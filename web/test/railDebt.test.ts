import { test } from "node:test";
import assert from "node:assert/strict";
import { useSandbox } from "./sandbox";
import { openRailDebt, railDebtTotal, unpaidObligations, settleObligation } from "../src/lib/railDebt";

useSandbox();
const HUMAN = "0x" + "aa".repeat(32);

/** Point @lifeline/sui at a made-up deployment, as a network switch would. */
function onFacility(id: string) {
  process.env.SUI_NETWORK = "testnet";
  process.env.SUI_PACKAGE_ID = "0x1";
  process.env.SUI_ADMIN_CAP_ID = "0x2";
  process.env.SUI_COIN_TYPE = "0x1::fusd::FUSD";
  process.env.SUI_FACILITY_ID = id;
}

const draw = (obligationId: string, amountUsd: number) =>
  openRailDebt({ humanOwner: HUMAN, rail: "sui", agentAddress: "0x" + "11".repeat(20), amountUsd, obligationId, resource: "/risk" });

test("Sui debt counts against the line on the deployment it was drawn on", () => {
  onFacility("0xfacA");
  draw("0xob1", 0.02);
  draw("0xob1", 0.01);
  assert.equal(railDebtTotal(HUMAN), 0.03);
});

test("debt from another deployment is not this one's to count or collect", () => {
  onFacility("0xfacB");
  assert.equal(railDebtTotal(HUMAN), 0);
  assert.deepEqual(unpaidObligations(HUMAN), []);
  draw("0xob9", 0.5);
  assert.equal(railDebtTotal(HUMAN), 0.5);
});

test("settling on one deployment leaves the other's rows alone", () => {
  onFacility("0xfacB");
  settleObligation("0xob9");
  assert.equal(railDebtTotal(HUMAN), 0);
  onFacility("0xfacA");
  assert.equal(railDebtTotal(HUMAN), 0.03, "rows from the first facility were lost on write-back");
});
