import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { screenOutgoing, screenIncoming, clearCache, ARC_USDC } from "../src/lib/intercepta";
import { createHold, openHolds, resolveHold, getHold } from "../src/lib/holdStore";

/**
 * The policy that turns Intercepta's answers into pay, cap, hold or refuse.
 *
 * Intercepta itself is stood in for here, answer by answer, so each branch of
 * the policy can be pinned down. The live calls are exercised by
 * test/e2e/intercepta.e2e.ts against the real API.
 */

useSandbox();

const PAYEE = "0x" + "ab".repeat(20);
const AGENT = "0x" + "cd".repeat(20);
const TYPED = { primaryType: "TransferWithAuthorization", message: {} };

type Answers = { address?: object; message?: object; token?: object; status?: number };
let answers: Answers;
let calls: string[];

beforeEach(() => {
  process.env.INTERCEPTA_API_KEY = "test";
  clearCache();
  calls = [];
  answers = {
    address: { toxicScore: 0, traits: [] },
    message: { messageType: "TransferWithAuthorization", riskGroup: "Low", detectors: [] },
  };
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    if (answers.status) return new Response("boom", { status: answers.status });
    const body = /analysis\/signature/.test(url)
      ? answers.message
      : /token-intelligence/.test(url)
        ? answers.token ?? {}
        : answers.address;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
});

const out = (over: Partial<Parameters<typeof screenOutgoing>[0]> = {}) =>
  screenOutgoing({ from: AGENT, payTo: PAYEE, asset: ARC_USDC, amountUsd: 0.01, typedData: TYPED, website: "http://x", ...over });

test("a clean payee, real USDC and a plain authorisation is paid", async () => {
  const v = await out();
  assert.equal(v.decision, "pay");
  assert.deepEqual(v.checks.map((c) => c.subject).sort(), ["authorization", "payTo", "token"]);
  assert.ok(calls.some((u) => u.includes(`/account/${PAYEE}/toxic-score`)), "payee deep-scanned");
  assert.ok(calls.some((u) => u.includes("/analysis/signature")), "authorisation scanned");
});

test("a sanctioned payee is refused, with the trait as the reason", async () => {
  answers.address = { toxicScore: 95, traits: [{ name: "sanction_address", risk: 100, txsCount: 3, description: "OFAC" }] };
  const v = await out();
  assert.equal(v.decision, "refuse");
  assert.match(v.reasons[0], /sanction address/);
  assert.equal(v.capUsd, 0);
});

test("a severe trait refuses even on a low score", async () => {
  answers.address = { toxicScore: 5, traits: [{ name: "known_scammer", risk: 40, txsCount: 1, description: "" }] };
  assert.equal((await out()).decision, "refuse");
});

test("warning signs cap what the agent may pay alone", async () => {
  answers.address = { toxicScore: 40, traits: [{ name: "mixer_transfers", risk: 40, txsCount: 2, description: "" }] };
  const small = await out({ amountUsd: 0.1 });
  assert.equal(small.decision, "cap");
  assert.equal(small.capUsd, 0.25);
  const big = await out({ amountUsd: 1 });
  assert.equal(big.decision, "hold");
  assert.match(big.reasons.at(-1)!, /over the \$0\.25/);
});

test("a clean payee above the auto-approve limit goes to the human", async () => {
  const v = await out({ amountUsd: 5 });
  assert.equal(v.decision, "hold");
  assert.equal(v.capUsd, 2);
});

test("a quote in anything but Arc's USDC is refused", async () => {
  answers.token = { riskLevel: "high", category: "malicious", token: { chainId: 1, address: "0x1", symbol: "USDC" }, detectors: [] };
  const v = await out({ asset: "0x" + "99".repeat(20) });
  assert.equal(v.decision, "refuse");
  assert.match(v.reasons[0], /not Arc's native USDC.*USDC, high risk, malicious/);
});

test("a High-risk authorisation is refused", async () => {
  answers.message = { riskGroup: "High", detectors: [{ code: "WALLET_DRAINER", description: "Known drainer" }] };
  const v = await out();
  assert.equal(v.decision, "refuse");
  assert.match(v.reasons[0], /Known drainer/);
});

test("no answer from Intercepta is a hold, never a pass", async () => {
  answers.status = 500;
  const v = await out();
  assert.equal(v.decision, "hold");
  assert.ok(v.checks.some((c) => c.level === "unknown"));
});

test("no key is a hold, and nothing is called", async () => {
  delete process.env.INTERCEPTA_API_KEY;
  const v = await out();
  assert.equal(v.decision, "hold");
  assert.equal(calls.length, 0);
});

test("answers are reused for a while, to spare the quota", async () => {
  await out();
  const first = calls.length;
  await out();
  assert.equal(calls.length, first + 1, "only the authorisation, which differs each time, is asked again");
});

test("a seller refuses a flagged payer and accepts a clean one", async () => {
  assert.equal((await screenIncoming(AGENT, 1)).decision, "pay");
  clearCache();
  answers.address = { toxicScore: 80, traits: [{ name: "attack_money_target", risk: 90, txsCount: 1, description: "stolen funds" }] };
  const v = await screenIncoming(AGENT, 1);
  assert.equal(v.decision, "refuse");
  assert.ok(calls.some((u) => u.includes("/quick-scan")), "the hot path uses quick scan");
});

test("a seller cannot wait for a human, so an unscreened payer is refused", async () => {
  answers.status = 403;
  const v = await screenIncoming(AGENT, 1);
  assert.equal(v.decision, "refuse");
  assert.match(v.reasons[0], /refused the API key/);
});

test("holds belong to their human and are answered once", async () => {
  const verdict = await out({ amountUsd: 5 });
  const h = createHold({ human: "0xH", agentAddress: AGENT, url: "http://x/dossier", method: "GET", payTo: PAYEE, amountUsd: 5, verdict });
  assert.equal(openHolds("0xh").length, 1);
  assert.equal(openHolds("0xother").length, 0);
  resolveHold(h.holdId, "declined");
  assert.equal(getHold(h.holdId)?.status, "declined");
  assert.equal(openHolds("0xH").length, 0);
});
