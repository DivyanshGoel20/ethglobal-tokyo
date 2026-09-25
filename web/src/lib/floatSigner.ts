import { GatewayClient } from "@circle-fin/x402-batching/client";
import { formatUnits, parseUnits } from "viem";
import {
  getAgentByAddress,
  getHumanFacilityStats,
  updateAgentInStore,
} from "./agentStore";
import { createLoan } from "./loanStore";
import { recordPayment, PaymentRecord } from "./paymentStore";
import { FLOAT_CREDIT_FACILITY_ADDRESS } from "./arc";
import { addPending } from "./pendingLedger";
import { flushAgent } from "./ledgerFlush";
import { getAgentPrivateKey, authorizeAgentSpend } from "./agentKeys";

export interface AgentPaymentContext {
  agentAddress: string;
  agentPrivateKey?: `0x${string}`;
  humanProfileId?: string;
  /**
   * Ceiling set by an agent's mandate, when the caller holds one rather than a
   * browser session. Folded into the headroom below, so the tightest of the
   * three - agent limit, facility headroom, mandate cap - is what binds.
   */
  maxCreditUsd?: number;
}

export interface FloatPayResult {
  success: boolean;
  fundingSource: "AGENT_GATEWAY" | "FLOAT_FACILITY";
  amount: string;
  borrowed: string;
  drawdownId: string | null;
  agentGatewayBalance: string;
  shortfall: string;
  data: any;
  status: number;
  transactionId?: string;
  arcTxHash?: string;
  arcTxLink?: string;
  circleSettlementId?: string;
  payer: string;
  creditFacilityAddress?: string;
  agentDebt?: number;
  facilityDebt?: number;
}

export class FloatSignerTS {
  private floatFundingClient: GatewayClient;
  private fundingPrivateKey: `0x${string}`;
  public creditFacilityAddress: string;

  constructor(options?: {
    fundingPrivateKey?: `0x${string}`;
    chain?: "arcTestnet";
    creditFacilityAddress?: string;
  }) {
    this.creditFacilityAddress =
      options?.creditFacilityAddress ||
      process.env.FLOAT_CREDIT_FACILITY_ADDRESS ||
      FLOAT_CREDIT_FACILITY_ADDRESS;

    // Default to the Circle Gateway-funded account on Arc Testnet
    this.fundingPrivateKey =
      options?.fundingPrivateKey ||
      (process.env.FLOAT_FUNDING_PRIVATE_KEY as `0x${string}`) ||
      (process.env.PRIVATE_KEY as `0x${string}`);

    if (!this.fundingPrivateKey) {
      throw new Error("Missing FLOAT_FUNDING_PRIVATE_KEY or PRIVATE_KEY in environment");
    }

    this.floatFundingClient = new GatewayClient({
      chain: options?.chain || "arcTestnet",
      privateKey: this.fundingPrivateKey,
    });
  }

  /**
   * Returns Float's funding address used to provide overdraft purchasing capacity.
   */
  get fundingAddress(): string {
    return this.floatFundingClient.address;
  }

  /**
   * Queries the real Circle Gateway available balance for any agent address.
   */
  async getAgentGatewayBalance(
    agentAddress: string
  ): Promise<{ available: bigint; formattedAvailable: string }> {
    const balances = await (this.floatFundingClient as any).getGatewayBalance(
      agentAddress
    );
    return {
      available: balances.available,
      formattedAvailable: balances.formattedAvailable,
    };
  }

