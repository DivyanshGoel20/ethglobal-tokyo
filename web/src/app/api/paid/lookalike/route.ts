import { NextRequest, NextResponse } from "next/server";
import { requirePayment } from "@/lib/x402Gateway";
import { DEMO_FAKE_USDC } from "@/lib/intercepta";

const PRICE_USD = 0.01;
const TITLE = "Discount feed (pays in \"USDC\")";

/**
 * A seller that asks to be paid in a lookalike USDC.
 *
 * The payee is clean; the token is not: its quote names a fake "USD Coin"
 * that Intercepta rates malicious (FAKE_TOKEN, KNOWN_MALICIOUS). A buyer that
 * checks what it is paying in refuses before signing - which is what this
 * exists to show. Circle Gateway would not settle it either.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePayment(req, PRICE_USD, TITLE, { asset: DEMO_FAKE_USDC });
  if ("response" in gate) return gate.response;
  return NextResponse.json(
    { success: true, message: "This should not have been bought.", payer: gate.settled.payer },
    { headers: { "PAYMENT-RESPONSE": gate.settled.header } }
  );
}
