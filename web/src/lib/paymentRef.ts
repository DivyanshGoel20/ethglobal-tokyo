/**
 * What goes on chain as a drawdown's reference.
 *
 * A reference is stored as a Solidity string, which costs one fresh storage
 * slot per 32 bytes plus one for the length. The full resource URL ran to three
 * slots - about 60,000 gas, or two thirds of a cent - to record a payment that
 * is itself a cent. The URL is already kept in the loan store, where it costs
 * nothing and is easier to query.
 *
 * So the on-chain reference is a tag, not a description: one slot, never more.
 */
const MAX_BYTES = 31;

export function shortRef(reference: string): string {
  const trimmed = (reference || "").trim();
  if (!trimmed) return "draw";

  // Byte length, not character count: a multi-byte character near the boundary
  // would otherwise push the string into a second slot.
  const bytes = Buffer.from(trimmed, "utf8");
  if (bytes.length <= MAX_BYTES) return trimmed;

  // Cut on a character boundary rather than mid-sequence.
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, MAX_BYTES))
    .replace(/�+$/, "");
}

import { keccak256, toBytes } from "viem";

/**
 * The on-chain form of a reference: a hash of the readable one.
 *
 * One slot instead of three, and it still proves which reference a row belongs
 * to - the readable string is kept on the loan record and can be re-hashed to
 * match.
 */
export function refHash(reference: string): `0x${string}` {
  return keccak256(toBytes(shortRef(reference)));
}
