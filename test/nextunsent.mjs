// nextUnsentIndex() finds the index of the first chunk not yet in the sentChunks set — what Copy-next
// actually copies on each press. Depends on module-level lastChunks/sentChunks, exposed here via setters
// (same injectable-state pattern the other send-state test files in this round use). Zero prior coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("let lastChunks"), html.indexOf("// compose the Send-mode tab title")),
  "globalThis.__NU = { nextUnsentIndex, setLastChunks: v => { lastChunks = v; }, setSent: v => { sentChunks.clear(); v.forEach(c => sentChunks.add(c)); } };",
].join("\n");
new Function(src)();
const { nextUnsentIndex, setLastChunks, setSent } = globalThis.__NU;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("nothing sent yet: the first chunk is next", () => {
  setLastChunks(["a", "b", "c"]);
  setSent([]);
  assert.equal(nextUnsentIndex(), 0);
});

t("the first chunk already sent: the second is next", () => {
  setLastChunks(["a", "b", "c"]);
  setSent(["a"]);
  assert.equal(nextUnsentIndex(), 1);
});

t("sent chunks in the middle are skipped, not just a leading run", () => {
  setLastChunks(["a", "b", "c", "d"]);
  setSent(["a", "c"]);   // b is the first one NOT sent
  assert.equal(nextUnsentIndex(), 1);
});

t("everything sent: -1, the same not-found value Array.findIndex always returns", () => {
  setLastChunks(["a", "b"]);
  setSent(["a", "b"]);
  assert.equal(nextUnsentIndex(), -1);
});

t("sentChunks is keyed by chunk TEXT, not position — a re-pack with different strings finds nothing sent", () => {
  // mirrors the real invariant (#196/#214/#221-era): marks are keyed by the chunk's own text, so a fresh
  // pack that mints different session-id strings can never accidentally inherit stale marks
  setLastChunks(["x1", "x2"]);
  setSent(["a", "b"]);   // marks from a completely different pack
  assert.equal(nextUnsentIndex(), 0);
});

console.log(`\n${pass} passed`);
