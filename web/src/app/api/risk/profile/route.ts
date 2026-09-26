import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getHuman, unauthenticated } from "@/lib/session";
import { profile, isConfigured } from "@/lib/intercepta";

/**
 * A counterparty's risk profile, with the reasons behind it: Intercepta's
 * deep and quick scores, the traits that drove them, and who the address is.
 * Session-only, because each lookup spends the Intercepta quota.
 */
export async function GET(req: NextRequest) {
  if (!getHuman(req)) return unauthenticated();
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "Not an EVM address." }, { status: 400 });
  if (!isConfigured()) return NextResponse.json({ error: "INTERCEPTA_API_KEY is not set." }, { status: 503 });
  try {
    return NextResponse.json(await profile(address));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Intercepta did not answer" }, { status: 502 });
  }
}
