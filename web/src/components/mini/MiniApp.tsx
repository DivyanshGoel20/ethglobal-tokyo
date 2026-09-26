"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { Activity, BadgeCheck, Receipt, ScrollText } from "lucide-react";
import type { Agent, Rail } from "@/types";
import { useLifeline } from "@/lib/useLifeline";
import { ago } from "@/lib/ecg";
import { Lead, LifelineMark } from "../Pulse";
import { AuthorizeSheet, type LeadData } from "../Monitor";
import { EventTape } from "../EventTape";
import { Underwriting } from "../Underwriting";
import { FacilityRecord } from "../FacilityRecord";
import { Counterparties } from "../Counterparties";
import { PurchaseModal } from "../PurchaseModal";
import { RepayModal } from "../RepayModal";
import { Sheet } from "../Sheet";
import { MiniGate } from "./MiniGate";

type Tab = "pulse" | "owed" | "tape" | "record";

const TABS: { id: Tab; label: string; Icon: typeof Activity }[] = [
  { id: "pulse", label: "Pulse", Icon: Activity },
  { id: "owed", label: "Owed", Icon: Receipt },
  { id: "tape", label: "Tape", Icon: ScrollText },
  { id: "record", label: "Record", Icon: BadgeCheck },
];

const usd = (n: number, d = 2) => `$${n.toFixed(d)}`;

/** Felt, not only seen: money moving is a success tap, a refusal an error one. */
function haptic(kind: "success" | "error") {
  if (!MiniKit.isInWorldApp()) return;
  MiniKit.sendHapticFeedback({ hapticsType: "notification", style: kind }).catch(() => {});
}

/**
 * Lifeline, inside World App.
 *
 * The same line, agents and rails as the browser dashboard - one state, from
 * useLifeline - laid out the way World's guidelines ask for: a tab bar, not a
 * footer; sheets that rise from the bottom; the action anchored above the
 * tabs; 24px gutters; the user's World username, not a hex address.
 */
