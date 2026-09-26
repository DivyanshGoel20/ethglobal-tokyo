import { test } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { claimReceipt, releaseReceipt } from "../src/lib/receiptStore";

useSandbox();
const HASH = "0x" + "ab".repeat(32);

test("a repayment receipt can be counted once", () => {
  assert.equal(claimReceipt(HASH, "human-a"), true);
  assert.equal(claimReceipt(HASH, "human-a"), false, "the same transfer cleared debt twice");
});

test("case does not make a receipt new", () => {
  assert.equal(claimReceipt(HASH.toUpperCase().replace("0X", "0x"), "human-b"), false);
});

test("a receipt released after a failed repayment can be used again", () => {
  const other = "0x" + "cd".repeat(32);
  assert.equal(claimReceipt(other, "human-a"), true);
  releaseReceipt(other);
  assert.equal(claimReceipt(other, "human-a"), true);
});
