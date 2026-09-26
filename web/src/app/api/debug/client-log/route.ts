import { NextRequest, NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/rateLimit";

// One line per field: no caller gets to write a line that looks like the server's.
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);

/**
 * Where a phone's browser reports what went wrong before the app could.
 *
 * World App's webview has no console we can see. The reporter in the root
 * layout sends script errors, failed script loads and a "booted" mark here,
 * and they land in the server log. Size-capped; it only ever logs.
 */
export async function POST(req: NextRequest) {
  if (!allow(`client-log:${clientIp(req)}`, 30, 60_000)) return new NextResponse(null, { status: 429 });
  const text = (await req.text().catch(() => "")).slice(0, 4000);
  let entry: Record<string, unknown> = {};
  try {
    entry = JSON.parse(text);
  } catch {
    entry = { raw: text };
  }
  const stack = String(entry.s ?? "").split("\n").slice(0, 6).map((l) => clean(l, 300));
  console.log(`[client] ${clean(entry.k ?? "?", 40)} ${clean(entry.u, 300)} ${clean(entry.m, 500)}\n  ${stack.join("\n  ")}\n  ua=${clean(entry.ua, 140)}`);
  return new NextResponse(null, { status: 204 });
}
