import fs from "fs";
import path from "path";
import Stripe from "stripe";
import { writeJsonAtomic } from "./atomicWrite";
import { getAgentByAddress, getHumanFacilityStats } from "./agentStore";
import { prepareArcRepayment, commitArcRepayment } from "./repayCore";

/**
 * Repaying Arc debt by card, Apple Pay or Google Pay, through Stripe.
 *
 * The human pays Lifeline in dollars; once Stripe says the payment succeeded,
 * Lifeline books the repayment on the facility contract, exactly as a USDC
 * repayment is booked. Stripe's word is taken from Stripe - the payment is
 * retrieved server-side by id, never believed from the browser - and each
 * payment is booked once, however many times it is reported (the browser's
 * confirmation and the webhook both arrive). Anything paid over what is owed
 * by the time it is booked goes back to the card.
 */

const PURPOSE = "lifeline_repayment";
// Stripe will not charge less than this in USD.
export const CARD_MINIMUM_USD = 0.5;

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}
export const cardEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
/** Tests stand in for Stripe here. */
export const useStripeClient = (c: Stripe | null) => (client = c);

/* ---- which payments have been booked ---------------------------------- */

type Booking = { human: string; status: "booking" | "booked" | "refunded"; amountUsd?: number; txHash?: string; refundedUsd?: number; at: number };

function file(): string {
  const candidates = [
    path.resolve(process.cwd(), "web", "data", "card-repayments.json"),
    path.resolve(process.cwd(), "data", "card-repayments.json"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return fs.existsSync(path.resolve(process.cwd(), "web", "data")) ? candidates[0] : candidates[1];
}
const read = (): Record<string, Booking> => {
  try {
    return fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(), "utf8")) : {};
  } catch {
    return {};
  }
};
const save = (id: string, b: Booking | null) => {
  const all = read();
  if (b) all[id] = b;
  else delete all[id];
  writeJsonAtomic(file(), all);
};
export const bookingFor = (paymentIntentId: string) => read()[paymentIntentId] ?? null;

/* ---- starting a payment ------------------------------------------------ */

export async function startCardRepayment(p: { human: string; agentAddress: string; amountUsd: number }) {
  const agent = getAgentByAddress(p.agentAddress);
  if (!agent || agent.humanOwner.toLowerCase() !== p.human.toLowerCase()) {
    return { error: "That agent is not yours.", status: 403 } as const;
  }
  const owed = getHumanFacilityStats(p.human).arcOutstandingDebt;
  if (owed <= 0.0001) return { error: "Nothing is owed on Arc.", status: 400 } as const;
  if (!(p.amountUsd > 0)) return { error: "Enter an amount.", status: 400 } as const;

  // Paying it all rounds up to the cent (the fraction of a cent stays with
  // Lifeline); paying part rounds to the nearest cent.
  const all = p.amountUsd >= owed - 0.0001;
  const cents = all ? Math.ceil(owed * 100 - 1e-6) : Math.round(Math.min(p.amountUsd, owed) * 100);
  if (cents < CARD_MINIMUM_USD * 100) {
    return { error: `Card payments start at $${CARD_MINIMUM_USD.toFixed(2)}. Repay less than that from the agent's wallet.`, status: 400 } as const;
  }

  const intent = await stripe().paymentIntents.create({
    amount: cents,
    currency: "usd",
    // Cards only - Apple Pay and Google Pay are card wallets, so they are
    // included; Link and the rest are not, which keeps the form short.
    payment_method_types: ["card"],
    description: `Lifeline repayment · ${agent.name}`,
    metadata: { purpose: PURPOSE, human: p.human, agentAddress: agent.address },
  });
  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id, amountUsd: cents / 100 } as const;
}

/* ---- booking a paid one ----------------------------------------------- */

export type CardBookingResult =
  | { ok: true; alreadyBooked?: boolean; amountUsd: number; txHash?: string; refundedUsd: number }
  | { ok: false; status: number; error: string };

export async function bookCardRepayment(paymentIntentId: string, asHuman?: string): Promise<CardBookingResult> {
  const intent = await stripe().paymentIntents.retrieve(paymentIntentId);
  const human = intent.metadata?.human;
  if (intent.metadata?.purpose !== PURPOSE || !human) return { ok: false, status: 400, error: "Not a Lifeline repayment." };
  if (asHuman && asHuman.toLowerCase() !== human.toLowerCase()) return { ok: false, status: 403, error: "Not your payment." };
  if (intent.currency !== "usd") return { ok: false, status: 400, error: "Unexpected currency." };
  if (intent.status !== "succeeded") return { ok: false, status: 409, error: `The payment is ${intent.status.replace(/_/g, " ")}.` };

  // Claimed before booking, so the webhook and the browser cannot both book it.
  const existing = bookingFor(intent.id);
  if (existing) {
    return existing.status === "booking"
      ? { ok: false, status: 409, error: "Already being booked." }
      : { ok: true, alreadyBooked: true, amountUsd: existing.amountUsd ?? 0, txHash: existing.txHash, refundedUsd: existing.refundedUsd ?? 0 };
  }
  save(intent.id, { human, status: "booking", at: Date.now() });

  const paidUsd = (intent.amount_received || intent.amount) / 100;
  try {
    const agent = getAgentByAddress(intent.metadata.agentAddress);
    const prepared = await prepareArcRepayment(human, paidUsd);
    if (!agent || !prepared.ok) {
      // Paid, but nothing left to repay by now: it all goes back.
      await stripe().refunds.create({ payment_intent: intent.id });
      save(intent.id, { human, status: "refunded", amountUsd: 0, refundedUsd: paidUsd, at: Date.now() });
      return { ok: true, amountUsd: 0, refundedUsd: paidUsd };
    }

    const { result, txHash } = await commitArcRepayment({
      humanOwner: human,
      payingAgent: agent,
      beneficiaryAddress: agent.address,
      amount: prepared.amount,
      funding: { kind: "card", reference: intent.id },
    });

    // Whole cents over what was owed go back to the card.
    const overCents = Math.floor((paidUsd - result.amountRepaid) * 100 + 1e-6);
    if (overCents > 0) await stripe().refunds.create({ payment_intent: intent.id, amount: overCents });

    const booked = { human, status: "booked" as const, amountUsd: result.amountRepaid, txHash, refundedUsd: overCents / 100, at: Date.now() };
    save(intent.id, booked);
    return { ok: true, amountUsd: booked.amountUsd, txHash, refundedUsd: booked.refundedUsd };
  } catch (err: any) {
    // Not booked: let it be tried again.
    save(intent.id, null);
    return { ok: false, status: 500, error: err?.message ?? "Could not book the repayment." };
  }
}
