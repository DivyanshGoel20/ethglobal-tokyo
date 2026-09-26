"use client";

import React, { useEffect, useState } from "react";
import { Agent, Rail } from "@/types";
import { X, RefreshCw, ExternalLink } from "lucide-react";

type Resource = { path: string; price: number; title: string; artifact?: string };

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  rail: Rail;
  headroom: number;
  onDone: (message: string) => void;
  onSessionExpired: () => void;
}

/**
 * An agent hits a paywall. If it holds enough it pays; if not, Float covers the
 * shortfall on the human's line - on Arc through Circle Gateway, on Sui by
 * drawing against a repayment the agent has already parked.
 */
export const PurchaseModal: React.FC<PurchaseModalProps> = ({
  isOpen,
  onClose,
  agents,
  rail,
  headroom,
  onDone,
  onSessionExpired,
}) => {
  const [catalogue, setCatalogue] = useState<{ base: string; resources: Resource[] } | null>(null);
  const [agentAddress, setAgentAddress] = useState("");
  const [choice, setChoice] = useState("");
  const [directAmount, setDirectAmount] = useState("1.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Reset on open and on a rail change only. Keyed on `agents` too, it wiped
  // the receipt the moment the dashboard refreshed after a purchase.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setResult(null);
    setCatalogue(null);
    fetch(rail === "arc" ? "/api/x402/catalogue" : "/api/sui/status")
      .then((r) => r.json())
      .then((d) => {
        const resources: Resource[] = d.resources ?? [];
        setCatalogue({ base: d.base ?? "", resources });
        setChoice(resources[0]?.path ?? (rail === "arc" ? "direct" : ""));
      })
      .catch(() => setCatalogue({ base: "", resources: [] }));
  }, [isOpen, rail]);

  useEffect(() => {
    if (isOpen) setAgentAddress((a) => a || agents[0]?.address || "");
  }, [isOpen, agents]);

  if (!isOpen) return null;

  const selected = catalogue?.resources.find((r) => r.path === choice);
  const price = choice === "direct" ? parseFloat(directAmount) || 0 : selected?.price ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentAddress || !choice) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [route, body] =
        choice === "direct"
          ? ["/api/borrow", { agentAddress, amount: price, memo: "dashboard draw" }]
          : [rail === "arc" ? "/api/pay" : "/api/sui/pay", { url: `${catalogue!.base}${choice}`, agentAddress }];

      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onSessionExpired();
        throw new Error("Your World session expired. Verify again to keep spending.");
      }
      if (!res.ok || !data.success) throw new Error(data.error || "That did not settle.");

      setResult(data);
      const borrowed = Number(data.borrowed ?? data.amount ?? 0);
      onDone(
        choice === "direct"
          ? `Drew $${price.toFixed(2)} on Arc`
          : borrowed > 0
            ? `Bought ${selected?.title} - Float covered $${borrowed.toFixed(3)}`
            : `Bought ${selected?.title} - the agent paid for itself`
      );
    } catch (err: any) {
      setError(err.message || "Payment failed.");
    } finally {
      setBusy(false);
    }
  };

  const link = result?.explorer ?? result?.arcTxLink ?? null;
  const tx = result?.digest ?? result?.arcTxHash ?? result?.txHash ?? result?.circleSettlementId ?? result?.transactionId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="panel max-w-md w-full p-6 bg-[#12141a] shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#94a3b8] hover:text-white cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <h4 className="text-sm font-semibold text-white mb-1">x402 Purchase</h4>
        <p className="text-xs text-[#94a3b8] mb-4">
          {rail === "arc"
            ? "Settled through Circle Gateway on Arc. A shortfall is drawn on your line."
            : "Settled on Sui. A shortfall is drawn against a repayment the agent parks first, in the same transaction that pays the seller."}
        </p>

        {agents.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#64748b] font-mono">Authorize an agent first.</div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5 text-xs font-mono">
            <div>
              <label className="text-[#94a3b8] block mb-1">Agent</label>
              <select
                value={agentAddress}
                onChange={(e) => setAgentAddress(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-sans"
              >
                {agents.map((a) => (
                  <option key={a.address} value={a.address} disabled={rail === "sui" && !a.suiAddress}>
                    {a.name} ({(rail === "arc" ? a.address : a.suiAddress ?? "no Sui key").slice(0, 10)}...)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[#94a3b8] block mb-1">Resource</label>
              {!catalogue ? (
                <div className="text-[#64748b] py-2">loading catalogue...</div>
              ) : (
                <select
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-sans"
                >
                  {catalogue.resources.map((r) => (
                    <option key={r.path} value={r.path}>
                      {r.title} - ${r.price.toFixed(3)}
                    </option>
                  ))}
                  {rail === "arc" && <option value="direct">Direct draw (no purchase)</option>}
                </select>
              )}
              {catalogue && catalogue.resources.length === 0 && (
                <div className="text-[11px] text-[#64748b] mt-1">
                  {rail === "arc" ? "The premium API is not running." : "The Sui feed is not running (npm run sui:service)."}
                </div>
              )}
            </div>

            {choice === "direct" && (
              <div>
                <label className="text-[#94a3b8] block mb-1">Amount (USDC)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={directAmount}
                  onChange={(e) => setDirectAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}

            <div className="flex justify-between text-[11px] text-[#64748b]">
              <span>Headroom across both rails</span>
              <span>${headroom.toFixed(2)} USDC</span>
            </div>

            {error && <div className="text-[11px] text-red-400">{error}</div>}

            {result && (
              <div className="panel-subtle p-3 text-[11px] space-y-1">
                <div className="text-emerald-400">Settled</div>
                {result.fundingSource && <div className="text-[#94a3b8]">paid by {result.fundingSource === "FLOAT_CREDIT" || result.fundingSource === "FLOAT_FACILITY" ? "Float, on credit" : "the agent"}</div>}
                {Number(result.borrowed ?? 0) > 0 && <div className="text-[#f59e0b]">borrowed ${Number(result.borrowed).toFixed(3)}</div>}
                {result.obligationId && <div className="text-[#94a3b8] truncate">obligation {result.obligationId}</div>}
                {tx && (
                  <div className="text-[#94a3b8] truncate">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                        {String(tx).slice(0, 18)}... <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      `tx ${String(tx).slice(0, 24)}...`
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white cursor-pointer">
                {result ? "Done" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={busy || !choice || price <= 0}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                {busy && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>{busy ? "Settling..." : choice === "direct" ? "Draw" : "Buy"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
