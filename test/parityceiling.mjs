// parityChunksB64/parityChunksDense must decide whether a block's index still fits the parity header's
// one-character block field BEFORE building shards and running the Reed-Solomon encode for it (#466) —
// not after, which used to pay for a full encode on the first out-of-range block only to throw the rows
// away. RS_BLOCK_CEILING.b64 is 64 blocks (2048 data parts), too large to drive honestly in a fast test,
// so this pins the ordering itself: wrap rsEncode with a counter and lower the ceiling to a small number,
// then assert the encode never runs for a block index at or past it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const RS_HALF  = 32;"), html.indexOf("/* ---------- GF(2^14)")),
  "const RS_BLOCK_CEILING = { b64: 64, dense: 16384 };",   // real value from index.html, pinned here since the GF(2^14) section it's normally derived from isn't loaded
  html.slice(html.indexOf("const RS_LEVELS ="), html.indexOf("const RS_TARGET =") + "const RS_TARGET = 0.99;".length),
  html.slice(html.indexOf("async function parityChunksB64"), html.indexOf("// B64V has 128 entries")),
  "globalThis.__PC = { parityChunksB64, RS_BLOCK_CEILING, RS_BLOCK, setRsEncode: f => { rsEncode = f; } };",
].join("\n");
new Function(src)();
const { parityChunksB64, RS_BLOCK_CEILING, RS_BLOCK, setRsEncode } = globalThis.__PC;

let pass = 0;
const t = async (n, f) => { await f(); console.log("  ok  " + n); pass++; };

// pin the constant this file hardcodes above against the real one in index.html, so a future change to
// RS_BLOCK_CEILING can't silently drift from what this test believes it's exercising
await t("RS_BLOCK_CEILING.b64 in index.html is still 64 — the value this test's ceiling stub stands in for", () => {
  assert.match(html, /const RS_BLOCK_CEILING = \{ b64: 64, dense: GF14_ORDER \};/);
});

await t("never encodes a block at or past the ceiling — checked before shard construction, not after", async () => {
  RS_BLOCK_CEILING.b64 = 2;   // lower the real 64-block ceiling so the test stays fast: blocks 0,1 kept, 2+ dropped
  const encodedBlockStarts = [];
  setRsEncode(async (shards, k) => {
    encodedBlockStarts.push(shards.length);   // records that an encode ran; the block itself is inferred below
    return Array.from({length: k}, () => new Uint8Array(shards[0].length));
  });
  const per = 2;
  const total = RS_BLOCK * 3;              // 3 full blocks: 0 and 1 are within the lowered ceiling, 2 is not
  const b64 = "A".repeat(total * per);
  const out = await parityChunksB64(b64, "abc123", total, per, "strong", "PXT");
  // exactly 2 blocks' worth of parity chunks were emitted (ceiling=2), never a 3rd
  const parityForBlock = blk => out.filter(c => c.split("/")[4][0] === "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[blk]);
  assert.ok(parityForBlock(0).length > 0, "block 0 should have parity");
  assert.ok(parityForBlock(1).length > 0, "block 1 should have parity");
  assert.equal(parityForBlock(2).length, 0, "block 2 is past the lowered ceiling and must carry no parity");
  // the real assertion: rsEncode ran exactly twice (once per kept block), never a third time for the
  // dropped block. Before #466's fix this would have been 3 — the encode happened, THEN got discarded.
  assert.equal(encodedBlockStarts.length, 2, "rsEncode must not run for a block past the ceiling");
});

console.log(`\n${pass} passed`);
