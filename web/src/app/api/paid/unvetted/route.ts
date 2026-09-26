import { NextRequest, NextResponse } from "next/server";
import { requirePayment } from "@/lib/x402Gateway";
import { DEMO_RISKY_PAYTO } from "@/lib/intercepta";

const PRICE_USD = 0.01;
const TITLE = "Unvetted feed";

/**
 * A seller Lifeline should never pay: its quote names a payee with a record on
 * mainnet (by default an OFAC-listed exploiter's wallet). It exists so the
 * refusal can be seen - Intercepta's verdict stops the agent before it signs,
 * so nothing is ever sent to this address.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePayment(req, PRICE_USD, TITLE, { payTo: DEMO_RISKY_PAYTO });
  if ("response" in gate) return gate.response;
  return NextResponse.json(
    { success: true, message: "This should not have been bought.", payer: gate.settled.payer },
    { headers: { "PAYMENT-RESPONSE": gate.settled.header } }
  );
}
