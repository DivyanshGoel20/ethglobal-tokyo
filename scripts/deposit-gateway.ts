/**
 * Tops up Lifeline's Circle Gateway balance, which is what settles x402 payments
 * on Arc.
 *
 * The Gateway balance is separate from the wallet balance: USDC sitting in the
 * wallet cannot pay a 402, it has to be deposited first. Lifeline paying on an
 * agent's behalf draws on this, so when it runs dry every drawdown fails at
 * settlement no matter how much headroom the facility says is left.
 *
 *   npm run deposit                 # tops up to the 50 USDC floor
 *   npm run deposit -- 25           # deposits exactly 25
 *   npm run deposit -- --to 120     # deposits whatever reaches 120
 *
 * Amounts are in USDC. The wallet keeps whatever it is not asked to move.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

/** Below this, settlement is one bad day from failing. */
const FLOOR = 50;

async function main() {
  const args = process.argv.slice(2);
  const toIndex = args.indexOf("--to");
  const target = toIndex >= 0 ? Number(args[toIndex + 1]) : null;
  const exact = toIndex < 0 && args[0] ? Number(args[0]) : null;

  if ((target !== null && !Number.isFinite(target)) || (exact !== null && !Number.isFinite(exact))) {
    throw new Error("amount must be a number, e.g. `npm run deposit -- 25`");
  }

  const privateKey = (process.env.PRIVATE_KEY ||
    process.env.LIFELINE_FUNDING_PRIVATE_KEY) as `0x${string}`;
  if (!privateKey) {
    throw new Error("no PRIVATE_KEY or LIFELINE_FUNDING_PRIVATE_KEY (set it in the root .env)");
  }

  const client = new GatewayClient({ chain: "arcTestnet", privateKey });
  const before = await client.getBalances();

  const wallet = Number(before.wallet.formatted);
  const gateway = Number(before.gateway.formattedAvailable);

  console.log(`  wallet   ${client.address}`);
  console.log(`  holds    ${before.wallet.formatted} USDC on Arc`);
  console.log(`  gateway  ${before.gateway.formattedAvailable} USDC available`);

  const want = target ?? FLOOR;
  const amount = exact ?? Math.max(0, Math.ceil((want - gateway) * 1e6) / 1e6);

  if (amount <= 0) {
    console.log(`\n  already at ${gateway} USDC, at or above the ${want} target - nothing to do`);
    return;
  }

  // Depositing more than the wallet holds fails at the transfer rather than
  // here, with a less obvious message.
  if (amount > wallet) {
    throw new Error(
      `cannot deposit ${amount} USDC: the wallet holds ${wallet}. ` +
        `Claim testnet USDC at https://faucet.circle.com (Arc Testnet).`
    );
  }

  console.log(`\n  depositing ${amount} USDC...`);
  const result = await client.deposit(String(amount));
  console.log(`  tx ${result.depositTxHash}`);

  // Circle credits a deposit a beat after the transaction lands, so reading
  // straight back reported the old figure and made a deposit that had worked
  // look like one that had not.
  const expected = gateway + amount - 0.000001;
  let after = await client.getBalances();
  for (let i = 0; i < 12 && Number(after.gateway.formattedAvailable) < expected; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    after = await client.getBalances();
  }

  console.log(`\n  wallet   ${after.wallet.formatted} USDC`);
  console.log(`  gateway  ${after.gateway.formattedAvailable} USDC available`);

  if (Number(after.gateway.formattedAvailable) < expected) {
    console.log(`\n  not credited yet after a minute. The transaction is on chain;`);
    console.log(`  re-run with no arguments to see where it settled.`);
  }
}

main().catch((err) => {
  console.error("\ndeposit failed:", err?.message || err);
  process.exit(1);
});
