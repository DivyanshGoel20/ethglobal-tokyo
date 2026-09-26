import { Transaction, coinWithBalance, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { Keypair } from "@mysten/sui/cryptography";
import { fromHex, normalizeSuiAddress, SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { suiClient } from "./client";
import { requireDeployment, type Deployment } from "./config";
import {
  CreditProfileBcs,
  OBLIGATION_STATUS,
  ObligationBcs,
  PurseBcs,
  type ObligationStatus,
} from "./bcs";

/**
 * Lifeline's Move facility, from TypeScript.
 *
 * Every transaction an agent signs is sponsored: Lifeline's operator is the gas
 * owner, so an agent holding nothing but a debt still transacts - the Sui
 * equivalent of a facilitator paying the fees.
 */

const target = (d: Deployment, module: string, fn: string) => `${d.packageId}::${module}::${fn}` as const;

/** Profile ids are the same 32 bytes as on Arc: keccak of the human's nullifier. */
export const profileBytes = (profileIdHex: string) => Array.from(fromHex(profileIdHex.replace(/^0x/, "")));

export type Executed = {
  digest: string;
  created: { objectId: string; type: string }[];
  balanceChanges: { coinType: string; address: string; amount: string }[];
  events: { eventType: string; json: Record<string, unknown> | null }[];
};

export class SuiTxError extends Error {
  constructor(
    message: string,
    public digest?: string
  ) {
    super(message);
  }
}

/**
 * Build, sign and execute. With a sponsor, the sender signs for the commands
 * and the sponsor signs for the gas; both signatures go in together.
 */
export async function execute(
  tx: Transaction,
  signer: Keypair,
  opts: { sponsor?: Keypair } = {}
): Promise<Executed> {
  const client = suiClient();
  // Kept unbuilt, so a stale gas coin can be re-resolved rather than fatal.
  // Coin intents resolve against the sender, so it has to be known first.
  tx.setSenderIfNotSet(signer.toSuiAddress());
  const unbuilt = await tx.toJSON({ client, supportedIntents: ["CoinWithBalance"] });

  const run = async (t: Transaction) => {
    const { bytes, signatures } = await signTransaction(t, signer, opts.sponsor);
    return client.executeTransaction({
      transaction: bytes,
      signatures,
      include: { effects: true, events: true, balanceChanges: true, objectTypes: true },
    });
  };

  let result;
  try {
    result = await run(tx);
  } catch (err: any) {
    // The sponsor's gas coin moves whenever a seller submits a payment Lifeline
    // signed, in a process this one cannot see. A read that has not caught up
    // yet hands back the old version; waiting a beat and rebuilding fixes it.
    if (!/unavailable for consumption|needs to be rebuilt/i.test(err?.message ?? "")) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    result = await run(Transaction.from(unbuilt));
  }
  const done = result.Transaction ?? result.FailedTransaction;
  if (!done.status.success) {
    throw new SuiTxError(`Sui transaction failed: ${done.status.error?.message ?? "unknown"}`, done.digest);
  }
  await client.waitForTransaction({ digest: done.digest });

  const types = done.objectTypes ?? {};
  return {
    digest: done.digest,
    created: (done.effects?.changedObjects ?? [])
      .filter((o) => o.idOperation === "Created")
      .map((o) => ({ objectId: o.objectId, type: types[o.objectId] ?? "" })),
    balanceChanges: done.balanceChanges ?? [],
    events: (done.events ?? []).map((e) => ({ eventType: e.eventType, json: e.json })),
  };
}

/** Sign without executing - what an x402 buyer hands the seller. */
export async function signTransaction(
  tx: Transaction,
  signer: Keypair,
  sponsor?: Keypair
): Promise<{ bytes: Uint8Array; signatures: string[] }> {
  tx.setSenderIfNotSet(signer.toSuiAddress());
  if (sponsor && sponsor.toSuiAddress() !== signer.toSuiAddress()) {
    tx.setGasOwner(sponsor.toSuiAddress());
  }
  const bytes = await tx.build({ client: suiClient() });
  const signatures = [(await signer.signTransaction(bytes)).signature];
  if (sponsor && sponsor.toSuiAddress() !== signer.toSuiAddress()) {
    signatures.push((await sponsor.signTransaction(bytes)).signature);
  }
  return { bytes, signatures };
}

const createdOf = (r: Executed, suffix: string) => {
  const found = r.created.find((c) => c.type.includes(suffix));
  if (!found) throw new SuiTxError(`Transaction created no ${suffix}`, r.digest);
  return found.objectId;
};

// === Underwriter (Lifeline's operator, holding the AdminCap) ===

export async function createProfile(
  operator: Keypair,
  args: { profileId: string; humanOwner: string; limitUnits: bigint }
): Promise<Executed> {
  const d = requireDeployment();
  const tx = new Transaction();
  const id = profileBytes(args.profileId);
  tx.moveCall({
    target: target(d, "facility", "create_credit_profile"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(d.adminCapId),
      tx.pure.vector("u8", id),
      tx.pure.address(args.humanOwner),
      // The World root is the profile id itself, as on Arc.
      tx.pure.vector("u8", id),
      tx.pure.u64(args.limitUnits),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, operator);
}

export async function setCreditLimit(operator: Keypair, profileId: string, limitUnits: bigint) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "facility", "set_credit_limit"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(d.adminCapId),
      tx.pure.vector("u8", profileBytes(profileId)),
      tx.pure.u64(limitUnits),
    ],
  });
  return execute(tx, operator);
}

