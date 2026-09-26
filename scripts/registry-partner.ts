/**
 * Add a partner app to the Lifeline registry.
 *
 *   npm run registry:add -- --id acme --name "Acme Lending" --callback https://acme.example/auth/world/callback
 *
 * Writes the partner to web/data/registry-partners.json (this machine) and
 * prints its key - once; only a hash is kept - plus the entry to add to
 * LIFELINE_REGISTRY_PARTNERS on a deployment. The callback goes into Lifeline's
 * authorization document, which the partner's World client names as its
 * sector, so World gives it Lifeline's identifier for the humans who sign in.
 */
import { addPartner } from "../web/src/lib/registry";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const id = arg("id");
const name = arg("name") ?? id;
const callback = arg("callback");
if (!id || !callback || !/^[a-z0-9-]{2,40}$/.test(id)) {
  console.error('usage: npm run registry:add -- --id <slug> --name "<name>" --callback <https callback url>');
  process.exit(1);
}

const { partner, key } = addPartner({ id, name: name!, callbackUrl: callback });
console.log(`\n  partner   ${partner.name} (${partner.id})\n  callback  ${partner.callbackUrl}\n`);
console.log(`  key       ${key}\n            give this to the partner; it is not stored and cannot be shown again\n`);
console.log("  for a deployment, add this to the LIFELINE_REGISTRY_PARTNERS JSON array:");
console.log(`  ${JSON.stringify({ id: partner.id, name: partner.name, callbackUrl: partner.callbackUrl, keyHash: partner.keyHash })}\n`);
