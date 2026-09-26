import { test } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { recordPayment } from "../src/lib/paymentStore";
import { withFirstPayeeRule, hasPaidBefore, FIRST_PAYEE_TRIAL_USD } from "../src/lib/payeePolicy";
import type { Verdict } from "../src/lib/intercepta";

/** A payee none of the human's agents has paid is held unless the payment is a small trial. */

useSandbox();
const HUMAN = "0x" + "e5".repeat(32);
const PAYEE = "0x" + "ab".repeat(20);
const clean = (amountUsd: number): Verdict => ({
  decision: "pay",
  reasons: ["No known risk on the payee, the asset or the authorisation."],
  capUsd: 2,
  amountUsd,
  checks: [],
  screenedAt: Date.now(),
  provider: "intercepta",
});

test("a first payment within the trial goes through, noted", () => {
  const v = withFirstPayeeRule(clean(0.01), HUMAN, PAYEE);
  assert.equal(v.decision, "pay");
  assert.equal(v.checks.at(-1)!.level, "elevated");
  assert.match(v.reasons.at(-1)!, /trial for a new payee/);
});

test("a first payment over the trial is held for the human, with the reason first", () => {
  const v = withFirstPayeeRule(clean(1), HUMAN, PAYEE);
  assert.equal(v.decision, "hold");
  assert.equal(v.capUsd, FIRST_PAYEE_TRIAL_USD);
  assert.match(v.reasons[0], /none of your agents has paid it before/);
});

test("once paid, the payee is known and ordinary limits apply", () => {
  recordPayment({ paymentId: "p1", agentAddress: "0x1", humanProfileId: HUMAN, sellerAddress: PAYEE, resourceUrl: "x", requestedAmount: "0.01", agentGatewayBalance: "0", shortfall: "0", fundingSource: "AGENT_GATEWAY", drawdownId: null, status: "SUCCESS", timestamp: Date.now() });
  assert.equal(hasPaidBefore(HUMAN, PAYEE.toUpperCase().replace("0X", "0x")), true);
  const v = withFirstPayeeRule(clean(1), HUMAN, PAYEE);
  assert.equal(v.decision, "pay");
  assert.equal(v.checks.at(-1)!.level, "clean");
});

test("a refused or failed payment does not make a payee known", () => {
  const other = "0x" + "cd".repeat(20);
  recordPayment({ paymentId: "p2", agentAddress: "0x1", humanProfileId: HUMAN, sellerAddress: other, resourceUrl: "x", requestedAmount: "1", agentGatewayBalance: "0", shortfall: "0", fundingSource: "AGENT_GATEWAY", drawdownId: null, status: "REFUSED_RISK", timestamp: Date.now() });
  assert.equal(hasPaidBefore(HUMAN, other), false);
});

test("a refusal stands, untouched", () => {
  const refused = { ...clean(1), decision: "refuse" as const };
  assert.equal(withFirstPayeeRule(refused, HUMAN, "0x" + "ef".repeat(20)).decision, "refuse");
});

test("another human's history does not count", () => {
  assert.equal(hasPaidBefore("0x" + "99".repeat(32), PAYEE), false);
});
