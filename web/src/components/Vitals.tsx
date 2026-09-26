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
 * The human's vitals on the selected rail. Arc and Sui are separate lines -
 * separate limits, debt and records - so everything here is this rail's alone.
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
  const name = rail === "arc" ? "Arc" : "Sui";
  const here = rail === "arc" ? arcDebt : suiDebt;
  const drawn = here;
  const headroom = Math.max(0, creditLimit - here);
  const pct = (n: number) => (creditLimit > 0 ? Math.min(100, (n / creditLimit) * 100) : 0);

  return (
    <section className="pt-12 pb-10 rise">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-9">
        <div>
          <div className="lab mb-3">{name} line · underwritten by one human</div>
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
          { lab: "Headroom", val: usd(headroom), note: `on the ${name} line` },
          { lab: `Drawn on ${name}`, val: usd(here), note: here > 0 ? "owed on this line" : "nothing owed", alarm: here > 0 },
          { lab: "Line", val: usd(creditLimit), note: `set by your ${name} repayment record` },
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

      {/* The line itself: how much of it is drawn. */}
      <div className="mt-7">
        <div className="relative h-[6px]" style={{ background: "var(--hair)" }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${pct(here)}%`, background: "var(--alarm)" }} />
        </div>
        <div className="flex justify-between mt-2 mono text-[10px] ink-3">
          <span>
            {name} {usd(here)} of {usd(creditLimit)}
          </span>
          <span>{pct(drawn).toFixed(1)}% of the {name} line</span>
        </div>
      </div>
    </section>
  );
};
