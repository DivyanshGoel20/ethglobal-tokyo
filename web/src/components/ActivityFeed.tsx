"use client";

import React from "react";
import { ActivityItem, Rail } from "@/types";
import { Zap, DollarSign, ShieldCheck, UserPlus, Clock } from "lucide-react";

interface ActivityFeedProps {
  activities: ActivityItem[];
  rail: Rail;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, rail }) => {
  return (
    <div className="glass-panel p-6 sm:p-8 border-white/10">
      <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-4">
        <div>
          <h3 className="text-xl font-semibold text-white tracking-tight">On-Chain Activity &amp; Settlements</h3>
          <p className="text-xs text-slate-400 mt-1">
            Real-time x402 overdraft settlements and repayments on {rail === "base" ? "Base" : "Sui"}.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Consensus Feed</span>
        </div>
      </div>

      <div className="space-y-3">
        {activities.map((item) => (
          <div
            key={item.id}
            className="p-3.5 rounded-xl bg-black/20 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono hover:border-white/15 transition-all"
          >
            {/* Left: Icon and Details */}
            <div className="flex items-center space-x-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  item.type === "drawdown"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : item.type === "repayment"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : item.type === "world_verify"
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}
              >
                {item.type === "drawdown" && <Zap className="w-4 h-4" />}
                {item.type === "repayment" && <DollarSign className="w-4 h-4" />}
                {item.type === "world_verify" && <ShieldCheck className="w-4 h-4" />}
                {item.type === "authorization" && <UserPlus className="w-4 h-4" />}
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white">
                    {item.type === "drawdown" && `x402 Paywall Drawdown — ${item.agentName}`}
                    {item.type === "repayment" && "Human Debt Repayment"}
                    {item.type === "world_verify" && "World ID Underwriting Confirmed"}
                    {item.type === "authorization" && `Agent Authorized — ${item.agentName}`}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                      item.rail === "base"
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {item.rail}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-3">
                  <span>Tx: {item.txHash}</span>
                  {item.endpoint && <span className="text-slate-500">&bull; {item.endpoint}</span>}
                </div>
              </div>
            </div>

            {/* Right: Amount & Timestamp */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto">
              {item.amount !== undefined && (
                <span
                  className={`font-semibold ${
                    item.type === "drawdown" ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {item.type === "drawdown" ? `-$${item.amount.toFixed(2)}` : `+$${item.amount.toFixed(2)}`} USDC
                </span>
              )}
              <span className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                <Clock className="w-3 h-3" />
                <span>{item.timestamp}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};