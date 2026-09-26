/**
 * Both endings of a parked repayment, on chain, end to end.
 *
 *   npm run sui:service                 # the x402 seller, in one terminal
 *   npm run sui:lifecycle               # here
 *
 * Two agents are minted with nothing. Both buy from the Sui feed on the same
 * human's line, so both draws are covered by credit and both park a repayment
 * before anything is spent. Then one is paid for its work and the other is
 * left idle, the term runs out, and collection runs - by a stranger, to show
 * it needs nobody's permission. One obligation repays; the other defaults and
 * moves nothing.
 *
 * Along the way it checks the edges: an agent with its own coins pays for
 * itself, a replayed payment is refused, and an unsigned one buys nothing.
 * Exits non-zero if any check fails.
 */
import crypto from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
  agentKeypair,
  buildSelfPay,
  depositToPurse,
  encodeHeader,
  fromUnits,
  mintDemoDollars,
  operatorKeypair,
  paySui,
  paymentPayload,
  readObligation,
  readProfile,
  readPurse,
  requireDeployment,
  resolveObligation,
  signTransaction,
  suiRequirementsFrom,
  suiClient,
  toUnits,
  walletUnits,
} from "../src";

const FEED = process.env.SUI_SERVICE_URL || "http://localhost:4031";
const TERM_SECONDS = Number(process.env.LIFECYCLE_TERM_SECONDS || 25);

