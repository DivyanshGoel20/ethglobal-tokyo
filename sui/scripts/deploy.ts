/**
 * Publishes Lifeline to Sui and stands up a funded facility.
 *
 *   SUI_NETWORK=localnet npm run sui:deploy     # against `sui start`
 *   SUI_NETWORK=testnet  npm run sui:deploy
 *
 * Publishes the package, opens a Facility<FUSD> with the operator holding its
 * AdminCap, mints demo dollars into it as lending liquidity, and writes the ids
 * to sui/deployments/<network>.json - which is all the web app needs to find it.
 *
 * The operator key is SUI_PRIVATE_KEY. Without one, a key is generated and
 * printed so it can go into .env; on localnet and testnet it is funded from the
 * faucet.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import type { Keypair } from "@mysten/sui/cryptography";
import {
  execute,
  keypairFromSecret,
  network,
  saveDeployment,
  suiClient,
  suiDir,
  toUnits,
  type Deployment,
} from "../src";

const LIQUIDITY_USD = Number(process.env.SUI_LIQUIDITY_USD || 500);
const MIN_GAS = 2_000_000_000n; // 2 SUI

async function operator(): Promise<Keypair> {
  if (process.env.SUI_PRIVATE_KEY) return keypairFromSecret(process.env.SUI_PRIVATE_KEY);
  const kp = Ed25519Keypair.generate();
  console.log(`\n  No SUI_PRIVATE_KEY - generated an operator. Add this to .env:\n`);
  console.log(`  SUI_PRIVATE_KEY=${kp.getSecretKey()}\n`);
  return kp;
}

async function ensureGas(kp: Keypair) {
  const owner = kp.toSuiAddress();
  const { balance } = await suiClient().getBalance({ owner });
  if (BigInt(balance.balance) >= MIN_GAS) return;

  const n = network();
  if (n !== "localnet" && n !== "testnet" && n !== "devnet") {
    throw new Error(`operator ${owner} holds ${balance.balance} MIST and ${n} has no faucet`);
  }
  console.log(`  requesting SUI for ${owner} from the ${n} faucet...`);
  await requestSuiFromFaucetV2({
    host: process.env.SUI_FAUCET_URL || getFaucetHost(n),
    recipient: owner,
  });
  for (let i = 0; i < 20; i++) {
    const { balance: b } = await suiClient().getBalance({ owner });
    if (BigInt(b.balance) > 0n) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("the faucet did not pay out");
}

function compile(): { modules: string[]; dependencies: string[] } {
  const pkg = path.join(suiDir(), "lifeline");
  const out = execFileSync("sui", ["move", "build", "--dump-bytecode-as-base64", "--path", pkg], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(out.slice(out.indexOf("{")));
}

async function main() {
  const n = network();
  console.log(`\nDeploying Lifeline to Sui ${n}\n`);

  const kp = await operator();
  const owner = kp.toSuiAddress();
  console.log(`  operator  ${owner}`);
  await ensureGas(kp);

  const { modules, dependencies } = compile();
  const publish = new Transaction();
  const [upgradeCap] = publish.publish({ modules, dependencies });
  publish.transferObjects([upgradeCap], publish.pure.address(owner));
  const published = await execute(publish, kp);

  const faucet = published.created.find((c) => c.type.endsWith("::fusd::Faucet"));
  if (!faucet) throw new Error("publish created no FUSD faucet");
  const packageId = faucet.type.split("::")[0];
  const coinType = `${packageId}::fusd::FUSD`;
  console.log(`  package   ${packageId}  (${published.digest})`);

  const open = new Transaction();
  const [cap] = open.moveCall({ target: `${packageId}::facility::create`, typeArguments: [coinType] });
  open.transferObjects([cap], open.pure.address(owner));
  const opened = await execute(open, kp);
  const facility = opened.created.find((c) => c.type.includes("::facility::Facility<"));
  const adminCap = opened.created.find((c) => c.type.endsWith("::facility::AdminCap"));
  if (!facility || !adminCap) throw new Error("facility::create did not return a facility and cap");
  console.log(`  facility  ${facility.objectId}`);
  console.log(`  adminCap  ${adminCap.objectId}`);

  // Lending liquidity, minted in faucet-sized pieces and put straight in.
  const fund = new Transaction();
  const pieces: ReturnType<Transaction["moveCall"]>[] = [];
  let remaining = toUnits(LIQUIDITY_USD);
  while (remaining > 0n) {
    const piece = remaining > 1_000_000_000n ? 1_000_000_000n : remaining;
    pieces.push(
      fund.moveCall({
        target: `${packageId}::fusd::mint`,
        arguments: [fund.object(faucet.objectId), fund.pure.u64(piece)],
      })
    );
    remaining -= piece;
  }
  const [first, ...rest] = pieces.map((p) => p[0]);
  if (rest.length) fund.mergeCoins(first, rest);
  fund.moveCall({
    target: `${packageId}::facility::fund`,
    typeArguments: [coinType],
    arguments: [fund.object(facility.objectId), first],
  });
  const funded = await execute(fund, kp);
  console.log(`  liquidity ${LIQUIDITY_USD} FUSD  (${funded.digest})`);

  const d: Deployment = {
    network: n,
    packageId,
    facilityId: facility.objectId,
    adminCapId: adminCap.objectId,
    coinType,
    faucetId: faucet.objectId,
    operator: owner,
    deployedAt: new Date().toISOString(),
    digest: published.digest,
  };
  saveDeployment(d);
  console.log(`\n  wrote sui/deployments/${n}.json\n`);
}

main().catch((err) => {
  console.error("\ndeploy failed:", err?.message || err);
  process.exit(1);
});
