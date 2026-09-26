process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.LIFELINE_DEFAULT_GRACE_DAYS = "30";

import { test } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { addAgentToStore, getAgentByAddress } from "../src/lib/agentStore";
import { createLoan, getAllLoans, saveAllLoans, processRepayment } from "../src/lib/loanStore";
import { openRailDebt, defaultObligation, settleObligation } from "../src/lib/railDebt";
import { getHumanReputationRecord, getAllReputationRecords, saveAllReputationRecords } from "../src/lib/reputationStore";
import { enforceStanding, standingOf, borrowingBlocked, useChainHooks, appliedStanding } from "../src/lib/standing";

/** Humans who do not repay: suspended, then defaulted, then restored when they pay. Chain calls stood in for. */

useSandbox();
const DAY = 24 * 60 * 60 * 1000;
const calls: string[] = [];
let failNext = false;
useChainHooks({
  arc: {
    suspend: async (h) => (calls.push(`arc:suspend:${h}`), "0xsuspend"),
    activate: async (h) => (calls.push(`arc:activate:${h}`), "0xactivate"),
    markDefault: async (h) => {
      if (failNext) {
        failNext = false;
        throw new Error("rpc down");
      }
      calls.push(`arc:default:${h}`);
      return "0xdefault";
    },
  },
  sui: { setStatus: async (h, s) => (calls.push(`sui:${s}:${h}`), "digest") },
});

let n = 0;
const human = () => "0x" + (++n).toString(16).padStart(64, "a");
const agentOf = (h: string) => {
  const address = "0x" + (n * 7).toString(16).padStart(40, "b");
  addAgentToStore({ address, name: "late", humanOwner: h, creditLimit: 10, outstandingDebt: 1, totalBorrowed: 1, totalRepaid: 0, currentBalance: 0, status: "Active" } as any);
  return address;
};
const loanDue = (h: string, agent: string, dueInMs: number) => {
  const loan = createLoan({ agentAddress: agent, agentName: "late", humanOwner: h, amount: 1, txHash: "0x1" });
  const all = getAllLoans();
  all.find((l) => l.loanId === loan.loanId)!.dueAt = Date.now() + dueInMs;
  saveAllLoans(all);
  return loan;
};

test("a loan not yet due leaves the line in good standing, and nothing is touched", async () => {
  const h = human();
  loanDue(h, agentOf(h), 3 * DAY);
  await enforceStanding(h);
  assert.equal(standingOf(h).arc.status, "good");
  assert.equal(borrowingBlocked(h, "arc"), null);
  assert.equal(calls.filter((c) => c.endsWith(h)).length, 0);
});

test("past due: the line is suspended on chain, the agent is delinquent, and new credit is refused", async () => {
  const h = human();
  const a = agentOf(h);
  loanDue(h, a, -2 * DAY);
  await enforceStanding(h);
  const s = standingOf(h).arc;
  assert.equal(s.status, "delinquent");
  assert.ok(s.overdueUsd > 1 && s.defaultsAt! > Date.now());
  assert.deepEqual(calls.filter((c) => c.endsWith(h)), [`arc:suspend:${h}`]);
  assert.equal(getAgentByAddress(a)!.status, "Delinquent");
  assert.match(borrowingBlocked(h, "arc")!, /suspended/);

  // Enforcing again changes nothing.
  await enforceStanding(h);
  assert.equal(calls.filter((c) => c.endsWith(h)).length, 1);
});

test("past the grace period: a default on chain, and the record drops to the first tier", async () => {
  const h = human();
  const a = agentOf(h);
  const all = getAllReputationRecords();
  all[h.toLowerCase()] = { humanOwner: h, totalInterestPaid: 3, totalActiveDurationDays: 40, repaymentsCount: 12, currentTierNumber: 3 };
  saveAllReputationRecords(all);

  loanDue(h, a, -31 * DAY);
  await enforceStanding(h);
  assert.equal(standingOf(h).arc.status, "defaulted");
  assert.ok(calls.includes(`arc:default:${h}`));
  const rec = getHumanReputationRecord(h, "arc");
  assert.equal(rec.currentTierNumber, 1);
  assert.equal(rec.repaymentsCount, 0);
  assert.equal(rec.defaults, 1);
  assert.match(borrowingBlocked(h, "arc")!, /default/);
});

test("paying what was overdue restores the line and the agent; the record's penalty stays", async () => {
  const h = human();
  const a = agentOf(h);
  const loan = loanDue(h, a, -31 * DAY);
  await enforceStanding(h);
  assert.equal(appliedStanding(h).arc?.status, "defaulted");

  processRepayment({ payingAgentAddress: a, amount: 5, targetLoanId: loan.loanId, humanOwner: h, txHash: "0xrepay" });
  await enforceStanding(h);
  assert.equal(standingOf(h).arc.status, "good");
  assert.ok(calls.includes(`arc:activate:${h}`));
  assert.notEqual(getAgentByAddress(a)!.status, "Delinquent");
  assert.equal(borrowingBlocked(h, "arc"), null);
  assert.equal(getHumanReputationRecord(h, "arc").currentTierNumber, 1);
});

test("a chain call that fails is tried again on the next check", async () => {
  const h = human();
  loanDue(h, agentOf(h), -40 * DAY);
  failNext = true;
  await enforceStanding(h);
  assert.ok(appliedStanding(h).arc?.chainError);
  assert.ok(!calls.includes(`arc:default:${h}`));
  await enforceStanding(h);
  assert.ok(calls.includes(`arc:default:${h}`));
  assert.equal(appliedStanding(h).arc?.chainError, undefined);
});

test("Sui: a defaulted parked repayment defaults the profile; curing it restores the line", async () => {
  const h = human();
  const a = agentOf(h);
  openRailDebt({ humanOwner: h, rail: "sui", agentAddress: a, amountUsd: 0.4, obligationId: "0xob1", resource: "r" });
  await enforceStanding(h);
  assert.equal(standingOf(h).sui.status, "good");

  defaultObligation("0xob1", "purse empty");
  await enforceStanding(h);
  assert.equal(standingOf(h).sui.status, "defaulted");
  assert.ok(calls.includes(`sui:defaulted:${h}`));
  assert.equal(getHumanReputationRecord(h, "sui").currentTierNumber, 1);
  assert.match(borrowingBlocked(h, "sui")!, /default/);

  settleObligation("0xob1");
  await enforceStanding(h);
  assert.equal(standingOf(h).sui.status, "good");
  assert.ok(calls.includes(`sui:active:${h}`));
});
