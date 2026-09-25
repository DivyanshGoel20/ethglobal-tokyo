"use client";

import React from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

interface WorldAuthGateProps {
  onSignIn: () => void;
}

export const WorldAuthGate: React.FC<WorldAuthGateProps> = ({ onSignIn }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0b0e] text-[#f8fafc]">
      <div className="w-full max-w-sm panel p-8 flex flex-col items-center text-center">
        {/* World Icon */}
        <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center mb-6 shadow-sm">
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-white mb-2">
          Float Credit Facility
        </h1>

        <p className="text-xs text-[#94a3b8] leading-relaxed mb-6">
          Undercollateralized credit line for autonomous agents on Base and Sui, underwritten by World ID.
        </p>

        <button
          id="world-signin-btn"
          onClick={onSignIn}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          </svg>
          <span>Sign in with World</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1 text-zinc-600" />
        </button>

        <div className="mt-6 pt-4 border-t border-[#232732] w-full flex items-center justify-center space-x-2 text-[11px] text-[#64748b]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>One human, one credit line</span>
        </div>
      </div>
    </div>
  );
};
