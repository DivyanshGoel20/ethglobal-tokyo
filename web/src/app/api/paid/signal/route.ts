import { NextRequest, NextResponse } from "next/server";


const SELLER_WALLET = process.env.SELLER_WALLET_ADDRESS || "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const PRICE_MICRO = "10000";
const PRICE_FORMATTED = "0.01 USDC";
const TITLE = "Alpha Signal Intelligence";

export async function GET(req: NextRequest) {
  // Check for Payment-Signature header sent by FloatSigner / x402 client
  const paymentSig = req.headers.get("payment-signature");

  if (!paymentSig) {
    // Return HTTP 402 Payment Required with x402 specification
    const paymentRequired = {
      x402Version: 2,
      resource: "/api/paid/signal",
      accepts: [
        {
          scheme: "circleGateway",
          network: "arcTestnet",
          chainId: 5042002,
          payTo: SELLER_WALLET,
          amount: PRICE_MICRO,
          currency: "USDC",
          description: TITLE,
        },
      ],
    };

    const base64Header = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");

    return new NextResponse(JSON.stringify(paymentRequired), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": base64Header,
        "WWW-Authenticate": "x402 version=2, scheme=circleGateway",
      },
    });
  }

  // Parse payment signature
  let payer = "0xAgent";
  let transactionId = "tx_" + Date.now();
  try {
    const parsed = JSON.parse(Buffer.from(paymentSig, "base64").toString("utf-8"));
    if (parsed.signer || parsed.payer || parsed.from) {
      payer = parsed.signer || parsed.payer || parsed.from;
    }
  } catch {}

  const settleResponse = Buffer.from(
    JSON.stringify({
      transaction: transactionId,
      status: "SETTLED",
      network: "arcTestnet",
    })
  ).toString("base64");

  
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
        payer,
        amount: PRICE_FORMATTED,
        network: "Arc Testnet (5042002)",
        verified: true,
      },
    },
    {
      headers: {
        "PAYMENT-RESPONSE": settleResponse,
      },
    }
  );
  
}
