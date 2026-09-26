process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.NEXT_PUBLIC_APP_URL = "https://lifeline.example";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { bindIdentity } from "../src/lib/worldAgents";
import { addPartner, hashKey, sectorDocument } from "../src/lib/registry";
import { createLoan, getAllLoans, saveAllLoans } from "../src/lib/loanStore";
import { addAgentToStore } from "../src/lib/agentStore";
import { GET as standing } from "../src/app/api/registry/standing/route";
import { GET as sector } from "../src/app/api/registry/sector/route";
import { GET as me } from "../src/app/api/registry/me/route";

/** Lifeline as a registry partner World apps can ask: does this human repay? */

useSandbox();
const HONEST = "0x" + "a1".repeat(32);
const LATE = "0x" + "b2".repeat(32);
const ISS = "https://sandbox.auth.world.org";
bindIdentity(HONEST, { iss: ISS, sub: "sub-honest", authTime: 0, acr: "orb" });
bindIdentity(LATE, { iss: ISS, sub: "sub-late", authTime: 0, acr: "orb" });

// A late payer: a loan 40 days past due (past the 30-day grace).
addAgentToStore({ address: "0x" + "c3".repeat(20), name: "x", humanOwner: LATE, creditLimit: 5, outstandingDebt: 1, totalBorrowed: 1, totalRepaid: 0, currentBalance: 0 } as any);
const loan = createLoan({ agentAddress: "0x" + "c3".repeat(20), agentName: "x", humanOwner: LATE, amount: 1, txHash: "0x1" });
const all = getAllLoans();
all.find((l) => l.loanId === loan.loanId)!.dueAt = Date.now() - 40 * 86_400_000;
saveAllLoans(all);

const { key } = addPartner({ id: "acme", name: "Acme Lending", callbackUrl: "https://acme.example/auth/callback" });
process.env.LIFELINE_REGISTRY_PARTNERS = JSON.stringify([
  { id: "zen", name: "Zen Market", callbackUrl: "https://zen.example/cb", keyHash: hashKey("zen-key") },
]);

const ask = (sub: string, k?: string) =>
  standing(new NextRequest(`https://lifeline.example/api/registry/standing?sub=${sub}`, { headers: k ? { authorization: `Bearer ${k}` } : {} }));
const session = (h: string) => `lifeline_session=${attachSession(NextResponse.json({}), h).cookies.get("lifeline_session")!.value}`;

test("the authorization document lists Lifeline's callback, then every partner's", async () => {
  const doc = await (await sector()).json();
  assert.deepEqual(doc, sectorDocument());
  assert.equal(doc[0], "https://lifeline.example/api/auth/world-agents/callback");
  assert.ok(doc.includes("https://acme.example/auth/callback"));
  assert.ok(doc.includes("https://zen.example/cb"));
});

test("only a partner with its key may ask", async () => {
  assert.equal((await ask("sub-honest")).status, 401);
  assert.equal((await ask("sub-honest", "llp_guess")).status, 401);
  assert.equal((await ask("sub-honest", key)).status, 200);
  assert.equal((await ask("sub-honest", "zen-key")).status, 200, "partners from the environment work too");
});

test("a human who repays is in good standing; one in default is reported as such - and nothing more", async () => {
  const good = await (await ask("sub-honest", key)).json();
  assert.equal(good.found, true);
  assert.equal(good.overall, "good");
  assert.deepEqual(good.standing, { arc: "good", sui: "good" });

  const late = await (await ask("sub-late", key)).json();
  assert.equal(late.overall, "defaulted");
  assert.equal(late.standing.arc, "defaulted");
  // No amounts, no history.
  assert.equal(JSON.stringify(late).includes("overdue"), false);
  assert.equal(JSON.stringify(late).includes("0x"), false);
});

test("someone never linked is simply not found", async () => {
  const r = await (await ask("sub-stranger", key)).json();
  assert.deepEqual({ found: r.found, sub: r.sub }, { found: false, sub: "sub-stranger" });
});

test("every lookup is shown to the human it was about", async () => {
  const mine = await (await me(new NextRequest("https://lifeline.example/api/registry/me", { headers: { cookie: session(LATE) } }))).json();
  assert.equal(mine.listed, true);
  assert.ok(mine.lookups.length >= 1);
  assert.equal(mine.lookups[0].partner, "Acme Lending");
  assert.equal(mine.lookups[0].answered, "defaulted");
  assert.equal((await me(new NextRequest("https://lifeline.example/api/registry/me"))).status, 401);
});
