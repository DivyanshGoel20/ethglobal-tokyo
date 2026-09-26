"use client";

import React from "react";
import { ActivityItem, Rail } from "@/types";
import { ExternalLink } from "lucide-react";

interface ActivityFeedProps {
  activities: ActivityItem[];
  rail: Rail;
}

const when = (t: number | string) => {
  if (typeof t === "string") return t;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};

const LABEL: Partial<Record<ActivityItem["type"], string>> = {
  x402_overdraft: "x402 on credit",
  x402_normal: "x402 self-paid",
  borrow: "Direct draw",
  repay: "Repayment",
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, rail }) => {
  return (
    <div className="panel p-6 mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#232732] mb-3">
        <div>
          <h3 className="text-base font-semibold text-white">Activity Log</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">x402 purchases settled on {rail === "arc" ? "Arc" : "Sui"}.</p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#64748b] font-mono">
          No activity recorded on {rail === "arc" ? "Arc" : "Sui"}.
        </div>
      ) : (
        <div className="divide-y divide-[#1c202a]">
          {activities.map((item) => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-4 text-xs font-mono text-slate-300">
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-white font-medium">
                    {LABEL[item.type] ?? item.type} ({item.agentName || "Agent"})
                  </span>
                  <span className="text-[10px] uppercase text-[#64748b]">[{item.rail}]</span>
                </div>
                <div className="text-[11px] text-[#64748b] mt-0.5 truncate">
                  {item.txLink ? (
                    <a href={item.txLink} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                      {item.txHash.slice(0, 16)}... <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    item.txHash && `${item.txHash.slice(0, 20)}...`
                  )}
                  {item.endpoint && ` · ${item.endpoint}`}
                </div>
              </div>

              <div className="text-right shrink-0">
                {item.amount !== undefined && (
                  <div className={`font-semibold ${(item.borrowed ?? 0) > 0 ? "text-[#f59e0b]" : "text-emerald-400"}`}>
                    -${item.amount.toFixed(3)}
                  </div>
                )}
                {(item.borrowed ?? 0) > 0 && <div className="text-[10px] text-[#f59e0b]">${item.borrowed!.toFixed(3)} on credit</div>}
                <div className="text-[10px] text-[#64748b]">{when(item.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
