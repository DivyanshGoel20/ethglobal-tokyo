/**
 * Open a facility for another coin on the package already published.
 *
 *   SUI_NETWORK=testnet npm run sui:open-usdc                 # Circle's testnet USDC
 *   SUI_NETWORK=testnet SUI_LIQUIDITY_USD=15 npm run sui:open-usdc
 *
 * The Move package is generic over the coin it lends, so lending USDC needs no
 * new package: `facility::create<USDC>` opens a Facility<USDC>, the operator
 * keeps its AdminCap, and the operator's own USDC goes in as liquidity. The
 * deployment file is rewritten to point at it, and the one it replaces is
 * kept beside it.
 *
 * Testnet USDC comes from Circle's faucet (faucet.circle.com, "Sui Testnet"),
 * sent to the operator address this prints.
 */
import fs from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import {
  deploymentFile,
  execute,
  fromUnits,
  fundFacility,
  keypairFromSecret,
  network,
  requireDeployment,
  saveDeployment,
  suiClient,
  toUnits,
  type Deployment,
} from "../src";

/** Circle's USDC on each Sui network it is issued on. */
const USDC: Record<string, string> = {
  testnet: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
};

// Kept back for paying agents for their work in the demo (see payOut).
const RESERVE_USD = Number(process.env.SUI_OPERATOR_RESERVE_USD || 2);

async function main() {
  const n = network();
  const coinType = process.env.SUI_COIN_TYPE || USDC[n];
  if (!coinType) throw new Error(`No USDC known on Sui ${n}; set SUI_COIN_TYPE`);
  if (!process.env.SUI_PRIVATE_KEY) throw new Error("SUI_PRIVATE_KEY (the operator) is required");

  const current = requireDeployment();
  const kp = keypairFromSecret(process.env.SUI_PRIVATE_KEY);
  const owner = kp.toSuiAddress();
  if (owner !== current.operator) throw new Error(`SUI_PRIVATE_KEY is ${owner}, not the operator ${current.operator}`);

  console.log(`\nOpening a facility for ${coinType}\n  on package ${current.packageId} (Sui ${n})\n  operator  ${owner}\n`);

  const { balance } = await suiClient().getBalance({ owner, coinType });
  const held = BigInt(balance.balance);
  const reserve = toUnits(RESERVE_USD);
  const liquidity = process.env.SUI_LIQUIDITY_USD ? toUnits(Number(process.env.SUI_LIQUIDITY_USD)) : held - reserve;
  console.log(`  operator holds ${fromUnits(held)} USDC; putting ${fromUnits(liquidity)} in, keeping ${fromUnits(held - liquidity)}`);
  if (liquidity <= 0n || liquidity > held) {
    throw new Error(`Not enough USDC. Get testnet USDC for ${owner} at https://faucet.circle.com (Sui Testnet), then run this again.`);
  }

  const open = new Transaction();
  const [cap] = open.moveCall({ target: `${current.packageId}::facility::create`, typeArguments: [coinType] });
  open.transferObjects([cap], open.pure.address(owner));
  const opened = await execute(open, kp);
  const facility = opened.created.find((c) => c.type.includes("::facility::Facility<"));
  const adminCap = opened.created.find((c) => c.type.endsWith("::facility::AdminCap"));
  if (!facility || !adminCap) throw new Error("facility::create did not return a facility and cap");
  console.log(`  facility  ${facility.objectId}\n  adminCap  ${adminCap.objectId}`);

  // Keep the deployment it replaces, then point the rail at the new one.
  const file = deploymentFile(n);
  const previous = file.replace(/\.json$/, `.${current.coinType.split("::").pop()!.toLowerCase()}.json`);
  if (fs.existsSync(file) && !fs.existsSync(previous)) fs.copyFileSync(file, previous);

  const d: Deployment = {
    network: n,
    packageId: current.packageId,
    facilityId: facility.objectId,
    adminCapId: adminCap.objectId,
    coinType,
    operator: owner,
    deployedAt: new Date().toISOString(),
    digest: opened.digest,
  };
  saveDeployment(d);

  const funded = await fundFacility(kp, liquidity);
  console.log(`  liquidity ${fromUnits(liquidity)} USDC  (${funded.digest})`);
  console.log(`\n  wrote ${file}\n  kept the previous deployment as ${previous}\n`);
}

main().catch((err) => {
  console.error("\nopen-facility failed:", err?.message || err);
  process.exit(1);
});
