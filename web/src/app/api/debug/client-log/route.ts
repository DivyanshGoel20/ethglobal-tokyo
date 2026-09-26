import { NextRequest, NextResponse } from "next/server";

/**
 * Where a phone's browser reports what went wrong before the app could.
 *
 * World App's webview has no console we can see. The reporter in the root
 * layout sends script errors, failed script loads and a "booted" mark here,
 * and they land in the server log. Size-capped; it only ever logs.
 */
export async function POST(req: NextRequest) {
  const text = (await req.text().catch(() => "")).slice(0, 4000);
  let entry: Record<string, unknown> = {};
  try {
    entry = JSON.parse(text);
  } catch {
    entry = { raw: text };
  }
  console.log(`[client] ${String(entry.k ?? "?")} ${String(entry.u ?? "")} ${String(entry.m ?? "")}\n  ${String(entry.s ?? "").split("\n").slice(0, 6).join("\n  ")}\n  ua=${String(entry.ua ?? "").slice(0, 140)}`);
  return new NextResponse(null, { status: 204 });
}
