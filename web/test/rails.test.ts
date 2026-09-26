import { test } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { addAgentToStore, getHumanFacilityStats, getSuiFacilityStats, updateAgentInStore } from "../src/lib/agentStore";
import { openRailDebt, settleObligation } from "../src/lib/railDebt";
import { getHumanCreditTier, getHumanReputationRecord, recordRepaymentInReputation } from "../src/lib/reputationStore";

/**
 * Arc and Sui are separate lines: separate limits, separate debt, separate
 * repayment records. Nothing on one rail moves the other.
 */

useSandbox();
const HUMAN = "0x" + "d4".repeat(32);
const AGENT = ("0x" + "44".repeat(20)) as `0x${string}`;
addAgentToStore({ address: AGENT, name: "a", humanOwner: HUMAN, creditLimit: 10, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, currentBalance: 0 } as any);

test("each rail starts with its own $10 line", () => {
  assert.equal(getHumanFacilityStats(HUMAN).totalAvailableCredit, 10);
  assert.equal(getSuiFacilityStats(HUMAN).availableCredit, 10);
});

test("what Sui draws uses the Sui line only", () => {
  openRailDebt({ humanOwner: HUMAN, rail: "sui", agentAddress: AGENT, amountUsd: 4, obligationId: "0xob1", resource: "/risk" });
  assert.equal(getSuiFacilityStats(HUMAN).availableCredit, 6);
  assert.equal(getHumanFacilityStats(HUMAN).totalAvailableCredit, 10, "Arc is untouched");
});

test("what Arc owes uses the Arc line only", () => {
  updateAgentInStore(AGENT, { outstandingDebt: 7 });
  assert.equal(getHumanFacilityStats(HUMAN).totalAvailableCredit, 3);
  assert.equal(getSuiFacilityStats(HUMAN).availableCredit, 6, "Sui is untouched");
  updateAgentInStore(AGENT, { outstandingDebt: 0 });
  settleObligation("0xob1");
  assert.equal(getSuiFacilityStats(HUMAN).availableCredit, 10);
});

test("repaying on one rail builds that rail's record, and only that one", async () => {
  for (let i = 0; i < 3; i++) await recordRepaymentInReputation({ humanOwner: HUMAN, interestPaid: 0, loanDurationDays: 3, rail: "sui" });
  assert.equal(getHumanReputationRecord(HUMAN, "sui").repaymentsCount, 3);
  assert.equal(getHumanReputationRecord(HUMAN, "arc").repaymentsCount, 0, "Arc's record is untouched");
});

test("Sui's line grows on repayments and time, since Sui charges no fee", async () => {
  // Tier 2 needs 3 repayments over 7 days (and a fee, on Arc): 3 x 3 days.
  assert.equal(getHumanCreditTier(HUMAN, "sui").creditLimit, 25);
  assert.equal(getHumanCreditTier(HUMAN, "arc").creditLimit, 10, "Arc's limit did not move");
});
