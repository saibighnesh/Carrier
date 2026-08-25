// chunkPrefixLen(total) is the exact length of a chunk's "PXT/<sid>/<index>/<total>/" prefix. Roughly a
// dozen other test files hand-copy this exact formula as a stub ("4 + SID_LEN + 3 + 2 * String(total).length")
// rather than extracting the real one from index.html — meaning if the real implementation ever drifted
// from that copied formula, nothing would catch it, since every stub would just silently drift along with
// it. This file tests the REAL function directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const SID_LEN"), html.indexOf("const textBitsPerChar")),
  "globalThis.__CPL = { chunkPrefixLen, SID_LEN };",
].join("\n");
new Function(src)();
const { chunkPrefixLen, SID_LEN } = globalThis.__CPL;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("SID_LEN is 6 — the value every stub across the suite assumes", () => {
  assert.equal(SID_LEN, 6);
});

t("single-digit total: PXT/ + 6-char sid + / + 1-digit index + / + 1-digit total + / = 4+6+3+2 = 15", () => {
  assert.equal(chunkPrefixLen(1), 15);
  assert.equal(chunkPrefixLen(9), 15);
});

t("crossing into 2-digit totals adds exactly 2 to the prefix (1 digit each for index and total)", () => {
  assert.equal(chunkPrefixLen(10), 17);
  assert.equal(chunkPrefixLen(99), 17);
});

t("crossing into 3, 4, 5, and 6-digit totals each add exactly 2 more", () => {
  assert.equal(chunkPrefixLen(100), 19);
  assert.equal(chunkPrefixLen(1000), 21);
  assert.equal(chunkPrefixLen(10000), 23);
  assert.equal(chunkPrefixLen(100000), 25);
});

t("matches the hand-copied stub formula every other test file uses — the drift check this file exists for", () => {
  const stub = total => 4 + SID_LEN + 3 + 2 * String(total).length;
  for(const total of [1, 9, 10, 99, 100, 4096, 60000, 999999]){
    assert.equal(chunkPrefixLen(total), stub(total), `drift detected at total=${total}`);
  }
});

console.log(`\n${pass} passed`);
