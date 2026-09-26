import { NextResponse } from "next/server";
import { sectorDocument } from "@/lib/registry";

export const dynamic = "force-dynamic";

/**
 * Lifeline's authorization (sector identifier) document: the exact callback
 * URLs that may share Lifeline's World identifier for a human - Lifeline's own
 * and each partner's. Also served at /.well-known/lifeline-sector.json.
 */
export function GET() {
  return NextResponse.json(sectorDocument(), { headers: { "Cache-Control": "public, max-age=300" } });
}