export default function MiniApp() {
  const L = useLifeline({ haptic });
  const [tab, setTab] = useState<Tab>("pulse");
  const [adding, setAdding] = useState(false);
  const [account, setAccount] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-shell", "mini");
    return () => document.documentElement.removeAttribute("data-shell");
  }, []);

  useEffect(() => {
    if (L.isWorldVerified && MiniKit.isInWorldApp()) setUsername(MiniKit.user?.username ?? null);
  }, [L.isWorldVerified]);

  const selectTab = (t: Tab) => {
    if (t !== tab && MiniKit.isInWorldApp()) MiniKit.sendHapticFeedback({ hapticsType: "selection-changed" }).catch(() => {});
    setTab(t);
    document.getElementById("mini-scroll")?.scrollTo({ top: 0 });
  };

  if (L.isLoadingSession) {
    return (
      <div className="min-h-[100dvh] grid place-items-center">
        <LifelineMark size={26} className="pulse-dot" />
      </div>
    );
  }

  if (!L.isWorldVerified) return <MiniGate onSignedIn={L.signedIn} haptic={haptic} />;

  const owedHere = L.rail === "arc" ? L.arcDebt : L.suiDebt;

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* Header. World App draws its own controls at the top right, so ours
          stay left and centre. */}
      <header className="shrink-0 hair-b" style={{ paddingTop: "env(safe-area-inset-top)", background: "var(--ground)" }}>
        <div className="px-6 h-14 flex items-center justify-between gap-3" style={{ paddingRight: 96 }}>
          <div className="flex items-center gap-2">
            <LifelineMark size={15} />
            <span className="serif text-[21px] leading-none">Lifeline</span>
          </div>
          <button onClick={() => setAccount(true)} className="mono text-[11px] ink-2 truncate max-w-[40vw]">
            {username ? `@${username}` : `${L.nullifierHash.slice(0, 6)}…`}
          </button>
        </div>
        <div className="px-6 pb-3 flex gap-2">
          <Segment
            value={L.rail}
            onChange={(r) => L.chooseRail(r as Rail)}
            options={[
              { id: "arc", name: "Arc" },
              { id: "sui", name: "Sui", disabled: !L.sui.ready },
            ]}
            grow
          />
          <Segment
            value={L.instrument}
            onChange={(i) => L.chooseInstrument(i as "strip" | "monitor")}
            options={[
              { id: "strip", name: "Strip" },
              { id: "monitor", name: "Monitor" },
            ]}
          />
        </div>
      </header>

      {L.toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40 sheet rise px-4 py-2.5 max-w-[88vw] text-[13px] text-center" style={{ top: "calc(env(safe-area-inset-top) + 112px)" }}>
          {L.toast}
        </div>
      )}

      <main id="mini-scroll" className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        <div className="px-6 pt-6" style={{ paddingBottom: tab === "pulse" ? 120 : 32 }}>
          {tab === "pulse" && (
            <PulseTab L={L} onBuy={(a) => L.setPurchaseFor(a.address)} onAdd={() => setAdding(true)} />
          )}
          {tab === "owed" && <OwedTab L={L} owedHere={owedHere} />}
          {tab === "tape" && <EventTape activities={L.activities} rail={L.rail} />}
          {tab === "record" && (
            <div className="space-y-8">
              <Underwriting humanOwner={L.nullifierHash} refreshTrigger={L.refreshTrigger} onTier={L.setCreditLimit} />
              {L.rail === "arc" ? (
                <>
                  <FacilityRecord humanOwner={L.nullifierHash} refreshTrigger={L.refreshTrigger} />
                  <Counterparties payments={L.payments} refreshTrigger={L.refreshTrigger} agentName={L.nameOf} onChanged={L.done} />
                </>
              ) : (
                <SuiFacility />
              )}
            </div>
          )}
        </div>
      </main>

      {/* The one action, anchored above the tabs where a thumb is. */}
      {tab === "pulse" && L.agents.length > 0 && (
        <div className="shrink-0 px-6 pb-3 pt-3 rule-t" style={{ background: "var(--ground)" }}>
          <button onClick={() => L.setPurchaseFor(null)} className="btn btn-solid w-full justify-center h-12">
            x402 purchase
          </button>
        </div>
      )}

      <nav className="tabbar shrink-0 rule-t grid grid-cols-4" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))", background: "var(--ground)" }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className="flex flex-col items-center gap-1 pt-2.5 ink-3"
          >
            <span className="tab-mark h-[2px] w-5 -mt-2.5 mb-1.5" />
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} />
            <span className="lab" style={{ color: "inherit", fontSize: 9 }}>
              {label}
            </span>
          </button>
        ))}
      </nav>

      <AuthorizeSheet open={adding} onClose={() => setAdding(false)} onAddAgent={L.handleAddAgent} />

      <PurchaseModal
        isOpen={L.purchaseFor !== undefined}
        initialAgent={L.purchaseFor ?? null}
        onClose={() => L.setPurchaseFor(undefined)}
        agents={L.agents}
        rail={L.rail}
        headroom={L.headroom}
        onDone={L.done}
        onSessionExpired={L.endSession}
      />
      <RepayModal
        isOpen={L.isRepayOpen}
        onClose={() => L.setIsRepayOpen(false)}
        rail={L.rail}
        agents={L.agents}
        onDone={L.done}
        onSessionExpired={L.endSession}
      />

      <Sheet open={account} onClose={() => setAccount(false)} kicker="Signed in" title={username ? `@${username}` : "World ID"}>
        <p className="text-[13px] ink-2 leading-relaxed mb-5">
          Your World App wallet signs you in; World ID proved once that you are one human, and this is your one line.
        </p>
        <div className="mono text-[10.5px] ink-3 break-all mb-6">{L.nullifierHash}</div>
        <button
          onClick={() => {
            setAccount(false);
            L.handleSignOut();
          }}
          className="btn w-full justify-center"
          style={{ color: "var(--alarm)" }}
        >
          Sign out
        </button>
      </Sheet>
    </div>
  );
}

