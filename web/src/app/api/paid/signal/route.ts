import { NextRequest, NextResponse } from "next/server";
import { requirePayment } from "@/lib/x402Gateway";

const PRICE_USD = 0.01;
const TITLE = "Alpha Signal Intelligence";

export async function GET(req: NextRequest) {
  const gate = await requirePayment(req, PRICE_USD, TITLE);
  if ("response" in gate) return gate.response;
  const { settled } = gate;

  return NextResponse.json(
    {
      success: true,
      message: "Premium alpha intelligence unlocked.",
      resource: "/api/paid/signal",
      data: {
        signal: "DEMO-ALPHA-001",
        value: 8472,
        volatility: "0.142",
        confidence: "98.4%",
        action: "EXECUTE_ARBITRAGE",
        timestamp: Date.now(),
      },
      payment: {
        payer: settled.payer,
        amount: `${PRICE_USD.toFixed(2)} USDC`,
        network: settled.network,
        transaction: settled.transaction,
      },
    },
    { headers: { "PAYMENT-RESPONSE": settled.header } }
  );
}
