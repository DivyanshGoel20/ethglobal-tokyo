import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { provisionAgent } from "@/lib/provisionAgent";

/**
 * Provisions a fresh agent wallet for a verified human, on one rail: a key
 * Lifeline holds, authorised on the Arc facility for an Arc agent, and a
 * mandate token bound to that agent.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const body = await req.json().catch(() => ({}));
  // An agent belongs to one rail: Arc or Sui, never both.
  const rail: "arc" | "sui" = body.rail === "sui" ? "sui" : "arc";
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `${rail}-agent`;
  const days = Number.isFinite(body.days) ? Math.min(Math.max(Number(body.days), 1), 90) : 7;

  const made = await provisionAgent(human, { rail, label, days, capUsd: body.capUsd });
  if ("error" in made) return NextResponse.json(made, { status: 409 });

  return NextResponse.json({
    success: true,
    ...made,
    notice:
      `The token is shown once and not stored. This agent borrows against your ${rail === "arc" ? "Arc" : "Sui"} line up to ` +
      "the cap, and only there; its own wallet is what the repayment debits.",
  });
}
