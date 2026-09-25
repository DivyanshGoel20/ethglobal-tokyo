"use client";

import React, { useState } from "react";
import { ArrowRight, ShieldCheck, Cpu, KeyRound } from "lucide-react";

interface WorldAuthGateProps {
  onSignIn: () => void;
}

export const WorldAuthGate: React.FC<WorldAuthGateProps> = ({ onSignIn }) => {
  const [isVerifying, setIsVerifying] = useState(false);

  const handleTrigger = () => {
    setIsVerifying(true);
    // Smooth transition simulation
    setTimeout(() => {
      onSignIn();
      setIsVerifying(false);
    }, 600);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden">
      {/* Background ambient orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Bar */}
      <header className="flex items-center justify-between w-full max-w-6xl mx-auto z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/15 shadow-inner">
            <span className="serif text-2xl font-bold italic tracking-wider text-white">F</span>
          </div>
          <div>
            <span className="font-semibold tracking-tight text-white text-lg">FLOAT</span>
            <span className="text-xs text-slate-400 block -mt-1 font-mono">BASE &bull; SUI</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Multi-Rail Credit Facility</span>
        </div>
      </header>

      {/* Main Hero Card */}
      <main className="max-w-xl mx-auto w-full my-auto z-10 text-center py-10">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-mono mb-6">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>World ID Human Underwriting</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-4 leading-tight">
          An agent can hold money.<br />
          <span className="serif italic font-normal text-slate-300">Only a human can hold debt.</span>
        </h1>

        <p className="text-slate-400 text-sm sm:text-base mb-8 max-w-md mx-auto leading-relaxed">
          Float opens an undercollateralized USDC credit line for your autonomous agents on{" "}
          <strong className="text-blue-400 font-medium">Base</strong> and{" "}
          <strong className="text-cyan-400 font-medium">Sui</strong>. When an agent hits an x402 paywall, Float settles immediately.
        </p>

        {/* World Sign-in Action */}
        <div className="glass-panel p-6 sm:p-8 max-w-md mx-auto border-white/10 shadow-2xl relative">
          <div className="flex justify-center mb-5">
            {/* World ID Orb Icon */}
            <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-lg relative group">
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </div>
          </div>

          <h2 className="text-base font-medium text-white mb-1">Human Verification</h2>
          <p className="text-xs text-slate-400 mb-6 font-mono">
            Verify uniqueness once with World ID to unlock credit facility
          </p>

          <button
            id="world-signin-btn"
            onClick={handleTrigger}
            disabled={isVerifying}
            className="w-full flex items-center justify-center space-x-2.5 py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-black font-semibold text-sm transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-75 cursor-pointer"
          >
            {isVerifying ? (
              <>
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Verifying Nullifier...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                  <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                </svg>
                <span>Sign in with World</span>
                <ArrowRight className="w-4 h-4 text-black/70 ml-1" />
              </>
            )}
          </button>

          <div className="mt-4 pt-4 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-center space-x-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>Click to enter dashboard (World ID bypass active)</span>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="grid grid-cols-2 gap-3 mt-8 max-w-md mx-auto text-left">
          <div className="glass-panel p-3.5 rounded-xl border-white/5">
            <div className="flex items-center space-x-2 mb-1">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-slate-200">Base Rail</span>
            </div>
            <p className="text-[11px] text-slate-400">EVM Smart Contracts &amp; x402 nanopayment settlement.</p>
          </div>
          <div className="glass-panel p-3.5 rounded-xl border-white/5">
            <div className="flex items-center space-x-2 mb-1">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-200">Sui Rail</span>
            </div>
            <p className="text-[11px] text-slate-400">Move programmable transaction blocks &amp; sub-second finality.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 font-mono z-10 py-4">
        Float Protocol &bull; ETHGlobal Tokyo &bull; Underwritten with World ID
      </footer>
    </div>
  );
};