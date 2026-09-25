"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { Bot, Plus, CheckCircle2, PauseCircle, ShieldAlert, ExternalLink } from "lucide-react";

interface AgentListProps {
  agents: Agent[];
  rail: Rail;
  onAddAgent: (name: string, model: string, limit: number) => void;
  onToggleStatus: (id: string) => void;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  rail,
  onAddAgent,
  onToggleStatus,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("Claude 3.5 Sonnet (Agentic)");
  const [newLimit, setNewLimit] = useState("100");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddAgent(newName.trim(), newModel, parseFloat(newLimit) || 50);
    setNewName("");
    setIsModalOpen(false);
  };

  return (
    <div className="glass-panel p-6 sm:p-8 mb-8 border-white/10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-xl font-semibold text-white tracking-tight">Authorized AI Agents</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-white/10 text-slate-300">
              {agents.length} Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Agents authorized to spend against your World ID credit line on {rail === "base" ? "Base (EVM)" : "Sui (Move)"}.
          </p>
        </div>

        <button
          id="authorize-agent-btn"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-medium bg-white hover:bg-slate-100 text-black transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Authorize Agent</span>
        </button>
      </div>

      {/* Agents Table / List */}
      <div className="divide-y divide-white/5 mt-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-white/[0.02] px-2 rounded-lg transition-all"
          >
            {/* Left: Agent Info */}
            <div className="flex items-center space-x-3 min-w-[240px]">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  agent.status === "active"
                    ? rail === "base"
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                    : "bg-slate-800/60 border-white/10 text-slate-500"
                }`}
              >
                <Bot className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-sm text-white">{agent.name}</span>
                  <span
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                      agent.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {agent.status === "active" ? (
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    ) : (
                      <PauseCircle className="w-2.5 h-2.5" />
                    )}
                    <span className="capitalize">{agent.status}</span>
                  </span>
                </div>

                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs text-slate-400 font-mono truncate max-w-[140px] sm:max-w-[200px]">
                    {agent.address}
                  </span>
                  <span className="text-[11px] text-slate-500">&bull; {agent.model}</span>
                </div>
              </div>
            </div>

            {/* Middle: Limits and Spend */}
            <div className="flex items-center space-x-6 w-full md:w-auto justify-between md:justify-end font-mono">
              <div className="text-left md:text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Allocated</span>
                <span className="text-sm font-semibold text-slate-200">${agent.allocatedLimit.toFixed(2)}</span>
              </div>

              <div className="text-left md:text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Drawn</span>
                <span className="text-sm font-semibold text-amber-400">${agent.spent.toFixed(2)}</span>
              </div>

              {/* Status Action */}
              <button
                onClick={() => onToggleStatus(agent.id)}
                className="text-xs px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 transition-all cursor-pointer"
              >
                {agent.status === "active" ? "Pause" : "Resume"}
              </button>
            </div>
          </div>
        ))}

        {agents.length === 0 && (
          <div className="text-center py-12 text-slate-500 font-mono text-sm">
            No agents authorized yet. Authorize an agent above to enable x402 spending.
          </div>
        )}
      </div>

      {/* Authorize Agent Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="glass-panel max-w-md w-full p-6 border-white/15 bg-slate-900 shadow-2xl relative">
            <h4 className="text-lg font-semibold text-white mb-1">Authorize New AI Agent</h4>
            <p className="text-xs text-slate-400 mb-6">
              Create an on-chain authorization mapping on {rail === "base" ? "Base" : "Sui"}.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-slate-300 block mb-1">Agent Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Research-Scraper-01"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 block mb-1">Model / Runtime</label>
                <select
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 font-sans"
                >
                  <option value="Claude 3.5 Sonnet (Agentic)">Claude 3.5 Sonnet (Agentic)</option>
                  <option value="GPT-4o Autonomous">GPT-4o Autonomous</option>
                  <option value="DeepSeek-R1 Agent">DeepSeek-R1 Agent</option>
                  <option value="Custom LangChain Runner">Custom LangChain Runner</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 block mb-1">
                  Credit Sub-Cap (USDC)
                </label>
                <input
                  type="number"
                  required
                  min="5"
                  max="500"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-medium text-white transition-all shadow-md cursor-pointer ${
                    rail === "base" ? "bg-blue-600 hover:bg-blue-500" : "bg-cyan-600 hover:bg-cyan-500"
                  }`}
                >
                  Confirm Authorization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};