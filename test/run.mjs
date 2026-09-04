// Run every suite; exit non-zero if any fails. Plain node, no dependencies — matching the app itself.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const suites = readdirSync(dir).filter(f => f.endsWith(".mjs") && f !== "run.mjs").sort();
let failed = 0;
for (const f of suites) {
  try {
    // 4096 MB — the RS/GF(2^14) sweeps and large-image round-trip suites allocate several sizable
    // Uint8Array/Uint16Array buffers per iteration; Node's default heap can OOM well before those finish.
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