export async function authorizeAgent(operator: Keypair, profileId: string, agent: string) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "facility", "authorize_agent_as_underwriter"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(d.adminCapId),
      tx.pure.vector("u8", profileBytes(profileId)),
      tx.pure.address(agent),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, operator);
}

export async function revokeAgent(operator: Keypair, profileId: string, agent: string) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "facility", "revoke_agent_as_underwriter"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(d.adminCapId),
      tx.pure.vector("u8", profileBytes(profileId)),
      tx.pure.address(agent),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, operator);
}

/** Put coins the operator holds into the facility, so agents have something to draw. */
export async function fundFacility(operator: Keypair, units: bigint) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "facility", "fund"),
    typeArguments: [d.coinType],
    arguments: [tx.object(d.facilityId), coinWithBalance({ type: d.coinType, balance: units })],
  });
  return execute(tx, operator);
}

/** Demo coin only: mint from the shared faucet to an address. */
export async function mintDemoDollars(sender: Keypair, to: string, units: bigint) {
  const d = requireDeployment();
  if (!d.faucetId) throw new Error("This facility does not lend the demo dollar; there is no faucet");
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: target(d, "fusd", "mint"),
    arguments: [tx.object(d.faucetId), tx.pure.u64(units)],
  });
  tx.transferObjects([coin], tx.pure.address(to));
  return execute(tx, sender);
}

// === Agent (signs, Lifeline sponsors gas) ===

export async function openPurse(agent: Keypair, sponsor: Keypair, profileId: string): Promise<string> {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "obligation", "open_purse"),
    typeArguments: [d.coinType],
    arguments: [tx.object(d.facilityId), tx.pure.vector("u8", profileBytes(profileId))],
  });
  return createdOf(await execute(tx, agent, { sponsor }), "::obligation::Purse<");
}

/**
 * The agent signs its promise to repay: a claim on its purse for up to
 * `ceilingUnits`, due at `dueMs`. Nothing is owed until it draws.
 */
