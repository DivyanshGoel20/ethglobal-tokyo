/**
 * Check a Lifeline deployment before a judge does.
 *
 *   npm run preflight -- https://<web> https://<premium> https://<feed>
 *
 * Each check is one somebody would otherwise hit live: a seller that answers
 * 200 sells nothing, a spending route that answers an anonymous caller is
 * spendable by anyone, and a cookie without Secure is a session sent in clear.
 */
const [web, premium, feed] = process.argv.slice(2).map((u) => u?.replace(/\/$/, ""));

let failed = 0;
const ok = (m: string) => console.log(`  \x1b[32mok\x1b[0m    ${m}`);
const bad = (m: string) => {
  failed++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
};

const quoteOf = (res: Response) => {
  const header = res.headers.get("payment-required");
  return header ? JSON.parse(Buffer.from(header, "base64").toString("utf8")) : null;
};

async function checkWeb(base: string) {
  console.log(`\nweb      ${base}`);
  const root = await fetch(base, { redirect: "manual" });
  root.status < 400 ? ok(`serving (${root.status})`) : bad(`/ answered ${root.status}`);

  for (const [method, path] of [
    ["POST", "/api/pay"],
    ["POST", "/api/borrow"],
    ["POST", "/api/sui/pay"],
    ["POST", "/api/repay"],
    ["GET", "/api/x402/catalogue"],
    ["GET", "/api/agents"],
    ["GET", "/api/agent/connect/ABCDEFGH"],
  ]) {
    const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    res.status === 401 ? ok(`${method} ${path} refuses anonymous callers`) : bad(`${method} ${path} answered ${res.status} anonymously, expected 401`);
  }

  const card = await fetch(`${base}/api/repay/card`).then((r) => r.json()).catch(() => null);
  card?.enabled ? ok("card repayment is on") : bad("card repayment is off - set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");

  const pair = await fetch(`${base}/api/auth/pair`, { method: "POST" });
  const cookie = pair.headers.get("set-cookie") ?? "";
  /;\s*secure/i.test(cookie) ? ok("cookies are Secure") : bad(`cookies are not Secure (${cookie.split(";").slice(1).join(";").trim() || "no cookie"}) - is NODE_ENV production?`);
}

async function checkPremium(base: string) {
  console.log(`\npremium  ${base}`);
  const res = await fetch(`${base}/premium-data`);
  if (res.status !== 402) return bad(`/premium-data answered ${res.status}, expected 402 - it is not gated`);
  const q = quoteOf(res);
  const arc = q?.accepts?.find((a: any) => a.network === "eip155:5042002");
  arc ? ok(`402 quotes ${Number(arc.amount) / 1e6} USDC on Arc, paid to ${arc.payTo}`) : bad("402 offers no Arc testnet option");
}

async function checkFeed(base: string) {
  console.log(`\nfeed     ${base}`);
  const two = await fetch(`${base}/risk?records=2`);
  if (two.status !== 402) return bad(`/risk answered ${two.status}, expected 402 - it is not gated`);
  const q2 = quoteOf(two)?.accepts?.[0];
  if (!q2?.network?.startsWith("sui:")) return bad(`network is ${q2?.network}, expected sui:*`);
  ok(`402 quotes ${Number(q2.amount) / 1e6} on ${q2.network}`);
  const q1 = quoteOf(await fetch(`${base}/risk?records=1`))?.accepts?.[0];
  q1 && q1.amount !== q2.amount ? ok(`metered: 1 record ${q1.amount}, 2 records ${q2.amount}`) : bad("price did not move with the number of records");
}

async function main() {
  if (!web) {
    console.error("usage: npm run preflight -- <webUrl> [premiumUrl] [feedUrl]");
    process.exit(1);
  }
  for (const [fn, url] of [
    [checkWeb, web],
    [checkPremium, premium],
    [checkFeed, feed],
  ] as const) {
    if (!url) continue;
    try {
      await fn(url);
    } catch (err: any) {
      bad(`${url} unreachable: ${err?.message ?? err}`);
    }
  }
  console.log(failed ? `\n${failed} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failed ? 1 : 0);
}

main();
