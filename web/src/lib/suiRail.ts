import {
  agentKeypair,
  deployment,
  facilityLiquidity,
  fromUnits,
  mintDemoDollars,
  network,
  operatorKeypair,
  paySui,
  readObligation,
  readProfile,
  readPurse,
  resolveObligation,
  settleEarly,
  toUnits,
  walletUnits,
  type SuiPayResult,
} from "@lifeline/sui";
import { getAgentPrivateKey, authorizeAgentSpend } from "./agentKeys";
import { getSuiFacilityStats } from "./agentStore";
import { recordRepaymentInReputation } from "./reputationStore";
import { computeProfileId } from "./facilityContract";
import { recordPayment } from "./paymentStore";
import {
  defaultObligation,
  openRailDebt,
  railDebtsFor,
  settleObligation,
  unpaidObligations,
  unpaidRailDebts,
} from "./railDebt";
import { invalidateTelemetryCache } from "./telemetryCache";
import type { Agent } from "@/types";

/**
 * Lifeline's Sui rail, as the web app sees it.
 *
 * Policy lives here, mechanism in @lifeline/sui: this module decides whose line is
 * being spent and how much of it, then hands the payer a key and a ceiling.
 * Every draw is written into railDebt against the session human, so Arc and Sui
 * net against one limit.
 */

export const SUI_FEED_URL = process.env.SUI_SERVICE_URL || "http://localhost:4031";

export function suiExplorer(kind: "tx" | "object", id: string): string | null {
  const n = network();
  if (n === "localnet") return null;
  return `https://suiscan.xyz/${n}/${kind === "tx" ? "tx" : "object"}/${id}`;
}

export function suiConfigured(): boolean {
  return !!deployment() && !!process.env.SUI_PRIVATE_KEY;
}

