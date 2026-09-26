/**
 * Turning an agent's payments into a heartbeat.
 *
 * The trace advances by event, not by clock. The newest beat always sits at
 * the right edge, and each new payment pushes the ones before it one slot to
 * the left - the way a strip only feeds when the pen has something to draw.
 * A time axis would slide every beat off the left edge while the agent sat
 * idle, so an agent that paid for something yesterday would look dead today.
 *
 * Every payment is one complex - P wave, QRS, T wave - with an R peak whose
 * height follows the amount on a log scale (a cent is a clear beat, five
 * dollars fills the lead). A repayment that fell due and collected nothing is
 * drawn as fibrillation, in sequence with the payments around it.
 *
 * Geometry only, in real pixels: the component decides colour and motion.
 */
export type Beat = {
  t: number;
  amountUsd: number;
  /** Drawn in the alarm colour: Lifeline lent some of this payment. */
  borrowed: boolean;
};

type Event = { t: number; kind: "beat"; beat: Beat } | { t: number; kind: "default" };

export type Trace = {
  /** The whole line, baseline and every complex. */
  line: string;
  /** Complexes to overdraw in the alarm colour. */
  alarms: string[];
  /** Fibrillation where an obligation defaulted. */
  arrhythmias: string[];
  /** Where each visible beat's R peak is, for hover targets. */
  marks: { x: number; beat: Beat }[];
  /** How many of the events fit on the lead. */
  shown: number;
  baseline: number;
};

export const TRACE_H = 72;
const COMPLEX = 34; // one P-QRS-T complex, in px
const FIB = 46; // one run of fibrillation, in px
const GAP = 16; // flat line between events, in px
const RIGHT = 28; // room at the right for the head / pen

const amplitude = (usd: number) =>
  Math.max(16, Math.min(TRACE_H * 0.6, 16 + 12 * Math.log10(1 + usd * 100)));

function complex(x0: number, amp: number, base: number): string {
  const p = (dx: number, dy: number) => `${(x0 + dx).toFixed(1)},${(base - dy).toFixed(1)}`;
  return [
    `L${p(0, 0)}`,
    `Q${p(3, 3.2)} ${p(6, 0)}`, // P
    `L${p(10, 0)}`,
    `L${p(12, -amp * 0.12)}`, // Q
    `L${p(14.5, amp)}`, // R
    `L${p(17, -amp * 0.28)}`, // S
    `L${p(19, 0)}`,
    `L${p(23, 0)}`,
    `Q${p(27.5, amp * 0.22 + 2)} ${p(32, 0)}`, // T
    `L${p(COMPLEX, 0)}`,
  ].join(" ");
}

/** Deterministic jitter, so a default always looks the same. */
function fibrillation(x0: number, seed: number, base: number): string {
  let s = seed % 2147483647 || 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: string[] = [];
  for (let dx = 2; dx < FIB; dx += 2) {
    pts.push(`L${(x0 + dx).toFixed(1)},${(base - (rand() - 0.45) * 22).toFixed(1)}`);
  }
  pts.push(`L${(x0 + FIB).toFixed(1)},${base.toFixed(1)}`);
  return pts.join(" ");
}

export function buildTrace(beats: Beat[], width: number, opts: { defaults?: number[]; height?: number } = {}): Trace {
  const h = opts.height ?? TRACE_H;
  const base = h * 0.64;
  const events: Event[] = [
    ...beats.map((beat) => ({ t: beat.t, kind: "beat" as const, beat })),
    ...(opts.defaults ?? []).map((t) => ({ t, kind: "default" as const })),
  ].sort((a, b) => a.t - b.t);

  // Lay out from the right, newest first, until the lead is full.
  const placed: { x: number; e: Event }[] = [];
  let right = width - RIGHT;
  for (let i = events.length - 1; i >= 0; i--) {
    const w = events[i].kind === "beat" ? COMPLEX : FIB;
    const x = right - w;
    if (x < 4) break;
    placed.unshift({ x, e: events[i] });
    right = x - GAP;
  }

  let line = `M0,${base.toFixed(1)}`;
  const alarms: string[] = [];
  const arrhythmias: string[] = [];
  const marks: Trace["marks"] = [];

  for (const { x, e } of placed) {
    if (e.kind === "beat") {
      const c = complex(x, amplitude(e.beat.amountUsd), base);
      line += ` ${c}`;
      if (e.beat.borrowed) alarms.push(`M${x.toFixed(1)},${base.toFixed(1)} ${c}`);
      marks.push({ x: x + 14.5, beat: e.beat });
    } else {
      const f = fibrillation(x, Math.floor(e.t), base);
      line += ` L${x.toFixed(1)},${base.toFixed(1)} ${f}`;
      arrhythmias.push(`M${x.toFixed(1)},${base.toFixed(1)} ${f}`);
    }
  }
  line += ` L${width.toFixed(1)},${base.toFixed(1)}`;

  return { line, alarms, arrhythmias, marks, shown: placed.length, baseline: base };
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
