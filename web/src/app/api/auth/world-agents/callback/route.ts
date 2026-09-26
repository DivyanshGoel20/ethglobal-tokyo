import { NextResponse } from "next/server";

/**
 * The redirect URI registered with World ID for Agents. World's portal asks
 * for one even for a client that only uses the device grant, which is all
 * Lifeline uses - approvals arrive by polling, never through this URL.
 */
export async function GET() {
  return new NextResponse("Lifeline uses World ID for Agents device approval. You can close this page.", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
