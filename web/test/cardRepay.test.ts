process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.STRIPE_SECRET_KEY = "sk_test_stand_in";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_stand_in";

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { addAgentToStore, updateAgentInStore } from "../src/lib/agentStore";
import { useStripeClient, bookCardRepayment } from "../src/lib/cardRepay";
import { POST as start } from "../src/app/api/repay/card/route";
import { POST as confirm } from "../src/app/api/repay/card/confirm/route";

/**
 * Card repayment: what Lifeline decides around Stripe.
 *
 * Stripe is stood in for here; booking on Arc is exercised live by
 * test/e2e/card.e2e.ts in Stripe test mode.
 */

useSandbox();
const ALICE = "0x" + "a1".repeat(32);
const BOB = "0x" + "b2".repeat(32);
const AGENT = ("0x" + "11".repeat(20)) as `0x${string}`;

addAgentToStore({ address: AGENT, name: "scout", humanOwner: ALICE, creditLimit: 10, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, currentBalance: 0 } as any);

let created: any[];
let refunds: any[];
let intent: any;
beforeEach(() => {
  created = [];
  refunds = [];
  updateAgentInStore(AGENT, { outstandingDebt: 1.2625 });
  intent = { id: "pi_1", status: "succeeded", currency: "usd", amount: 127, amount_received: 127, metadata: { purpose: "lifeline_repayment", human: ALICE, agentAddress: AGENT } };
  useStripeClient({
    paymentIntents: {
      create: async (p: any) => (created.push(p), { id: "pi_new", client_secret: "pi_new_secret" }),
      retrieve: async () => intent,
    },
    refunds: { create: async (p: any) => (refunds.push(p), { id: "re_1" }) },
  } as unknown as Stripe);
});

const cookie = (h: string) => `lifeline_session=${attachSession(NextResponse.json({}), h).cookies.get("lifeline_session")!.value}`;
const post = (url: string, body: unknown, who?: string) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { cookie: who ? cookie(who) : "", "content-type": "application/json" } });

test("only a signed-in human can start a card repayment", async () => {
  assert.equal((await start(post("/api/repay/card", { agentAddress: AGENT, amount: 1 }))).status, 401);
});

test("paying the whole debt rounds up to the cent, and names the human and agent", async () => {
  const res = await start(post("/api/repay/card", { agentAddress: AGENT, amount: 1.2625 }, ALICE));
  const d = await res.json();
  assert.equal(d.amountUsd, 1.27);
  assert.equal(created[0].amount, 127);
  assert.equal(created[0].currency, "usd");
  assert.deepEqual(created[0].metadata, { purpose: "lifeline_repayment", human: ALICE, agentAddress: AGENT });
});

test("more than is owed is charged as what is owed", async () => {
  await start(post("/api/repay/card", { agentAddress: AGENT, amount: 50 }, ALICE));
  assert.equal(created[0].amount, 127);
});

test("another human's agent, nothing owed, or under Stripe's minimum is refused", async () => {
  assert.equal((await start(post("/api/repay/card", { agentAddress: AGENT, amount: 1 }, BOB))).status, 403);
  assert.equal((await start(post("/api/repay/card", { agentAddress: AGENT, amount: 0.2 }, ALICE))).status, 400);
  updateAgentInStore(AGENT, { outstandingDebt: 0 });
  assert.equal((await start(post("/api/repay/card", { agentAddress: AGENT, amount: 1 }, ALICE))).status, 400);
  assert.equal(created.length, 0, "Stripe was never asked");
});

test("a payment that has not succeeded is not booked", async () => {
  intent.status = "requires_payment_method";
  const r = await bookCardRepayment("pi_1");
  assert.equal(r.ok, false);
});

test("someone else's payment, or one that is not a repayment, is not booked", async () => {
  assert.equal((await confirm(post("/api/repay/card/confirm", { paymentIntentId: "pi_1" }, BOB))).status, 403);
  intent.metadata = { purpose: "something_else" };
  assert.equal((await bookCardRepayment("pi_1")).ok, false);
});

test("paid when nothing is owed any more: all of it goes back, and it is recorded once", async () => {
  updateAgentInStore(AGENT, { outstandingDebt: 0 });
  intent.id = "pi_nothing_owed";
  const r = await bookCardRepayment("pi_nothing_owed");
  assert.deepEqual(r, { ok: true, amountUsd: 0, refundedUsd: 1.27 });
  assert.deepEqual(refunds, [{ payment_intent: "pi_nothing_owed" }]);
  const again = await bookCardRepayment("pi_nothing_owed");
  assert.equal(again.ok && again.alreadyBooked, true);
  assert.equal(refunds.length, 1, "not refunded twice");
});
