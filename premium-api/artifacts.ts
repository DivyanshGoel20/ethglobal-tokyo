/**
 * The goods.
 *
 * An x402 demo that returns `{ signal: "DEMO-ALPHA-001" }` proves the payment
 * worked and nothing else - there is no visible difference between a cent well
 * spent and a cent wasted. These endpoints return something an agent can only
 * have because it paid: a rendered artefact, drawn in Float's own palette so it
 * looks like it belongs to the product rather than to a test fixture.
 *
 * Everything is derived from the buyer's address, so two agents never receive
 * the same document and the output is stable across repeat purchases.
 */

const PAPER = "#f3f0e7";
const SUNK = "#e9e5d9";
const INK = "#17150f";
const INK2 = "#5b5648";
const INK3 = "#8e8877";
const RULE = "#d5cfbf";
const SEA = "#2b4a7e";
const FLARE = "#a2541f";

/** Deterministic per-address pseudo-randomness, so a dossier is stable. */
function seeded(address: string) {
  let h = 2166136261;
  for (const ch of address.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const FONTS = `
  <style>
    .d { font-family: Georgia, 'Times New Roman', serif; fill: ${INK}; }
    .m { font-family: 'SF Mono', Menlo, monospace; fill: ${INK3}; letter-spacing: 2.2px; }
    .v { font-family: 'SF Mono', Menlo, monospace; fill: ${INK}; }
    .b { font-family: 'SF Mono', Menlo, monospace; fill: ${INK2}; }
  </style>`;

/**
 * $1.00 - an exposure curve.
 *
 * Thirty days of the agent's modelled credit exposure, drawn as a waterline:
 * the same visual language the facility uses for headroom, so the thing bought
 * reads as part of the same system.
 */
export function riskCurveSvg(agent: string): string {
  const rand = seeded(agent);
  const days = 30;
  const pts: number[] = [];
  let v = 0.3 + rand() * 0.25;
  for (let i = 0; i < days; i++) {
    v = Math.max(0.05, Math.min(0.95, v + (rand() - 0.48) * 0.16));
    pts.push(v);
  }

  const W = 720;
  const H = 360;
  const x0 = 56;
  const x1 = W - 34;
  // Title sits between the label and the plot; at yTop 58 its ascenders ran
  // back into the label above it.
  const yTop = 104;
  const yBot = H - 54;
  const px = (i: number) => x0 + (i * (x1 - x0)) / (days - 1);
  const py = (t: number) => yBot - t * (yBot - yTop);

  const line = pts.map((t, i) => `${px(i).toFixed(1)},${py(t).toFixed(1)}`).join(" ");
  const area = `${x0},${yBot} ${line} ${x1},${yBot}`;
  const peak = Math.max(...pts);
  const last = pts[pts.length - 1];

  const grid = [0.25, 0.5, 0.75]
    .map(
      (t) =>
        `<line x1="${x0}" y1="${py(t).toFixed(1)}" x2="${x1}" y2="${py(t).toFixed(1)}" stroke="${RULE}" stroke-width="1"/>` +
        `<text class="b" x="${x0 - 10}" y="${(py(t) + 3).toFixed(1)}" font-size="9" text-anchor="end">${Math.round(t * 100)}</text>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONTS}
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${INK}"/>
  <text class="m" x="28" y="32" font-size="9">EXPOSURE CURVE · 30D</text>
  <text class="d" x="28" y="72" font-size="26">${short(agent)}</text>
  ${grid}
  <polygon points="${area}" fill="${SEA}" opacity="0.22"/>
  <polyline points="${line}" fill="none" stroke="${SEA}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${px(days - 1).toFixed(1)}" cy="${py(last).toFixed(1)}" r="4" fill="${FLARE}"/>
  <line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="1"/>
  <text class="b" x="${x0}" y="${H - 30}" font-size="9">D-29</text>
  <text class="b" x="${x1}" y="${H - 30}" font-size="9" text-anchor="end">TODAY</text>
  <text class="m" x="28" y="${H - 14}" font-size="8.5">PEAK ${Math.round(peak * 100)} · CURRENT ${Math.round(last * 100)} · FLOAT RISK FEED</text>
</svg>`;
}

/**
 * $5.00 - the underwriting dossier.
 *
 * The expensive tier exists to exercise a drawdown large enough to matter
 * against a ten dollar line, and to make the difference between tiers obvious:
 * a cent buys a number, five dollars buys a document.
 */
export function dossierSvg(agent: string): string {
  const rand = seeded(agent + "dossier");
  const score = 38 + Math.floor(rand() * 55);
  const band = score >= 75 ? "PRIME" : score >= 55 ? "STANDARD" : "WATCH";
  const bandColor = score >= 75 ? SEA : score >= 55 ? INK2 : FLARE;

  const rows: Array<[string, string]> = [
    ["Settlement history", `${12 + Math.floor(rand() * 40)} cleared`],
    ["Mean time to settle", `${(1 + rand() * 5).toFixed(1)} days`],
    ["Peak utilisation", `${(40 + rand() * 55).toFixed(0)}%`],
    ["Counterparty spread", `${2 + Math.floor(rand() * 9)} resources`],
    ["Defaults on record", rand() > 0.82 ? "1" : "none"],
    ["Human attestation", "World ID · verified"],
  ];

  const W = 720;
  // Tall enough that the footer clears the last row; at 460 they collided.
  const H = 500;
  const spark = Array.from({ length: 24 }, () => 0.2 + rand() * 0.7);
  const sx = (i: number) => 430 + i * 11;
  const sy = (t: number) => 250 - t * 46;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${FONTS}
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${INK}"/>
  <line x1="0" y1="88" x2="${W}" y2="88" stroke="${INK}"/>

  <text class="m" x="28" y="30" font-size="9">UNDERWRITING DOSSIER</text>
  <text class="d" x="28" y="70" font-size="34">${short(agent)}</text>

  <text class="m" x="28" y="126" font-size="9">CREDIT BAND</text>
  <text class="d" x="28" y="176" font-size="54" fill="${bandColor}">${score}</text>
  <text class="d" x="28" y="208" font-size="22" fill="${bandColor}">${band}</text>
  <rect x="28" y="224" width="330" height="6" fill="${SUNK}"/>
  <rect x="28" y="224" width="${(330 * score) / 100}" height="6" fill="${bandColor}"/>

  <text class="m" x="430" y="126" font-size="9">DRAW CADENCE · 24W</text>
  <polyline points="${spark.map((t, i) => `${sx(i)},${sy(t).toFixed(1)}`).join(" ")}"
            fill="none" stroke="${SEA}" stroke-width="1.6"/>
  <line x1="430" y1="252" x2="${sx(23)}" y2="252" stroke="${RULE}"/>

  ${rows
    .map(
      ([k, v], i) => `
  <line x1="28" y1="${276 + i * 28}" x2="${W - 28}" y2="${276 + i * 28}" stroke="${RULE}"/>
  <text class="b" x="28" y="${294 + i * 28}" font-size="12">${k}</text>
  <text class="v" x="${W - 28}" y="${294 + i * 28}" font-size="12" text-anchor="end">${v}</text>`
    )
    .join("")}

  <text class="m" x="28" y="${H - 16}" font-size="8">PRICED PER DOCUMENT · SETTLED OVER X402 · FLOAT RISK FEED</text>
</svg>`;
}
