"use client";

import React from "react";
import { Rail } from "@/types";
import { ShieldCheck, LogOut, RefreshCw } from "lucide-react";

interface HeaderProps {
  rail: Rail;
  setRail: (rail: Rail) => void;
  nullifierHash: string;
  onSignOut: () => void;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rail,
  setRail,
  nullifierHash,
  onSignOut,
  onRefresh,
}) => {
  return (
    <header className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 border-b border-white/10 glass-panel !rounded-none !border-x-0 !border-t-0 mb-6">
      {/* Brand & Multi-rail tag */}
      <div className="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/15">
            <span className="serif text-2xl font-bold italic tracking-wider text-white">F</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-white text-lg">FLOAT</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-white/10 text-slate-300">
                Facility
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block font-mono">Autonomous Agent Credit</span>
          </div>
        </div>

        {/* Rail Switcher for Mobile */}
        <div className="flex sm:hidden bg-slate-900/90 p-1 rounded-lg border border-white/10 text-xs">
          <button
            onClick={() => setRail("base")}
            className={`px-3 py-1 rounded-md font-mono font-medium transition-all ${
              rail === "base" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Base
          </button>
          <button
            onClick={() => setRail("sui")}
            className={`px-3 py-1 rounded-md font-mono font-medium transition-all ${
              rail === "sui" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Sui
          </button>
        </div>
      </div>

      {/* Middle: Rail Selector on Desktop */}
      <div className="hidden sm:flex items-center space-x-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
        <button
          id="rail-toggle-base"
          onClick={() => setRail("base")}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
            rail === "base"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {/* Base Logo snippet */}
          <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
          <span>Base Rail (EVM)</span>
        </button>

        <button
          id="rail-toggle-sui"
          onClick={() => setRail("sui")}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
            rail === "sui"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {/* Sui Logo snippet */}
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-300" />
          <span>Sui Rail (Non-EVM)</span>
        </button>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
        {/* World ID verification indicator */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="hidden md:inline">World ID Verified:</span>
          <span className="font-semibold text-white truncate max-w-[90px]">
            {nullifierHash.slice(0, 6)}...{nullifierHash.slice(-4)}
          </span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh Ledger"
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        <button
          id="sign-out-btn"
          onClick={onSignOut}
          title="Sign Out"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 text-slate-300 hover:text-red-400 text-xs font-mono transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
};