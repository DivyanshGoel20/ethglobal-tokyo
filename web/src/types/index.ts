export type Rail = "base" | "sui";

export interface Agent {
  id: string;
  name: string;
  address: string;
  rail: Rail;
  allocatedLimit: number;
  spent: number;
  status: "active" | "paused";
}

export interface ActivityItem {
  id: string;
  type: "drawdown" | "repayment" | "authorization";
  agentName?: string;
  amount?: number;
  rail: Rail;
  txHash: string;
  timestamp: string;
  endpoint?: string;
}
