// Run every suite; exit non-zero if any fails. Plain node, no dependencies — matching the app itself.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const suites = readdirSync(dir).filter(f => f.endsWith(".mjs") && f !== "run.mjs").sort();
let failed = 0;
for (const f of suites) {
  try {
    const out = execFileSync(process.execPath, ["--max-old-space-size=4096", dir + f], { encoding: "utf8", timeout: 120000 });
    const last = out.trim().split("\n").pop();
    console.log(`  ok    ${f.padEnd(28)} ${last}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${f}`);
    console.log(String(e.stdout || "").split("\n").slice(-12).join("\n"));
  }
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
