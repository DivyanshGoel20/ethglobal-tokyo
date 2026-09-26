import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "./atomicWrite";

/**
 * Which World App wallet belongs to which human.
 *
 * Inside World App, sign-in is the wallet: MiniKit's Sign-In with Ethereum
 * proves the user holds it, every visit, with one tap. But a wallet is not a
 * human - one person can hold several - so it identifies nobody until it is
 * linked here, once, while World ID's one-time uniqueness proof is in hand
 * (or, for someone who signed up in a browser, through a link token that only
 * their signed-in session could mint). A wallet is never moved to a second
 * human.
 */
type Store = Record<string, { human: string; linkedAt: number }>;

function filePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "web", "data", "wallet-links.json"),
    path.resolve(process.cwd(), "data", "wallet-links.json"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return path.resolve(process.cwd(), "data", "wallet-links.json");
}

function read(): Store {
  try {
    const p = filePath();
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
  } catch {
    return {};
  }
}

export const humanForWallet = (wallet: string): string | null => read()[wallet.toLowerCase()]?.human ?? null;

export function linkWallet(wallet: string, human: string): { ok: true } | { ok: false; reason: string } {
  const all = read();
  const key = wallet.toLowerCase();
  const existing = all[key];
  if (existing && existing.human.toLowerCase() !== human.toLowerCase()) {
    return { ok: false, reason: "That World App wallet is already linked to another Lifeline account." };
  }
  all[key] = { human, linkedAt: existing?.linkedAt ?? Date.now() };
  writeJsonAtomic(filePath(), all);
  return { ok: true };
}
