"use client";

import React, { useState } from "react";
import { Rail } from "@/types";
import { DollarSign, X, CheckCircle2 } from "lucide-react";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  rail: Rail;
  outstandingDebt: number;
  onConfirmRepay: (amount: number) => void;
}

export const RepayModal: React.FC<RepayModalProps> = ({
  isOpen,
  onClose,
  rail,
  outstandingDebt,
  onConfirmRepay,
}) => {
  const [repayAmount, setRepayAmount] = useState(
    outstandingDebt > 0 ? Math.min(outstandingDebt, 50).toFixed(2) : "0"
  );

  if (!isOpen) return null;

  const numAmount = parseFloat(repayAmount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    onConfirmRepay(numAmount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel max-w-md w-full p-6 border-white/15 bg-slate-900 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 mb-2">
          <DollarSign className="w-4 h-4" />
          <span>FACILITY REPAYMENT</span>
        </div>

        <h3 className="text-xl font-semibold text-white mb-1">Repay Facility Debt</h3>
        <p className="text-xs text-slate-400 mb-6 font-sans">
          Settle drawn debt on <strong className="text-white">{rail === "base" ? "Base" : "Sui"}</strong> to restore
          available headroom for your autonomous agents.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
          <div>
            <label className="text-slate-300 block mb-1">Repayment Amount (USDC)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={outstandingDebt}
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-emerald-400"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Total Outstanding Debt:</span>
              <span className="text-amber-400 font-bold">${outstandingDebt.toFixed(2)} USDC</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setRepayAmount(outstandingDebt.toFixed(2))}
              className="px-3 py-1 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] text-slate-300 transition-all cursor-pointer"
            >
              Repay Full Balance
            </button>
            <button
              type="button"
              onClick={() => setRepayAmount((outstandingDebt / 2).toFixed(2))}
              className="px-3 py-1 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] text-slate-300 transition-all cursor-pointer"
            >
              Repay 50%
            </button>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={numAmount <= 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              Confirm Repayment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};