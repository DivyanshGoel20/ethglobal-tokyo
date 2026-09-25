/**
 * Float settlement rail: Arc Testnet.
 *
 * Arc is the debt ledger: credit profiles, limits, drawdowns, and nanopayments
 * live and settle directly on Arc Testnet (Chain ID 5042002) using native USDC.
 */
export type Rail = "arc";

export const RAIL_LABELS: Record<Rail, string> = {
  arc: "Arc",
};

export const RAIL_FACTS: Record<
  Rail,
  { network: string; facilitator: string; mechanism: string; resource: string }
> = {
  arc: {
    network: "Arc testnet",
    facilitator: "Circle Gateway",
    mechanism: "batched settlement",
    resource: "Float Premium API",
  },
};
