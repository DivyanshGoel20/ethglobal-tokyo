"use client";

import React, { useState } from "react";
import { Rail } from "@/types";
import { X } from "lucide-react";

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
  const [amount, setAmount] = useState(outstandingDebt > 0 ? outstandingDebt.toFixed(2) : "0");

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    onConfirmRepay(Math.min(numAmount, outstandingDebt));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="panel max-w-sm w-full p-6 bg-[#12141a] shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94a3b8] hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h4 className="text-sm font-semibold text-white mb-1">Repay Facility Debt</h4>
        <p className="text-xs text-[#94a3b8] mb-4">
          Settle drawn debt on {rail === "base" ? "Base" : "Sui"}.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
          <div>
            <label className="text-[#94a3b8] block mb-1">Repayment Amount (USDC)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={outstandingDebt}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500"
            />
            <div className="flex justify-between text-[11px] text-[#64748b] mt-1">
              <span>Outstanding Debt:</span>
              <span className="text-[#f59e0b]">${outstandingDebt.toFixed(2)} USDC</span>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={numAmount <= 0}
              className="px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
            >
              Confirm Repayment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
