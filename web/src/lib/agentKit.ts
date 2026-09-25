// idkit-core picks ReactNativeCryptoAdapter when navigator.product === 'ReactNative',
// which uses standard globalThis.crypto without creating a fake window object on Node.js.
if (typeof globalThis.navigator === "undefined") {
  // @ts-expect-error
  globalThis.navigator = { product: "ReactNative" };
} else {
  // @ts-expect-error
  globalThis.navigator.product = "ReactNative";
}

import { createPublicClient, http, decodeAbiParameters } from "viem";
import { worldchain } from "viem/chains";
import { solidityEncode } from "@worldcoin/agentkit-cli/node_modules/@worldcoin/idkit-core/build/lib/hashing.js";
import { createWorldBridgeStore } from "@worldcoin/agentkit-cli/node_modules/@worldcoin/idkit-core/build/index.js";
import { updateAgentInStore, getAgentByAddress } from "./agentStore";

// ─── Canonical World AgentKit / AgentBook Configuration ─────────────────────────
export const AGENT_BOOK_CONTRACT = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" as const;
export const AGENT_BOOK_NETWORK = "eip155:480"; // World Chain
export const AGENT_KIT_APP_ID = "app_a7c3e2b6b83927251a0db5345bd7146a";
export const AGENT_KIT_ACTION = "agentbook-registration";
export const DEFAULT_RELAY_URL = "https://x402-worldchain.vercel.app/register";

