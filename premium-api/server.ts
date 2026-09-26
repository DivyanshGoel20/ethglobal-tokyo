import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { formatUnits } from "viem";
import { riskCurveSvg, dossierSvg } from "./artifacts";

type PaidRequest = express.Request & {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
};

const app = express();

const SELLER_WALLET =
  process.env.SELLER_WALLET_ADDRESS ||
  "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://gateway-api-testnet.circle.com";
// Its own variable, not PORT: the Next app already owns 3000, and a shared
// PORT in .env silently pointed both at the same socket.
const PORT = process.env.PREMIUM_API_PORT || process.env.PORT || 4402;

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_WALLET,
  facilitatorUrl: FACILITATOR_URL,
});

app.get(
  "/premium-data",
  gateway.require("$0.01"),
  (req: PaidRequest, res) => {
    const { payer, amount, network } = req.payment!;

    res.json({
      success: true,
      message: "Premium data unlocked.",
      data: {
        signal: "DEMO-ALPHA-001",
        value: 8472,
      },
      payment: {
        payer,
        amount: formatUnits(BigInt(amount), 6) + " USDC",
        network,
      },
    });
  }
);

/**
 * Tiers, so the expensive paths can be exercised.
 *
 * A cent-priced endpoint never tests what happens when a charge is a
 * meaningful fraction of a ten dollar credit line. These do: a dollar draws
 * visibly against headroom, and five dollars twice over is refused, which is
 * the behaviour worth showing.
 *
 * Each returns an artefact rather than a payload, so the difference between
 * tiers is something you can see.
 */
app.get(
  "/risk-curve",
  gateway.require("$1.00"),
  (req: PaidRequest, res) => {
    const { payer, amount, network } = req.payment!;
    res.json({
      success: true,
      artifact: "svg",
      title: "Exposure curve · 30d",
      svg: riskCurveSvg(payer),
      payment: {
        payer,
        amount: formatUnits(BigInt(amount), 6) + " USDC",
        network,
      },
    });
  }
);

app.get(
  "/dossier",
  gateway.require("$5.00"),
  (req: PaidRequest, res) => {
    const { payer, amount, network } = req.payment!;
    res.json({
      success: true,
      artifact: "svg",
      title: "Underwriting dossier",
      svg: dossierSvg(payer),
      payment: {
        payer,
        amount: formatUnits(BigInt(amount), 6) + " USDC",
        network,
      },
    });
  }
);

/** What is for sale, and at what price. Unmetered - the catalogue is free. */
app.get("/catalogue", (_req, res) => {
  res.json({
    resources: [
      { path: "/premium-data", price: 0.01, title: "Alpha signal", artifact: "json" },
      { path: "/risk-curve", price: 1.0, title: "Exposure curve \u00b7 30d", artifact: "svg" },
      { path: "/dossier", price: 5.0, title: "Underwriting dossier", artifact: "svg" },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`Float Premium API running on http://localhost:${PORT}`);
});
