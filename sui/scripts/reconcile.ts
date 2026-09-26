/**
 * Close the books on every parked repayment, for a cron.
 *
 *   npm run sui:reconcile
 *
 * Reads each unpaid obligation back from chain, collects the ones that have
 * fallen due (collection is open to anyone; this is Lifeline bothering to call
 * it), and writes the outcome into railDebt: repaid obligations return their
 * headroom, defaulted ones keep consuming the line. Running it twice changes
 * nothing, and a chain that cannot answer leaves the debt open.
 *
 * POST /api/sui/reconcile does the same for one signed-in human.
 */
import { reconcileSui } from "../../web/src/lib/suiRail";

reconcileSui()
  .then((r) => {
    console.log(`\n  checked      ${r.checked} obligation(s)`);
    console.log(`  repaid       ${r.settled.length}${r.settled.map((id) => `\n    ${id}`).join("")}`);
    console.log(`  defaulted    ${r.defaulted.length}${r.defaulted.map((id) => `\n    ${id}  still owed`).join("")}`);
    console.log(`  not yet due  ${r.pending}`);
    if (r.unresolved.length) {
      console.log(`  unresolved   ${r.unresolved.length}`);
      for (const u of r.unresolved) console.log(`    ${u.obligationId}  ${u.reason}`);
    }
    console.log("");
  })
  .catch((err) => {
    console.error("reconcile failed:", err?.message || err);
    process.exit(1);
  });
