export type Rail = "base" | "sui";

export interface Agent {
  id: string;
  name: string;
  address: string;
  rail: Rail;
  allocatedLimit: number;
  spent: number;
  status: "active" | "paused";
  lastActive: string;
  model: string;
}

export interface ActivityItem {
  id: string;
  type: "drawdown" | "repayment" | "authorization" | "world_verify";
  agentName?: string;
  amount?: number;
  rail: Rail;
  txHash: string;
  timestamp: string;
  endpoint?: string;
  status: "settled" | "pending";
}

export interface CreditProfile {
  nullifierHash: string;
  isVerified: boolean;
  creditLimit: number;
  outstandingDebt: number;
  rail: Rail;
}