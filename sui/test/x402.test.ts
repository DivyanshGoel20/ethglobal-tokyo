import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import {
  agentKeypair,
  createSettler,
  decodeHeader,
  encodeHeader,
  fromUnits,
  suiRequirementsFrom,
  toUnits,
  type SuiPaymentRequirements,
} from "../src";

const quote: SuiPaymentRequirements = {
  scheme: "exact",
  network: "sui:testnet",
  asset: "0x2::sui::SUI",
  amount: "15000",
  payTo: "0x" + "ab".repeat(32),
  maxTimeoutSeconds: 120,
};

test("headers round-trip", () => {
  assert.deepEqual(decodeHeader(encodeHeader(quote)), quote);
});

test("the Sui option is picked out of a multi-network 402", () => {
  const header = encodeHeader({
    x402Version: 2,
    accepts: [{ ...quote, network: "eip155:5042002" }, quote],
  });
  assert.equal(suiRequirementsFrom(header)?.network, "sui:testnet");
});

test("a 402 with no Sui option offers nothing on Sui", () => {
  assert.equal(suiRequirementsFrom(encodeHeader({ accepts: [{ ...quote, network: "eip155:1" }] })), null);
  assert.equal(suiRequirementsFrom("not base64 json"), null);
  assert.equal(suiRequirementsFrom(null), null);
});

test("units are six decimals, as on Arc", () => {
  assert.equal(toUnits(0.005), 5000n);
  assert.equal(toUnits(10), 10_000_000n);
  assert.equal(fromUnits(15000n), 0.015);
});

test("one key is one agent on both rails", () => {
  const key = "0x" + "11".repeat(32);
  const a = agentKeypair(key).toSuiAddress();
  const b = agentKeypair(key.slice(2)).toSuiAddress();
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{64}$/);
  // Same secret, same curve point: viem gives it uncompressed (04 || x || y),
  // Sui compressed (02|03 || x). The x coordinate is the key.
  const evm = privateKeyToAccount(key as `0x${string}`);
  const suiPub = Buffer.from(agentKeypair(key).getPublicKey().toRawBytes()).toString("hex");
  assert.equal(suiPub.slice(2), evm.publicKey.slice(4, 68));
});

test("an agent key must be 32 bytes of hex", () => {
  assert.throws(() => agentKeypair("0x1234"));
});

test("the settler turns away a payment for another network without touching the chain", async () => {
  const { verifyAndSettle } = createSettler();
  const header = encodeHeader({
    x402Version: 2,
    accepted: { ...quote, network: "sui:mainnet" },
    payload: { transaction: "AA==", signatures: ["x"] },
  });
  const v = await verifyAndSettle(header, quote);
  assert.equal(v.ok, false);
  assert.equal((v as any).status, 400);
});

test("the settler turns away junk and unsigned payments", async () => {
  const { verifyAndSettle } = createSettler();
  assert.equal(((await verifyAndSettle("%%%", quote)) as any).status, 400);
  const unsigned = encodeHeader({ x402Version: 2, accepted: quote, payload: { transaction: "AA==", signatures: [] } });
  const v = await verifyAndSettle(unsigned, quote);
  assert.equal(v.ok, false);
  assert.equal((v as any).status, 402);
});
