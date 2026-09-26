/**
 * Ask the registry about a human, the way a partner app does.
 *
 *   npm run registry:lookup -- --key llp_... --sub <World sub> [--url https://<lifeline>]
 */
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = (arg("url") ?? process.env.LIFELINE_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const key = arg("key");
const sub = arg("sub");
if (!key || !sub) {
  console.error("usage: npm run registry:lookup -- --key <partner key> --sub <World sub> [--url <lifeline url>]");
  process.exit(1);
}
fetch(`${url}/api/registry/standing?sub=${encodeURIComponent(sub)}`, { headers: { Authorization: `Bearer ${key}` } })
  .then(async (r) => console.log(r.status, JSON.stringify(await r.json(), null, 2)))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
