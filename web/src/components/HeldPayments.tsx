"use client";

import React, { useEffect, useState } from "react";
import type { Rail } from "@/types";
import { WorldAgentApproval } from "./WorldAgentApproval";

type Hold = { holdId: string; agentAddress: string; url: string; amountUsd: number; verdict: { reasons: string[] } };

const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

/**
 * Payments waiting on the human, on one rail: flagged by Intercepta, or past
 * an agent's spending cap. Each shows why, and is approved with a fresh World
 * ID approval (or a click, where World ID for Agents is not set up) or declined.
 */
export const HeldPayments: React.FC<{
  rail: Rail;
  refreshTrigger?: number;
  agentName: (a: string) => string;
  onChanged: (message: string) => void;
  /** Show a heading of its own (the Sui page has no Counterparties panel around it). */
  titled?: boolean;
}> = ({ rail, refreshTrigger, agentName, onChanged, titled }) => {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // The hold waiting on a fresh World ID approval, if any.
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pay/holds?rail=${rail}`)
      .then((r) => r.json())
      .then((d) => setHolds(d.holds ?? []))
      .catch(() => {});
  }, [rail, refreshTrigger]);

  const answer = async (hold: Hold, action: "approve" | "decline") => {
    setBusy(hold.holdId);
    try {
      const res = await fetch(`/api/pay/holds/${hold.holdId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.code === "world_id_required") return setApproving(hold.holdId);
      onChanged(
        action === "decline"
          ? "Declined. Nothing was signed."
          : data.success
            ? `Approved - ${agentName(hold.agentAddress)} paid for ${path(hold.url)}`
            : `Still not paid: ${data.screening?.reasons?.[0] ?? data.error ?? "refused"}`
      );
      setHolds((h) => h.filter((x) => x.holdId !== hold.holdId));
    } catch (err: any) {
      onChanged(`Could not reach Lifeline: ${err?.message ?? "network error"}. Nothing was changed.`);
    } finally {
      setBusy(null);
    }
  };

  if (holds.length === 0) return null;

  return (
    <section className={titled ? "pb-10" : undefined}>
      {titled && (
        <div className="flex items-baseline justify-between pb-3 rule-b">
          <h3 className="serif text-[22px] leading-none">Held for you</h3>
          <span className="lab">approve with World ID</span>
        </div>
      )}
      {holds.map((h) => (
        <div key={h.holdId} className="py-3 hair-b space-y-2">
          <div className="flex justify-between mono text-[11px]">
            <span style={{ color: "var(--alarm)" }}>held · {agentName(h.agentAddress)}</span>
            <span>${h.amountUsd.toFixed(2)} · {path(h.url)}</span>
          </div>
          <p className="text-[12.5px] ink-2 leading-snug">{h.verdict.reasons[0]}</p>
          {approving === h.holdId ? (
            <WorldAgentApproval
              holdId={h.holdId}
              onDone={({ message }) => {
                setApproving(null);
                setHolds((all) => all.filter((x) => x.holdId !== h.holdId));
                onChanged(message);
              }}
              onCancel={() => setApproving(null)}
            />
          ) : (
            <div className="flex justify-end gap-2">
              <button className="btn btn-quiet" disabled={busy === h.holdId} onClick={() => answer(h, "decline")}>
                Decline
              </button>
              <button className="btn btn-solid" disabled={busy === h.holdId} onClick={() => answer(h, "approve")}>
                {busy === h.holdId ? "Settling…" : "Approve"}
              </button>
            </div>
          )}
        </div>
      ))}

    </section>
  );
};
