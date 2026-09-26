import fs from "node:fs";
import path from "node:path";
import { fromBase64, normalizeSuiAddress, normalizeStructTag, toBase64 } from "@mysten/sui/utils";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { suiClient } from "./client";

/**
 * x402's exact scheme on Sui.
 *
 * The buyer signs a transaction that transfers the price to the seller and
 * sends it, unexecuted, in PAYMENT-SIGNATURE. The seller simulates it, checks
 * that it really pays `payTo` at least `amount` of `asset`, then submits it
 * and serves the resource only once the chain says it succeeded.
 *
 * Gas is the buyer's side's problem: Lifeline sponsors its agents, so a seller
 * needs no SUI and an agent needs none either.
 */

export interface SuiPaymentRequirements {
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  resource?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

export interface SuiPaymentPayload {
  x402Version: 2;
  accepted: SuiPaymentRequirements;
  payload: { transaction: string; signatures: string[] };
}

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
export const decodeHeader = <T>(value: string): T => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

export function paymentPayload(
  accepted: SuiPaymentRequirements,
  bytes: Uint8Array,
  signatures: string[]
): SuiPaymentPayload {
  return { x402Version: 2, accepted, payload: { transaction: toBase64(bytes), signatures } };
}

/** The Sui option in a 402's PAYMENT-REQUIRED header, if it offers one. */
export function suiRequirementsFrom(header: string | null): SuiPaymentRequirements | null {
  if (!header) return null;
  try {
    const quote = decodeHeader<{ accepts?: SuiPaymentRequirements[] }>(header);
    return quote.accepts?.find((a) => a.scheme === "exact" && a.network?.startsWith("sui:")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Transactions that have already bought something.
 *
 * Submitting an executed transaction again returns its effects rather than an
 * error, so without this one payment would unlock the resource every time it
 * was replayed. Kept on disk so a restart does not forget.
 */
class SettledDigests {
  private seen = new Set<string>();
  constructor(private file?: string) {
    try {
      if (file && fs.existsSync(file)) {
        for (const d of JSON.parse(fs.readFileSync(file, "utf8"))) this.seen.add(d);
      }
    } catch {
      /* start empty */
    }
  }
  has(d: string) {
    return this.seen.has(d);
  }
  add(d: string) {
    this.seen.add(d);
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.seen]));
  }
  delete(d: string) {
    this.seen.delete(d);
  }
}

export type Verdict =
  | { ok: true; digest: string; payer: string; paid: bigint }
  | { ok: false; status: 400 | 402; reason: string };

const paidTo = (
  changes: { coinType: string; address: string; amount: string }[] | undefined,
  payTo: string,
  asset: string
) =>
  (changes ?? [])
    .filter(
      (c) =>
        normalizeSuiAddress(c.address) === normalizeSuiAddress(payTo) &&
        normalizeStructTag(c.coinType) === normalizeStructTag(asset)
    )
    .reduce((n, c) => n + BigInt(c.amount), 0n);

export function createSettler(opts: { ledgerFile?: string } = {}) {
  const settled = new SettledDigests(opts.ledgerFile);
  const inFlight = new Set<string>();

  /**
   * Verify against the requirements this server quotes - never the ones the
   * buyer echoes back, or a buyer could pay a cent for a dollar resource by
   * editing `accepted.amount`.
   */
  async function verifyAndSettle(header: string, quoted: SuiPaymentRequirements): Promise<Verdict> {
    let payment: SuiPaymentPayload;
    let bytes: Uint8Array;
    try {
      payment = decodeHeader<SuiPaymentPayload>(header);
      bytes = fromBase64(payment.payload.transaction);
    } catch {
      return { ok: false, status: 400, reason: "Malformed payment-signature" };
    }
    if (payment.accepted?.network !== quoted.network) {
      return { ok: false, status: 400, reason: `Network ${payment.accepted?.network ?? "(none)"} not accepted` };
    }
    if (!Array.isArray(payment.payload.signatures) || payment.payload.signatures.length === 0) {
      return { ok: false, status: 402, reason: "Payment is not signed" };
    }

    const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
    if (settled.has(digest) || inFlight.has(digest)) {
      return { ok: false, status: 402, reason: "That payment has already been used" };
    }
    inFlight.add(digest);

    try {
      const client = suiClient();
      const required = BigInt(quoted.amount);

      const sim = await client.simulateTransaction({
        transaction: bytes,
        include: { balanceChanges: true, transaction: true },
      });
      if (sim.$kind !== "Transaction") {
        const why = sim.FailedTransaction?.status.error?.message ?? "simulation failed";
        return { ok: false, status: 402, reason: `Payment would fail: ${why}` };
      }
      if (paidTo(sim.Transaction.balanceChanges, quoted.payTo, quoted.asset) < required) {
        return { ok: false, status: 402, reason: "Payment does not pay the quoted amount to the seller" };
      }

      const res = await client.executeTransaction({
        transaction: bytes,
        signatures: payment.payload.signatures,
        include: { balanceChanges: true, transaction: true },
      });
      const done = res.Transaction ?? res.FailedTransaction;
      if (!done.status.success) {
        return { ok: false, status: 402, reason: `Payment failed on chain: ${done.status.error?.message}` };
      }
      // The executed effects are the record; the simulation was only a filter.
      const paid = paidTo(done.balanceChanges, quoted.payTo, quoted.asset);
      if (paid < required) {
        return { ok: false, status: 402, reason: "Executed payment fell short of the quoted amount" };
      }

      settled.add(digest);
      const payer = (done.transaction as any)?.sender ?? (sim.Transaction.transaction as any)?.sender ?? "";
      return { ok: true, digest: done.digest, payer, paid };
    } catch (err: any) {
      // Signature failures surface here: the node refuses to execute.
      return { ok: false, status: 402, reason: err?.message ?? String(err) };
    } finally {
      inFlight.delete(digest);
    }
  }

  return { verifyAndSettle };
}