/** Whether the rail can be used right now, and what the Sui feed sells. */
export async function suiStatus() {
  const d = deployment();
  if (!d || !process.env.SUI_PRIVATE_KEY) {
    return {
      rail: "sui" as const,
      configured: false,
      network: network(),
      sellerUp: false,
      resources: [],
      reason: !d ? "Lifeline is not deployed on this Sui network" : "SUI_PRIVATE_KEY is not set",
    };
  }

  const [liquidity, catalogue] = await Promise.all([
    facilityLiquidity().catch(() => null),
    fetch(`${SUI_FEED_URL}/catalogue`, { cache: "no-store", signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  return {
    rail: "sui" as const,
    configured: true,
    network: d.network,
    packageId: d.packageId,
    facilityId: d.facilityId,
    coinType: d.coinType,
    liquidityUsd: liquidity === null ? null : fromUnits(liquidity),
    facilityLink: suiExplorer("object", d.facilityId),
    sellerUp: !!catalogue,
    base: SUI_FEED_URL,
    resources: catalogue?.resources ?? [],
  };
}

export const suiAddressFor = (agentAddress: string): string | null => {
  const key = getAgentPrivateKey(agentAddress);
  return key ? agentKeypair(key).toSuiAddress() : null;
};

/** What each agent holds and owes on Sui, for the dashboard. */
export async function withSuiState(agents: Agent[], human: string): Promise<Agent[]> {
  const debts = unpaidRailDebts(human);
  const configured = suiConfigured();
  return Promise.all(
    agents.map(async (a) => {
      // Arc agents have no Sui state: an agent belongs to one rail.
      if (a.rail !== "sui") return a;
      const suiAddress = suiAddressFor(a.address) ?? undefined;
      const suiDebt =
        Math.round(
          debts.filter((d) => d.agentAddress.toLowerCase() === a.address.toLowerCase()).reduce((n, d) => n + d.amountUsd, 0) * 10000
        ) / 10000;
      let suiWalletUsd: number | undefined;
      if (configured && suiAddress) {
        suiWalletUsd = await walletUnits(suiAddress).then(fromUnits).catch(() => undefined);
      }
      return { ...a, suiAddress, suiDebt, suiWalletUsd };
    })
  );
}

/** Buy something on Sui for an agent, on its human's line. */
export async function payOnSui(args: {
  url: string;
  agent: Agent;
  human: string;
  capUsd?: number;
}): Promise<SuiPayResult & { explorer?: string | null }> {
  const key = getAgentPrivateKey(args.agent.address);
  if (!key) {
    throw new Error(
      "Lifeline holds no key for this agent, so it cannot sign on Sui. Provision a new agent, or register this one with its key."
    );
  }

  // Sui's own line: its limit and its debt. Nothing drawn on Arc counts here.
  const facility = getSuiFacilityStats(args.human);
  const maxCreditUsd = Math.min(facility.availableCredit, args.capUsd ?? Number.POSITIVE_INFINITY);

  const result = await paySui(args.url, {
    agentKey: key,
    profileId: computeProfileId(args.human),
    creditLimitUsd: facility.creditLimit,
    maxCreditUsd,
    approve: (amountUsd) => {
      const allowed = authorizeAgentSpend(args.agent.address, amountUsd);
      if (!allowed.ok) throw new Error(`Lifeline will not sign for this agent: ${allowed.reason}`);
    },
  });

  const borrowed = Number(result.borrowed);
  if (result.fundingSource === "LIFELINE_CREDIT" && borrowed > 0 && result.obligationId) {
    openRailDebt({
      humanOwner: args.human,
      rail: "sui",
      agentAddress: args.agent.address,
      amountUsd: borrowed,
      obligationId: result.obligationId,
      resource: args.url,
      digest: result.digest,
    });
  }

  if (Number(result.amount) > 0) {
    recordPayment({
      paymentId: `sui_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentAddress: args.agent.address,
      humanProfileId: args.human,
      sellerAddress: result.payTo,
      resourceUrl: args.url,
      requestedAmount: result.amount,
      agentGatewayBalance: result.ownContribution,
      shortfall: result.borrowed,
      fundingSource: result.fundingSource === "LIFELINE_CREDIT" ? "LIFELINE_FACILITY" : "AGENT_WALLET",
      drawdownId: result.obligationId ?? null,
      status: "SUCCESS",
      timestamp: Date.now(),
      transactionId: result.digest,
      rail: "sui",
      network: network(),
      memo:
        result.fundingSource === "LIFELINE_CREDIT"
          ? `Drew ${result.borrowed} against obligation ${result.obligationId}, due ${new Date(result.dueMs!).toISOString()}`
          : "Paid from the agent's own coins on Sui",
    });
  }

  invalidateTelemetryCache(args.human);
  return { ...result, explorer: result.digest ? suiExplorer("tx", result.digest) : null };
}

/** The human's parked repayments, read back from chain. */
export async function obligationsFor(human: string) {
  const rows = railDebtsFor(human);
  const ids = [...new Set(rows.map((r) => r.obligationId))];

  const out = await Promise.all(
    ids.map(async (id) => {
      const mine = rows.filter((r) => r.obligationId === id);
      const unpaid = mine.filter((r) => r.status !== "settled");
      const ob = await readObligation(id).catch(() => null);
      const purse = ob ? await readPurse(ob.purseId).catch(() => null) : null;
      return {
        obligationId: id,
        agentAddress: mine[0].agentAddress,
        suiAgent: ob?.agent ?? null,
        status: ob?.status ?? "unknown",
        drawnUsd: ob ? fromUnits(ob.drawn) : mine.reduce((n, r) => n + r.amountUsd, 0),
        ceilingUsd: ob ? fromUnits(ob.ceiling) : null,
        owedUsd: Math.round(unpaid.reduce((n, r) => n + r.amountUsd, 0) * 10000) / 10000,
        dueMs: ob?.dueMs ?? null,
        purseId: ob?.purseId ?? null,
        purseUsd: purse ? fromUnits(purse.balance) : null,
        draws: mine.length,
        link: suiExplorer("object", id),
      };
    })
  );
  return out.sort((a, b) => (b.dueMs ?? 0) - (a.dueMs ?? 0));
}

/**
 * Repay before the date. The agent moves what the purse is short from its own
 * coins and settles, in one sponsored transaction it signs itself.
 */
export async function settleEarlyFor(human: string, obligationId: string) {
  const row = railDebtsFor(human).find((r) => r.obligationId === obligationId);
  if (!row) throw new Error("No such obligation on your line");

  const key = getAgentPrivateKey(row.agentAddress);
  if (!key) throw new Error("Lifeline holds no key for the agent that owes this");

  const ob = await readObligation(obligationId);
  if (ob.status === "settled" || ob.status === "closed") {
    creditSuiRecord(settleObligation(obligationId));
    return { alreadySettled: true, obligationId };
  }

  const [purse, profile] = await Promise.all([readPurse(ob.purseId), readProfile(ob.profileId)]);
  const owed = profile && profile.outstandingDebt < ob.drawn ? profile.outstandingDebt : ob.drawn;
  const deposit = owed > purse.balance ? owed - purse.balance : 0n;

  const agent = agentKeypair(key);
  if (deposit > 0n) {
    const held = await walletUnits(agent.toSuiAddress());
    if (held < deposit) {
      throw new Error(
        `The agent holds ${fromUnits(held).toFixed(6)} on Sui and needs ${fromUnits(deposit).toFixed(6)} more to settle`
      );
    }
  }

  const r = await settleEarly(agent, operatorKeypair(), { purseId: ob.purseId, obligationId, depositUnits: deposit });
  const closed = settleObligation(obligationId);
  creditSuiRecord(closed);
  invalidateTelemetryCache(human);
  return {
    obligationId,
    digest: r.digest,
    link: suiExplorer("tx", r.digest),
    settledUsd: closed.reduce((n, c) => n + c.amountUsd, 0),
  };
}

/**
 * A settled obligation counts on the human's Sui record, and only there: the
 * rails are separate lines. Once per obligation, however many draws it covered.
 */
function creditSuiRecord(closed: { humanOwner: string; createdAt: number; settledAt?: number }[]) {
  if (!closed.length) return;
  const first = Math.min(...closed.map((c) => c.createdAt));
  const days = Math.max(0, (closed[0].settledAt ?? Date.now()) - first) / 86_400_000;
  void recordRepaymentInReputation({ humanOwner: closed[0].humanOwner, interestPaid: 0, loanDurationDays: days, rail: "sui" }).catch(
    (err) => console.warn("[suiRail] Sui record update failed:", err?.message ?? err)
  );
}

/**
 * Close the books on what the chain has done - and, for anything due and
 * still open, do it: collection is open to anyone, and Lifeline is the party
 * that bothers to call it.
 */
export async function reconcileSui(human?: string) {
  const ids = unpaidObligations(human);
  const out = { checked: ids.length, settled: [] as string[], defaulted: [] as string[], pending: 0, unresolved: [] as { obligationId: string; reason: string }[] };

  for (const id of ids) {
    const o = await resolveObligation(id, { collectIfDue: true });
    if (o.state === "settled") {
      creditSuiRecord(settleObligation(id));
      out.settled.push(id);
    } else if (o.state === "defaulted") {
      if (defaultObligation(id, o.reason).length) out.defaulted.push(id);
      else out.defaulted.push(id);
    } else if (o.state === "pending") {
      out.pending++;
    } else {
      // A chain that cannot answer is not evidence. Leave it open.
      out.unresolved.push({ obligationId: id, reason: o.reason });
    }
  }
  if (human) invalidateTelemetryCache(human);
  return out;
}

/**
 * Test networks only: pay an agent in demo dollars, standing in for a customer
 * paying it for its work. The only way an agent here earns what it repays.
 */
export async function payAgentForWork(agentAddress: string, usd: number) {
  const d = deployment();
  if (!d?.faucetId || network() === "mainnet") {
    throw new Error("Demo dollars exist only on a test network with the demo coin");
  }
  const to = suiAddressFor(agentAddress);
  if (!to) throw new Error("Lifeline holds no key for this agent, so it has no Sui address");
  const r = await mintDemoDollars(operatorKeypair(), to, toUnits(usd));
  return { to, digest: r.digest, link: suiExplorer("tx", r.digest) };
}
