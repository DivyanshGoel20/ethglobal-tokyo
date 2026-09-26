/**
 * What an address or agent actually holds.
 *
 * "Balance" means a different thing on each rail, so this takes either kind
 * of address and asks the right question:
 *
 *   0x + 40 hex   an Arc address  -> Circle Gateway available balance, which is
 *                                    what can pay a 402 (wallet USDC cannot)
 *   0x + 64 hex   a Sui address   -> coins of the type the facility lends
 *
 * With no argument it reports Lifeline's funding wallet, the Sui facility, and
 * every agent Lifeline knows about on both rails.
 *
 *   npm run balances
 *   npm run balances -- 0x36e2…077d
 */
import fs from "node:fs";
import path from "node:path";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { deployment, facilityLiquidity, fromUnits, network, walletUnits } from "@lifeline/sui";
import { suiAddressFor } from "../web/src/lib/suiRail";

const isEvm = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const isSui = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

async function suiBalance(address: string): Promise<string> {
  const d = deployment();
  if (!d) throw new Error(`Lifeline is not deployed on Sui ${network()}`);
  return `${fromUnits(await walletUnits(address)).toFixed(6)} ${d.coinType.split("::").pop()}`;
}

function gateway(): GatewayClient {
  const pk = (process.env.PRIVATE_KEY || process.env.LIFELINE_FUNDING_PRIVATE_KEY) as `0x${string}`;
  if (!pk) throw new Error("no PRIVATE_KEY or LIFELINE_FUNDING_PRIVATE_KEY (set it in the root .env)");
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
    const bal = isSui(id) ? await suiBalance(id) : await arcBalance(id);
    console.log(`  ${label.padEnd(22)} ${id.padEnd(66)} ${bal}`);
  } catch (err: any) {
    console.log(`  ${label.padEnd(22)} ${id.padEnd(66)} ${err?.message ?? err}`);
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg) {
    if (!isEvm(arg) && !isSui(arg)) {
      console.error(`Not an address I recognise: ${arg}`);
      console.error(`Want 0x + 40 hex for Arc, or 0x + 64 hex for Sui.`);
      process.exit(1);
    }
    console.log(isSui(arg) ? `\nSui ${network()}\n` : `\nCircle Gateway, Arc testnet\n`);
    await report("address", arg);
    console.log("");
    return;
  }

  const agents = knownAgents();

  console.log(`\nArc - Circle Gateway available\n`);
  await report("lifeline funding", gateway().address);
  for (const a of agents) await report(a.label, a.id);

  const d = deployment();
  console.log(`\nSui ${network()} - coins held outright\n`);
  if (!d) {
    console.log(`  Lifeline is not deployed on this Sui network.`);
  } else {
    const liquidity = await facilityLiquidity().catch(() => null);
    console.log(`  ${"facility liquidity".padEnd(22)} ${d.facilityId.padEnd(66)} ${liquidity === null ? "unreadable" : fromUnits(liquidity).toFixed(6)}`);
    for (const a of agents) {
      const sui = suiAddressFor(a.id);
      if (sui) await report(a.label, sui);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("failed:", err?.message || err);
  process.exit(1);
});
