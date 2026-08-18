// chunkCardContent is the single source of truth makeChunkCard (build) and updateChunkCard (patch in
// place) both read from — this file proves the pure computation is correct, at the exact boundaries where
// data parts become recovery parts and where the preview truncates. It's fully DOM-free, so it's testable
// in node the same way every other pure function in this project is; the DOM-level property (that
// updateChunkCard actually reuses nodes rather than recreating them) is a browser-only fact and is
// verified live, the same way every DOM-touching change in this project has been.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");

const store = new Map();
let lastChunks = [];
const src = [
  "const CHUNK_PREVIEW = 280;",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  html.slice(html.indexOf("function chunkDataCount"), html.indexOf("function showLossHistory")),
  html.slice(html.indexOf("function chunkCardContent"), html.indexOf("function makeChunkCard")),
  "globalThis.__CC = { chunkCardContent, chunkDataCount, get lastChunks(){ return lastChunks; }, set lastChunks(v){ lastChunks = v; } };",
].join("\n");
new Function("store", "lastChunks", src)(store, lastChunks);
const { chunkCardContent, chunkDataCount } = globalThis.__CC;
const setChunks = v => { globalThis.__CC.lastChunks = v; };

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

// build a fake chunk list: `n` data parts (header states total=n) followed by `k` recovery parts
const mkList = (n, k) => {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(`PXT/aabbcc/${i}/${n}/data${i}`);
  for (let i = 0; i < k; i++) out.push(`PXT/aabbcc/${n+1+i}/${n}/parity${i}`);
  return out;
};

t("a data part and a recovery part are labelled distinctly, with correct 1-based counters", () => {
  setChunks(mkList(4, 2));
  const d0 = chunkCardContent(globalThis.__CC.lastChunks[0], 0);   // first data part
  assert.equal(d0.isParity, false);
  assert.equal(d0.pillLabel, "MESSAGE 1 / 4");
  assert.equal(d0.pillTitle, "Part 1 of 4");

  const d3 = chunkCardContent(globalThis.__CC.lastChunks[3], 3);   // last data part
  assert.equal(d3.isParity, false);
  assert.equal(d3.pillLabel, "MESSAGE 4 / 4");

  const p0 = chunkCardContent(globalThis.__CC.lastChunks[4], 4);   // first recovery part (index 4 = dataParts)
  assert.equal(p0.isParity, true);
  assert.equal(p0.pillLabel, "RECOVERY 1 / 2");
  assert.match(p0.pillTitle, /rebuild a message that goes missing/);

  const p1 = chunkCardContent(globalThis.__CC.lastChunks[5], 5);
  assert.equal(p1.pillLabel, "RECOVERY 2 / 2");
});

t("a single-message payload is labelled SINGLE MESSAGE, not MESSAGE 1 / 1", () => {
  setChunks(mkList(1, 0));
  const d = chunkCardContent(globalThis.__CC.lastChunks[0], 0);
  assert.equal(d.pillLabel, "SINGLE MESSAGE");
  assert.equal(d.isParity, false);
});

t("dataParts is read from the header, not assumed — chunkDataCount is the shared authority", () => {
  setChunks(mkList(10, 3));
  assert.equal(chunkDataCount(), 10);
  // and chunkCardContent must agree with it at every boundary, not recompute its own answer
  for (let i = 0; i < 13; i++) {
    const d = chunkCardContent(globalThis.__CC.lastChunks[i], i);
    assert.equal(d.isParity, i >= 10, `index ${i}: isParity mismatch`);
  }
});

t("the preview truncates at CHUNK_PREVIEW characters of the WHOLE chunk string, and only past it", () => {
  // truncation applies to c.length (prefix included), not the payload alone — build chunks whose TOTAL
  // length sits exactly on the boundary so the test proves the real threshold, not an assumed one
  const prefix = "PXT/aa/1/1/";
  const exact = prefix + "x".repeat(280 - prefix.length);   // total length exactly 280
  assert.equal(exact.length, 280, "test precondition");
  setChunks([exact]);
  const short = chunkCardContent(globalThis.__CC.lastChunks[0], 0);
  assert.equal(short.preview, exact, "exactly CHUNK_PREVIEW chars must not truncate");
  assert.ok(!short.preview.endsWith("…"));

  const over = prefix + "x".repeat(281 - prefix.length);   // total length exactly 281 — one past the line
  assert.equal(over.length, 281, "test precondition");
  setChunks([over]);
  const long = chunkCardContent(globalThis.__CC.lastChunks[0], 0);
  assert.equal(long.preview.length, 282, "280 kept chars + ' …' (2 chars)");
  assert.ok(long.preview.endsWith(" …"));
  assert.equal(long.preview.slice(0, 280), over.slice(0, 280));
});

t("copy/data aria-labels count against the TOTAL (data + recovery), matching the copy buttons' own contract", () => {
  setChunks(mkList(3, 2));
  const d = chunkCardContent(globalThis.__CC.lastChunks[0], 0);
  assert.equal(d.copyAriaLabel, "Copy message 1 of 5");   // 3 data + 2 recovery = 5 total, matches lastChunks.length
  assert.match(d.dataAriaLabel, /Message 1 of 5 content/);
});

t("chars reflects the actual chunk text length, not the preview length", () => {
  const chunk = "PXT/aa/1/1/" + "y".repeat(500);
  setChunks([chunk]);
  const d = chunkCardContent(chunk, 0);
  assert.equal(d.chars, `${chunk.length} chars`, "must count the whole chunk, prefix included");
  assert.notEqual(d.preview.length, chunk.length, "precondition: this chunk must actually be truncated");
});

console.log(`\n${pass} passed`);
