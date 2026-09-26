import { getAgentsByOwner, updateAgentInStore } from "./agentStore";
import { getLoansByAgent } from "./loanStore";

/**
 * One ledger change at a time, per human.
 *
 * A repayment reads what is owed, waits seconds for Arc, then writes; a
 * purchase on credit does the same. Two of them for the same human, running
 * together, each computed from a picture the other was about to change. They
 * now queue. Kept on globalThis because Next bundles each route on its own,
 * and a lock that is not shared locks nothing.
 */
const g = globalThis as unknown as { __lifelineLedgerLocks?: Map<string, Promise<unknown>> };
const locks = (g.__lifelineLedgerLocks ??= new Map());

/** Wait for this human's ledger, and get the function that hands it on. */
export async function acquireLedgerLock(human: string): Promise<() => void> {
  const key = human.toLowerCase();
  const before = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = before.then(() => mine);
  locks.set(key, tail);
  await before.catch(() => {});
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    if (locks.get(key) === tail) locks.delete(key);
  };
}

export async function withLedgerLock<T>(human: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLedgerLock(human);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Each agent's debt, recomputed from its loans - the ledger itself - rather
 * than added to a figure that may have been read before someone else changed
 * it. Call after any change to a human's loans.
 */
export function syncAgentDebts(human: string) {
  for (const a of getAgentsByOwner(human)) {
    const owed =
      Math.round(
        getLoansByAgent(a.address)
          .filter((l) => l.status === "ACTIVE" && (l.outstandingAmount || 0) > 0.0001)
          .reduce((sum, l) => sum + l.outstandingAmount, 0) * 10000
      ) / 10000;
    if (Math.abs((a.outstandingDebt || 0) - owed) > 0.00001) {
      updateAgentInStore(a.address, { outstandingDebt: owed, status: owed === 0 ? "Healthy" : "Active" });
    }
  }
}
