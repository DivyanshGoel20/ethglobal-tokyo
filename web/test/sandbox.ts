import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Run the stores against a throwaway directory.
 *
 * Every store resolves its file from process.cwd() on each call, so moving the
 * process into a temp dir is enough to keep tests off the real ledger in
 * web/data - and to give each test file a known, empty starting point.
 */
export function useSandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeline-test-"));
  fs.mkdirSync(path.join(dir, "data"));
  process.chdir(dir);
  return dir;
}
