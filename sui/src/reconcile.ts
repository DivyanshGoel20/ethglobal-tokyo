import { operatorKeypair } from "./client";
import { collect, readObligation, readPurse, type ObligationView } from "./facility";
import { fromUnits } from "./config";

/**
 * What became of a parked repayment.
 *
 * On Hedera, consensus executes a schedule on its own and Float has to ask the
 * mirror what happened. Sui runs nothing on its own, so reconciliation is also
 * the keeper: an obligation that is due and still open gets collected here.
 * Float holds no special power to do that - `collect` is open to anyone - it
 * is simply the party that cares enough to call it.
 */
export type Outcome =
  | { state: "pending"; obligation: ObligationView }
  | { state: "settled"; obligation: ObligationView; digest?: string }
  | { state: "defaulted"; obligation: ObligationView; reason: string; digest?: string }
  | { state: "unknown"; reason: string };

export async function resolveObligation(obligationId: string, opts: { collectIfDue?: boolean } = {}): Promise<Outcome> {
  let ob: ObligationView;
  try {
    ob = await readObligation(obligationId);
  } catch (err: any) {
    // A read that fails is not evidence of anything. Leave the debt open.
    return { state: "unknown", reason: err?.message ?? "could not read the obligation" };
  }

  if (ob.status === "settled" || ob.status === "closed") return { state: "settled", obligation: ob };
  if (ob.status === "defaulted") {
    return { state: "defaulted", obligation: ob, reason: "purse could not cover it when it fell due" };
  }

  if (Date.now() < ob.dueMs || opts.collectIfDue === false) return { state: "pending", obligation: ob };

  try {
    const r = await collect(operatorKeypair(), { purseId: ob.purseId, obligationId });
    const after = await readObligation(obligationId);
    if (after.status === "defaulted") {
      const purse = await readPurse(ob.purseId);
      return {
        state: "defaulted",
        obligation: after,
        digest: r.digest,
        reason: `purse held ${fromUnits(purse.balance).toFixed(6)} against ${fromUnits(after.drawn).toFixed(6)} owed`,
      };
    }
    return { state: "settled", obligation: after, digest: r.digest };
  } catch (err: any) {
    return { state: "unknown", reason: err?.message ?? "collection failed" };
  }
}
