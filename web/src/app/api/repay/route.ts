import { NextRequest, NextResponse } from "next/server";
import { unauthenticated } from "@/lib/session";
import { ARC_TREASURY } from "@/lib/browserChain";
import { hasCredential, resolveSpender } from "@/lib/agentToken";
import { invalidateTelemetryCache } from "@/lib/telemetryCache";
import { flushAgent } from "@/lib/ledgerFlush";
import { RepayRequest, RepayResponse } from "@/types";
import {
  getAgentByAddress,
  updateAgentInStore,
  getHumanFacilityStats,
  getAgentsByOwner,
} from "@/lib/agentStore";
import { processRepayment, getLoansByAgent } from "@/lib/loanStore";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_NAME, FLOAT_CREDIT_FACILITY_ADDRESS } from "@/lib/arc";
import { executeOnChainRepayment, verifyArcRepayment } from "@/lib/facilityContract";

export async function POST(req: NextRequest) {
  try {
    // Turn an anonymous caller away before discussing the request shape.
    if (!hasCredential(req)) return unauthenticated();

    const body: RepayRequest = await req.json();
    const { agentAddress, amount, targetAgentAddress, targetLoanId, txHash } =
      body;

    if (!agentAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required field: agentAddress" },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { success: false, error: "Missing required field: amount" },
        { status: 400 }
      );
    }

    const repayAmount = parseFloat(amount.toString());
    if (isNaN(repayAmount) || repayAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount. Must be a positive number." },
        { status: 400 }
      );
    }

    // 1. Verify Paying Agent
    // Gated so one human cannot write entries into another's ledger.
    const auth = resolveSpender(req, agentAddress);
    if ("error" in auth) return auth.error;

    const payingAgent = getAgentByAddress(agentAddress);
    if (!payingAgent) {
      return NextResponse.json(
        {
          success: false,
          error: `Paying agent ${agentAddress} is not registered in Float registry.`,
        },
        { status: 404 }
      );
    }

    // 2. Resolve Beneficiary / Target Agent
    // In Float, the Human is the actual borrower.
    // Sibling agents under the same human can repay each other's debt seamlessly.
    let beneficiaryAddress = payingAgent.address;
    if (targetAgentAddress) {
      const targetAgent = getAgentByAddress(targetAgentAddress);
      if (!targetAgent) {
        return NextResponse.json(
          {
            success: false,
            error: `Target agent ${targetAgentAddress} not found.`,
          },
          { status: 404 }
        );
      }
      if (
        targetAgent.humanOwner.toLowerCase() !==
        payingAgent.humanOwner.toLowerCase()
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Cross-agent repayment permitted only between agents owned by the same verified Human Operator (${payingAgent.humanOwner.slice(
              0,
              10
            )}...).`,
          },
          { status: 403 }
        );
      }
      beneficiaryAddress = targetAgent.address;
    }

    // 3. Check if there is any debt to repay
    // Settle any accumulated nanopayments before repaying. The contract
    // subtracts from the debt it can see, and un-flushed drawdowns are not
    // part of that yet - repaying the full off-chain balance against a
    // smaller on-chain one would be refused.
    await flushAgent(payingAgent.humanOwner, payingAgent.address, { force: true });

    const humanFacility = getHumanFacilityStats(payingAgent.humanOwner);
    if (humanFacility.totalOutstandingDebt <= 0.0001) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No outstanding debt exists on this agent or human credit facility to repay.",
        },
        { status: 400 }
      );
    }

    // Floating-point safety: Clamp repayAmount to total debt with epsilon tolerance
    const effectiveRepayAmount = Math.min(
      repayAmount,
      Math.round((humanFacility.totalOutstandingDebt + 0.0001) * 10000) / 10000
    );

    // 4. Real On-Chain Arc Testnet Settlement
    let arcTxHash = txHash;
    let transferTxHash: string | undefined = undefined;

    // A hash from the browser is a claim, not a receipt. Taking it on trust
    // meant the debt cleared on the strength of a string: a wallet left on
    // another chain produced a real hash for a transfer that never arrived,
    // and nothing stopped a caller posting arbitrary hex to the same end.
    if (arcTxHash) {
      const proof = await verifyArcRepayment({
        txHash: arcTxHash as `0x${string}`,
        expectedTo: ARC_TREASURY,
        minAmountUsdc: effectiveRepayAmount,
      });
      if (!proof.ok) {
        return NextResponse.json(
          { success: false, error: proof.reason, code: "unverified_repayment" },
          { status: 400 }
        );
      }
    }

    if (!arcTxHash) {
      const onChainRepay = await executeOnChainRepayment({
        humanOwner: payingAgent.humanOwner,
        payerAddress: payingAgent.address,
        agentAddress: beneficiaryAddress,
        amountUsdc: effectiveRepayAmount,
      });
      arcTxHash = onChainRepay.txHash;
      transferTxHash = onChainRepay.transferTxHash;
    }

    // 5. Process Repayment against Loan Ledger (FIFO: oldest loan first, interest then principal)
    const result = processRepayment({
      payingAgentAddress: payingAgent.address,
      amount: effectiveRepayAmount,
      targetAgentAddress: beneficiaryAddress,
      targetLoanId,
      humanOwner: payingAgent.humanOwner,
      txHash: arcTxHash,
    });

    // 6. Synchronize all affected Agents under this Human Facility
    const humanAgents = getAgentsByOwner(payingAgent.humanOwner);
    for (const a of humanAgents) {
      const activeLoans = getLoansByAgent(a.address).filter(
        (l) => l.status === "ACTIVE" && (l.outstandingAmount || 0) > 0.0001
      );
      const remainingDebt = Math.round(
        activeLoans.reduce((sum, l) => sum + l.outstandingAmount, 0) * 10000
      ) / 10000;
      const isPayer =
        a.address.toLowerCase() === payingAgent.address.toLowerCase();

      updateAgentInStore(a.address, {
        outstandingDebt: remainingDebt,
        currentBalance: isPayer
          ? Math.max(0, Math.round((a.currentBalance - result.amountRepaid) * 10000) / 10000)
          : a.currentBalance,
        totalRepaid: isPayer
          ? Math.round((a.totalRepaid + result.amountRepaid) * 10000) / 10000
          : a.totalRepaid,
        status: remainingDebt === 0 ? "Healthy" : "Active",
      });
    }

    // Borrow and pay both do this; without it a settlement stayed invisible
    // on the tape until the cache window lapsed.
    invalidateTelemetryCache(payingAgent.humanOwner);

    const updatedFacility = getHumanFacilityStats(payingAgent.humanOwner);
    const updatedBeneficiary = getAgentByAddress(beneficiaryAddress);

    const { getHumanCreditTier } = await import("@/lib/reputationStore");
    const currentTier = getHumanCreditTier(payingAgent.humanOwner);

    const response: RepayResponse = {
      success: true,
      txHash: arcTxHash,
      transferTxHash,
      amount: result.amountRepaid,
      remainingDebt: updatedBeneficiary?.outstandingDebt || 0,
      refundExcess: result.remainingExcessAmount,
      agentAddress: payingAgent.address,
      beneficiaryAgentAddress: beneficiaryAddress,
      facilityTotalDebt: updatedFacility.totalOutstandingDebt,
      settledLoans: result.settledLoans,
      interestPaid: result.interestPaid,
      principalPaid: result.principalPaid,
      currentTierName: currentTier.name,
      newCreditLimit: currentTier.creditLimit,
    };

    const message =
      result.remainingExcessAmount > 0
        ? `Repaid $${result.amountRepaid.toFixed(
            2
          )} USDC on Arc Testnet (principal: $${result.principalPaid.toFixed(
            2
          )}, interest/fee: $${result.interestPaid.toFixed(
            2
          )}). Unapplied excess of $${result.remainingExcessAmount.toFixed(
            2
          )} USDC was NOT deducted and remains in agent wallet.`
        : `Repaid $${result.amountRepaid.toFixed(
            2
          )} USDC on Arc Testnet (principal: $${result.principalPaid.toFixed(
            2
          )}, interest/fee: $${result.interestPaid.toFixed(
            2
          )}). Facility outstanding debt: $${updatedFacility.totalOutstandingDebt.toFixed(
            2
          )} USDC.`;

    return NextResponse.json({
      ...response,
      payingAgentName: payingAgent.name,
      beneficiaryAgentName: updatedBeneficiary?.name || payingAgent.name,
      network: `${ARC_TESTNET_NAME} (${ARC_TESTNET_CHAIN_ID})`,
      facilityContractAddress: FLOAT_CREDIT_FACILITY_ADDRESS,
      message,
    });
  } catch (error: any) {
    console.error("[POST /api/repay] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process repayment" },
      { status: 500 }
    );
  }
}