  /**
   * Wraps the x402 payment flow with Float's autonomous overdraft decision engine.
   */
  async pay(
    url: string,
    agentContext: AgentPaymentContext,
    options?: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: any;
    }
  ): Promise<FloatPayResult> {
    const method = options?.method ?? "GET";
    const headers = {
      "Content-Type": "application/json",
      ...options?.headers,
    };
    const serializedBody =
      options?.body !== undefined
        ? typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body)
        : undefined;

    // Step 1: Initial request to resource
    const initialResponse = await fetch(url, {
      method,
      headers,
      body: serializedBody,
    });

    if (initialResponse.status !== 402) {
      if (initialResponse.ok) {
        const data = await initialResponse.json();
        return {
          success: true,
          fundingSource: "AGENT_GATEWAY",
          amount: "0",
          borrowed: "0",
          drawdownId: null,
          agentGatewayBalance: "0",
          shortfall: "0",
          data,
          status: initialResponse.status,
          payer: agentContext.agentAddress,
        };
      }
      throw new Error(`Request failed with status ${initialResponse.status}`);
    }

    // Step 2: Parse 402 Payment Required requirements
    const paymentRequiredHeader = initialResponse.headers.get("PAYMENT-REQUIRED");
    if (!paymentRequiredHeader) {
      throw new Error("Missing PAYMENT-REQUIRED header in HTTP 402 response");
    }

    const paymentRequired = JSON.parse(
      Buffer.from(paymentRequiredHeader, "base64").toString("utf-8")
    );
    const accepts = paymentRequired.accepts;
    if (!accepts || accepts.length === 0) {
      throw new Error("No payment options specified in 402 response");
    }

    // Select Arc Testnet batching option (Chain ID 5042002)
    const batchingOption = accepts.find(
      (opt: any) =>
        opt.network === "eip155:5042002" &&
        opt.extra?.name === "GatewayWalletBatched"
    );

    if (!batchingOption) {
      throw new Error(
        "No supported Circle Gateway batching option found for Arc Testnet (eip155:5042002)"
      );
    }

    const x402Version = paymentRequired.x402Version ?? 2;
    const requestedAmount = BigInt(batchingOption.amount);
    const requestedAmountFormatted = formatUnits(requestedAmount, 6);
    const sellerAddress = batchingOption.payTo;

    // Step 3: Query Agent's REAL Circle Gateway available balance
    const { available: agentGatewayAvailable, formattedAvailable } =
      await this.getAgentGatewayBalance(agentContext.agentAddress);

    // Resolve Human Credit Profile
    const agent = getAgentByAddress(agentContext.agentAddress);
    // Supplied by the caller only after a World session has been verified and
    // the agent confirmed to belong to that human. The old fallback chain ended
    // in a hardcoded address, so a missing identity quietly became somebody
    // else's credit line rather than an error.
    const humanOwner = agentContext.humanProfileId;
    if (!humanOwner) {
      throw new Error("No verified human is associated with this payment.");
    }

    const paymentId = `pay_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    // Decision Logic: Can agent pay normally?
    if (agentGatewayAvailable >= requestedAmount) {
      // ----------------------------------------------------
      // PATH A: NORMAL AGENT PAYMENT (No Overdraft)
      // ----------------------------------------------------
      let agentClient: GatewayClient;
      const resolvedAgentKey =
        agentContext.agentPrivateKey ||
        getAgentPrivateKey(agentContext.agentAddress);

      if (resolvedAgentKey) {
        agentClient = new GatewayClient({
          chain: "arcTestnet",
          privateKey: resolvedAgentKey,
        });
      } else {
        throw new Error(
          `Agent ${agentContext.agentAddress} has sufficient Gateway balance ($${formattedAvailable} >= $${requestedAmountFormatted}), but no private key was found to sign the payment.`
        );
      }

      // The key is held on the agent's behalf under a ceiling and an expiry;
      // both are checked before it is used, not only when it was registered.
      const allowed = authorizeAgentSpend(
        agentContext.agentAddress,
        parseFloat(requestedAmountFormatted)
      );
      if (!allowed.ok) {
        throw new Error(`Float will not sign for this agent: ${allowed.reason}`);
      }

      const paymentPayload = await (agentClient as any).batchScheme.createPaymentPayload(
        x402Version,
        batchingOption
      );

      const paymentHeader = Buffer.from(
        JSON.stringify({
          ...paymentPayload,
          resource: paymentRequired.resource,
          accepted: batchingOption,
        })
      ).toString("base64");

      const paidResponse = await fetch(url, {
        method,
        headers: {
          ...headers,
          "Payment-Signature": paymentHeader,
        },
        body: serializedBody,
      });

      if (!paidResponse.ok) {
        const errJson = await paidResponse.json().catch(() => ({}));
        throw new Error(
          `Payment failed: ${errJson.error || paidResponse.statusText}`
        );
      }

      const settleHeader = paidResponse.headers.get("PAYMENT-RESPONSE");
      let settleResponse: any;
      if (settleHeader) {
        settleResponse = JSON.parse(
          Buffer.from(settleHeader, "base64").toString("utf-8")
        );
      }

      const data = await paidResponse.json();

      // Record normal payment record in Float audit ledger
      recordPayment({
        paymentId,
        agentAddress: agentContext.agentAddress,
        humanProfileId: humanOwner,
        sellerAddress,
        resourceUrl: url,
        requestedAmount: requestedAmountFormatted,
        agentGatewayBalance: formattedAvailable,
        shortfall: "0.00",
        fundingSource: "AGENT_GATEWAY",
        drawdownId: null,
        status: "SUCCESS",
        timestamp: Date.now(),
        transactionId: settleResponse?.transaction,
        memo: "Normal x402 payment using agent Gateway balance",
      });

      return {
        success: true,
        fundingSource: "AGENT_GATEWAY",
        amount: requestedAmountFormatted,
        borrowed: "0.00",
        drawdownId: null,
        agentGatewayBalance: formattedAvailable,
        shortfall: "0.00",
        data,
        status: paidResponse.status,
        transactionId: settleResponse?.transaction,
        payer: agentContext.agentAddress,
        creditFacilityAddress: this.creditFacilityAddress,
      };
    } else {
      // ----------------------------------------------------
      // PATH B: OVERDRAFT DRAWDOWN (Float Credit Facility)
      // ----------------------------------------------------
      const shortfallBigInt = requestedAmount - agentGatewayAvailable;
      const shortfallAmount = parseFloat(formatUnits(shortfallBigInt, 6));

      // 1. Check Float Credit Facility Limits
      const facility = getHumanFacilityStats(humanOwner);
      const agentAvailableLimit = agent
        ? Math.max(0, agent.creditLimit - agent.outstandingDebt)
        : facility.totalAvailableCredit;
      const effectiveAvailable = Math.min(
        agentAvailableLimit,
        facility.totalAvailableCredit,
        agentContext.maxCreditUsd ?? Number.POSITIVE_INFINITY
      );

      if (shortfallAmount > effectiveAvailable) {
        recordPayment({
          paymentId,
          agentAddress: agentContext.agentAddress,
          humanProfileId: humanOwner,
          sellerAddress,
          resourceUrl: url,
          requestedAmount: requestedAmountFormatted,
          agentGatewayBalance: formattedAvailable,
          shortfall: shortfallAmount.toFixed(2),
          fundingSource: "FLOAT_FACILITY",
          drawdownId: null,
          status: "REJECTED_CREDIT",
          timestamp: Date.now(),
          memo: `Credit rejected: Shortfall of $${shortfallAmount.toFixed(
            2
          )} exceeds headroom $${effectiveAvailable.toFixed(2)}`,
        });

        throw new Error(
          `Float Credit Facility: Shortfall of $${shortfallAmount.toFixed(
            2
          )} USDC exceeds remaining credit limit ($${effectiveAvailable.toFixed(
            2
          )} USDC available).`
        );
      }

      // 2. Book the debt. It reaches the chain with the next batch.
      //
      // Writing a drawdown per nanopayment cost more gas than the payment was
      // worth. The debt is recorded here first and settled on chain as one row
      // covering however many payments have accumulated.
      //
      // Admission control above reads the agent store, which is updated the
      // moment a payment is booked - so it already accounts for debt that has
      // not reached the chain yet. Adding the pending total on top would
      // double-count it, and the contract's own limit check cannot fail at
      // flush time for the same reason: chain debt plus the batch can never
      // exceed what the store already admitted.
      const loan = createLoan({
        agentAddress: agentContext.agentAddress,
        agentName: agent?.name || "Autonomous Agent",
        humanOwner,
        amount: shortfallAmount,
        txHash: "",
        memo: `Float Overdraft x402 Drawdown for ${url}`,
      });

      addPending({
        humanOwner,
        agentAddress: agentContext.agentAddress,
        amountUsdc: shortfallAmount,
        reference: "x402",
        loanId: loan.loanId,
      });

      // Settles only once the position is worth the gas, or has waited long
      // enough. Most calls return here without touching the chain at all.
      const flush = await flushAgent(humanOwner, agentContext.agentAddress);
      const arcTxHash = flush.txHash ?? "";

      // Update agent & human profile debt
      if (agent) {
        updateAgentInStore(agent.address, {
          outstandingDebt: agent.outstandingDebt + shortfallAmount,
          totalBorrowed: agent.totalBorrowed + shortfallAmount,
          status: "Active",
        });
      }

      // 3. Sign x402 Payment Authorization using Float's Gateway-Funded Facility
      const floatPaymentPayload = await (
        this.floatFundingClient as any
      ).batchScheme.createPaymentPayload(x402Version, batchingOption);

      const paymentHeader = Buffer.from(
        JSON.stringify({
          ...floatPaymentPayload,
          resource: paymentRequired.resource,
          accepted: batchingOption,
        })
      ).toString("base64");

      // 4. Retry request with Float's Payment-Signature
      const paidResponse = await fetch(url, {
        method,
        headers: {
          ...headers,
          "Payment-Signature": paymentHeader,
        },
        body: serializedBody,
      });

      if (!paidResponse.ok) {
        const errJson = await paidResponse.json().catch(() => ({}));
        recordPayment({
          paymentId,
          agentAddress: agentContext.agentAddress,
          humanProfileId: humanOwner,
          sellerAddress,
          resourceUrl: url,
          requestedAmount: requestedAmountFormatted,
          agentGatewayBalance: formattedAvailable,
          shortfall: shortfallAmount.toFixed(2),
          fundingSource: "FLOAT_FACILITY",
          drawdownId: loan.loanId,
          status: "FAILED",
          timestamp: Date.now(),
          memo: `Seller verification failed: ${errJson.error || paidResponse.statusText}`,
        });

        throw new Error(
          `Float-funded payment failed: ${
            errJson.error || paidResponse.statusText
          }`
        );
      }

      const settleHeader = paidResponse.headers.get("PAYMENT-RESPONSE");
      let settleResponse: any;
      if (settleHeader) {
        settleResponse = JSON.parse(
          Buffer.from(settleHeader, "base64").toString("utf-8")
        );
      }

      const data = await paidResponse.json();

      // 5. Record successful payment in audit trail
      recordPayment({
        paymentId,
        agentAddress: agentContext.agentAddress,
        humanProfileId: humanOwner,
        sellerAddress,
        resourceUrl: url,
        requestedAmount: requestedAmountFormatted,
        agentGatewayBalance: formattedAvailable,
        shortfall: shortfallAmount.toFixed(2),
        fundingSource: "FLOAT_FACILITY",
        drawdownId: loan.loanId,
        status: "SUCCESS",
        timestamp: Date.now(),
        transactionId: settleResponse?.transaction,
        memo: `Overdraft funded via Float facility ($${shortfallAmount.toFixed(
          2
        )} shortfall)`,
      });

      const updatedFacility = getHumanFacilityStats(humanOwner);
      const updatedAgent = getAgentByAddress(agentContext.agentAddress);

      return {
        success: true,
        fundingSource: "FLOAT_FACILITY",
        amount: requestedAmountFormatted,
        borrowed: shortfallAmount.toFixed(2),
        drawdownId: loan.loanId,
        agentGatewayBalance: formattedAvailable,
        shortfall: shortfallAmount.toFixed(2),
        data,
        status: paidResponse.status,
        transactionId: arcTxHash || settleResponse?.transaction,
        arcTxHash: arcTxHash || undefined,
        arcTxLink: arcTxHash ? `https://testnet.arcscan.app/tx/${arcTxHash}` : undefined,
        circleSettlementId: settleResponse?.transaction,
        payer: this.floatFundingClient.address,
        creditFacilityAddress: this.creditFacilityAddress,
        agentDebt: updatedAgent?.outstandingDebt || shortfallAmount,
        facilityDebt: updatedFacility.totalOutstandingDebt,
      };
    }
  }
}
