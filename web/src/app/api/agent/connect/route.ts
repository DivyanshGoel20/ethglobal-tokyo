import { NextRequest, NextResponse } from "next/server";
import { displayCode, startConnect } from "@/lib/agentConnect";
import { allow, clientIp } from "@/lib/rateLimit";

/**
 * An agent asks for a line of its own. No credential: this is how an agent
 * with nothing starts. It gets a link for its human and a secret to poll with;
 * nothing is issued until the human, signed in with World ID, approves.
 */
export async function POST(req: NextRequest) {
  // Per caller, so one noisy client cannot lock every other agent out, and
  // an overall ceiling so the request file stays small.
  if (!allow(`connect:${clientIp(req)}`, 20, 10 * 60_000) || !allow("connect:all", 600, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many connect requests. Try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
  const name = clean(body.name, 48) || "claude-agent";
  const rail = body.rail === "sui" ? "sui" : "arc";
  const capUsd = Number.isFinite(body.capUsd) && body.capUsd > 0 ? Math.min(Number(body.capUsd), 1000) : undefined;

  const { code, secret, expiresAt } = startConnect({
    name,
    rail,
    capUsd,
    reason: clean(body.reason, 280) || undefined,
    client: clean(body.client, 48) || undefined,
  });

  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return NextResponse.json({
    code: displayCode(code),
    approveUrl: `${base}/connect/${code}`,
    secret,
    expiresAt: new Date(expiresAt).toISOString(),
    pollUrl: `${base}/api/agent/connect/${code}`,
    notice: "Give your human the link. They approve it signed in with World ID; then poll with the secret to collect your mandate.",
  });
}
