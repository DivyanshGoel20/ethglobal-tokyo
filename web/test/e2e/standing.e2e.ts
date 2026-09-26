/**
 * A human who does not repay, live: Arc testnet and Sui testnet.
 *
 *   npm run dev            # the app
 *   npm run sui:service    # the Sui seller
 *   npm run e2e:standing
 *
 * What it shows:
 *   1. Arc: a loan past due suspends the profile on chain and new credit is
 *      refused; past the grace period it is marked defaulted on chain and the
 *      record drops to the first tier; repaying makes the profile active again
 *   2. Sui: a defaulted parked repayment defaults the profile on chain;
 *      settling it restores the line
 *
 * Nobody waits a week: the harness moves a loan's due date back in the same
 * ledger the app reads, which is exactly what time would do.
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { attachSession } from "../../src/lib/session";
import { ensureHumanProfileOnChain, readArcProfileStatus, computeProfileId } from "../../src/lib/facilityContract";
import { getAllLoans, saveAllLoans } from "../../src/lib/loanStore";
import { defaultObligation } from "../../src/lib/railDebt";
import { getHumanReputationRecord } from "../../src/lib/reputationStore";
import { readProfile } from "@lifeline/sui";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const APP = process.env.LIFELINE_APP_URL || "http://localhost:3000";
const SUI_FEED = process.env.SUI_SERVICE_URL || "http://localhost:4031";
const HUMAN = "0x" + crypto.randomBytes(32).toString("hex");
const DAY = 24 * 60 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Move every open loan of this human's due date back, as time would. */
function dueAgo(ms: number) {
  const all = getAllLoans();
  for (const l of all) if (l.humanOwner === HUMAN && l.status === "ACTIVE") l.dueAt = Date.now() - ms;
  saveAllLoans(all);
}

async function main() {
  console.log(`\nhuman ${HUMAN}\n`);
  await ensureHumanProfileOnChain(HUMAN);
  const cookie = `lifeline_session=${attachSession(NextResponse.json({}), HUMAN).cookies.get("lifeline_session")!.value}`;
  const call = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(`${APP}${route}`, {
      method,
      headers: { "Content-Type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };
  // The dashboard's poll, which is where a fallen-due loan is noticed.
  const look = () => call("GET", "/api/agents");

  console.log("Arc\n");
  const agent = (await call("POST", "/api/agent/provision", { rail: "arc", label: "late-payer", capUsd: 2 })).body.agent.address;
  const drawn = await call("POST", "/api/borrow", { agentAddress: agent, amount: 0.5, disburse: true });
  check("the agent borrows $0.50 into its wallet", drawn.status === 200 && drawn.body.success, drawn.body.txHash ?? drawn.body.error);
  check("the profile starts active on chain", (await readArcProfileStatus(HUMAN)) === "active");

  dueAgo(2 * DAY);
  await look();
  const late = (await call("GET", "/api/standing")).body.arc;
  check("two days late: delinquent", late.status === "delinquent", `$${late.overdueUsd} since ${new Date(late.dueSince).toISOString().slice(0, 10)}`);
  check("suspended on chain", (await readArcProfileStatus(HUMAN)) === "suspended", late.chainTx ?? "");
  const refused = await call("POST", "/api/borrow", { agentAddress: agent, amount: 0.1 });
  check("new credit is refused", refused.status === 403 && refused.body.code === "line_suspended", refused.body.error);
  const agentNow = (await look()).body.agents?.find((a: any) => a.address.toLowerCase() === agent.toLowerCase());
  check("the agent that owes is delinquent", agentNow?.status === "Delinquent", agentNow?.status);

  dueAgo(31 * DAY);
  await look();
  const dflt = (await call("GET", "/api/standing")).body.arc;
  check("past the grace period: defaulted", dflt.status === "defaulted");
  check("defaulted on chain", (await readArcProfileStatus(HUMAN)) === "defaulted", dflt.chainTx ?? "");
  check("the record is back at the first tier", getHumanReputationRecord(HUMAN, "arc").currentTierNumber === 1);

  // The human pays it off by card (Stripe test mode), which works in default too.
  const card = await call("POST", "/api/repay/card", { agentAddress: agent, amount: 100 });
  await stripe.paymentIntents.confirm(card.body.paymentIntentId, { payment_method: "pm_card_visa", return_url: APP });
  const repaid = await call("POST", "/api/repay/card/confirm", { paymentIntentId: card.body.paymentIntentId });
  check("the human repays by card, even while in default", repaid.status === 200 && repaid.body.success, repaid.body.error ?? `$${repaid.body.amountUsd}`);
  const back = (await call("GET", "/api/standing")).body.arc;
  check("repaid: good standing", back.status === "good");
  check("active on chain again", (await readArcProfileStatus(HUMAN)) === "active");
  const again = await call("POST", "/api/borrow", { agentAddress: agent, amount: 0.05 });
  check("and it can borrow again", again.status === 200 && again.body.success, again.body.error ?? "");

  console.log("\nSui\n");
  const suiAgent = (await call("POST", "/api/agent/provision", { rail: "sui", label: "late-sui", capUsd: 1 })).body.agent.address;
  const bought = await call("POST", "/api/sui/pay", { url: `${SUI_FEED}/risk?records=1`, agentAddress: suiAgent });
  check("the Sui agent buys on credit", bought.body.success && !!bought.body.obligationId, bought.body.obligationId ?? bought.body.error);
  // Its purse did not cover it on the due date: what collection records.
  defaultObligation(bought.body.obligationId, "purse short on the due date");
  await look();
  const suiLate = (await call("GET", "/api/standing")).body.sui;
  check("Sui: defaulted", suiLate.status === "defaulted", `$${suiLate.overdueUsd}`);
  const onChain = await readProfile(computeProfileId(HUMAN));
  check("the Sui profile is defaulted on chain", onChain?.status === 3, `status ${onChain?.status}`);
  const refusedSui = await call("POST", "/api/sui/pay", { url: `${SUI_FEED}/risk?records=1`, agentAddress: suiAgent });
  check("new Sui credit is refused", !refusedSui.body.success && /default/i.test(refusedSui.body.error ?? ""), refusedSui.body.error);

  // Test network: a customer pays the agent a cent, so it has something to settle with.
  await call("POST", "/api/sui/earn", { agentAddress: suiAgent, amount: 0.01 });
  const settled = await call("POST", "/api/sui/settle", { obligationId: bought.body.obligationId });
  check("the human settles it", settled.body.success, settled.body.error ?? settled.body.digest);
  check("Sui: good standing again", (await call("GET", "/api/standing")).body.sui.status === "good");
  check("the Sui profile is active on chain", (await readProfile(computeProfileId(HUMAN)))?.status === 1);

  console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("e2e failed:", err);
  process.exit(1);
});