function Segment({
  value,
  options,
  onChange,
  grow,
}: {
  value: string;
  options: { id: string; name: string; disabled?: boolean }[];
  onChange: (id: string) => void;
  grow?: boolean;
}) {
  return (
    <div className={`flex h-9 ${grow ? "flex-1" : ""}`} style={{ border: "1px solid var(--rule)" }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            disabled={o.disabled}
            className={`${grow ? "flex-1" : "px-3"} mono text-[10.5px] tracking-[0.08em] uppercase disabled:opacity-35`}
            style={{ background: on ? "var(--solid-bg)" : "transparent", color: on ? "var(--solid-fg)" : "var(--ink-2)" }}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function PulseTab({ L, onBuy, onAdd }: { L: ReturnType<typeof useLifeline>; onBuy: (a: Agent) => void; onAdd: () => void }) {
  const drawn = L.arcDebt + L.suiDebt;
  const here = L.rail === "arc" ? L.arcDebt : L.suiDebt;
  const credit = L.beats24h.filter((p) => (Number(p.shortfall) || 0) > 0).length;

  return (
    <>
      <div className="lab mb-2">Your line</div>
      <h1 className="serif text-[34px] leading-[0.98] tracking-tight">
        {drawn === 0 ? (
          <>
            Resting. <em className="ink-3">Nothing owed.</em>
          </>
        ) : (
          <>
            {usd(L.headroom)} <em className="ink-3">of {usd(L.creditLimit)} free.</em>
          </>
        )}
      </h1>

      <div className="grid grid-cols-2 mt-6 rule-t">
        {[
          { lab: "Headroom", val: usd(L.headroom), note: "both rails" },
          { lab: `Drawn · ${L.rail === "arc" ? "Arc" : "Sui"}`, val: usd(here), note: `${usd(L.rail === "arc" ? L.suiDebt : L.arcDebt)} on ${L.rail === "arc" ? "Sui" : "Arc"}`, alarm: here > 0 },
          { lab: "Line", val: usd(L.creditLimit), note: "grows as you repay" },
          { lab: "Beats · 24h", val: String(L.beats24h.length), note: credit ? `${credit} on credit` : "all self-paid" },
        ].map((v, i) => (
          <div key={v.lab} className="py-4 hair-b" style={i % 2 ? { borderLeft: "1px solid var(--hair)", paddingLeft: 16 } : undefined}>
            <div className="lab mb-2">{v.lab}</div>
            <div className="readout text-[24px]" style={{ color: v.alarm ? "var(--alarm)" : "var(--ink)" }}>
              {v.val}
            </div>
            <div className="mono text-[10px] ink-3 mt-1.5">{v.note}</div>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between mt-8 mb-1">
        <h2 className="serif text-[24px] leading-none">Leads</h2>
        <button onClick={onAdd} className="btn btn-quiet">
          + Authorize
        </button>
      </div>
      <div className="lab mb-2">
        newest beat on the right · <span style={{ color: "var(--alarm)" }}>red</span> on credit
      </div>

      {L.leads.length === 0 ? (
        <div className="py-10 text-center">
          <Lead beats={[]} instrument={L.instrument} height={52} />
          <p className="serif text-[19px] leading-snug mt-6">No agents on this line yet.</p>
          <button onClick={onAdd} className="btn btn-solid mt-5">
            Authorize your first agent
          </button>
        </div>
      ) : (
        L.leads.map((lead) => <MiniLead key={lead.agent.address} lead={lead} L={L} onBuy={onBuy} />)
      )}
    </>
  );
}

function MiniLead({ lead, L, onBuy }: { lead: LeadData; L: ReturnType<typeof useLifeline>; onBuy: (a: Agent) => void }) {
  const a = lead.agent;
  const owed = L.rail === "arc" ? a.outstandingDebt : a.suiDebt ?? 0;
  const [busy, setBusy] = useState<string | null>(null);
  const last = lead.beats.length ? Math.max(...lead.beats.map((b) => b.t)) : null;
  const status = lead.defaults.length ? "arrhythmia" : owed > 0 ? "borrowing" : lead.beats.length ? "steady" : "flatline";
  const alarm = status === "arrhythmia" || status === "borrowing";

  const act = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      try {
        await fn();
      } catch (err: any) {
        L.showToast(err.message || "That did not go through.");
        haptic("error");
      } finally {
        setBusy(null);
      }
    },
    [L]
  );

  return (
    <div className="py-4 hair-b">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ width: 6, height: 6, flexShrink: 0, background: alarm ? "var(--alarm)" : status === "steady" ? "var(--steady)" : "var(--ink-3)" }} />
            <span className="font-medium text-[15px] truncate">{a.name}</span>
          </div>
          <div className="lab mt-1.5" style={{ color: alarm ? "var(--alarm)" : undefined }}>
            {status}
            {last !== null && <span className="ink-3"> · {lead.beats.length} beats · {ago(last)}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="readout text-[20px]" style={{ color: owed > 0 ? "var(--alarm)" : "var(--ink)" }}>
            {usd(owed, owed > 0 && owed < 0.1 ? 3 : 2)}
          </div>
          <div className="lab mt-1">owes</div>
        </div>
      </div>

      <div className="mt-3">
        <Lead beats={lead.beats} defaults={lead.defaults} instrument={L.instrument} height={60} />
      </div>

      <div className="flex gap-1 mt-2 -ml-1.5">
        <button onClick={() => onBuy(a)} disabled={L.rail === "sui" && !a.suiAddress} className="btn btn-quiet h-8">
          Buy
        </button>
        {L.rail === "sui" && a.suiAddress && L.sui.network !== "mainnet" && (
          <button onClick={() => act("pay", () => L.handlePayAgent(a.address))} disabled={!!busy} className="btn btn-quiet h-8">
            {busy === "pay" ? "paying…" : "+$0.10"}
          </button>
        )}
        <button
          onClick={() => act("rm", () => L.handleRemoveAgent(a.address))}
          disabled={!!busy || a.outstandingDebt > 0 || (a.suiDebt ?? 0) > 0}
          className="btn btn-quiet h-8 ml-auto"
          style={{ color: "var(--alarm)" }}
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

type Obligation = { obligationId: string; agentAddress: string; status: string; owedUsd: number; drawnUsd: number; dueMs: number | null; link: string | null };

function OwedTab({ L, owedHere }: { L: ReturnType<typeof useLifeline>; owedHere: number }) {
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (L.rail !== "sui") return;
    fetch("/api/sui/obligations")
      .then((r) => r.json())
      .then((d) => setObligations(d.obligations ?? []))
      .catch(() => setObligations([]));
  }, [L.rail, L.refreshTrigger]);

  const reconcile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sui/reconcile", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Reconciliation failed");
      L.done(`Checked ${d.checked}: ${d.settled.length} repaid, ${d.defaulted.length} defaulted, ${d.pending} not due`);
    } catch (err: any) {
      L.showToast(err.message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  const owing = L.agents.filter((a) => (L.rail === "arc" ? a.outstandingDebt : a.suiDebt ?? 0) > 0);

  return (
    <>
      <div className="lab mb-2">Owed on {L.rail === "arc" ? "Arc" : "Sui"}</div>
      <div className="readout text-[44px]" style={{ color: owedHere > 0 ? "var(--alarm)" : "var(--ink)" }}>
        {usd(owedHere, owedHere > 0 && owedHere < 0.1 ? 3 : 2)}
      </div>
      <p className="text-[13px] ink-2 leading-relaxed mt-3">
        {L.rail === "arc"
          ? "An agent repays from its own Arc wallet, and the facility books it."
          : "Each Sui debt is a repayment the agent parked before it drew. Settle it early, or on its date anyone can collect it."}
      </p>
      <button onClick={() => L.setIsRepayOpen(true)} disabled={owedHere <= 0} className="btn btn-solid w-full justify-center h-12 mt-5">
        {L.rail === "arc" ? "Repay" : "Settle a repayment"}
      </button>

      <div className="mt-8">
        {L.rail === "arc" ? (
          owing.length === 0 ? (
            <p className="mono text-[11px] ink-3">Nothing owed on Arc.</p>
          ) : (
            owing.map((a) => (
              <div key={a.address} className="flex justify-between py-3 hair-b">
                <span className="text-[14px]">{a.name}</span>
                <span className="mono text-[13px]" style={{ color: "var(--alarm)" }}>
                  {usd(a.outstandingDebt, 3)}
                </span>
              </div>
            ))
          )
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="serif text-[21px] leading-none">Parked</h3>
              <button onClick={reconcile} disabled={busy} className="btn btn-quiet">
                {busy ? "Checking…" : "Reconcile"}
              </button>
            </div>
            {obligations === null ? (
              <p className="mono text-[11px] ink-3">reading from chain…</p>
            ) : obligations.length === 0 ? (
              <p className="mono text-[11px] ink-3">Nothing parked yet.</p>
            ) : (
              obligations.map((o) => (
                <div key={o.obligationId} className="py-3 hair-b">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[14px]">{L.nameOf(o.agentAddress)}</span>
                    <span className="tag" style={{ color: o.status === "defaulted" ? "var(--alarm)" : o.status === "settled" ? "var(--steady)" : "var(--trace)" }}>
                      {o.status}
                    </span>
                  </div>
                  <div className="flex justify-between mono text-[10.5px] ink-3 mt-1.5">
                    <span>
                      drew {usd(o.drawnUsd, 3)}
                      {o.status === "open" && o.dueMs ? ` · due ${new Date(o.dueMs).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                    </span>
                    {o.link && (
                      <a href={o.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        view ↗
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}

function SuiFacility() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    fetch("/api/sui/status")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);
  return (
    <section>
      <div className="flex items-baseline justify-between pb-3 rule-b">
        <h3 className="serif text-[22px] leading-none">On chain</h3>
        <span className="lab">{s?.configured ? `sui:${s.network}` : "…"}</span>
      </div>
      {s?.facilityId && (
        <dl className="grid grid-cols-2 gap-y-2.5 py-4 mono text-[11px]">
          <dt className="ink-3">facility</dt>
          <dd className="text-right">
            {s.facilityLink ? (
              <a href={s.facilityLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {s.facilityId.slice(0, 8)}… ↗
              </a>
            ) : (
              `${s.facilityId.slice(0, 8)}…`
            )}
          </dd>
          <dt className="ink-3">liquidity</dt>
          <dd className="text-right">{s.liquidityUsd == null ? "-" : usd(s.liquidityUsd)}</dd>
          <dt className="ink-3">x402 feed</dt>
          <dd className="text-right" style={{ color: s.sellerUp ? "var(--steady)" : "var(--ink-3)" }}>
            {s.sellerUp ? "up" : "down"}
          </dd>
        </dl>
      )}
    </section>
  );
}
