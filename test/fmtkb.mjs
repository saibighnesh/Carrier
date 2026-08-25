// fmtKB(b) formats a byte count for every size shown on screen (Original/Compressed stats, the .txt save
// note): bytes verbatim under 1 KiB, KB with 1 decimal under 100 KB / 0 decimals from 100 KB up to 1 MiB,
// MB with 1 decimal above that. Pure, deterministic, zero prior test coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const fmtKB"), html.indexOf("// stamp saved files")),
  "globalThis.__FK = { fmtKB };",
].join("\n");
new Function(src)();
const { fmtKB } = globalThis.__FK;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("under 1 KiB: the raw byte count, verbatim", () => {
  assert.equal(fmtKB(0), "0 B");
  assert.equal(fmtKB(1), "1 B");
  assert.equal(fmtKB(1023), "1023 B");
});

t("1 KiB is the first KB value, formatted with 1 decimal", () => {
  assert.equal(fmtKB(1024), "1.0 KB");
});

t("under the 100 KB threshold: 1 decimal place", () => {
  assert.equal(fmtKB(51200), "50.0 KB");   // 50 KiB exactly
});

t("right at the 100 KB threshold, from below: rounds up to 100.0 while still in the 1-decimal regime", () => {
  // 102399 / 1024 = 99.999...; toFixed(1) rounds to "100.0" one byte before the formula actually
  // switches to 0-decimal formatting — a real rounding artifact of a deliberately simple formatter,
  // not a bug, and worth pinning down explicitly so it doesn't look like one later
  assert.equal(fmtKB(102399), "100.0 KB");
});

t("at and past the 100 KB threshold: 0 decimal places", () => {
  assert.equal(fmtKB(102400), "100 KB");
  assert.equal(fmtKB(512000), "500 KB");
});

t("just under 1 MiB: rounds up to 1024 KB, still in the KB branch — the sibling artifact to the 100 KB case", () => {
  assert.equal(fmtKB(1048575), "1024 KB");
});

t("1 MiB is the first MB value", () => {
  assert.equal(fmtKB(1048576), "1.0 MB");
});

t("MB values always keep exactly 1 decimal, no matter how large", () => {
  assert.equal(fmtKB(5242880), "5.0 MB");
  assert.equal(fmtKB(1048576 * 123), "123.0 MB");
});

console.log(`\n${pass} passed`);
