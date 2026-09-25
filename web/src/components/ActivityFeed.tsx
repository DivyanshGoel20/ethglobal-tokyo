"use client";

import React from "react";
import { ActivityItem, Rail } from "@/types";

interface ActivityFeedProps {
  activities: ActivityItem[];
  rail: Rail;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, rail }) => {
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#232732] mb-3">
        <div>
          <h3 className="text-base font-semibold text-white">Activity Log</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            x402 drawdowns and repayments on {rail === "base" ? "Base" : "Sui"}.
          </p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#64748b] font-mono">
          No activity recorded on {rail === "base" ? "Base" : "Sui"}.
        </div>
      ) : (
        <div className="divide-y divide-[#1c202a]">
          {activities.map((item) => (
            <div
              key={item.id}
              className="py-3 flex items-center justify-between text-xs font-mono text-slate-300"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-white font-medium">
                    {item.type === "drawdown" && `x402 Overdraft (${item.agentName || "Agent"})`}
                    {item.type === "repayment" && "Facility Repayment"}
                    {item.type === "authorization" && `Authorized ${item.agentName}`}
                  </span>
                  <span className="text-[10px] uppercase text-[#64748b]">[{item.rail}]</span>
                </div>
                <div className="text-[11px] text-[#64748b] mt-0.5">
                  Tx: {item.txHash} {item.endpoint && `• ${item.endpoint}`}
                </div>
              </div>

              <div className="text-right">
                {item.amount !== undefined && (
                  <div
                    className={`font-semibold ${
                      item.type === "drawdown" ? "text-[#f59e0b]" : "text-emerald-400"
                    }`}
                  >
                    {item.type === "drawdown" ? `-$${item.amount.toFixed(2)}` : `+$${item.amount.toFixed(2)}`}
                  </div>
                )}
                <div className="text-[10px] text-[#64748b]">{item.timestamp}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
