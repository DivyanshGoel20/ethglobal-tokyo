"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildTrace, TRACE_H, type Beat } from "@/lib/ecg";

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
  /** Flatline, rendered with a note, when the agent has never paid for anything. */
  idle?: boolean;
  height?: number;
}

/** Measured in real pixels, so the head stays round and on the line. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Tail lengths, as a share of the trace, and how bright each is. Stacked, they
// make a comet: brightest at the head, fading behind it.
const TAIL = [
  { len: 3, opacity: 1 },
  { len: 8, opacity: 0.55 },
  { len: 16, opacity: 0.22 },
];

/**
 * One agent's lead.
 *
 * A head sweeps the trace the way a watch or a bedside monitor draws it, on
 * chart paper: the whole line stays faintly visible, and a dark tail inks each
 * beat - red where Lifeline lent - as the head passes. A new payment feeds the
 * trace one slot left.
 */
export const Lead: React.FC<LeadProps> = ({ beats, defaults, idle, height = TRACE_H }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const trace = useMemo(
    () => (width > 0 ? buildTrace(beats, width, { defaults, height }) : null),
    [beats, defaults, width, height]
  );
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  // Feed the strip when a new event arrives - not on first paint.
  const newest = Math.max(0, ...beats.map((b) => b.t), ...(defaults ?? []));
  const seen = useRef(newest);
  const [feedKey, setFeedKey] = useState(0);
  useEffect(() => {
    if (newest > seen.current) {
      seen.current = newest;
      setFeedKey((k) => k + 1);
    }
  }, [newest]);

  const dur = `${Math.max(3.2, width / 230).toFixed(2)}s`;

  const drawing = trace && (
    <>
      <path d={trace.line} className="trace" />
      {trace.alarms.map((d, i) => (
        <path key={`a${i}`} d={d} className="trace trace-alarm" />
      ))}
      {trace.arrhythmias.map((d, i) => (
        <path key={`f${i}`} d={d} className="trace trace-alarm" />
      ))}
    </>
  );

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {trace && (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible" aria-label={`${beats.length} payments`}>
          <g key={feedKey} className={feedKey ? "feed" : undefined}>
            <>
                <defs>
                  {/* The comet: the trace's own path, dashed so only a short
                      run near the head shows, moving the length of the line. */}
                  <mask id={`m${uid}`} maskUnits="userSpaceOnUse" x={-10} y={-10} width={width + 20} height={height + 20}>
                    {TAIL.map((t) => (
                      <path
                        key={t.len}
                        d={trace.line}
                        pathLength={100}
                        fill="none"
                        stroke="#fff"
                        strokeOpacity={t.opacity}
                        strokeWidth={10}
                        strokeDasharray={`${t.len} 200`}
                      >
                        <animate attributeName="stroke-dashoffset" from={t.len} to={t.len - 100} dur={dur} repeatCount="indefinite" />
                      </path>
                    ))}
                  </mask>
                </defs>

                {/* Always visible, faintly: nothing is lost between sweeps. */}
                <g style={{ opacity: 0.5 }}>{drawing}</g>

                {/* Lit where the head has just been. */}
                <g mask={`url(#m${uid})`} className="lit">
                  {drawing}
                </g>

                {/* The head. */}
                <circle r={2.6} className="head">
                  <animateMotion dur={dur} repeatCount="indefinite" path={trace.line} />
                </circle>
            </>
          </g>

          {trace.marks.map((m, i) => (
            <rect key={`h${i}`} x={m.x - 12} y={0} width={24} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}

      {idle && (
        <span className="lab absolute left-1 top-1" style={{ opacity: 0.8 }}>
          flatline - no payments yet
        </span>
      )}

      {hover !== null && trace?.marks[hover] && (
        <div
          className="absolute top-1 mono text-[10px] px-1.5 py-0.5 pointer-events-none whitespace-nowrap"
          style={{
            left: Math.min(trace.marks[hover].x + 10, Math.max(0, width - 170)),
            background: "var(--ground)",
            border: "1px solid var(--rule)",
            color: trace.marks[hover].beat.borrowed ? "var(--alarm)" : "var(--ink)",
          }}
        >
          ${trace.marks[hover].beat.amountUsd.toFixed(3)} {trace.marks[hover].beat.borrowed ? "on credit" : "self-paid"} ·{" "}
          {new Date(trace.marks[hover].beat.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
};
