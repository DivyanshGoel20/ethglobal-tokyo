import { NextRequest, NextResponse } from "next/server";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

/**
 * x402 for Next route handlers, settled through Circle Gateway.
 *
 * The in-app paid endpoints used to answer a 402 and then serve the goods to
 * any request carrying a `payment-signature` header - parsed, never verified,
 * never settled. Anyone could send `payment-signature: e30=` and read a
 * five-dollar dossier for free. This does what the Express middleware in
 * premium-api does: quote the price from the facilitator's supported
 * networks, then verify and settle the signed authorisation before the
 * handler runs.
 */

const ARC_NETWORK = "eip155:5042002";
const SCHEME = "exact";
const BATCHING_NAME = "GatewayWalletBatched";
const BATCHING_VERSION = "1";
// Seven days plus verification latency, as the Gateway middleware uses.
const MAX_TIMEOUT_SECONDS = 604_900;

export const SELLER_WALLET =
  process.env.SELLER_WALLET_ADDRESS || "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

let facilitator: BatchFacilitatorClient | null = null;
let arcKind: Promise<any> | null = null;

function client(): BatchFacilitatorClient {
  facilitator ??= new BatchFacilitatorClient({
    url: process.env.FACILITATOR_URL || "https://gateway-api-testnet.circle.com",
  });
  return facilitator;
}

/** Arc's entry from the facilitator's /supported, cached for the process. */
async function arcSupport(): Promise<any> {
  arcKind ??= client()
    .getSupported()
    .then((s: any) => {
      const kind = s.kinds.find((k: any) => k.network === ARC_NETWORK && k.extra?.verifyingContract);
      if (!kind) throw new Error("Circle Gateway does not list Arc testnet");
      return kind;
    })
    .catch((err) => {
      arcKind = null; // do not cache a failure
      throw err;
    });
  return arcKind;
}

export const toUnits = (usd: number) => String(Math.round(usd * 1e6));

async function requirements(priceUsd: number) {
  const kind = await arcSupport();
  const usdc = kind.extra?.assets?.find((a: any) => a.symbol === "USDC")?.address;
  if (!usdc) throw new Error("Circle Gateway lists no USDC on Arc testnet");
  return {
    scheme: SCHEME,
    network: ARC_NETWORK,
    asset: usdc,
    amount: toUnits(priceUsd),
    payTo: SELLER_WALLET,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: BATCHING_NAME,
      version: BATCHING_VERSION,
      verifyingContract: kind.extra.verifyingContract,
    },
  };
}

export type Settled = {
  payer: string;
  amount: string;
  network: string;
  transaction?: string;
  /** Goes back to the buyer as PAYMENT-RESPONSE. */
  header: string;
};

const json402 = (body: object) =>
  NextResponse.json(body, { status: 402, headers: { "Content-Type": "application/json" } });

/**
 * Either the response to send (402 with a quote, or a refusal), or proof the
 * payment settled. The handler serves the resource only on the second.
 */
export async function requirePayment(
  req: NextRequest,
  priceUsd: number,
  description: string
): Promise<{ response: NextResponse } | { settled: Settled }> {
  let reqs;
  try {
    reqs = await requirements(priceUsd);
  } catch (err: any) {
    return {
      response: NextResponse.json(
        { error: "No payment network available", detail: err?.message },
        { status: 503 }
      ),
    };
  }

  const header = req.headers.get("payment-signature");
  if (!header) {
    const quote = {
      x402Version: 2,
      resource: { url: new URL(req.url).pathname, description, mimeType: "application/json" },
      accepts: [reqs],
    };
    return {
      response: new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(quote)).toString("base64"),
        },
      }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return { response: NextResponse.json({ error: "Malformed payment-signature" }, { status: 400 }) };
  }
  if (payload?.accepted?.network !== ARC_NETWORK) {
    return {
      response: NextResponse.json(
        { error: `Network ${payload?.accepted?.network ?? "(none)"} not accepted` },
        { status: 400 }
      ),
    };
  }

  // Verified and settled against the requirements this server quotes, never
  // the ones the buyer echoes back - otherwise a buyer could pay a cent for a
  // five-dollar resource by editing `accepted.amount`.
  try {
    const verified = await client().verify(payload, reqs);
    if (!verified.isValid) {
      return { response: json402({ error: "Payment verification failed", reason: verified.invalidReason }) };
    }

    const settled = await client().settle(payload, reqs);
    if (!settled.success) {
      return { response: json402({ error: "Payment settlement failed", reason: settled.errorReason }) };
    }

    const payer = settled.payer ?? verified.payer ?? "";
    return {
      settled: {
        payer,
        amount: reqs.amount,
        network: ARC_NETWORK,
        transaction: settled.transaction,
        header: Buffer.from(
          JSON.stringify({ success: true, transaction: settled.transaction, network: ARC_NETWORK, payer })
        ).toString("base64"),
      },
    };
  } catch (err: any) {
    // The client throws on any non-2xx from Circle, which is almost always a
    // payload it refused. Either way nothing settled, so it is still a 402.
    return {
      response: json402({ error: "Payment could not be verified", reason: err?.message ?? String(err) }),
    };
  }
}
