process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.INTERCEPTA_API_KEY = "test";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { POST as report, GET as reports } from "../src/app/api/risk/report/route";

/** Reporting an address to Intercepta: humans only, validated, rate-limited, recorded. Intercepta is stood in for. */

useSandbox();
const HUMAN = "0x" + "f6".repeat(32);
const ADDR = "0x39308ae43e5dda98db5fb17d005c5c764e5a2fed";
const sent: any[] = [];
globalThis.fetch = (async (url: string, init: any) => {
  sent.push({ url: String(url), body: JSON.parse(init.body), key: init.headers["X-API-KEY"] });
  return Response.json({ success: true, message: "Address report submitted successfully" });
}) as typeof fetch;

const cookie = `lifeline_session=${attachSession(NextResponse.json({}), HUMAN).cookies.get("lifeline_session")!.value}`;
const post = (body: unknown, c = cookie) =>
  new NextRequest("http://localhost/api/risk/report", { method: "POST", body: JSON.stringify(body), headers: { cookie: c, "content-type": "application/json" } });

test("only a signed-in human can report", async () => {
  assert.equal((await report(post({ address: ADDR, kind: "malicious" }, ""))).status, 401);
  assert.equal(sent.length, 0);
});

test("a bad address or kind is refused before Intercepta hears of it", async () => {
  assert.equal((await report(post({ address: "0x123", kind: "malicious" }))).status, 400);
  assert.equal((await report(post({ address: ADDR, kind: "maybe" }))).status, 400);
  assert.equal(sent.length, 0);
});

test("a report reaches Intercepta's report endpoint, said plainly, and is recorded", async () => {
  const res = await report(post({ address: ADDR, kind: "malicious", note: "Took payment, delivered nothing." }));
  assert.equal(res.status, 200);
  const r = sent.at(-1);
  assert.match(r.url, /\/api\/public\/v2\/extension\/reports\/address$/);
  assert.equal(r.body.address, ADDR);
  assert.match(r.body.message, /^Reported as malicious: Intercepta did not flag it\. Took payment, delivered nothing\. \(via Lifeline\)$/);
  const mine = await (await reports(new NextRequest("http://localhost/api/risk/report", { headers: { cookie } }))).json();
  assert.equal(mine.reports.length, 1);
  assert.equal(mine.reports[0].kind, "malicious");
});

test("no more than ten an hour", async () => {
  for (let i = 0; i < 9; i++) await report(post({ address: ADDR, kind: "safe" }));
  assert.equal((await report(post({ address: ADDR, kind: "safe" }))).status, 429);
});
