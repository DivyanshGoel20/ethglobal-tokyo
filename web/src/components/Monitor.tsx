"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { Lead } from "./Pulse";
import { Sheet, Field, ErrorNote } from "./Sheet";
import { ago, type Beat } from "@/lib/ecg";

export type LeadData = {
  agent: Agent;
  beats: Beat[];
  /** Due dates of obligations that defaulted: drawn as arrhythmia. */
  defaults: number[];
};

interface MonitorProps {
  leads: LeadData[];
  rail: Rail;
  suiNetwork?: string | null;
  onAddAgent: (input: { name: string; address: string; privateKey: string; capUsd: number }) => Promise<void>;
  onRemoveAgent: (address: string) => Promise<void>;
  onPayAgent?: (address: string) => Promise<void>;
  onBuy: (agent: Agent) => void;
}

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** What the lead says, in monitor terms. */
function condition(owed: number, lead: LeadData): { label: string; tone: "alarm" | "steady" | "quiet" } {
  if (lead.defaults.length) return { label: "arrhythmia", tone: "alarm" };
  if (owed > 0) return { label: "borrowing", tone: "alarm" };
  if (lead.beats.length === 0) return { label: "flatline", tone: "quiet" };
  return { label: "steady", tone: "steady" };
}

export const Monitor: React.FC<MonitorProps> = ({
  leads,
  rail,
  suiNetwork,
  onAddAgent,
  onRemoveAgent,
  onPayAgent,
  onBuy,
}) => {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || "That did not go through.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="pb-14">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 rule-b">
        <div className="flex items-baseline gap-4">
          <h2 className="serif text-[30px] leading-none">Leads</h2>
          <span className="lab">
            {leads.length} agent{leads.length === 1 ? "" : "s"} · newest beat on the right ·{" "}
            <span style={{ color: "var(--ink)" }}>ink</span> self-paid ·{" "}
            <span style={{ color: "var(--alarm)" }}>red</span> on credit
          </span>
        </div>
        <button onClick={() => setAdding(true)} className="btn">
          + Authorize agent
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="py-16 grid place-items-center text-center">
          <div className="w-full max-w-[520px] mb-6">
            <Lead beats={[]} height={56} />
          </div>
          <p className="serif text-[22px] leading-snug max-w-[30ch]">
            No agents on this line yet. <em className="ink-3">Authorize one and it can start spending.</em>
          </p>
          <button onClick={() => setAdding(true)} className="btn btn-solid mt-6">
            Authorize your first agent
          </button>
        </div>
      ) : (
        leads.map((lead) => {
          const a = lead.agent;
          const owed = rail === "arc" ? a.outstandingDebt : a.suiDebt ?? 0;
          const holds = rail === "arc" ? Number(a.gatewayBalanceUSDC ?? a.currentBalance ?? 0) : a.suiWalletUsd;
          const addr = rail === "arc" ? a.address : a.suiAddress;
          const c = condition(owed, lead);
          const last = lead.beats.length ? Math.max(...lead.beats.map((b) => b.t)) : null;

          return (
            <div key={a.address} className="lead-row py-5 hair-b">
              <div className="lead-who">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={c.tone === "alarm" ? "pulse-dot" : ""}
                    style={{
                      width: 6,
                      height: 6,
                      flexShrink: 0,
                      display: "inline-block",
                      background:
                        c.tone === "alarm" ? "var(--alarm)" : c.tone === "steady" ? "var(--steady)" : "var(--ink-3)",
                    }}
                  />
                  <span className="font-medium text-[15px] truncate">{a.name}</span>
                </div>
                <div className="mono text-[10.5px] ink-3 truncate" title={addr}>
                  {addr ? short(addr) : "no key held"}
                </div>
                <div className="lab mt-2" style={{ color: c.tone === "alarm" ? "var(--alarm)" : undefined }}>
                  {c.label}
                  {last !== null && (
                    <span className="ink-3">
                      {" "}
                      · {lead.beats.length} beat{lead.beats.length === 1 ? "" : "s"} · {ago(last)}
                    </span>
                  )}
                </div>
              </div>

              <div className="lead-trace">
                <Lead
                  beats={lead.beats}
                  defaults={lead.defaults}
                 
                  idle={lead.beats.length === 0}
                />
              </div>

              <div className="lead-owes">
                <div className="flex items-baseline justify-end gap-2">
                  <span className="lab">owes</span>
                  <span className="readout text-[24px]" style={{ color: owed > 0 ? "var(--alarm)" : "var(--ink)" }}>
                    ${owed.toFixed(owed > 0 && owed < 0.1 ? 3 : 2)}
                  </span>
                </div>
                <div className="mono text-[10px] ink-3 mt-1.5">
                  holds {holds === undefined ? "-" : `$${holds.toFixed(2)}`}
                </div>
                <div className="flex flex-wrap justify-end -mr-1.5 mt-2">
                  <button
                    onClick={() => onBuy(a)}
                    disabled={!!busy || (rail === "sui" && !a.suiAddress)}
                    className="btn btn-quiet h-7"
                  >
                    Buy
                  </button>
                  {rail === "sui" && onPayAgent && a.suiAddress && suiNetwork !== "mainnet" && (
                    <button
                      onClick={() => act(`pay-${a.address}`, () => onPayAgent(a.address))}
                      disabled={!!busy}
                      title="Test networks: a customer pays this agent $0.10 in testnet USDC"
                      className="btn btn-quiet h-7"
                    >
                      {busy === `pay-${a.address}` ? "paying…" : "+$0.10"}
                    </button>
                  )}
                  <button
                    onClick={() => act(`rm-${a.address}`, () => onRemoveAgent(a.address))}
                    disabled={!!busy || a.outstandingDebt > 0 || (a.suiDebt ?? 0) > 0}
                    title={a.outstandingDebt > 0 || (a.suiDebt ?? 0) > 0 ? "Repay before revoking" : "Revoke"}
                    className="btn btn-quiet h-7"
                    style={{ color: "var(--alarm)" }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <AuthorizeSheet open={adding} rail={rail} onClose={() => setAdding(false)} onAddAgent={onAddAgent} />
    </section>
  );
};

export const AuthorizeSheet: React.FC<{
  open: boolean;
  /** The rail the agent is created on. It lives there, and only there. */
  rail: Rail;
  onClose: () => void;
  onAddAgent: MonitorProps["onAddAgent"];
}> = ({ open, rail, onClose, onAddAgent }) => {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [limit, setLimit] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAddAgent({
        name: name.trim(),
        address: rail === "arc" ? address.trim() : "",
        privateKey: rail === "arc" ? privateKey.trim() : "",
        capUsd: parseFloat(limit) || 5,
      });
      setName("");
      setAddress("");
      setPrivateKey("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not authorize the agent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} kicker={rail === "arc" ? "New lead · Arc" : "New lead · Sui"} title="Authorize an agent">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px] ink-2 leading-relaxed">
          {rail === "arc"
            ? "An Arc agent, spending on your Arc line and only there. Leave the address empty and Lifeline mints it a wallet."
            : "A Sui agent, spending on your Sui line and only there. Lifeline mints it a wallet and holds the key that signs its payments and repayments."}
        </p>
        <Field label="Name">
          <input className="field" autoFocus required placeholder="scraper-01" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {rail === "arc" && (
          <Field label="Existing Arc address" hint="optional">
            <input className="field" placeholder="empty mints a new wallet" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        )}
        {rail === "arc" && address.trim() ? (
          <Field label="Its private key" hint="optional · needed to repay from its wallet">
            <input type="password" className="field" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} />
          </Field>
        ) : (
          <Field label="Spending cap" hint="USDC">
            <input type="number" min="0.01" step="0.01" className="field" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn btn-solid">
            {busy ? "Authorizing on chain…" : "Authorize"}
          </button>
        </div>
      </form>
    </Sheet>
  );
};