/** Waits for whatever the seller submitted, so Float's next build reads fresh gas. */
async function settledBy(res: Response) {
  const receipt = res.headers.get("payment-response");
  if (!receipt) return;
  const { transaction } = JSON.parse(Buffer.from(receipt, "base64").toString());
  if (transaction) await suiClient().waitForTransaction({ digest: transaction });
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

const newAgentKey = () => "0x" + crypto.randomBytes(32).toString("hex");

async function main() {
  process.env.FLOAT_TERM_SECONDS = String(TERM_SECONDS);
  const d = requireDeployment();
  const operator = operatorKeypair();
  const profileId = "0x" + crypto.randomBytes(32).toString("hex");
  const ctx = (agentKey: string) => ({ agentKey, profileId, creditLimitUsd: 10, maxCreditUsd: 10 });

  console.log(`\nSui ${d.network}  facility ${d.facilityId}`);
  console.log(`human profile ${profileId}\n`);

  // --- An agent that can afford it pays for itself and owes nothing.
  const rich = newAgentKey();
  await mintDemoDollars(operator, agentKeypair(rich).toSuiAddress(), toUnits(1));
  const own = await paySui(`${FEED}/risk?records=2`, ctx(rich));
  check("an agent with coins pays for itself", own.fundingSource === "AGENT_WALLET" && own.borrowed === "0.000000", `paid ${own.amount} tx ${own.digest}`);

  // --- Two agents with nothing borrow against the same line.
  const earnerKey = newAgentKey();
  const idlerKey = newAgentKey();
  const earner = await paySui(`${FEED}/risk?records=3`, ctx(earnerKey));
  check(
    "a broke agent is covered on credit",
    earner.fundingSource === "FLOAT_CREDIT" && earner.borrowed === "0.015000",
    `borrowed ${earner.borrowed} obligation ${earner.obligationId}`
  );
  check("the repayment was parked before the draw", !!earner.parkedDigest, `parked ${earner.parkedDigest}`);

  const again = await paySui(`${FEED}/risk?records=1`, ctx(earnerKey));
  check("a second draw reuses the same tranche", again.obligationId === earner.obligationId && !again.parkedDigest, `drawn on ${again.obligationId}`);

  const idler = await paySui(`${FEED}/risk?records=2`, ctx(idlerKey));
  check("the second agent borrows on the same line", idler.fundingSource === "FLOAT_CREDIT", `borrowed ${idler.borrowed}`);

  const profile = await readProfile(profileId);
  check("the facility shows one human's debt across both agents", profile?.outstandingDebt === toUnits(0.03), `owes ${fromUnits(profile?.outstandingDebt ?? 0n)}`);

  // --- Replays and forgeries buy nothing.
  const quoteRes = await fetch(`${FEED}/risk?records=1`);
  const quote = suiRequirementsFrom(quoteRes.headers.get("payment-required"))!;
  const payer = agentKeypair(rich);
  const tx = buildSelfPay({ agent: payer.toSuiAddress(), units: BigInt(quote.amount), payTo: quote.payTo });
  const signed = await signTransaction(tx, payer, operator);
  const header = encodeHeader(paymentPayload(quote, signed.bytes, signed.signatures));
  const firstUse = await fetch(`${FEED}/risk?records=1`, { headers: { "payment-signature": header } });
  await settledBy(firstUse);
  const replay = await fetch(`${FEED}/risk?records=1`, { headers: { "payment-signature": header } });
  check("a payment buys once", firstUse.status === 200, `status ${firstUse.status}`);
  check("the same payment replayed buys nothing", replay.status === 402, `status ${replay.status}`);

  const cheap = await fetch(`${FEED}/risk?records=1`);
  const cheapQuote = suiRequirementsFrom(cheap.headers.get("payment-required"))!;
  const underpay = buildSelfPay({ agent: payer.toSuiAddress(), units: BigInt(cheapQuote.amount), payTo: cheapQuote.payTo });
  const under = await signTransaction(underpay, payer, operator);
  const priceySay = await fetch(`${FEED}/risk?records=200`, {
    headers: { "payment-signature": encodeHeader(paymentPayload({ ...cheapQuote, network: cheapQuote.network }, under.bytes, under.signatures)) },
  });
  check("a one-record payment cannot buy two hundred", priceySay.status === 402, `status ${priceySay.status}`);

  const stranger = Ed25519Keypair.generate();
  const forged = buildSelfPay({ agent: payer.toSuiAddress(), units: BigInt(quote.amount), payTo: quote.payTo });
  const forgedSig = await signTransaction(forged, stranger, operator).catch(() => null);
  if (forgedSig) {
    const bad = await fetch(`${FEED}/risk?records=1`, {
      headers: { "payment-signature": encodeHeader(paymentPayload(quote, forgedSig.bytes, forgedSig.signatures)) },
    });
    check("a payment signed by someone else buys nothing", bad.status === 402, `status ${bad.status}`);
  }

  // --- The earner is paid for its work; the idler is not.
  await mintDemoDollars(operator, operator.toSuiAddress(), toUnits(0.05));
  await depositToPurse(operator, earner.purseId!, toUnits(0.05));
  const purse = await readPurse(earner.purseId!);
  check("earnings land in the earner's purse, pledged to its debt", purse.balance === toUnits(0.05) && purse.pledged === toUnits(0.02), `balance ${fromUnits(purse.balance)} pledged ${fromUnits(purse.pledged)}`);

  const early = await resolveObligation(earner.obligationId!);
  check("nothing is collected before its date", early.state === "pending");

  const due = Math.max((await readObligation(earner.obligationId!)).dueMs, (await readObligation(idler.obligationId!)).dueMs);
  const wait = due - Date.now() + 3000;
  console.log(`\n  waiting ${Math.ceil(wait / 1000)}s for both obligations to fall due...\n`);
  await new Promise((r) => setTimeout(r, Math.max(0, wait)));

  // --- Collection is open to anyone: a stranger with gas runs it.
  const keeper = Ed25519Keypair.generate();
  const gas = new Transaction();
  const [coin] = gas.splitCoins(gas.gas, [200_000_000]);
  gas.transferObjects([coin], keeper.toSuiAddress());
  const { execute } = await import("../src");
  await execute(gas, operator);

  const { collect } = await import("../src");
  const e = await collect(keeper, { purseId: earner.purseId!, obligationId: earner.obligationId! });
  const i = await collect(keeper, { purseId: idler.purseId!, obligationId: idler.obligationId! });
  const earnerAfter = await readObligation(earner.obligationId!);
  const idlerAfter = await readObligation(idler.obligationId!);
  check("the earner's obligation repaid, collected by a stranger", earnerAfter.status === "settled", `tx ${e.digest}`);
  check("the idler's obligation defaulted in plain sight", idlerAfter.status === "defaulted", `tx ${i.digest}`);

  const idlerPurse = await readPurse(idler.purseId!);
  check("the default moved nothing", idlerPurse.balance === 0n);

  const after = await readProfile(profileId);
  check("only the defaulted debt still counts against the line", after?.outstandingDebt === toUnits(0.01), `owes ${fromUnits(after?.outstandingDebt ?? 0n)}`);

  // --- The idler earns later and cures its default.
  await mintDemoDollars(operator, agentKeypair(idlerKey).toSuiAddress(), toUnits(0.01));
  check("the idler now holds enough to cure", (await walletUnits(agentKeypair(idlerKey).toSuiAddress())) === toUnits(0.01));
  const { settleEarly } = await import("../src");
  await settleEarly(agentKeypair(idlerKey), operator, {
    purseId: idler.purseId!,
    obligationId: idler.obligationId!,
    depositUnits: toUnits(0.01),
  });
  const cured = await readObligation(idler.obligationId!);
  const clear = await readProfile(profileId);
  check("a default can be cured", cured.status === "settled" && clear?.outstandingDebt === 0n, `owes ${fromUnits(clear?.outstandingDebt ?? 1n)}`);

  console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\nlifecycle failed:", err?.message || err);
  process.exit(1);
});
