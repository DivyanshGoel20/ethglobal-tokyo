/**
 * Turning an agent's payments into a heartbeat.
 *
 * Every payment is one complex - P wave, QRS, T wave - placed at the moment it
 * settled, with an R peak whose height follows the amount on a log scale (a
 * cent is a flutter, five dollars is a spike). Between payments the line is
 * flat, because nothing happened. A repayment that fell due and collected
 * nothing is drawn as fibrillation at its due date.
 *
 * Geometry only: the component decides which beats are drawn in ink and which
 * in the alarm colour.
 */
export type Beat = {
  t: number;
  amountUsd: number;
  /** Drawn in the alarm colour: Lifeline lent some of this payment. */
  borrowed: boolean;
};

export type Trace = {
  /** The whole line, baseline and every complex, in the base stroke. */
  line: string;
  /** Complexes to overdraw in the alarm colour. */
  alarms: string[];
  /** Fibrillation where an obligation defaulted. */
  arrhythmias: string[];
  /** x of each beat, for hover targets. */
  marks: { x: number; beat: Beat }[];
};

export const TRACE_W = 1000;
export const TRACE_H = 72;
const BASE = TRACE_H * 0.64;
const COMPLEX = 34; // width of one P-QRS-T complex, in viewBox units

// A cent is a clear beat, a dollar is tall, five dollars fills the lead.
const amplitude = (usd: number) =>
  Math.max(16, Math.min(TRACE_H * 0.6, 16 + 12 * Math.log10(1 + usd * 100)));

/** One complex starting at x0, as path commands continuing from the baseline. */
function complex(x0: number, amp: number): string {
  const p = (dx: number, dy: number) => `${(x0 + dx).toFixed(1)},${(BASE - dy).toFixed(1)}`;
  return [
    `L${p(0, 0)}`,
    // P wave: a small rounded bump.
    `Q${p(3, 3.2)} ${p(6, 0)}`,
    `L${p(10, 0)}`,
    // QRS: dip, spike, dip.
    `L${p(12, -amp * 0.12)}`,
    `L${p(14.5, amp)}`,
    `L${p(17, -amp * 0.28)}`,
    `L${p(19, 0)}`,
    `L${p(23, 0)}`,
    // T wave: broader and lower.
    `Q${p(27.5, amp * 0.22 + 2)} ${p(32, 0)}`,
    `L${p(COMPLEX, 0)}`,
  ].join(" ");
}

/** Deterministic jitter, so a default always looks the same. */
function fibrillation(x0: number, seed: number): string {
  let s = seed % 2147483647 || 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [`M${x0.toFixed(1)},${BASE.toFixed(1)}`];
  for (let dx = 2; dx <= 46; dx += 2) {
    pts.push(`L${(x0 + dx).toFixed(1)},${(BASE - (rand() - 0.45) * 22).toFixed(1)}`);
  }
  pts.push(`L${(x0 + 48).toFixed(1)},${BASE.toFixed(1)}`);
  return pts.join(" ");
}

export function buildTrace(
  beats: Beat[],
  opts: { from: number; to: number; defaults?: number[] }
): Trace {
  const span = Math.max(1, opts.to - opts.from);
  // Leave room at the right for the pen / sweep dot.
  const usable = TRACE_W - COMPLEX - 16;
  const xOf = (t: number) => ((t - opts.from) / span) * usable;

  const sorted = [...beats].filter((b) => b.t >= opts.from).sort((a, b) => a.t - b.t);

  let line = `M0,${BASE.toFixed(1)}`;
  const alarms: string[] = [];
  const marks: Trace["marks"] = [];
  let cursor = -Infinity;

  for (const beat of sorted) {
    // Payments closer together than one complex are drawn back to back rather
    // than on top of each other: a burst reads as a racing pulse.
    const x = Math.max(xOf(beat.t), cursor + 2);
    if (x > usable) break;
    const c = complex(x, amplitude(beat.amountUsd));
    line += ` ${c}`;
    if (beat.borrowed) alarms.push(`M${x.toFixed(1)},${BASE.toFixed(1)} ${c}`);
    marks.push({ x: x + 14.5, beat });
    cursor = x + COMPLEX;
  }
  line += ` L${TRACE_W},${BASE.toFixed(1)}`;

  const arrhythmias = (opts.defaults ?? [])
    .filter((t) => t >= opts.from)
    .map((t) => fibrillation(Math.min(xOf(t), usable - 48), Math.floor(t)));

  return { line, alarms, arrhythmias, marks };
}

/** A window wide enough to show every beat, never narrower than 15 minutes. */
export function traceWindow(allBeats: number[], now = Date.now()) {
  const min = 15 * 60_000;
  const earliest = allBeats.length ? Math.min(...allBeats) : now;
  const span = Math.max(min, (now - earliest) * 1.08);
  return { from: now - span, to: now, span };
}

export function describeSpan(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Beats per hour over the window: the number a monitor shows beside a lead. */
export const rate = (beats: number, spanMs: number) => (beats === 0 ? 0 : (beats / spanMs) * 3_600_000);
