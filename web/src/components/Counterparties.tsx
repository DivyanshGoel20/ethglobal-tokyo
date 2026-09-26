"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Payment } from "@/lib/useLifeline";

type Trait = { name: string; risk: number; txsCount: number; description: string };
type Profile = {
  address: string;
  level: string;
  score?: number;
  quickScore?: number;
  traits: Trait[];
  overview: { ens?: string | null; firstTxDate?: string | null; txCount?: number | null; fundedBy?: any; isContract?: boolean | null } | null;
};
type Hold = { holdId: string; agentAddress: string; url: string; amountUsd: number; verdict: { reasons: string[] } };

const TONE: Record<string, string> = {
  pay: "var(--steady)",
  cap: "var(--steady)",
  clean: "var(--steady)",
  hold: "var(--alarm)",
  refuse: "var(--alarm)",
  elevated: "var(--alarm)",
  severe: "var(--alarm)",
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

/**
 * Who the agents are paying, and what Intercepta says about each of them.
 *
 * One row per payee on Arc with its latest verdict. Opening a row pulls the
 * full profile - scores, the traits behind them, who the address is. Above
 * it, anything held for the human, with the reason and a yes or no.
 */
export const Counterparties: React.FC<{
  payments: Payment[];
  refreshTrigger?: number;
  agentName: (a: string) => string;
  onChanged: (message: string) => void;
}> = ({ payments, refreshTrigger, agentName, onChanged }) => {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile | { error: string }>>({});
  const [lookup, setLookup] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pay/holds")
      .then((r) => r.json())
      .then((d) => setHolds(d.holds ?? []))
      .catch(() => {});
  }, [refreshTrigger]);

  const payees = useMemo(() => {
    const seen = new Map<string, Payment>();
    for (const p of payments) {
      if ((p.rail ?? "arc") !== "arc" || !p.sellerAddress || !p.screening) continue;
      const k = p.sellerAddress.toLowerCase();
      if (!seen.has(k)) seen.set(k, p); // newest first already
    }
    return [...seen.values()];
  }, [payments]);

  const load = async (address: string) => {
    setOpen((o) => (o === address ? null : address));
    if (profiles[address]) return;
    const res = await fetch(`/api/risk/profile?address=${address}`);
    const data = await res.json().catch(() => ({ error: "No answer" }));
    setProfiles((p) => ({ ...p, [address]: res.ok ? data : { error: data.error ?? "No answer" } }));
  };

  const answer = async (hold: Hold, action: "approve" | "decline") => {
    setBusy(hold.holdId);
    try {
      const res = await fetch(`/api/pay/holds/${hold.holdId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      onChanged(
        action === "decline"
          ? "Declined. Nothing was signed."
          : data.success
            ? `Approved - ${agentName(hold.agentAddress)} paid for ${path(hold.url)}`
            : `Still not paid: ${data.screening?.reasons?.[0] ?? data.error ?? "refused"}`
      );
      setHolds((h) => h.filter((x) => x.holdId !== hold.holdId));
    } finally {
      setBusy(null);
    }
  };

  const shown = open ? profiles[open] : null;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-3 rule-b">
        <h3 className="serif text-[22px] leading-none">Counterparties</h3>
        <span className="lab">screened by Intercepta</span>
      </div>

      {holds.map((h) => (
        <div key={h.holdId} className="py-3 hair-b space-y-2">
          <div className="flex justify-between mono text-[11px]">
            <span style={{ color: "var(--alarm)" }}>held · {agentName(h.agentAddress)}</span>
            <span>${h.amountUsd.toFixed(2)} · {path(h.url)}</span>
          </div>
          <p className="text-[12.5px] ink-2 leading-snug">{h.verdict.reasons[0]}</p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-quiet" disabled={busy === h.holdId} onClick={() => answer(h, "decline")}>
              Decline
            </button>
            <button className="btn btn-solid" disabled={busy === h.holdId} onClick={() => answer(h, "approve")}>
              {busy === h.holdId ? "Settling…" : "Approve"}
            </button>
          </div>
        </div>
      ))}

      {payees.length === 0 && holds.length === 0 && (
        <p className="py-4 text-[13px] ink-3">No Arc payees yet. Each one is screened before an agent signs.</p>
      )}

      {payees.map((p) => (
        <button
          key={p.sellerAddress}
          onClick={() => load(p.sellerAddress!)}
          className="w-full text-left py-3 hair-b flex justify-between gap-3 mono text-[11px]"
        >
          <span>
            {short(p.sellerAddress!)} <span className="ink-3">· {path(p.resourceUrl)}</span>
          </span>
          <span style={{ color: TONE[p.screening!.decision] }}>{p.screening!.decision}</span>
        </button>
      ))}

      <form
        className="pt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^0x[0-9a-fA-F]{40}$/.test(lookup.trim())) load(lookup.trim());
        }}
      >
        <input className="field flex-1 mono text-[11px]" placeholder="0x… any address" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        <button className="btn btn-quiet" type="submit">
          Screen
        </button>
      </form>

      {open && (
        <div className="pt-4 space-y-2">
          {!shown ? (
            <div className="mono text-[11px] ink-3">screening {short(open)}…</div>
          ) : "error" in shown ? (
            <div className="mono text-[11px]" style={{ color: "var(--alarm)" }}>
              {shown.error}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-baseline">
                <span className="mono text-[11px]">{shown.overview?.ens || short(shown.address)}</span>
                <span className="readout text-[20px]" style={{ color: TONE[shown.level] }}>
                  {shown.score ?? "-"}
                  <span className="lab ml-2">{shown.level}</span>
                </span>
              </div>
              {shown.traits.length === 0 ? (
                <p className="text-[12.5px] ink-3">No risk traits on mainnet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {shown.traits.map((t) => (
                    <li key={t.name} className="text-[12.5px] leading-snug">
                      <span className="mono text-[10.5px]" style={{ color: "var(--alarm)" }}>
                        {t.name.replace(/_/g, " ")} · {t.risk}
                      </span>{" "}
                      <span className="ink-2">{t.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              {shown.overview && (
                <div className="mono text-[10.5px] ink-3">
                  {shown.overview.isContract ? "contract" : "wallet"}
                  {shown.overview.txCount != null && ` · ${shown.overview.txCount} txs`}
                  {shown.overview.firstTxDate && ` · since ${String(shown.overview.firstTxDate).slice(0, 10)}`}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
