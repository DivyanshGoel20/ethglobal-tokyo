"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Payment } from "@/lib/useLifeline";
import { HeldPayments } from "./HeldPayments";

type Trait = { name: string; risk: number; txsCount: number; description: string };
type Profile = {
  address: string;
  level: string;
  score?: number;
  quickScore?: number;
  traits: Trait[];
  overview: { ens?: string | null; firstTxDate?: string | null; txCount?: number | null; fundedBy?: any; isContract?: boolean | null } | null;
};

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
  const [open, setOpen] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile | { error: string }>>({});
  const [lookup, setLookup] = useState("");

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

  const shown = open ? profiles[open] : null;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-3 rule-b">
        <h3 className="serif text-[22px] leading-none">Counterparties</h3>
        <span className="lab">screened by Intercepta</span>
      </div>

      <HeldPayments rail="arc" refreshTrigger={refreshTrigger} agentName={agentName} onChanged={onChanged} />

      {payees.length === 0 && (
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
              <ReportToIntercepta key={shown.address} address={shown.address} flagged={shown.level !== "clean"} onDone={onChanged} />
            </>
          )}
        </div>
      )}
    </section>
  );
};

/**
 * Tell Intercepta it got an address wrong: malicious where it saw nothing, or
 * safe where it flagged something. Filed by the signed-in human only.
 */
const ReportToIntercepta: React.FC<{ address: string; flagged: boolean; onDone: (m: string) => void }> = ({ address, flagged, onDone }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"malicious" | "safe">(flagged ? "safe" : "malicious");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setError(null);
    const res = await fetch("/api/risk/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, kind, note }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) {
      setState("idle");
      setError(d.error || "Intercepta did not take the report.");
      return;
    }
    setState("sent");
    onDone(`Reported ${short(address)} to Intercepta as ${kind}`);
  };

  if (state === "sent") return <p className="mono text-[10.5px]" style={{ color: "var(--steady)" }}>Reported to Intercepta as {kind}. Thank you.</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mono text-[10.5px] ink-3 underline underline-offset-2">
        {flagged ? "Wrongly flagged? Report to Intercepta" : "Know it is malicious? Report to Intercepta"}
      </button>
    );
  }
  return (
    <div className="space-y-2 pt-1">
      <div className="grid grid-cols-2" style={{ border: "1px solid var(--rule)" }}>
        {(["malicious", "safe"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="h-8 mono text-[10px] uppercase tracking-[0.04em]"
            style={{ background: kind === k ? "var(--solid-bg)" : "transparent", color: kind === k ? "var(--solid-fg)" : "var(--ink-2)" }}
          >
            {k === "malicious" ? "It is malicious" : "It is safe"}
          </button>
        ))}
      </div>
      <textarea
        className="field text-[12px] min-h-[64px]"
        placeholder="What happened (optional) - e.g. it took payment and delivered nothing"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="mono text-[10.5px]" style={{ color: "var(--alarm)" }}>{error}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn btn-quiet" onClick={() => setOpen(false)} disabled={state === "sending"}>
          Cancel
        </button>
        <button className="btn btn-solid" onClick={send} disabled={state === "sending"}>
          {state === "sending" ? "Reporting…" : "Report"}
        </button>
      </div>
      <p className="mono text-[10px] ink-3">Reports go to Intercepta&apos;s threat data, which other wallets rely on. Report only what you know.</p>
    </div>
  );
};