export async function parkRepayment(
  agent: Keypair,
  sponsor: Keypair,
  args: { purseId: string; ceilingUnits: bigint; dueMs: number }
): Promise<{ obligationId: string; digest: string }> {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "obligation", "park"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(args.purseId),
      tx.pure.u64(args.ceilingUnits),
      tx.pure.u64(BigInt(args.dueMs)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  const r = await execute(tx, agent, { sponsor });
  return { obligationId: createdOf(r, "::obligation::Obligation<"), digest: r.digest };
}

/**
 * The purchase itself: draw against the parked obligation and pay the seller,
 * topped up from the agent's own coins when it holds some. One transaction,
 * so the debt exists if and only if the seller was paid.
 */
export function buildDrawAndPay(args: {
  agent: string;
  purseId: string;
  obligationId: string;
  drawUnits: bigint;
  ownUnits: bigint;
  payTo: string;
  referenceHash: Uint8Array;
}): Transaction {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.setSender(args.agent);

  const parts: TransactionObjectArgument[] = [];
  if (args.drawUnits > 0n) {
    const [drawn] = tx.moveCall({
      target: target(d, "obligation", "draw"),
      typeArguments: [d.coinType],
      arguments: [
        tx.object(d.facilityId),
        tx.object(args.purseId),
        tx.object(args.obligationId),
        tx.pure.u64(args.drawUnits),
        tx.pure.u32(1),
        tx.pure.vector("u8", Array.from(args.referenceHash)),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    parts.push(drawn);
  }
  if (args.ownUnits > 0n) {
    parts.push(coinWithBalance({ type: d.coinType, balance: args.ownUnits }));
  }
  if (parts.length === 0) throw new Error("Nothing to pay with");

  const [payment, ...rest] = parts;
  if (rest.length) tx.mergeCoins(payment, rest);
  tx.transferObjects([payment], tx.pure.address(args.payTo));
  return tx;
}

/** A plain payment from the agent's own coins. */
export function buildSelfPay(args: { agent: string; units: bigint; payTo: string }): Transaction {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.setSender(args.agent);
  tx.transferObjects([coinWithBalance({ type: d.coinType, balance: args.units })], tx.pure.address(args.payTo));
  return tx;
}

/**
 * Settle early (or cure a default): the agent moves `depositUnits` of its own
 * coins into the purse and settles in the same transaction.
 */
export async function settleEarly(
  agent: Keypair,
  sponsor: Keypair,
  args: { purseId: string; obligationId: string; depositUnits: bigint }
): Promise<Executed> {
  const d = requireDeployment();
  const tx = new Transaction();
  if (args.depositUnits > 0n) {
    tx.moveCall({
      target: target(d, "obligation", "deposit"),
      typeArguments: [d.coinType],
      arguments: [tx.object(args.purseId), coinWithBalance({ type: d.coinType, balance: args.depositUnits })],
    });
  }
  tx.moveCall({
    target: target(d, "obligation", "settle"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(args.purseId),
      tx.object(args.obligationId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, agent, { sponsor });
}

/** Anyone may pay into a purse: this is how an agent's earnings arrive. */
export async function depositToPurse(payer: Keypair, purseId: string, units: bigint, sponsor?: Keypair) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "obligation", "deposit"),
    typeArguments: [d.coinType],
    arguments: [tx.object(purseId), coinWithBalance({ type: d.coinType, balance: units })],
  });
  return execute(tx, payer, { sponsor });
}

/**
 * Anyone, once due. Lifeline runs this from reconciliation, but it needs no
 * capability - a stranger calling it gets exactly the same outcome.
 */
export async function collect(caller: Keypair, args: { purseId: string; obligationId: string }) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.moveCall({
    target: target(d, "obligation", "collect"),
    typeArguments: [d.coinType],
    arguments: [
      tx.object(d.facilityId),
      tx.object(args.purseId),
      tx.object(args.obligationId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, caller);
}

// === Reads ===

export type ObligationView = {
  obligationId: string;
  purseId: string;
  agent: string;
  profileId: string;
  ceiling: bigint;
  drawn: bigint;
  dueMs: number;
  status: ObligationStatus;
  createdMs: number;
};

export async function readObligation(obligationId: string): Promise<ObligationView> {
  const { object } = await suiClient().getObject({ objectId: obligationId, include: { content: true } });
  const o = ObligationBcs.parse(object.content);
  return {
    obligationId,
    purseId: o.purse,
    agent: o.agent,
    profileId: "0x" + Buffer.from(o.profile_id).toString("hex"),
    ceiling: BigInt(o.ceiling),
    drawn: BigInt(o.drawn),
    dueMs: Number(o.due_ms),
    status: OBLIGATION_STATUS[o.status] ?? "open",
    createdMs: Number(o.created_ms),
  };
}

export async function readPurse(purseId: string) {
  const { object } = await suiClient().getObject({ objectId: purseId, include: { content: true } });
  const p = PurseBcs.parse(object.content);
  return {
    purseId,
    agent: p.agent,
    balance: BigInt(p.balance),
    pledged: BigInt(p.pledged),
  };
}

/** Coins of the lent type an address holds outright, outside any purse. */
export async function walletUnits(owner: string): Promise<bigint> {
  const d = requireDeployment();
  const { balance } = await suiClient().getBalance({ owner, coinType: d.coinType });
  return BigInt(balance.balance);
}

/**
 * Call a view function without executing anything. The facility's tables are
 * dynamic fields; asking Move is simpler and stays right if the layout moves.
 */
async function view(fn: string, args: (tx: Transaction) => any[], sender?: string) {
  const d = requireDeployment();
  const tx = new Transaction();
  tx.setSender(sender ?? d.operator);
  tx.moveCall({ target: target(d, "facility", fn), typeArguments: [d.coinType], arguments: args(tx) });
  const res = await suiClient().simulateTransaction({ transaction: tx, include: { commandResults: true } });
  if (res.$kind !== "Transaction") return null;
  return res.commandResults?.[0]?.returnValues?.[0]?.bcs ?? null;
}

export async function readProfile(profileId: string) {
  const d = requireDeployment();
  const exists = await view("has_profile", (tx) => [tx.object(d.facilityId), tx.pure.vector("u8", profileBytes(profileId))]);
  if (!exists || !bcs.bool().parse(exists)) return null;
  const raw = await view("profile", (tx) => [tx.object(d.facilityId), tx.pure.vector("u8", profileBytes(profileId))]);
  if (!raw) return null;
  const p = CreditProfileBcs.parse(raw);
  return {
    humanOwner: p.human_owner,
    creditLimit: BigInt(p.credit_limit),
    outstandingDebt: BigInt(p.outstanding_debt),
    totalBorrowed: BigInt(p.total_borrowed),
    totalRepaid: BigInt(p.total_repaid),
    status: p.status,
  };
}

export async function isAgentAuthorized(profileId: string, agent: string): Promise<boolean> {
  const d = requireDeployment();
  const raw = await view("is_agent_authorized", (tx) => [
    tx.object(d.facilityId),
    tx.pure.vector("u8", profileBytes(profileId)),
    tx.pure.address(agent),
  ]);
  return !!raw && bcs.bool().parse(raw);
}

export async function facilityLiquidity(): Promise<bigint> {
  const d = requireDeployment();
  const raw = await view("liquidity", (tx) => [tx.object(d.facilityId)]);
  return raw ? BigInt(bcs.u64().parse(raw)) : 0n;
}

export const sameAddress = (a: string, b: string) => normalizeSuiAddress(a) === normalizeSuiAddress(b);
