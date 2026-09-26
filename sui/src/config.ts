import fs from "node:fs";
import path from "node:path";

/**
 * Where Lifeline's Sui rail lives.
 *
 * A deployment is written to sui/deployments/<network>.json by the deploy
 * script, so a fresh clone that runs `npm run sui:deploy` is configured without
 * copying ids by hand. Environment variables override the file, so a host can
 * point at a deployment it was never given the file for.
 */
export type SuiNetwork = "localnet" | "testnet" | "devnet" | "mainnet";

export interface Deployment {
  network: SuiNetwork;
  packageId: string;
  facilityId: string;
  adminCapId: string;
  /** The coin the facility lends, e.g. `<pkg>::fusd::FUSD` or Circle's USDC. */
  coinType: string;
  /** Only when the facility lends the demo coin. */
  faucetId?: string;
  operator: string;
  deployedAt?: string;
  digest?: string;
}

export const FULLNODE: Record<SuiNetwork, string> = {
  localnet: "http://127.0.0.1:9000",
  devnet: "https://fullnode.devnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

export function network(): SuiNetwork {
  const n = (process.env.SUI_NETWORK || "testnet").toLowerCase();
  if (n === "localnet" || n === "testnet" || n === "devnet" || n === "mainnet") return n;
  throw new Error(`SUI_NETWORK must be localnet, devnet, testnet or mainnet, not ${n}`);
}

export const rpcUrl = () => process.env.SUI_RPC_URL || FULLNODE[network()];

/** The x402 network id, CAIP-2 style: `sui:testnet`. */
export const x402Network = () => `sui:${network()}`;

/** The repo's sui/ directory, found from wherever the caller runs. */
export function suiDir(): string {
  for (const c of [
    path.resolve(process.cwd(), "sui"),
    path.resolve(process.cwd(), "..", "sui"),
    path.resolve(__dirname, ".."),
  ]) {
    if (fs.existsSync(path.join(c, "lifeline", "Move.toml"))) return c;
  }
  return path.resolve(process.cwd(), "sui");
}

export const deploymentFile = (n: SuiNetwork = network()) =>
  path.join(suiDir(), "deployments", `${n}.json`);

/** The active deployment, or null when the rail has not been deployed. */
export function deployment(): Deployment | null {
  const n = network();
  let fromFile: Partial<Deployment> = {};
  try {
    const file = deploymentFile(n);
    if (fs.existsSync(file)) fromFile = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* a corrupt file is the same as none */
  }

  const d: Partial<Deployment> = {
    ...fromFile,
    network: n,
    packageId: process.env.SUI_PACKAGE_ID || fromFile.packageId,
    facilityId: process.env.SUI_FACILITY_ID || fromFile.facilityId,
    adminCapId: process.env.SUI_ADMIN_CAP_ID || fromFile.adminCapId,
    coinType: process.env.SUI_COIN_TYPE || fromFile.coinType,
    faucetId: process.env.SUI_FAUCET_ID || fromFile.faucetId,
  };

  if (!d.packageId || !d.facilityId || !d.adminCapId || !d.coinType) return null;
  return d as Deployment;
}

export function requireDeployment(): Deployment {
  const d = deployment();
  if (!d) {
    throw new Error(
      `Lifeline is not deployed on Sui ${network()}. Run \`npm run sui:deploy\` or set SUI_PACKAGE_ID, ` +
        `SUI_FACILITY_ID, SUI_ADMIN_CAP_ID and SUI_COIN_TYPE.`
    );
  }
  return d;
}

export function saveDeployment(d: Deployment) {
  const file = deploymentFile(d.network);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
}

/** USDC and the demo dollar are both 6 decimals. */
export const DECIMALS = 6;
export const toUnits = (usd: number) => BigInt(Math.round(usd * 10 ** DECIMALS));
export const fromUnits = (units: bigint | string | number) => Number(units) / 10 ** DECIMALS;

/** How long a parked repayment has before it falls due. */
export const termMs = () => Number(process.env.LIFELINE_TERM_SECONDS || 604_800) * 1000;

/** One parked obligation covers draws up to this, then a new one is parked. */
export const trancheCeilingUsd = () => Number(process.env.LIFELINE_TRANCHE_CEILING || 0.5);
