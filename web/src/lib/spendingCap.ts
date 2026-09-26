import type { Verdict } from "./intercepta";

/**
 * An agent's spending cap: what its human lets it borrow without asking.
 *
 * Going past it is not refused - the human's line may have room - but it is
 * not the agent's call either. The payment is held, like one Intercepta
 * flags, and goes through only once the human approves it with World ID.
 * Going past the human's whole line is still refused: no one can approve
 * money that is not there.
 */
export class OverSpendingCap extends Error {
  constructor(
    public needUsd: number,
    public capLeftUsd: number,
    public payTo: string,
    public priceUsd: number
  ) {
    super(overCapReason(needUsd, capLeftUsd));
  }
}

export const overCapReason = (needUsd: number, capLeftUsd: number) =>
  `Over this agent's spending cap: it needs to borrow $${needUsd.toFixed(2)} and may borrow $${capLeftUsd.toFixed(2)} more. ` +
  "Approve it with World ID to let this one payment through.";

export function capHoldVerdict(needUsd: number, capLeftUsd: number, priceUsd: number): Verdict {
  return {
    decision: "hold",
    reasons: [overCapReason(needUsd, capLeftUsd)],
    capUsd: capLeftUsd,
    amountUsd: priceUsd,
    checks: [],
    screenedAt: Date.now(),
    provider: "lifeline",
  };
}

/** Did the human approve exactly this: this payee, for no more than this? */
export const approvalCovers = (approved: { payTo: string; amountUsd: number } | undefined, payTo: string, priceUsd: number) =>
  !!approved && approved.payTo.toLowerCase() === payTo.toLowerCase() && priceUsd <= approved.amountUsd + 1e-9;
