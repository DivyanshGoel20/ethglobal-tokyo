process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { addAgentToStore, getAgentByAddress, updateAgentInStore } from "../src/lib/agentStore";
import { createLoan, processRepayment, getLoansByAgent, getAllLoans, saveAllLoans } from "../src/lib/loanStore";
import { calculateLoanAccrual } from "../src/lib/reputationEngine";
import { withLedgerLock, syncAgentDebts } from "../src/lib/ledgerLock";
import { POST as repay } from "../src/app/api/repay/route";

/**
 * The ledger bugs found in a real session: a repayment that moved no money,
 * interest charged twice, and debt written back from a stale copy.
 */

useSandbox();
const HUMAN = "0x" + "c3".repeat(32);
const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const agent = () => {
  const address = ("0x" + (++n).toString(16).padStart(40, "0")) as `0x${string}`;
  addAgentToStore({ address, name: `a${n}`, humanOwner: HUMAN, creditLimit: 10, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, currentBalance: 0 } as any);
  return address;
};
const backdate = (loanId: string, ms: number) => {
  const all = getAllLoans();
  const l = all.find((x) => x.loanId === loanId)!;
  l.borrowedAt -= ms;
  saveAllLoans(all);
};

test("repaying from an agent's wallet needs a key Lifeline holds - no money, no repayment", async () => {
  const a = agent();
  createLoan({ agentAddress: a, agentName: "a", humanOwner: HUMAN, amount: 1, txHash: "0x1", memo: "t" });
  syncAgentDebts(HUMAN);
  const cookie = `lifeline_session=${attachSession(NextResponse.json({}), HUMAN).cookies.get("lifeline_session")!.value}`;
  const res = await repay(
    new NextRequest("http://localhost/api/repay", { method: "POST", body: JSON.stringify({ agentAddress: a, amount: 1.01 }), headers: { cookie, "content-type": "application/json" } })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "no_agent_key");
  assert.equal(getLoansByAgent(a)[0].status, "ACTIVE", "the loan is untouched");
  assert.equal(getAgentByAddress(a)!.outstandingDebt, 1.01);
});

test("interest runs on what is owed, once: paying in full leaves nothing behind", () => {
  const a = agent();
  const loan = createLoan({ agentAddress: a, agentName: "a", humanOwner: HUMAN, amount: 1, txHash: "0x1", memo: "t" });
  backdate(loan.loanId, 10 * DAY);
  const due = calculateLoanAccrual(getLoansByAgent(a)[0]).totalDue;
  assert.equal(due, 1.015, "1.00 + 1% fee + 10 days at 0.05%");
  const r = processRepayment({ payingAgentAddress: a, amount: due, humanOwner: HUMAN, txHash: "0x2" });
  assert.equal(r.amountRepaid, due);
  assert.equal(getLoansByAgent(a)[0].status, "SETTLED");
});

test("a partial repayment does not bill the same days again", () => {
  const a = agent();
  const loan = createLoan({ agentAddress: a, agentName: "a", humanOwner: HUMAN, amount: 1, txHash: "0x1", memo: "t" });
  backdate(loan.loanId, 10 * DAY);
  processRepayment({ payingAgentAddress: a, amount: 0.5, humanOwner: HUMAN, txHash: "0x2" });
  const after = calculateLoanAccrual(getLoansByAgent(a)[0]);
  // 1.015 owed, 0.5 paid: 0.515 left, and no fresh interest for days already charged.
  assert.equal(after.totalDue, 0.515);
  assert.equal(after.accruedInterest, 0);
  const now = Date.now();
  const later = calculateLoanAccrual(getLoansByAgent(a)[0], now + 10 * DAY);
  assert.equal(later.accruedInterest, 0.0026, "ten more days, on the 0.515 still owed");
});

test("an agent's debt comes from its loans, not from a stale copy", () => {
  const a = agent();
  createLoan({ agentAddress: a, agentName: "a", humanOwner: HUMAN, amount: 2, txHash: "0x1", memo: "t" });
  updateAgentInStore(a, { outstandingDebt: 99 }); // what a stale write would leave
  syncAgentDebts(HUMAN);
  assert.equal(getAgentByAddress(a)!.outstandingDebt, 2.02);
});

test("ledger changes for one human run one at a time; other humans are not held up", async () => {
  const order: string[] = [];
  const slow = (tag: string, ms: number) => async () => {
    order.push(`${tag}+`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${tag}-`);
  };
  await Promise.all([
    withLedgerLock(HUMAN, slow("repay", 30)),
    withLedgerLock(HUMAN, slow("borrow", 5)),
    withLedgerLock("0xsomeone-else", slow("other", 5)),
  ]);
  assert.ok(order.indexOf("repay-") < order.indexOf("borrow+"), `borrow waited for repay: ${order.join(" ")}`);
  assert.ok(order.indexOf("other-") < order.indexOf("repay-"), "another human's ledger did not wait");
});

test("a failed change still hands the ledger on", async () => {
  await assert.rejects(withLedgerLock(HUMAN, async () => { throw new Error("boom"); }));
  assert.equal(await withLedgerLock(HUMAN, async () => "next"), "next");
});
