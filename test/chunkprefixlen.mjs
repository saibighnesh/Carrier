// chunkPrefixLen(total) is the exact length of a chunk's "PXT/<sid>/<index>/<total>/" prefix, and
// maxChunkIndexFor(total, recoveryOn) is the safe upper bound chunkify() reserves prefix width for when
// parity chunks might push the widest index past total. Roughly a dozen other test files hand-copy both
// exact formulas as stubs rather than extracting the real ones from index.html — meaning if either real
// implementation ever drifted from its copied formula, nothing would catch it, since every stub would just
// silently drift along with it. This file tests the REAL functions directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const SID_LEN"), html.indexOf("const textBitsPerChar")),
  "globalThis.__CPL = { chunkPrefixLen, SID_LEN, maxChunkIndexFor };",
].join("\n");
new Function(src)();
const { chunkPrefixLen, SID_LEN, maxChunkIndexFor } = globalThis.__CPL;

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

t("maxChunkIndexFor matches the hand-copied stub every chunkify()-calling test file uses", () => {
  // same drift risk as chunkPrefixLen above: ~14 test files hand-copy "recoveryOn ? total * 2 : total"
  // as a stub instead of extracting the real function, because their sliced-in copy of chunkify() now
  // calls it too (added alongside the parity-index-overflow fix). Pin the real function's behavior here
  // so a future change to it doesn't silently drift out of sync with every stub at once.
  const stub = (total, recoveryOn) => recoveryOn ? total * 2 : total;
  for(const total of [1, 9, 10, 99, 100, 4096, 60000]){
    for(const recoveryOn of [true, false]){
      assert.equal(maxChunkIndexFor(total, recoveryOn), stub(total, recoveryOn), `drift detected at total=${total}, recoveryOn=${recoveryOn}`);
    }
  }
  assert.equal(maxChunkIndexFor(9, false), 9, "recovery off: no padding, matches total exactly");
  assert.equal(maxChunkIndexFor(9, true), 18, "recovery on: doubled, safely covering any real parity index");
});

t("a negative total is not rejected — the minus sign counts as a character, one digit-width too many", () => {
  // String(-5).length is 2, not 1 — the leading "-" occupies a character position the formula counts the
  // same as a real digit, so a negative total is treated as if it had one more digit than its magnitude
  // actually has. total is always lastChunks.length in practice, never negative, so unreachable — but
  // worth pinning down as verified behavior
  assert.equal(String(-5).length, 2, "test precondition: the minus sign is a character");
  assert.equal(chunkPrefixLen(-5), 17, "same width as a real 2-digit total, not the 1-digit width its magnitude would suggest");
});

console.log(`\n${pass} passed`);
