"use client";

import React from "react";

type Check = { subject: string; target: string; endpoint: string; level: string; summary: string; cached?: boolean; ms?: number };
export type ScreeningVerdict = {
  decision: "pay" | "cap" | "hold" | "refuse";
  reasons: string[];
  capUsd: number;
  amountUsd: number;
  checks: Check[];
  approvedByHuman?: boolean;
};

const TONE: Record<string, string> = {
  pay: "var(--steady)",
  cap: "var(--steady)",
  hold: "var(--alarm)",
  refuse: "var(--alarm)",
  clean: "var(--steady)",
  elevated: "var(--alarm)",
  severe: "var(--alarm)",
  unknown: "var(--ink-3)",
};

const LABEL: Record<string, string> = {
  pay: "Cleared",
  cap: "Cleared, capped",
  hold: "Held for you",
  refuse: "Refused",
};

/**
 * Intercepta's verdict, as the agent saw it before signing: the decision, the
 * reasons in plain words, and each check that fed it.
 */
export const Verdict: React.FC<{ verdict: ScreeningVerdict }> = ({ verdict }) => (
  <div className="rule-t pt-4 space-y-3">
    <div className="flex items-baseline justify-between">
      <span className="lab">Intercepta screening</span>
      <span className="mono text-[11px] uppercase tracking-wider" style={{ color: TONE[verdict.decision] }}>
        {verdict.approvedByHuman ? "Approved by you" : LABEL[verdict.decision]}
        {verdict.decision === "cap" && ` · ≤ $${verdict.capUsd.toFixed(2)}`}
      </span>
    </div>
    <ul className="space-y-1 text-[13px] ink-2 leading-snug">
      {verdict.reasons.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
    <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 mono text-[10.5px]">
      {verdict.checks.map((c, i) => (
        <React.Fragment key={i}>
          <dt className="ink-3">{c.subject}</dt>
          <dd className="truncate" title={c.summary}>
            <span style={{ color: TONE[c.level] }}>{c.level}</span>
            <span className="ink-3">
              {" "}
              · {c.endpoint}
              {c.cached ? " · cached" : c.ms ? ` · ${c.ms}ms` : ""}
            </span>
          </dd>
        </React.Fragment>
      ))}
    </dl>
  </div>
);
