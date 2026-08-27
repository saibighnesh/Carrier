// formatParts collapses a sorted, missing-parts index list into the range-abbreviated prose every
// receive-side message uses ("6-19" for a long run, "6, 7" for a pair that doesn't collapse). Pure and
// DOM-free — the same way targetBytes/dec64/parseCustomLimit get tested directly instead of only through
// the DOM-touching functions that call them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("function formatParts"), html.indexOf("function headerFlags")),
  "globalThis.__FP = { formatParts };",
].join("\n");
new Function(src)();
const { formatParts } = globalThis.__FP;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("empty list", () => {
  assert.equal(formatParts([]), "");
});

t("a single number", () => {
  assert.equal(formatParts([5]), "5");
});

t("a pair of consecutive numbers stays a list, not a range", () => {
  assert.equal(formatParts([6, 7]), "6, 7");
});

t("three or more consecutive numbers collapse to a range", () => {
  assert.equal(formatParts([6, 7, 8]), "6–8");
  assert.equal(formatParts([1, 2, 3, 4, 5]), "1–5");
});

t("non-consecutive numbers never collapse", () => {
  assert.equal(formatParts([1, 3, 5]), "1, 3, 5");
});

t("a mix of runs, pairs, and singles in one list", () => {
  // 1-3 is a real range (3 consecutive), 5 stands alone, 7-8 is a pair (stays a list)
  assert.equal(formatParts([1, 2, 3, 5, 7, 8]), "1–3, 5, 7, 8");
});

t("two separate long runs", () => {
  assert.equal(formatParts([1, 2, 3, 10, 11, 12, 13]), "1–3, 10–13");
});

t("two adjacent pairs with a gap between them — a distinct shape from a single pair or a run", () => {
  // neither pair reaches the 3-consecutive threshold to collapse into a range, and the gap (2 to 4)
  // keeps them from merging into each other — every element stays a separate list entry
  assert.equal(formatParts([1, 2, 4, 5]), "1, 2, 4, 5");
});

t("a run at the very end of the list", () => {
  assert.equal(formatParts([1, 20, 21, 22]), "1, 20–22");
});

console.log(`\n${pass} passed`);
