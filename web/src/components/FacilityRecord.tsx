"use client";

import React, { useEffect, useState } from "react";

type Telemetry = {
  network: { latestBlock: number };
  contract: { address: string; explorerUrl: string };
  profile: { creditLimit: number; outstandingDebt: number; remainingCredit: number; totalBorrowed: number; totalRepaid: number; status: string };
  drawdowns?: { loanId: number; amountUsdc: number; agentAddress: string; paymentCount: number; timestampIso: string }[];
  repayments?: { repaymentId: number; amountUsdc: number; timestampIso: string }[];
};

/**
 * What the Arc contract itself says. The dashboard's own figures are a cache;
 * this reads the facility, so anyone can check the two agree.
 */
export const FacilityRecord: React.FC<{ humanOwner: string; refreshTrigger?: number }> = ({ humanOwner, refreshTrigger }) => {
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contract-telemetry?human=${encodeURIComponent(humanOwner)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || "Arc RPC unreachable");
        setData(json.telemetry);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message || "Arc RPC unreachable"));
    return () => {
      cancelled = true;
    };
  }, [humanOwner, refreshTrigger]);

  const p = data?.profile;
  const addr = data?.contract.address;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-3 rule-b">
        <h3 className="serif text-[22px] leading-none">On chain</h3>
        <span className="lab">{data ? `block ${data.network.latestBlock.toLocaleString()}` : error ? "unreachable" : "reading…"}</span>
      </div>

      <div className="py-3 hair-b flex justify-between gap-3 mono text-[11px]">
        <span className="ink-3">facility</span>
        {addr ? (
          <a href={data!.contract.explorerUrl} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
            {addr.slice(0, 8)}…{addr.slice(-4)} ↗
          </a>
        ) : (
          <span>-</span>
        )}
      </div>

      {p && (
        <dl className="grid grid-cols-2 gap-y-2.5 py-4 hair-b mono text-[11px]">
          <dt className="ink-3">limit</dt>
          <dd className="text-right">${p.creditLimit.toFixed(2)}</dd>
          <dt className="ink-3">outstanding</dt>
          <dd className="text-right" style={{ color: p.outstandingDebt > 0 ? "var(--alarm)" : undefined }}>
            ${p.outstandingDebt.toFixed(4)}
          </dd>
          <dt className="ink-3">borrowed · repaid</dt>
          <dd className="text-right">
            ${p.totalBorrowed.toFixed(2)} · ${p.totalRepaid.toFixed(2)}
          </dd>
          <dt className="ink-3">status</dt>
          <dd className="text-right">{p.status.toLowerCase()}</dd>
        </dl>
      )}

      {data?.drawdowns && data.drawdowns.length > 0 && (
        <div className="pt-3">
          <div className="lab mb-2">drawdown rows</div>
          {data.drawdowns.slice(-5).reverse().map((d) => (
            <div key={d.loanId} className="flex justify-between mono text-[10.5px] py-1.5">
              <span className="ink-3">
                #{d.loanId} · {d.paymentCount} payment{d.paymentCount === 1 ? "" : "s"}
              </span>
              <span>${d.amountUsdc.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mono text-[10.5px] ink-3 pt-3">{error}</p>}
    </section>
  );
};
