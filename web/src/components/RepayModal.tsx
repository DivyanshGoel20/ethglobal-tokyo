"use client";

import React, { useEffect, useState } from "react";
import { Agent, Rail } from "@/types";
import { Sheet, Field, ErrorNote } from "./Sheet";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  rail: Rail;
  agents: Agent[];
  onDone: (message: string) => void;
  onSessionExpired: () => void;
}

type Obligation = {
  obligationId: string;
  agentAddress: string;
  status: string;
  owedUsd: number;
  dueMs: number | null;
  purseUsd: number | null;
};

/**
 * Repaying differs by rail. On Arc the agent sends USDC from its wallet and the
 * operator books it on the facility. On Sui the debt is a parked obligation:
 * settling early moves the agent's coins into its purse and settles in one
 * transaction the agent signs.
 */
export const RepayModal: React.FC<RepayModalProps> = ({ isOpen, onClose, rail, agents, onDone, onSessionExpired }) => {
  const owing = agents.filter((a) => a.outstandingDebt > 0);
  const [agentAddress, setAgentAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (rail === "arc") {
      const first = owing[0];
      setAgentAddress(first?.address ?? "");
      setAmount(first ? first.outstandingDebt.toFixed(2) : "");
    } else {
      setObligations(null);
      fetch("/api/sui/obligations")
        .then((r) => r.json())
        .then((d) => setObligations((d.obligations ?? []).filter((o: Obligation) => o.owedUsd > 0)))
        .catch(() => setObligations([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rail]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onSessionExpired();
      throw new Error("Your World session expired. Verify again to repay.");
    }
    if (!res.ok || !data.success) throw new Error(data.error || "Repayment did not settle.");
    return data;
  };

  const repayArc = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount) || 0;
    if (!agentAddress || value <= 0) return;
    setBusy("arc");
    setError(null);
    try {
      const data = await post("/api/repay", { agentAddress, amount: value });
      onDone(`Repaid $${Number(data.amount).toFixed(2)} on Arc`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const settle = async (o: Obligation) => {
    setBusy(o.obligationId);
    setError(null);
    try {
      await post("/api/sui/settle", { obligationId: o.obligationId });
      onDone(`Settled $${o.owedUsd.toFixed(3)} on Sui`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (addr: string) => agents.find((a) => a.address.toLowerCase() === addr.toLowerCase())?.name ?? addr.slice(0, 10);

  return (
    <Sheet open={isOpen} onClose={onClose} kicker={rail === "arc" ? "Arc · booked on the facility" : "Sui · settle before the date"} title="Repay">
      {rail === "arc" ? (
        owing.length === 0 ? (
          <p className="serif text-[18px]">Nothing is owed on Arc.</p>
        ) : (
          <form onSubmit={repayArc} className="space-y-4">
            <p className="text-[13px] ink-2 leading-relaxed">The agent pays from its own Arc wallet; the facility books it.</p>
            <Field label="Paying agent">
              <select
                className="field"
                value={agentAddress}
                onChange={(e) => {
                  setAgentAddress(e.target.value);
                  const a = owing.find((x) => x.address === e.target.value);
                  if (a) setAmount(a.outstandingDebt.toFixed(2));
                }}
              >
                {owing.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.name} - owes ${a.outstandingDebt.toFixed(2)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount" hint="USDC">
              <input type="number" step="0.01" min="0.01" className="field" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn btn-quiet">
                Cancel
              </button>
              <button type="submit" disabled={!!busy} className="btn btn-solid">
                {busy ? "Settling on Arc…" : "Repay"}
              </button>
            </div>
          </form>
        )
      ) : obligations === null ? (
        <p className="mono text-[11px] ink-3">reading obligations from chain…</p>
      ) : obligations.length === 0 ? (
        <p className="serif text-[18px]">Nothing is owed on Sui.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] ink-2 leading-relaxed">
            The agent moves what its purse is short from its own coins, and settles, in one transaction it signs.
          </p>
          {obligations.map((o) => (
            <div key={o.obligationId} className="flex items-center justify-between gap-4 py-3 hair-b">
              <div className="min-w-0">
                <div className="text-[14px]">
                  {nameOf(o.agentAddress)} owes <span className="mono" style={{ color: "var(--alarm)" }}>${o.owedUsd.toFixed(3)}</span>
                </div>
                <div className="mono text-[10px] ink-3 mt-1 truncate">
                  {o.status} · due {o.dueMs ? new Date(o.dueMs).toLocaleString() : "?"} · purse ${o.purseUsd?.toFixed(3) ?? "?"}
                </div>
              </div>
              <button onClick={() => settle(o)} disabled={!!busy} className="btn btn-solid shrink-0">
                {busy === o.obligationId ? "Settling…" : o.status === "defaulted" ? "Cure" : "Settle early"}
              </button>
            </div>
          ))}
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}
    </Sheet>
  );
};
