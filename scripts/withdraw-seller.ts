/**
 * Withdraws what the Arc seller has earned from Circle Gateway.
 *
 * x402 payments through Gateway never reach the seller's wallet: they build up
 * as the seller's Gateway balance, and only the seller's key can withdraw it.
 * On testnet the useful thing to do with it is send it back to Lifeline's
 * funding wallet, so the money agents spend comes round again instead of
 * draining.
 *
 *   npm run withdraw:seller                    # all of it, to the funding wallet
 *   npm run withdraw:seller -- 5               # exactly 5 USDC
 *   npm run withdraw:seller -- --to 0xabc...   # to another address
 *
 * Then `npm run deposit` puts it back into Lifeline's Gateway balance.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const args = process.argv.slice(2);
  const toIndex = args.indexOf("--to");
  const to = toIndex >= 0 ? args[toIndex + 1] : null;
  const amountArg = args.find((a, i) => i !== toIndex + 1 && a !== "--to") ?? null;

  const sellerKey = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!sellerKey) throw new Error("no SELLER_PRIVATE_KEY in the root .env");
  const seller = privateKeyToAccount(sellerKey).address;
  if (process.env.SELLER_WALLET_ADDRESS && process.env.SELLER_WALLET_ADDRESS.toLowerCase() !== seller.toLowerCase()) {
    throw new Error(`SELLER_PRIVATE_KEY is ${seller}, but SELLER_WALLET_ADDRESS is ${process.env.SELLER_WALLET_ADDRESS}`);
  }

  const fundingKey = (process.env.PRIVATE_KEY || process.env.LIFELINE_FUNDING_PRIVATE_KEY) as `0x${string}` | undefined;
  const recipient = (to ?? (fundingKey ? privateKeyToAccount(fundingKey).address : null)) as `0x${string}` | null;
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("no recipient: pass --to 0x... or set PRIVATE_KEY");

  const client = new GatewayClient({ chain: "arcTestnet", privateKey: sellerKey });
  const before = await client.getBalances();
  const available = Number(before.gateway.formattedAvailable);
  console.log(`\n  seller   ${seller}\n  gateway  ${available} USDC available`);

  const amount = amountArg !== null ? Number(amountArg) : available;
  if (!Number.isFinite(amount) || amount <= 0) {
    console.log("  nothing to withdraw\n");
    return;
  }
  if (amount > available) throw new Error(`asked for ${amount} USDC; the seller has ${available} available`);

  console.log(`  withdrawing ${amount} USDC to ${recipient}...`);
  const r = await client.withdraw(amount.toFixed(6), { recipient });
  console.log(`  withdrew ${r.formattedAmount} USDC · mint tx ${r.mintTxHash}\n`);
}

main().catch((err) => {
  console.error("\nwithdraw failed:", err?.message || err);
  process.exit(1);
});
