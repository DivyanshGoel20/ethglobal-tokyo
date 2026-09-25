import fs from "fs";
import { writeJsonAtomic } from "./atomicWrite";
import path from "path";
import { CREDIT_TIERS, CreditTier } from "./reputationEngine";
import { updateOnChainCreditLimit } from "./facilityContract";

export interface HumanReputationData {
  humanOwner: string;
  totalInterestPaid: number;
  totalActiveDurationDays: number;
  repaymentsCount: number;
  currentTierNumber: number;
  tierGraduatedAt?: number;
  lastRepaymentAt?: number;
}

function getReputationFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "web", "data", "reputation.json"),
    path.resolve(process.cwd(), "data", "reputation.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), "data", "reputation.json");
}

function ensureDirectoryExists() {
  const filePath = getReputationFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getAllReputationRecords(): Record<string, HumanReputationData> {
  try {
    ensureDirectoryExists();
    const filePath = getReputationFilePath();
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error("[ReputationStore] Error reading reputation file:", error);
    return {};
  }
}

export function saveAllReputationRecords(data: Record<string, HumanReputationData>) {
  try {
    ensureDirectoryExists();
    const primary = getReputationFilePath();
    writeJsonAtomic(primary, data);

    // Also mirror to secondary path if running in next.js web workspace
    const altPath = primary.includes("web/data")
      ? primary.replace("web/data", "data")
      : primary.replace("/data", "/web/data");
    if (altPath !== primary) {
      try {
        const altDir = path.dirname(altPath);
        if (!fs.existsSync(altDir)) fs.mkdirSync(altDir, { recursive: true });
        writeJsonAtomic(altPath, data);
      } catch {
        // ignore secondary mirror error
      }
    }
  } catch (error) {
    console.error("[ReputationStore] Error writing reputation file:", error);
  }
}

export function getHumanReputationRecord(humanOwner: string): HumanReputationData {
  const all = getAllReputationRecords();
  const key = humanOwner.toLowerCase();
  if (all[key]) {
    return all[key];
  }

  // Default Tier 1 Starter
  const initial: HumanReputationData = {
    humanOwner,
    totalInterestPaid: 0,
    totalActiveDurationDays: 0,
    repaymentsCount: 0,
    currentTierNumber: 1,
  };
  all[key] = initial;
  saveAllReputationRecords(all);
  return initial;
}

export function getHumanCreditTier(humanOwner: string): CreditTier {
  const record = getHumanReputationRecord(humanOwner);
  const tier = CREDIT_TIERS.find((t) => t.tierNumber === record.currentTierNumber);
  return tier || CREDIT_TIERS[0];
}

/**
 * Record a settled repayment and check for automatic tier graduation.
 */
export async function recordRepaymentInReputation(params: {
  humanOwner: string;
  interestPaid: number;
  loanDurationDays: number;
}): Promise<{
  upgraded: boolean;
  previousTier: CreditTier;
  currentTier: CreditTier;
  onChainTxHash?: string | null;
}> {
  const all = getAllReputationRecords();
  const key = params.humanOwner.toLowerCase();
  const record = all[key] || {
    humanOwner: params.humanOwner,
    totalInterestPaid: 0,
    totalActiveDurationDays: 0,
    repaymentsCount: 0,
    currentTierNumber: 1,
  };

  record.totalInterestPaid =
    Math.round((record.totalInterestPaid + params.interestPaid) * 10000) / 10000;
  record.totalActiveDurationDays =
    Math.round((record.totalActiveDurationDays + params.loanDurationDays) * 10) / 10;
  record.repaymentsCount += 1;
  record.lastRepaymentAt = Date.now();

  const prevTierNumber = record.currentTierNumber;
  const previousTier =
    CREDIT_TIERS.find((t) => t.tierNumber === prevTierNumber) || CREDIT_TIERS[0];

  // Evaluate tier graduation
  let eligibleTier = CREDIT_TIERS[0];
  for (let i = CREDIT_TIERS.length - 1; i >= 0; i--) {
    const t = CREDIT_TIERS[i];
    if (
      record.totalInterestPaid >= t.requiredInterestPaid &&
      record.totalActiveDurationDays >= t.requiredActiveDurationDays &&
      record.repaymentsCount >= t.requiredRepaymentsCount
    ) {
      eligibleTier = t;
      break;
    }
  }

  let upgraded = false;
  let onChainTxHash: string | null = null;

  if (eligibleTier.tierNumber > record.currentTierNumber) {
    console.log(
      `[ReputationStore] Human ${params.humanOwner} graduated to ${eligibleTier.name} ($${eligibleTier.creditLimit} limit)!`
    );
    record.currentTierNumber = eligibleTier.tierNumber;
    record.tierGraduatedAt = Date.now();
    upgraded = true;

    // Synchronize the higher credit limit on-chain on Arc Testnet
    try {
      onChainTxHash = await updateOnChainCreditLimit(
        params.humanOwner,
        eligibleTier.creditLimit
      );
      if (onChainTxHash) {
        console.log(
          `[ReputationStore] On-chain credit limit upgraded to $${eligibleTier.creditLimit} USDC in tx ${onChainTxHash}`
        );
      }
    } catch (err: any) {
      console.warn("[ReputationStore] On-chain limit upgrade error:", err.message);
    }
  }

  all[key] = record;
  saveAllReputationRecords(all);

  const currentTier =
    CREDIT_TIERS.find((t) => t.tierNumber === record.currentTierNumber) || CREDIT_TIERS[0];

  return {
    upgraded,
    previousTier,
    currentTier,
    onChainTxHash,
  };
}
