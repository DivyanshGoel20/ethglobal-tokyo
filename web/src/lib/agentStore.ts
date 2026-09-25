import fs from "fs";
import { writeJsonAtomic } from "./atomicWrite";
import path from "path";
import { Agent } from "@/types";
import { getHumanCreditTier } from "./reputationStore";

function getAgentsFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "web", "data", "agents.json"),
    path.resolve(process.cwd(), "data", "agents.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), "data", "agents.json");
}

function ensureDirectoryExists() {
  const filePath = getAgentsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getAllAgents(): Agent[] {
  try {
    ensureDirectoryExists();
    const filePath = getAgentsFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error("[AgentStore] Error reading agents file:", error);
    return [];
  }
}

export function saveAllAgents(agents: Agent[]) {
  try {
    ensureDirectoryExists();
    const filePath = getAgentsFilePath();
    writeJsonAtomic(filePath, agents);
  } catch (error) {
    console.error("[AgentStore] Error writing agents file:", error);
  }
}

export function getAgentsByOwner(owner?: string, agentBookHumanId?: string): Agent[] {
  const all = getAllAgents();
  if (!owner && !agentBookHumanId) return all;
  return all.filter((a) => {
    if (
      agentBookHumanId &&
      a.agentBookHumanId &&
      a.agentBookHumanId.toLowerCase() === agentBookHumanId.toLowerCase()
    ) {
      return true;
    }
    if (owner && a.humanOwner && a.humanOwner.toLowerCase() === owner.toLowerCase()) {
      return true;
    }
    return false;
  });
}

export function addAgentToStore(newAgent: Agent): Agent {
  const all = getAllAgents();
  const existingIndex = all.findIndex(
    (a) => a.address.toLowerCase() === newAgent.address.toLowerCase()
  );

  if (existingIndex >= 0) {
    all[existingIndex] = { ...all[existingIndex], ...newAgent };
    saveAllAgents(all);
    return all[existingIndex];
  }

  all.unshift(newAgent);
  saveAllAgents(all);
  return newAgent;
}

export function updateAgentInStore(
  address: string,
  updates: Partial<Agent>
): Agent | null {
  const all = getAllAgents();
  const index = all.findIndex(
    (a) => a.address.toLowerCase() === address.toLowerCase()
  );

  if (index === -1) return null;

  all[index] = { ...all[index], ...updates };
  saveAllAgents(all);
  return all[index];
}

export function getAgentByAddress(address: string): Agent | null {
  const all = getAllAgents();
  return (
    all.find((a) => a.address.toLowerCase() === address.toLowerCase()) || null
  );
}

export function getHumanFacilityStats(
  humanOwner: string,
  agentBookHumanId?: string
): {
  humanOwner: string;
  agentCount: number;
  totalCreditLimit: number;
  totalOutstandingDebt: number;
  totalAvailableCredit: number;
  totalBorrowed: number;
  totalRepaid: number;
} {
  const humanAgents = getAgentsByOwner(humanOwner, agentBookHumanId);
  const tier = getHumanCreditTier(humanOwner);
  const totalCreditLimit = tier.creditLimit;
  const totalOutstandingDebt = Math.round(
    humanAgents.reduce((sum, a) => sum + (a.outstandingDebt || 0), 0) * 10000
  ) / 10000;
  const totalBorrowed = Math.round(
    humanAgents.reduce((sum, a) => sum + (a.totalBorrowed || 0), 0) * 10000
  ) / 10000;
  const totalRepaid = Math.round(
    humanAgents.reduce((sum, a) => sum + (a.totalRepaid || 0), 0) * 10000
  ) / 10000;
  const totalAvailableCredit = Math.max(
    0,
    Math.round((totalCreditLimit - totalOutstandingDebt) * 100) / 100
  );

  return {
    humanOwner,
    agentCount: humanAgents.length,
    totalCreditLimit,
    totalOutstandingDebt,
    totalAvailableCredit,
    totalBorrowed,
    totalRepaid,
  };
}

export function removeAgentFromStore(address: string): boolean {
  const all = getAllAgents();
  const filtered = all.filter(
    (a) => a.address.toLowerCase() !== address.toLowerCase()
  );

  if (filtered.length === all.length) return false;

  saveAllAgents(filtered);
  return true;
}

