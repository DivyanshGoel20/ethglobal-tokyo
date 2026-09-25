import { formatUnits } from "viem";
import { getPublicClient } from "./facilityContract";

/**
 * What an agent actually holds on Arc.
 *
 * Distinct from its Circle Gateway balance, and the two are routinely different:
 * USDC sitting in the wallet has not been deposited into the Gateway, so it
 * cannot settle an x402 charge. An agent can hold twenty dollars and still be
 * unable to pay a cent, which is precisely the gap Float covers.
 *
 * On Arc testnet USDC is the native currency at 18 decimals, so this is a
 * balance read rather than an ERC-20 call.
 */
/**
 * Balances are read once per agent on every dashboard poll, and the public Arc
 * RPC rate-limits well before that becomes reasonable. A few seconds of
 * staleness is invisible next to a 429 and its backoff.
 */
const TTL_MS = 10_000;
const cache = new Map<string, { at: number; value: string }>();

export async function getAgentWalletUsdc(address: string): Promise<string> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const wei = await getPublicClient().getBalance({ address: address as `0x${string}` });
    const value = parseFloat(formatUnits(wei, 18)).toFixed(2);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn("[walletBalance] Could not read Arc balance for", address, err);
    // Serve a stale figure over a wrong one: zero reads as "no funds".
    return hit?.value ?? "0.00";
  }
}
