"use client";

import React, { useCallback, useEffect, useState } from "react";

type Obligation = {
  obligationId: string;
  agentAddress: string;
  status: string;
  drawnUsd: number;
  ceilingUsd: number | null;
  owedUsd: number;
  dueMs: number | null;
  purseUsd: number | null;
  draws: number;
  link: string | null;
};

type Status = {
  configured: boolean;
  network: string;
  facilityId?: string;
  packageId?: string;
  liquidityUsd?: number | null;
  facilityLink?: string | null;
  sellerUp: boolean;
  reason?: string;
};

interface SuiRailPanelProps {
  refreshTrigger: number;
  agentName: (address: string) => string;
  onChanged: (message: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  open: "var(--trace)",
  settled: "var(--steady)",
  closed: "var(--ink-3)",
  defaulted: "var(--alarm)",
};

const due = (ms: number | null) => {
  if (!ms) return "?";
  const left = ms - Date.now();
  if (left <= 0) return "due now";
  const h = Math.floor(left / 3_600_000);
  return h >= 24 ? `in ${Math.floor(h / 24)}d ${h % 24}h` : `in ${h}h ${Math.floor((left % 3_600_000) / 60_000)}m`;
};

/**
 * The Sui facility and the repayments parked against it.
 *
 * Each row is an obligation an agent signed before it drew: a tranche that can
 * cover many payments, collected on its date by whoever calls it. Reconciling
 * reads what the chain did and collects anything that has fallen due.
 */
export const ParkedRepayments: React.FC<SuiRailPanelProps> = ({ refreshTrigger, agentName, onChanged }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([
      fetch("/api/sui/status").then((r) => r.json()).catch(() => null),
      fetch("/api/sui/obligations").then((r) => r.json()).catch(() => ({ obligations: [] })),
    ]);
    setStatus(s);
    setObligations(o.obligations ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const reconcile = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sui/reconcile", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Reconciliation failed");
      onChanged(`Reconciled ${d.checked}: ${d.settled.length} repaid, ${d.defaulted.length} defaulted, ${d.pending} not yet due`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pb-14">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 rule-b">
        <div>
          <h2 className="serif text-[30px] leading-none">Parked repayments</h2>
          <p className="text-[13px] ink-2 mt-2 max-w-[62ch]">
            Signed by each agent before it drew. On its date anyone can collect it: the purse covers it and it
            repays, or it defaults in plain sight and moves nothing.
          </p>
        </div>
        <button onClick={reconcile} disabled={busy || !status?.configured} className="btn">
          {busy ? "Reconciling…" : "Reconcile"}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 py-4 hair-b">
          {[
            ["network", status.configured ? `sui:${status.network}` : "not deployed"],
            ["facility", status.facilityId ? `${status.facilityId.slice(0, 8)}…${status.facilityId.slice(-4)}` : status.reason ?? "-"],
            ["liquidity", status.liquidityUsd == null ? "-" : `$${status.liquidityUsd.toFixed(2)}`],
            ["x402 feed", status.sellerUp ? "up" : "down"],
          ].map(([k, v], i) => (
            <div key={k} className={i % 2 ? "pl-4" : i ? "sm:pl-4" : ""} style={i ? { borderLeft: "1px solid var(--hair)" } : undefined}>
              <div className="lab mb-1">{k}</div>
              {k === "facility" && status.facilityLink ? (
                <a href={status.facilityLink} target="_blank" rel="noreferrer" className="mono text-[11.5px] hover:underline underline-offset-2">
                  {v} ↗
                </a>
              ) : (
                <div className="mono text-[11.5px]" style={k === "x402 feed" ? { color: status.sellerUp ? "var(--steady)" : "var(--ink-3)" } : undefined}>
                  {v}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="mono text-[11px] mt-3" style={{ color: "var(--alarm)" }}>{error}</div>}

      {obligations.length === 0 ? (
        <p className="mono text-[11px] ink-3 py-8">
          Nothing parked. An agent parks its first repayment the first time it borrows on Sui.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="lab">
                <th className="py-3 font-normal">Obligation</th>
                <th className="py-3 font-normal">Agent</th>
                <th className="py-3 font-normal">Drawn / ceiling</th>
                <th className="py-3 font-normal">Purse</th>
                <th className="py-3 font-normal">Due</th>
                <th className="py-3 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody className="mono text-[11.5px]">
              {obligations.map((o) => (
                <tr key={o.obligationId} className="hair-b" style={{ borderTop: "1px solid var(--hair)" }}>
                  <td className="py-3">
                    {o.link ? (
                      <a href={o.link} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
                        {o.obligationId.slice(0, 8)}… ↗
                      </a>
                    ) : (
                      `${o.obligationId.slice(0, 8)}…`
                    )}
                  </td>
                  <td className="py-3" style={{ fontFamily: "var(--sans)", fontSize: 13 }}>{agentName(o.agentAddress)}</td>
                  <td className="py-3">
                    ${o.drawnUsd.toFixed(3)} <span className="ink-3">/ ${o.ceilingUsd?.toFixed(2) ?? "?"} · {o.draws} draw{o.draws === 1 ? "" : "s"}</span>
                  </td>
                  <td className="py-3">{o.purseUsd == null ? "-" : `$${o.purseUsd.toFixed(3)}`}</td>
                  <td className="py-3">{o.status === "open" ? due(o.dueMs) : "-"}</td>
                  <td className="py-3 text-right">
                    <span className="tag" style={{ color: STATUS_COLOR[o.status] ?? "var(--ink-3)" }}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
