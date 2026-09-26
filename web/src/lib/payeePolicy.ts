import { getPaymentsByHuman } from "./paymentStore";
import type { Check, Verdict } from "./intercepta";

/**
 * A payee this human's agents have never paid is a new counterparty, however
 * clean Intercepta finds it. The first payment gets a small trial; anything
 * more waits for the human - approved once, with World ID for Agents - and
 * after that the payee is known and ordinary limits apply.
 */
export const FIRST_PAYEE_TRIAL_USD = Number(process.env.LIFELINE_FIRST_PAYEE_TRIAL_USD || 0.05);

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Has any of this human's agents paid this address on Arc before? */
export function hasPaidBefore(human: string, payTo: string): boolean {
  const to = payTo.toLowerCase();
  return getPaymentsByHuman(human).some(
    (p) => p.status === "SUCCESS" && (p.rail ?? "arc") === "arc" && (p.sellerAddress ?? "").toLowerCase() === to
  );
}

/** Intercepta's verdict, with the first-payment rule applied on top. */
export function withFirstPayeeRule(verdict: Verdict, human: string, payTo: string): Verdict {
  // A refusal stands; a hold is already going to the human.
  if (verdict.decision === "refuse") return verdict;

  const known = hasPaidBefore(human, payTo);
  const check: Check = {
    subject: "history",
    target: payTo,
    endpoint: "payment history",
    level: known ? "clean" : "elevated",
    summary: known
      ? `Paid ${short(payTo)} before`
      : `First payment to ${short(payTo)} - none of your agents has paid it before`,
  };
  const checks = [...verdict.checks, check];
  if (known || verdict.decision === "hold") return { ...verdict, checks };

  if (verdict.amountUsd <= FIRST_PAYEE_TRIAL_USD) {
    return {
      ...verdict,
      checks,
      reasons: [...verdict.reasons, `First payment to ${short(payTo)}, within the $${FIRST_PAYEE_TRIAL_USD.toFixed(2)} trial for a new payee.`],
    };
  }
  return {
    ...verdict,
    decision: "hold",
    checks,
    capUsd: Math.min(verdict.capUsd, FIRST_PAYEE_TRIAL_USD),
    reasons: [
      `First payment to ${short(payTo)}: none of your agents has paid it before, and $${verdict.amountUsd.toFixed(2)} is over the $${FIRST_PAYEE_TRIAL_USD.toFixed(2)} trial. Approve it once; after that, ordinary limits apply.`,
      ...verdict.reasons,
    ],
  };
}
