/**
 * What an address or agent actually holds.
 *
 * On Arc, a balance that can pay a 402 is a Circle Gateway balance, not the
 * wallet's: USDC has to be deposited before it can settle anything.
 *
 *   npm run balances                 # every agent Float knows about
 *   npm run balances -- 0x36e2…077d  # one address
 */
import fs from "node:fs";
import path from "node:path";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const isEvm = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

function gateway(): GatewayClient {
  const pk = (process.env.PRIVATE_KEY || process.env.FLOAT_FUNDING_PRIVATE_KEY) as `0x${string}`;
  if (!pk) throw new Error("no PRIVATE_KEY or FLOAT_FUNDING_PRIVATE_KEY (set it in the root .env)");
  return new GatewayClient({ chain: "arcTestnet", privateKey: pk });
}

async function arcBalance(address: string): Promise<string> {
  const b = await (gateway() as any).getGatewayBalance(address);
  return `${b.formattedAvailable} USDC`;
}

function knownAgents(): { label: string; id: string }[] {
  const file = path.resolve(process.cwd(), "web", "data", "agents.json");
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return (Array.isArray(raw) ? raw : []).map((a: any) => ({
    label: a.name || "agent",
    id: a.address,
  }));
}

async function report(label: string, id: string) {
  try {
    console.log(`  ${label.padEnd(22)} ${id.padEnd(44)} ${await arcBalance(id)}`);
  } catch (err: any) {
    console.log(`  ${label.padEnd(22)} ${id.padEnd(44)} ${err?.message ?? err}`);
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg) {
    if (!isEvm(arg)) {
      console.error(`Not an Arc address: ${arg}`);
      process.exit(1);
    }
    console.log(`\nCircle Gateway, Arc testnet\n`);
    await report("address", arg);
    console.log("");
    return;
  }

  console.log(`\nArc - Circle Gateway available\n`);
  await report("float funding", gateway().address);
  for (const a of knownAgents()) await report(a.label, a.id);
  console.log("");
}

main().catch((err) => {
  console.error("failed:", err?.message || err);
  process.exit(1);
});
