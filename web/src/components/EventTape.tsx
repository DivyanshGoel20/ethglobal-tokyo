"use client";

import React from "react";
import { ActivityItem, Rail } from "@/types";

const when = (t: number | string) => {
  if (typeof t === "string") return t;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
};

/** The strip's annotations: every payment, newest first. */
export const EventTape: React.FC<{ activities: ActivityItem[]; rail: Rail }> = ({ activities, rail }) => (
  <section>
    <div className="flex items-baseline justify-between pb-3 rule-b">
      <h3 className="serif text-[22px] leading-none">Tape</h3>
      <span className="lab">{rail === "arc" ? "Arc" : "Sui"} · x402 settlements</span>
    </div>

    {activities.length === 0 ? (
      <p className="mono text-[11px] ink-3 py-8">No payments on this rail yet.</p>
    ) : (
      <ol>
        {activities.slice(0, 14).map((item) => {
          const credit = (item.borrowed ?? 0) > 0;
          return (
            <li key={item.id} className="grid grid-cols-[34px_1fr_auto] gap-3 items-baseline py-2.5 hair-b">
              <span className="mono text-[10px] ink-3">{when(item.timestamp)}</span>
              <div className="min-w-0">
                <div className="text-[13px] truncate">
                  <span className="font-medium">{item.agentName}</span>{" "}
                  <span className="ink-3">{credit ? "borrowed for" : "paid for"}</span>{" "}
                  <span className="mono text-[11px]">{item.endpoint}</span>
                </div>
                {item.txHash && (
                  <div className="mono text-[10px] ink-3 truncate mt-0.5">
                    {item.txLink ? (
                      <a href={item.txLink} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
                        {item.txHash.slice(0, 20)}… ↗
                      </a>
                    ) : (
                      `${item.txHash.slice(0, 24)}…`
                    )}
                  </div>
                )}
              </div>
              <span className="mono text-[12px]" style={{ color: credit ? "var(--alarm)" : "var(--ink)" }}>
                ${item.amount?.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ol>
    )}
  </section>
);
