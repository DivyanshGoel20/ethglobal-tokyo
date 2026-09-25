"use client";

import React, { useState } from "react";
import { Rail } from "@/types";
import { LogOut, Copy, Check } from "lucide-react";

interface HeaderProps {
  rail: Rail;
  setRail: (rail: Rail) => void;
  nullifierHash: string;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rail,
  setRail,
  nullifierHash,
  onSignOut,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyNullifier = () => {
    if (nullifierHash) {
      navigator.clipboard.writeText(nullifierHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedNullifier = nullifierHash
    ? (nullifierHash.length > 14
        ? nullifierHash.slice(0, 6) + "..." + nullifierHash.slice(-4)
        : nullifierHash)
    : "Verified Human";

  return (
    <header className="border-b border-[#232732] bg-[#0a0b0e]">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-white text-base">FLOAT</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#1c202a] text-[#94a3b8]">
              Credit
            </span>
          </div>

          {/* Rail Segmented Toggle */}
          <div className="flex items-center p-0.5 rounded-md bg-[#181b22] border border-[#232732] text-xs font-mono">
            <button
              onClick={() => setRail("base")}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                rail === "base"
                  ? "bg-[#0052ff] text-white font-medium"
                  : "text-[#94a3b8] hover:text-white"
              }`}
            >
              Base (EVM)
            </button>
            <button
              onClick={() => setRail("sui")}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                rail === "sui"
                  ? "bg-[#2a82e4] text-white font-medium"
                  : "text-[#94a3b8] hover:text-white"
              }`}
            >
              Sui (Move)
            </button>
          </div>
        </div>

        {/* Right Info: Actual True World ID Nullifier */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-[#12141a] border border-[#232732] text-[#94a3b8]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[#64748b]">World ID (Nullifier):</span>
            <span
              onClick={handleCopyNullifier}
              className="text-white hover:text-zinc-200 cursor-pointer flex items-center space-x-1.5"
              title={nullifierHash ? "App-Scoped ZK Nullifier: " + nullifierHash + "\n(Unique to Float for privacy - click to copy)" : undefined}
            >
              <span>{formattedNullifier}</span>
              {nullifierHash && (
                copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-zinc-500" />
                )
              )}
            </span>
          </div>

          <button
            onClick={onSignOut}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#12141a] border border-[#232732] text-[#94a3b8] hover:text-red-400 hover:border-red-900/50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
