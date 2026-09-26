"use client";

import React, { useMemo, useState } from "react";
import { buildTrace, TRACE_H, TRACE_W, type Beat } from "@/lib/ecg";
import type { Rail } from "@/types";

/** The mark: one complex, drawn once. */
export const LifelineMark: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <svg width={size * 1.6} height={size} viewBox="0 0 32 20" className={className} aria-hidden>
    <path
      d="M1 12h7l2-5 3.5 11 3-15 2.5 9h12"
      fill="none"
      stroke="var(--alarm)"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

interface LeadProps {
  beats: Beat[];
  defaults?: number[];
  from: number;
  to: number;
  rail: Rail;
  /** Flatline, rendered with a note, when the agent has never paid for anything. */
  idle?: boolean;
  height?: number;
}

/**
 * One agent's lead.
 *
 * On the printed strip (Arc) the paper has stopped at "now" and the pen rests
 * there. On the monitor (Sui) the trace is lit and an erase bar sweeps it, as a
 * bedside screen redraws.
 */
export const Lead: React.FC<LeadProps> = ({ beats, defaults, from, to, rail, idle, height = TRACE_H }) => {
  const trace = useMemo(() => buildTrace(beats, { from, to, defaults }), [beats, from, to, defaults]);
  const [hover, setHover] = useState<number | null>(null);
  const base = TRACE_H * 0.64;

  return (
    <div className="relative w-full overflow-hidden" style={{ height }} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-label={`${beats.length} payments`}
      >
        <path d={trace.line} className="trace" vectorEffect="non-scaling-stroke" />
        {trace.alarms.map((d, i) => (
          <path key={i} d={d} className="trace trace-alarm" vectorEffect="non-scaling-stroke" />
        ))}
        {trace.arrhythmias.map((d, i) => (
          <path key={`f${i}`} d={d} className="trace trace-alarm" vectorEffect="non-scaling-stroke" />
        ))}
        {trace.marks.map((m, i) => (
          <rect
            key={`h${i}`}
            x={m.x - 12}
            y={0}
            width={24}
            height={TRACE_H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* "Now": the pen on paper, a lit dot on the monitor. */}
      <div
        className="absolute top-0 bottom-0 right-3 flex items-start"
        style={{ paddingTop: `${(base / TRACE_H) * 100}%` }}
      >
        <span
          className={rail === "sui" ? "pulse-dot" : ""}
          style={{
            width: 5,
            height: 5,
            marginTop: -2.5,
            background: rail === "sui" ? "var(--trace)" : "var(--ink)",
            boxShadow: rail === "sui" ? "0 0 8px var(--trace-glow)" : "none",
            borderRadius: rail === "sui" ? 999 : 0,
            display: "block",
          }}
        />
      </div>

      {rail === "sui" && (
        <div
          className="sweep absolute top-0 bottom-0 left-0 w-full pointer-events-none"
          aria-hidden
        >
          <div className="h-full" style={{ width: 22, background: "linear-gradient(90deg, transparent, var(--ground) 60%)" }} />
        </div>
      )}

      {idle && (
        <span className="lab absolute left-1 top-1" style={{ opacity: 0.8 }}>
          flatline - no payments yet
        </span>
      )}

      {hover !== null && trace.marks[hover] && (
        <div
          className="absolute top-1 mono text-[10px] px-1.5 py-0.5 pointer-events-none"
          style={{
            left: `min(calc(${(trace.marks[hover].x / TRACE_W) * 100}% + 8px), calc(100% - 150px))`,
            background: "var(--ground)",
            border: "1px solid var(--rule)",
            color: trace.marks[hover].beat.borrowed ? "var(--alarm)" : "var(--ink)",
          }}
        >
          ${trace.marks[hover].beat.amountUsd.toFixed(3)} {trace.marks[hover].beat.borrowed ? "on credit" : "self-paid"} ·{" "}
          {new Date(trace.marks[hover].beat.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
};
