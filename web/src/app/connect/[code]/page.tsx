"use client";

import React, { useCallback, useEffect, useState } from "react";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { LifelineMark } from "@/components/Pulse";
import { Field, ErrorNote } from "@/components/Sheet";

type Request = {
  code: string;
  name: string;
  rail: "arc" | "sui";
  capUsd: number | null;
  reason: string | null;
  client: string | null;
  status: "pending" | "approving" | "approved" | "denied" | "collected";
  expiresAt: string;
  headroom: { arc: number; sui: number };
  suiReady?: boolean;
  agent?: { address: string; name: string; rail: string };
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Where a human answers an agent that asked for a line of its own.
 *
 * The agent (a Claude Code session, say) opened the request and sent its human
 * this link. Signed in with World ID, the human sees who is asking and for what,
 * picks the rail, the cap and how long, and approves - which makes the agent a
 * wallet, authorises it, and binds a mandate to it - or declines.
 */
export default function ConnectPage({ params }: { params: { code: string } }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [req, setReq] = useState<Request | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rail, setRail] = useState<"arc" | "sui">("arc");
  const [cap, setCap] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: "approved" | "denied"; address?: string; cap?: number; expiresAt?: string; onChain?: boolean }>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/agent/connect/${params.code}`, { cache: "no-store" });
    if (res.status === 401) return setSignedIn(false);
    setSignedIn(true);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setLoadError(d.error ?? "Could not load this request.");
    setReq(d);
    const startRail = d.rail === "sui" && d.suiReady === false ? "arc" : d.rail;
    setRail(startRail);
    const room = d.headroom[startRail] ?? 0;
    setCap(String(Math.min(d.capUsd ?? 5, room || 0) || ""));
  }, [params.code]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (action: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/connect/${params.code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rail, capUsd: parseFloat(cap), days: parseInt(days, 10) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) throw new Error(d.error ?? "That did not go through.");
      setDone(
        action === "deny"
          ? { status: "denied" }
          : { status: "approved", address: d.agent.address, cap: d.grant.capUsd, expiresAt: d.grant.expiresAt, onChain: d.authorizedOnChain }
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (signedIn === null) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LifelineMark size={22} className="pulse-dot" />
      </div>
    );
  }
  if (!signedIn) return <WorldAuthGate onVerified={() => load()} />;

  const room = req ? req.headroom[rail] : 0;

  return (
    <main className="min-h-screen px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-[520px]">
        <div className="flex items-center gap-2 mb-8">
          <LifelineMark size={18} />
          <span className="lab">Lifeline · agent access</span>
        </div>

        {loadError ? (
          <p className="serif text-[24px] leading-snug">{loadError}</p>
        ) : !req ? (
          <p className="mono text-[12px] ink-3">loading…</p>
        ) : done ? (
          done.status === "approved" ? (
            <section className="space-y-4">
              <h1 className="serif text-[32px] leading-tight">{req.name} is on your line.</h1>
              <p className="text-[14px] ink-2 leading-relaxed">
                It has its own wallet, <span className="mono">{short(done.address!)}</span>, on {rail === "arc" ? "Arc" : "Sui"}, and can
                borrow up to <b>${done.cap!.toFixed(2)}</b> until {new Date(done.expiresAt!).toLocaleDateString()}. Every payment is screened by Intercepta first; anything
                risky waits for you.
              </p>
              {rail === "arc" && !done.onChain && (
                <ErrorNote>The on-chain authorisation did not finish; the agent can retry once the facility is reachable.</ErrorNote>
              )}
              <p className="text-[13px] ink-3">You can close this tab. The agent picks its access up by itself; revoke it any time from the dashboard.</p>
              <a href={`/${rail}`} className="btn btn-quiet inline-flex">Open the dashboard</a>
            </section>
          ) : (
            <section className="space-y-3">
              <h1 className="serif text-[32px] leading-tight">Declined.</h1>
              <p className="text-[14px] ink-2">Nothing was issued. The agent has been told no.</p>
            </section>
          )
        ) : req.status !== "pending" ? (
          <section className="space-y-3">
            <h1 className="serif text-[28px] leading-tight">This request was already answered.</h1>
            {req.agent && (
              <p className="text-[14px] ink-2">
                {req.agent.name} · <span className="mono">{short(req.agent.address)}</span> · {req.agent.rail}
              </p>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <div>
              <div className="lab mb-2">code {req.code}</div>
              <h1 className="serif text-[32px] leading-tight">
                An agent called <em>{req.name}</em> wants to spend on your credit line.
              </h1>
              {req.client && <p className="mono text-[11px] ink-3 mt-2">running in {req.client}</p>}
            </div>

            {req.reason && (
              <blockquote className="text-[14px] ink-2 leading-relaxed pl-3" style={{ borderLeft: "2px solid var(--rule)" }}>
                “{req.reason}”
              </blockquote>
            )}

            <p className="text-[13px] ink-2 leading-relaxed">
              Approving gives it a new wallet that Lifeline holds the key to, authorised on your line and bound to a mandate only it
              can use. It pays for x402 resources on credit, up to the cap you set. Intercepta screens every payee; payments to
              new or risky payees wait for your approval in World ID.
            </p>

            <div className="grid grid-cols-2" style={{ border: "1px solid var(--rule)" }}>
              {(["arc", "sui"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={r === "sui" && req.suiReady === false}
                  title={r === "sui" && req.suiReady === false ? "Lifeline is not deployed on Sui here" : undefined}
                  onClick={() => setRail(r)}
                  className="h-11 text-[13px] disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{ background: rail === r ? "var(--solid-bg)" : "transparent", color: rail === r ? "var(--solid-fg)" : "var(--ink-2)" }}
                >
                  {r === "arc" ? "Arc" : "Sui"} <span className="mono text-[10.5px] opacity-70">· ${req.headroom[r].toFixed(2)} free</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Spending cap" hint="USDC">
                <input type="number" min="0.01" step="0.01" max={room} className="field" value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
              <Field label="For" hint="days">
                <input type="number" min="1" max="90" className="field" value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
            </div>
            {room <= 0 && <ErrorNote>Your {rail === "arc" ? "Arc" : "Sui"} line has no headroom left. Repay first, or pick the other rail.</ErrorNote>}
            {req.capUsd != null && <p className="mono text-[10.5px] ink-3">The agent asked for ${req.capUsd.toFixed(2)}.</p>}

            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-quiet" disabled={busy} onClick={() => answer("deny")}>
                Decline
              </button>
              <button className="btn btn-solid" disabled={busy || room <= 0 || !(parseFloat(cap) > 0)} onClick={() => answer("approve")}>
                {busy ? (rail === "arc" ? "Authorising on chain…" : "Setting up…") : "Approve"}
              </button>
            </div>
            <p className="mono text-[10px] ink-3">Expires {new Date(req.expiresAt).toLocaleTimeString()}.</p>
          </section>
        )}
      </div>
    </main>
  );
}
