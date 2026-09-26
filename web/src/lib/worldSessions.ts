import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "./atomicWrite";

/**
 * World ID 4 sessions, linked to the human they belong to.
 *
 * In World ID 4 an action's nullifier can be spent once: it is what makes a
 * human unique, so it is how someone signs up. Asking for it again returns
 * `nullifier_replayed`, which is why signing in a second time used to fail.
 * Returning users prove a *session* instead.
 *
 * A session is not a uniqueness guarantee - one person can open as many as
 * they like - so it is only ever trusted through the link written here, at
 * sign-up, while the one-time nullifier is still in hand. A session with no
 * link identifies nobody.
 */
type Store = {
  sessions: Record<string, { human: string; linkedAt: number; lastSeenAt?: number }>;
  /** Session nullifiers already accepted, so a proof cannot be replayed. */
  used: Record<string, number>;
};

function filePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "web", "data", "world-sessions.json"),
    path.resolve(process.cwd(), "data", "world-sessions.json"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return path.resolve(process.cwd(), "data", "world-sessions.json");
}

function read(): Store {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return { sessions: {}, used: {} };
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    return { sessions: s.sessions ?? {}, used: s.used ?? {} };
  } catch {
    return { sessions: {}, used: {} };
  }
}

const write = (s: Store) => writeJsonAtomic(filePath(), s);

export const humanForSession = (sessionId: string): string | null => read().sessions[sessionId]?.human ?? null;

/** Links a session to a human. Refuses to move a session that belongs to someone else. */
export function linkSession(sessionId: string, human: string): { ok: true } | { ok: false; reason: string } {
  const s = read();
  const existing = s.sessions[sessionId];
  if (existing && existing.human.toLowerCase() !== human.toLowerCase()) {
    return { ok: false, reason: "That World ID session already belongs to another account." };
  }
  s.sessions[sessionId] = { human, linkedAt: existing?.linkedAt ?? Date.now(), lastSeenAt: Date.now() };
  write(s);
  return { ok: true };
}

/** True the first time a session nullifier is presented. */
export function spendSessionNullifier(nullifier: string): boolean {
  const s = read();
  const key = nullifier.toLowerCase();
  if (s.used[key]) return false;
  s.used[key] = Date.now();
  write(s);
  return true;
}

export function touchSession(sessionId: string) {
  const s = read();
  if (!s.sessions[sessionId]) return;
  s.sessions[sessionId].lastSeenAt = Date.now();
  write(s);
}
