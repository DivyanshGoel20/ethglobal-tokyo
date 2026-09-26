export type Rail = "arc" | "sui";

export interface Agent {
  agentId?: string;
  id?: string;
  address: `0x${string}`;
  name: string;
  humanOwner: string;
  rail?: Rail;
  network?: string;
  purpose?: string;
  apiKey?: string;
  isPlatformCreated?: boolean;
  isWorldBacked?: boolean;
  agentBookStatus?: "VERIFIED" | "UNVERIFIED";
  agentBookHumanId?: string; // Stored internally, omitted in client UI
  agentBookTxHash?: string;  // World Chain AgentBook registration tx hash
  creditLimit: number;       // in USDC
  allocatedLimit?: number;
  outstandingDebt: number;   // in USDC
  totalBorrowed: number;     // in USDC
  totalRepaid: number;       // in USDC
  currentBalance: number;    // in USDC
  spent?: number;
  gatewayBalanceUSDC?: string; // Live Circle Gateway available USDC
  walletUsdc?: string;         // Native USDC held in the agent's Arc wallet
  isAutonomous?: boolean;      // Whether agent private key is bound for autonomous self-signing
  status: "Healthy" | "Active" | "Delinquent" | "Suspended" | "active" | "paused";
  registeredAt: number;
}

export interface CreditStats {
  totalAvailableCredit: number;
  totalCreditUsed: number;
  totalOutstandingDebt: number;
  totalBorrowed: number;
  totalRepaid: number;
  activeAgentsCount: number;
}

export interface ActivityItem {
  id: string;
  type: "borrow" | "repay" | "register" | "remove" | "x402_overdraft" | "x402_normal" | "drawdown" | "repayment" | "authorization";
  agentName?: string;
  agentAddress?: string;
  amount?: number;
  rail?: Rail;
  timestamp: number | string;
  txHash: string;
  endpoint?: string;
}

export interface Loan {
  loanId: string;
  agentAddress: string;
  agentName: string;
  humanOwner: string;
  amount: number;
  originationFee?: number;
  accruedInterest?: number;
  outstandingAmount: number;
  totalRepaid: number;
  status: "ACTIVE" | "SETTLED" | "DEFAULTED";
  borrowedAt: number;
  dueAt?: number;
  settledAt?: number;
  borrowTxHash: string;
  repayTxHashes: string[];
  memo?: string;
}

export interface BorrowRequest {
  agentAddress: string;
  amount: string | number;
  memo?: string;
  signature?: string;
  nonce?: string;
}

export interface BorrowResponse {
  success: boolean;
  loanId?: string;
  txHash?: string;
  amount: number;
  newOutstandingDebt: number;
  facilityTotalDebt?: number;
  agentAddress: string;
  humanOwner?: string;
  error?: string;
}

export interface RepayRequest {
  agentAddress: string;
  amount: string | number;
  targetAgentAddress?: string;
  targetLoanId?: string;
  txHash?: string;
}

export interface RepayResponse {
  success: boolean;
  txHash?: string;
  transferTxHash?: string;
  amount: number;
  remainingDebt: number;
  refundExcess?: number;
  agentAddress: string;
  beneficiaryAgentAddress?: string;
  facilityTotalDebt?: number;
  settledLoans?: string[];
  interestPaid?: number;
  principalPaid?: number;
  upgradedTier?: boolean;
  currentTierName?: string;
  newCreditLimit?: number;
  error?: string;
}
