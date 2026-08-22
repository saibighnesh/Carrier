// parseCustomLimit is the pure decision function behind the custom chat-limit field (#250) — this file
// proves its three outcomes (empty / invalid / valid) at the exact boundaries that matter, DOM-free, the
// same way targetBytes/dec64/chunkCardContent get tested. The DOM-wiring half (applyCustomLimit reading
// #chatLimitCustom and writing #chatLimitCustomErr) is covered live via Playwright, same as every other
// DOM-touching change in this project.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const CUSTOM_LIMIT_MIN"), html.indexOf('$("#chatLimit").addEventListener')),
  "globalThis.__CL = { parseCustomLimit, CUSTOM_LIMIT_MIN, CUSTOM_LIMIT_MAX };",
].join("\n");
new Function(src)();
const { parseCustomLimit, CUSTOM_LIMIT_MIN, CUSTOM_LIMIT_MAX } = globalThis.__CL;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("empty input is neither valid nor an error — nothing typed yet", () => {
  assert.deepEqual(parseCustomLimit(""), {empty:true});
  assert.deepEqual(parseCustomLimit("   "), {empty:true}, "whitespace-only trims to empty");
});

t("the exact boundary values are valid", () => {
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MIN)).ok, true);
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MIN)).value, CUSTOM_LIMIT_MIN);
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MAX)).ok, true);
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MAX)).value, CUSTOM_LIMIT_MAX);
});

t("one past either boundary is rejected", () => {
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MIN - 1)).ok, false);
  assert.equal(parseCustomLimit(String(CUSTOM_LIMIT_MAX + 1)).ok, false);
});

t("a typical in-range value is accepted", () => {
  const r = parseCustomLimit("8000");
  assert.equal(r.ok, true);
  assert.equal(r.value, 8000);
});

t("decimal and scientific-notation strings are rejected, not silently truncated by parseInt", () => {
  // parseInt("12.5", 10) === 12 and parseInt("1e3", 10) === 1 — both look like clean integers unless the
  // original string is checked against the parsed-back value, which is exactly what String(n) !== raw catches
  assert.equal(parseCustomLimit("12.5").ok, false);
  assert.equal(parseCustomLimit("1e3").ok, false);
  assert.equal(parseCustomLimit("100.0").ok, false);
});

t("non-numeric and empty-looking-but-not-empty strings are rejected", () => {
  assert.equal(parseCustomLimit("abc").ok, false);
  assert.equal(parseCustomLimit("--").ok, false);
  assert.equal(parseCustomLimit("NaN").ok, false);
});

t("leading zeros and a leading + are rejected — the round-trip string must match exactly", () => {
  assert.equal(parseCustomLimit("007").ok, false, "parseInt reads 7, but the raw string was \"007\"");
  assert.equal(parseCustomLimit("+500").ok, false, "parseInt reads 500, but the raw string was \"+500\"");
});

t("negative numbers are rejected", () => {
  assert.equal(parseCustomLimit("-100").ok, false);
});

t("the error message names both bounds", () => {
  const r = parseCustomLimit("5");
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(String(CUSTOM_LIMIT_MIN)));
  assert.match(r.error, /200,000/);
});

console.log(`\n${pass} passed`);
