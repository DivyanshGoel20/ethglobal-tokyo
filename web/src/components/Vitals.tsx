"use client";

import React from "react";
import { Rail } from "@/types";

interface VitalsProps {
  creditLimit: number;
  arcDebt: number;
  suiDebt: number;
  rail: Rail;
  /** Payments on this rail in the last 24 hours. */
  beats24h: number;
  borrowedBeats24h: number;
  onPurchase: () => void;
  onRepay: () => void;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * The human's vitals. One line spent on two rails, so headroom is net of both
 * - a dollar drawn on Sui is a dollar Arc will not lend again.
 */
export const Vitals: React.FC<VitalsProps> = ({
  creditLimit,
  arcDebt,
  suiDebt,
  rail,
  beats24h,
  borrowedBeats24h,
  onPurchase,
  onRepay,
}) => {
  const drawn = arcDebt + suiDebt;
  const headroom = Math.max(0, creditLimit - drawn);
  const here = rail === "arc" ? arcDebt : suiDebt;
  const there = rail === "arc" ? suiDebt : arcDebt;
  const pct = (n: number) => (creditLimit > 0 ? Math.min(100, (n / creditLimit) * 100) : 0);

  return (
    <section className="pt-12 pb-10 rise">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-9">
        <div>
          <div className="lab mb-3">One line · underwritten by one human</div>
          <h1 className="serif text-[44px] sm:text-[56px] leading-[0.95] tracking-tight max-w-[16ch]">
            {drawn === 0 ? (
              <>
                Resting. <em className="ink-3">Nothing owed.</em>
              </>
            ) : (
              <>
                {usd(headroom)} <em className="ink-3">of {usd(creditLimit)} free.</em>
              </>
            )}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onPurchase} className="btn btn-solid">
            x402 purchase
          </button>
          <button onClick={onRepay} className="btn" disabled={here <= 0}>
            Repay
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 rule-t">
        {[
          { lab: "Headroom", val: usd(headroom), note: "shared by both rails" },
          {
            lab: `Drawn on ${rail === "arc" ? "Arc" : "Sui"}`,
            val: usd(here),
            note: `${usd(there)} on ${rail === "arc" ? "Sui" : "Arc"}`,
            alarm: here > 0,
          },
          { lab: "Line", val: usd(creditLimit), note: "set by your repayment record" },
          {
            lab: "Beats · 24 h",
            val: String(beats24h),
            note: borrowedBeats24h ? `${borrowedBeats24h} on credit` : "all self-paid",
          },
        ].map((v, i) => (
          <div key={v.lab} className={`pt-5 pb-1 ${i > 0 ? "lg:pl-6" : ""} ${i % 2 === 1 ? "pl-6 lg:pl-6" : ""}`} style={i > 0 ? { borderLeft: "1px solid var(--hair)" } : undefined}>
            <div className="lab mb-3">{v.lab}</div>
            <div className="readout text-[34px]" style={{ color: v.alarm ? "var(--alarm)" : "var(--ink)" }}>
              {v.val}
            </div>
            <div className="mono text-[10.5px] ink-3 mt-2.5">{v.note}</div>
          </div>
        ))}
      </div>

      {/* The line itself: how much of it each rail is using. */}
      <div className="mt-7">
        <div className="relative h-[6px]" style={{ background: "var(--hair)" }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${pct(arcDebt)}%`, background: rail === "arc" ? "var(--alarm)" : "var(--ink-3)" }} />
          <div
            className="absolute inset-y-0"
            style={{ left: `${pct(arcDebt)}%`, width: `${pct(suiDebt)}%`, background: rail === "sui" ? "var(--alarm)" : "var(--ink-3)" }}
          />
        </div>
        <div className="flex justify-between mt-2 mono text-[10px] ink-3">
          <span>
            Arc {usd(arcDebt)} · Sui {usd(suiDebt)}
          </span>
          <span>{pct(drawn).toFixed(1)}% of the line</span>
        </div>
      </div>
    </section>
  );
};