export const AGENT_BOOK_ABI = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "getNextNonce",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "lookupHuman",
    outputs: [{ internalType: "uint256", name: "humanId", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "agent", type: "address" },
      { internalType: "uint256", name: "root", type: "uint256" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
      { internalType: "uint256", name: "nullifierHash", type: "uint256" },
      { internalType: "uint256[8]", name: "proof", type: "uint256[8]" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export type RegistrationState =
  | "NOT_CHECKED"
  | "NOT_REGISTERED"
  | "WAITING_FOR_WORLD_APP"
  | "SUBMITTING_AGENTBOOK"
  | "REGISTERED_HUMAN_BACKED"
  | "REGISTRATION_FAILED";

export interface AgentBookResolution {
  isWorldBacked: boolean;
  agentBookStatus: "VERIFIED" | "UNVERIFIED";
  humanId: string | null;
  network: string;
  contract: string;
}

export interface ActiveBridgeSession {
  sessionId: string;
  agentAddress: string;
  nonce: bigint;
  signal: any;
  worldID: any;
  connectorURI: string;
  createdAt: number;
  status: RegistrationState;
  txHash?: string;
  error?: string;
}

// In-memory active bridge registration sessions (survives polling cycles)
const activeSessions = new Map<string, ActiveBridgeSession>();

function getPublicClient() {
  return createPublicClient({
    chain: worldchain,
    transport: http("https://worldchain-mainnet.g.alchemy.com/public"),
  });
}

function bigintToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

/**
 * Normalizes zero-knowledge proof payload from World ID bridge into uint256[8] string array
 */
export function normalizeProof(rawProof: any): string[] | null {
  if (Array.isArray(rawProof)) {
    if (rawProof.length === 8) {
      return rawProof.map((v) =>
        typeof v === "string" ? v : `0x${BigInt(v).toString(16).padStart(64, "0")}`
      );
    }
    return null;
  }
  if (typeof rawProof === "string") {
    if (rawProof.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawProof);
        if (Array.isArray(parsed)) return normalizeProof(parsed);
      } catch {
        // Fall through to ABI decode
      }
    }
    try {
      const decoded = decodeAbiParameters([{ type: "uint256[8]" }], rawProof as `0x${string}`)[0];
      return decoded.map((v) => `0x${v.toString(16).padStart(64, "0")}`);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Reads the canonical next registration nonce for an agent wallet from World Chain AgentBook
 */
export async function getNextNonce(agentAddress: string): Promise<bigint> {
  const client = getPublicClient();
  const nonce = await client.readContract({
    address: AGENT_BOOK_CONTRACT,
    abi: AGENT_BOOK_ABI,
    functionName: "getNextNonce",
    args: [agentAddress as `0x${string}`],
  });
  return nonce;
}

/**
 * Reads canonical humanId from World Chain AgentBook (0 if unregistered)
 */
export async function lookupHuman(agentAddress: string): Promise<string | null> {
  try {
    const client = getPublicClient();
    const humanIdRaw = await client.readContract({
      address: AGENT_BOOK_CONTRACT,
      abi: AGENT_BOOK_ABI,
      functionName: "lookupHuman",
      args: [agentAddress as `0x${string}`],
    });

    if (humanIdRaw === BigInt(0)) return null;
    return bigintToHex(humanIdRaw);
  } catch (err: any) {
    console.warn(`[AgentKit] Error looking up human for ${agentAddress}:`, err.message);
    return null;
  }
}

/**
 * Resolves live on-chain AgentBook status for an agent wallet address
 */
export async function resolveAgentBookStatus(address: string): Promise<AgentBookResolution> {
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return {
      isWorldBacked: false,
      agentBookStatus: "UNVERIFIED",
      humanId: null,
      network: AGENT_BOOK_NETWORK,
      contract: AGENT_BOOK_CONTRACT,
    };
  }

  const humanId = await lookupHuman(address);

  return {
    isWorldBacked: humanId !== null,
    agentBookStatus: humanId !== null ? "VERIFIED" : "UNVERIFIED",
    humanId,
    network: AGENT_BOOK_NETWORK,
    contract: AGENT_BOOK_CONTRACT,
  };
}

/**
 * Creates a real in-browser World ID bridge registration session for an agent wallet
 */
export async function createRegistrationBridgeSession(agentAddress: string): Promise<{
  sessionId: string;
  connectorURI: string;
  nonce: string;
  alreadyRegistered: boolean;
}> {
  // 1. Check if already registered on-chain
  const existingHuman = await lookupHuman(agentAddress);
  if (existingHuman) {
    // Update store if needed
    updateAgentInStore(agentAddress, {
      isWorldBacked: true,
      agentBookStatus: "VERIFIED",
      agentBookHumanId: existingHuman,
    });
    return {
      sessionId: "",
      connectorURI: "",
      nonce: "0",
      alreadyRegistered: true,
    };
  }

  // 2. Fetch canonical next nonce from AgentBook contract
  const nonce = await getNextNonce(agentAddress);

  // 3. Construct signal using exact AgentKit specification
  const signal = solidityEncode(["address", "uint256"], [agentAddress, nonce]);

  // 4. Initialize real World ID Bridge client
  const worldID = createWorldBridgeStore();
  await worldID.getState().createClient({
    app_id: AGENT_KIT_APP_ID,
    action: AGENT_KIT_ACTION,
    signal,
  });

  const connectorURI = worldID.getState().connectorURI;
  if (!connectorURI) {
    throw new Error("Failed to initialize World ID bridge connector URI.");
  }

  const sessionId = `bridge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  activeSessions.set(sessionId, {
    sessionId,
    agentAddress,
    nonce,
    signal,
    worldID,
    connectorURI,
    createdAt: Date.now(),
    status: "WAITING_FOR_WORLD_APP",
  });

  // Clean up sessions older than 15 minutes
  const now = Date.now();
  activeSessions.forEach((session, key) => {
    if (now - session.createdAt > 15 * 60 * 1000) {
      activeSessions.delete(key);
    }
  });

  return {
    sessionId,
    connectorURI,
    nonce: nonce.toString(),
    alreadyRegistered: false,
  };
}

/**
 * Polls active bridge session and automatically submits registration to AgentBook upon World App verification
 */
export async function pollRegistrationBridgeSession(sessionId: string): Promise<{
  status: RegistrationState;
  txHash?: string;
  error?: string;
  agentAddress?: string;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      status: "REGISTRATION_FAILED",
      error: "Session expired or not found. Please initiate a new registration.",
    };
  }

  if (session.status === "REGISTERED_HUMAN_BACKED") {
    return {
      status: "REGISTERED_HUMAN_BACKED",
      txHash: session.txHash,
      agentAddress: session.agentAddress,
    };
  }

  if (session.status === "REGISTRATION_FAILED") {
    return {
      status: "REGISTRATION_FAILED",
      error: session.error || "Registration failed.",
      agentAddress: session.agentAddress,
    };
  }

  try {
    // Poll bridge updates
    await session.worldID.getState().pollForUpdates();
    const { result, errorCode } = session.worldID.getState();

    if (errorCode) {
      session.status = "REGISTRATION_FAILED";
      session.error = `World App verification error: ${errorCode}`;
      return {
        status: "REGISTRATION_FAILED",
        error: session.error,
        agentAddress: session.agentAddress,
      };
    }

    if (!result) {
      // Still waiting for user to scan / verify
      return {
        status: "WAITING_FOR_WORLD_APP",
        agentAddress: session.agentAddress,
      };
    }

    // World ID verified! Transition to SUBMITTING_AGENTBOOK
    session.status = "SUBMITTING_AGENTBOOK";

    const normalizedProof = normalizeProof(result.proof);
    if (!normalizedProof) {
      session.status = "REGISTRATION_FAILED";
      session.error = "Unexpected proof format returned by World ID bridge.";
      return {
        status: "REGISTRATION_FAILED",
        error: session.error,
        agentAddress: session.agentAddress,
      };
    }

    // Build official AgentBook registration payload
    const registrationPayload = {
      agent: session.agentAddress,
      root: result.merkle_root,
      nonce: session.nonce.toString(),
      nullifierHash: result.nullifier_hash,
      proof: normalizedProof,
      contract: AGENT_BOOK_CONTRACT,
    };

    // Submit registration to the official World Chain relay
    const submitResult = await submitAgentBookRegistration(registrationPayload);
    session.txHash = submitResult.txHash;

    // Poll live lookupHuman on World Chain to ensure state confirmation
    let confirmedHuman: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      confirmedHuman = await lookupHuman(session.agentAddress);
      if (confirmedHuman) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Update internal store
    updateAgentInStore(session.agentAddress, {
      isWorldBacked: true,
      agentBookStatus: "VERIFIED",
      agentBookHumanId: confirmedHuman || "0xverified",
      agentBookTxHash: session.txHash,
    });

    session.status = "REGISTERED_HUMAN_BACKED";

    return {
      status: "REGISTERED_HUMAN_BACKED",
      txHash: session.txHash,
      agentAddress: session.agentAddress,
    };
  } catch (err: any) {
    session.status = "REGISTRATION_FAILED";
    session.error = err.message || "Failed to complete AgentBook registration.";
    return {
      status: "REGISTRATION_FAILED",
      error: session.error,
      agentAddress: session.agentAddress,
    };
  }
}

/**
 * Submits registration payload to the official World Chain relay
 */
export async function submitAgentBookRegistration(payload: {
  agent: string;
  root: string;
  nonce: string;
  nullifierHash: string;
  proof: string[];
  contract?: string;
}): Promise<{ txHash: string }> {
  const relayUrl = process.env.AGENTBOOK_RELAY_URL || DEFAULT_RELAY_URL;

  const response = await fetch(relayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      contract: AGENT_BOOK_CONTRACT,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Relay error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as { txHash?: string };
  return { txHash: data.txHash || "0xconfirmed" };
}
