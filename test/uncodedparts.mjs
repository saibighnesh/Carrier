// uncodedParts(layout) sums the part counts of every block the reliability planner left with no recovery
// at all (blk.k === 0, falsy) — the "N parts can't be covered by recovery" figure shown in showPlan and
// fed back into planParity's own return value. Pure reduce over a plain array of {k, n} objects, no
// external dependencies — self-contained, zero prior direct test coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const uncodedParts"), html.indexOf("function planParity")),
  "globalThis.__UP = { uncodedParts };",
].join("\n");
new Function(src)();
const { uncodedParts } = globalThis.__UP;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("an empty layout has nothing uncoded", () => {
  assert.equal(uncodedParts([]), 0);
});

t("every block coded (k > 0): nothing uncoded, regardless of block size", () => {
  assert.equal(uncodedParts([{k:2,n:32},{k:4,n:32},{k:1,n:8}]), 0);
});

t("every block uncoded (k === 0): the total is every part across every block", () => {
  assert.equal(uncodedParts([{k:0,n:10},{k:0,n:5}]), 15);
});

t("a mix: only the k===0 blocks contribute, coded blocks contribute exactly 0 regardless of their own size", () => {
  assert.equal(uncodedParts([{k:0,n:5},{k:3,n:10},{k:0,n:2}]), 7);
});

t("a single coded block with a large n contributes nothing — n alone never leaks through", () => {
  assert.equal(uncodedParts([{k:1,n:1000}]), 0);
});

console.log(`\n${pass} passed`);
