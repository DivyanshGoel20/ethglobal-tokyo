import { bcs } from "@mysten/sui/bcs";

/**
 * The Move structs Float reads back, in field order. Parsing BCS rather than
 * the JSON view keeps the shape identical across gRPC, GraphQL and JSON-RPC.
 */

const UID = bcs.Address;

export const ObligationBcs = bcs.struct("Obligation", {
  id: UID,
  facility: bcs.Address,
  purse: bcs.Address,
  profile_id: bcs.vector(bcs.u8()),
  agent: bcs.Address,
  ceiling: bcs.u64(),
  drawn: bcs.u64(),
  due_ms: bcs.u64(),
  status: bcs.u8(),
  created_ms: bcs.u64(),
});

export const PurseBcs = bcs.struct("Purse", {
  id: UID,
  agent: bcs.Address,
  profile_id: bcs.vector(bcs.u8()),
  balance: bcs.u64(),
  pledged: bcs.u64(),
});

export const CreditProfileBcs = bcs.struct("CreditProfile", {
  profile_id: bcs.vector(bcs.u8()),
  human_owner: bcs.Address,
  human_root: bcs.vector(bcs.u8()),
  credit_limit: bcs.u64(),
  outstanding_debt: bcs.u64(),
  total_borrowed: bcs.u64(),
  total_repaid: bcs.u64(),
  status: bcs.u8(),
  created_at_ms: bcs.u64(),
});

export const OBLIGATION_STATUS = ["open", "settled", "defaulted", "closed"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUS)[number];

export const PROFILE_STATUS = ["inactive", "active", "suspended", "defaulted"] as const;
