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

t("a data part's copy/data aria-labels count against the TOTAL (data + recovery), matching the copy button's own contract", () => {
  setChunks(mkList(3, 2));
  const d = chunkCardContent(globalThis.__CC.lastChunks[0], 0);
  assert.equal(d.copyAriaLabel, "Copy message 1 of 5");   // 3 data + 2 recovery = 5 total, matches lastChunks.length
  assert.match(d.dataAriaLabel, /Message 1 of 5 content/);
});

t("copyTitle is a hover-tooltip sentence naming the same 1-based/total pair as copyAriaLabel, for a data part", () => {
  setChunks(mkList(3, 2));
  const d = chunkCardContent(globalThis.__CC.lastChunks[0], 0);   // a data part — total-based numbering applies
  assert.equal(d.copyTitle, "Copies message 1 of 5 to the clipboard");
});

// A recovery part gets its own "RECOVERY n / m" pill so it isn't mistaken for an ordinary message (see
// the test above this one, and the boundary test further up) — the copy button and data region must say
// the same thing, not fall back to total-based "message" numbering the way they used to (#482). Before
// that fix, a screen reader user pressing this same card's Copy button heard "Copy message 5 of 5" for
// what the pill already, correctly, called "RECOVERY 2 / 2".
t("a recovery part's copy/data aria-labels say 'recovery part', with recovery-relative numbering, not 'message'", () => {
  setChunks(mkList(3, 2));
  const p = chunkCardContent(globalThis.__CC.lastChunks[4], 4);   // second of 2 recovery parts (dataParts=3)
  assert.equal(p.copyAriaLabel, "Copy recovery part 2 of 2");
  assert.equal(p.copyTitle, "Copies recovery part 2 of 2 to the clipboard");
  assert.match(p.dataAriaLabel, /Recovery part 2 of 2 content/);
  assert.doesNotMatch(p.copyAriaLabel, /message/i);
  assert.doesNotMatch(p.copyTitle, /message/i);
  assert.doesNotMatch(p.dataAriaLabel, /message/i);
});

t("chars reflects the actual chunk text length, not the preview length", () => {
  const chunk = "PXT/aa/1/1/" + "y".repeat(500);
  setChunks([chunk]);
  const d = chunkCardContent(chunk, 0);
  assert.equal(d.chars, `${chunk.length} chars`, "must count the whole chunk, prefix included");
  assert.notEqual(d.preview.length, chunk.length, "precondition: this chunk must actually be truncated");
});

// chunkCardContent(c, i, dataParts) gained its third parameter in #483 (renderChunks() now computes
// dataParts ONCE per render pass and threads it through, instead of every card re-deriving it via
// chunkDataCount()) — that PR shipped with no direct test of the parameter itself, only of the unchanged
// 2-arg default path. These pin down that the thread-through actually happens, not merely that it's
// harmless to omit.
t("an explicit dataParts argument is honored, not silently overridden by chunkDataCount()'s own answer", () => {
  setChunks(mkList(5, 0));           // chunkDataCount() would say 5 here — no parity parts at all
  // renderChunks() computes dataParts once and passes it to every card; simulate that with a value that
  // deliberately DISAGREES with what chunkDataCount() would derive, so the assertions can only pass if the
  // parameter is actually used
  const asIfThree = chunkCardContent(globalThis.__CC.lastChunks[3], 3, 3);   // index 3, told dataParts=3
  assert.equal(asIfThree.isParity, true, "index 3 >= the PASSED dataParts (3), even though chunkDataCount() would say 5");
  assert.equal(asIfThree.pillLabel, "RECOVERY 1 / 2");
  assert.equal(asIfThree.copyAriaLabel, "Copy recovery part 1 of 2");
});

t("omitting dataParts falls back to chunkDataCount(), matching the pre-#483 default behavior", () => {
  setChunks(mkList(4, 2));
  const withDefault = chunkCardContent(globalThis.__CC.lastChunks[4], 4);         // 2-arg call
  const withExplicit = chunkCardContent(globalThis.__CC.lastChunks[4], 4, chunkDataCount());   // 3-arg, same value
  assert.deepEqual(withDefault, withExplicit, "the default parameter must compute exactly what chunkDataCount() would");
});

t("the data/recovery boundary is exact at the single index where dataParts transitions, via an explicit dataParts", () => {
  // renderChunks() passes the SAME dataParts to every card in a pass — exercise the one-index transition
  // the way it actually would, rather than only through the 2-arg default path other tests use
  const list = mkList(6, 3);
  setChunks(list);
  const lastData = chunkCardContent(list[5], 5, 6);       // i = dataParts - 1: still a data part
  const firstParity = chunkCardContent(list[6], 6, 6);    // i = dataParts: the first recovery part
  assert.equal(lastData.isParity, false);
  assert.equal(lastData.pillLabel, "MESSAGE 6 / 6");
  assert.equal(firstParity.isParity, true);
  assert.equal(firstParity.pillLabel, "RECOVERY 1 / 3");
});

console.log(`\n${pass} passed`);
