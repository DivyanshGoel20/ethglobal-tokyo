import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey, type Keypair } from "@mysten/sui/cryptography";
import { fromHex } from "@mysten/sui/utils";
import { network, rpcUrl } from "./config";

let cached: { url: string; client: SuiGrpcClient } | null = null;

export function suiClient(): SuiGrpcClient {
  const url = rpcUrl();
  if (!cached || cached.url !== url) {
    cached = { url, client: new SuiGrpcClient({ baseUrl: url, network: network() }) };
  }
  return cached.client;
}

/**
 * Float's operator on Sui: holds the AdminCap, sponsors agents' gas and runs
 * collection when obligations fall due. `suiprivkey…` from `sui keytool`.
 */
export function operatorKeypair(): Keypair {
  const raw = process.env.SUI_PRIVATE_KEY;
  if (!raw) throw new Error("SUI_PRIVATE_KEY is not set - Float has no operator on Sui");
  return keypairFromSecret(raw);
}

export function keypairFromSecret(secret: string): Keypair {
  if (secret.startsWith("suiprivkey")) {
    const { scheme, secretKey } = decodeSuiPrivateKey(secret);
    if (scheme === "ED25519") return Ed25519Keypair.fromSecretKey(secretKey);
    if (scheme === "Secp256k1") return Secp256k1Keypair.fromSecretKey(secretKey);
    throw new Error(`Unsupported Sui key scheme ${scheme}`);
  }
  return agentKeypair(secret);
}

/**
 * The same agent on both rails.
 *
 * An Arc agent's key is secp256k1, which Sui accepts as it is. Deriving the
 * Sui identity from that key - rather than minting a second one - makes an
 * agent one borrower on two rails instead of two that happen to be operated
 * together, and it is the agent that signs its own repayment on either.
 */
export function agentKeypair(evmPrivateKey: string): Secp256k1Keypair {
  const hex = evmPrivateKey.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Agent key is not a 32-byte hex secret");
  return Secp256k1Keypair.fromSecretKey(fromHex(hex));
}

export const suiAddressForEvmKey = (evmPrivateKey: string) =>
  agentKeypair(evmPrivateKey).toSuiAddress();
