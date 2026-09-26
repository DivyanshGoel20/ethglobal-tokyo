/**
 * Repaying Arc debt by card, live: Stripe test mode and Arc testnet.
 *
 *   STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env (test keys)
 *   npm run dev
 *   npm run e2e:card
 *
 * Stripe's test card is confirmed server-side here, standing in for the
 * human tapping Apple Pay or Google Pay; everything else is the app's API,
 * Stripe's test mode and a real booking on the Arc facility.
 */
import crypto from "node:crypto";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { attachSession } from "../../src/lib/session";
import { ensureHumanProfileOnChain, getOnChainProfile } from "../../src/lib/facilityContract";

const APP = process.env.LIFELINE_APP_URL || "http://localhost:3000";
const HUMAN = "0x" + crypto.randomBytes(32).toString("hex");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Set a Stripe TEST secret key (sk_test_...) in .env");
  const stripe = new Stripe(key);

  console.log(`\nhuman ${HUMAN}\n`);
  await ensureHumanProfileOnChain(HUMAN);
  const cookie = `lifeline_session=${attachSession(NextResponse.json({}), HUMAN).cookies.get("lifeline_session")!.value}`;
  const call = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(`${APP}${route}`, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };

  const enabled = await call("GET", "/api/repay/card");
  check("card repayment is switched on", enabled.body.enabled === true);

  const agent = (await call("POST", "/api/agent/provision", { label: "e2e-card", capUsd: 8 })).body.agent?.address as string;
  const drawn = await call("POST", "/api/borrow", { agentAddress: agent, amount: 1.5, memo: "e2e card" });
  check("the agent borrows $1.50 on Arc", drawn.status === 200 && drawn.body.success, drawn.body.txHash ?? drawn.body.error);
  const owed = Number((await call("GET", "/api/agents")).body.agents?.find((a: any) => a.address === agent)?.outstandingDebt ?? 0);
  const before = await getOnChainProfile(HUMAN);
  check("the facility shows the debt", Number(before?.outstandingDebt) > 0, `on chain ${before?.outstandingDebt} · app ${owed}`);

  const tooSmall = await call("POST", "/api/repay/card", { agentAddress: agent, amount: 0.1 });
  check("less than Stripe's $0.50 minimum is refused", tooSmall.status === 400, tooSmall.body.error);

  // Pay part of it.
  const part = await call("POST", "/api/repay/card", { agentAddress: agent, amount: 0.75 });
  check("a partial card payment is created", part.body.success && part.body.amountUsd === 0.75, part.body.paymentIntentId ?? part.body.error);
  const early = await call("POST", "/api/repay/card/confirm", { paymentIntentId: part.body.paymentIntentId });
  check("an unpaid payment books nothing", early.status === 409, early.body.error);

  await stripe.paymentIntents.confirm(part.body.paymentIntentId, { payment_method: "pm_card_visa", return_url: APP });
  const booked = await call("POST", "/api/repay/card/confirm", { paymentIntentId: part.body.paymentIntentId });
  check("once paid, it is booked on Arc", booked.body.success && booked.body.amountUsd === 0.75 && /^0x/.test(booked.body.txHash ?? ""), booked.body.txHash ?? booked.body.error);
  const again = await call("POST", "/api/repay/card/confirm", { paymentIntentId: part.body.paymentIntentId });
  check("and only once", again.body.alreadyBooked === true);
  const mid = await getOnChainProfile(HUMAN);
  check("the facility's debt fell by $0.75", Math.abs(Number(before?.outstandingDebt) - Number(mid?.outstandingDebt) - 0.75) < 0.0001, `${before?.outstandingDebt} -> ${mid?.outstandingDebt}`);

  // Pay the rest, and a little over.
  const rest = await call("POST", "/api/repay/card", { agentAddress: agent, amount: 100 });
  check("the rest is charged as what is owed, rounded up to the cent", rest.body.success && rest.body.amountUsd >= Number(mid?.outstandingDebt), `$${rest.body.amountUsd}`);
  await stripe.paymentIntents.confirm(rest.body.paymentIntentId, { payment_method: "pm_card_visa", return_url: APP });
  const done = await call("POST", "/api/repay/card/confirm", { paymentIntentId: rest.body.paymentIntentId });
  check("paid in full by card", done.body.success, `booked $${done.body.amountUsd} · refunded $${done.body.refundedUsd} · ${done.body.txHash}`);
  const after = await getOnChainProfile(HUMAN);
  check("the facility shows the debt cleared", Number(after?.outstandingDebt) === 0, `outstanding ${after?.outstandingDebt}`);
  const agentAfter = (await call("GET", "/api/agents")).body.agents?.find((a: any) => a.address === agent);
  check("the app agrees", Number(agentAfter?.outstandingDebt) === 0, `app debt ${agentAfter?.outstandingDebt}`);

  const nothing = await call("POST", "/api/repay/card", { agentAddress: agent, amount: 1 });
  check("with nothing owed, no card payment is started", nothing.status === 400, nothing.body.error);

  console.log("\nSui: a parked repayment, paid by card\n");
  const SUI_FEED = process.env.SUI_SERVICE_URL || "http://localhost:4031";
  const suiAgent = (await call("POST", "/api/agent/provision", { rail: "sui", label: "card-sui", capUsd: 1, days: 1 })).body.agent?.address;
  check("a Sui agent is made", !!suiAgent, suiAgent);
  const bought = await call("POST", "/api/sui/pay", { url: `${SUI_FEED}/risk?records=20`, agentAddress: suiAgent });
  check("it buys $0.10 on credit, parked on chain", bought.body.success && Number(bought.body.borrowed) > 0, bought.body.obligationId ?? bought.body.error);
  const obs = (await call("GET", "/api/sui/obligations")).body.obligations ?? [];
  const ob = obs.find((o: any) => o.obligationId === bought.body.obligationId);
  check("the obligation is listed with what is owed", ob && ob.owedUsd > 0, `owes $${ob?.owedUsd} · purse $${ob?.purseUsd}`);
  const suiIntent = await call("POST", "/api/repay/card", { agentAddress: suiAgent, obligationId: ob.obligationId });
  check("a card payment is created for the whole obligation", suiIntent.body.success && suiIntent.body.amountUsd >= ob.owedUsd, `$${suiIntent.body.amountUsd}${suiIntent.body.note ? ` · ${suiIntent.body.note}` : ""}`);
  await stripe.paymentIntents.confirm(suiIntent.body.paymentIntentId, { payment_method: "pm_card_visa", return_url: APP });
  const suiBooked = await call("POST", "/api/repay/card/confirm", { paymentIntentId: suiIntent.body.paymentIntentId });
  check("once paid, the agent is funded and settles on Sui", suiBooked.body.success && suiBooked.body.rail === "sui" && !!suiBooked.body.txHash, `settled $${suiBooked.body.amountUsd} · refunded $${suiBooked.body.refundedUsd} · ${suiBooked.body.txHash ?? suiBooked.body.error}`);
  const suiAgain = await call("POST", "/api/repay/card/confirm", { paymentIntentId: suiIntent.body.paymentIntentId });
  check("and only once", suiAgain.body.alreadyBooked === true);
  const obsAfter = (await call("GET", "/api/sui/obligations")).body.obligations ?? [];
  const obAfter = obsAfter.find((o: any) => o.obligationId === ob.obligationId);
  check("the obligation is settled on chain", obAfter?.status === "settled" && obAfter.owedUsd === 0, `${obAfter?.status} · owes $${obAfter?.owedUsd}`);
  const suiNothing = await call("POST", "/api/repay/card", { agentAddress: suiAgent, obligationId: ob.obligationId });
  check("a settled obligation cannot be charged again", suiNothing.status === 400, suiNothing.body.error);

  console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("e2e failed:", err);
  process.exit(1);
});
