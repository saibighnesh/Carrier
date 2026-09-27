// dense2ByteLength(text) recovers a Compact (dense v2) payload's byte count in O(1) from its header
// symbol and character count alone, without running the full 14-bit unpacking loop. Extracted from
// dense2ToBytes() (#467) purely to skip that decode where only the size is wanted; this suite pins
// down that it never disagrees with the decoder it was pulled out of, across every remainder the
// 7-byte cycle produces, and that it rejects exactly what the decoder rejects.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const DENSE_BASE ="), html.indexOf("/* ---------- CRC-32")),
  "globalThis.__DL = { bytesToDense2, dense2ToBytes, dense2ByteLength, DENSE_BASE, DENSE2_HDR };",
].join("\n");
new Function(src)();
const { bytesToDense2, dense2ToBytes, dense2ByteLength, DENSE_BASE, DENSE2_HDR } = globalThis.__DL;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("agrees with dense2ToBytes().length across two full 7-byte cycles, plus the empty payload", () => {
  for(let n = 0; n <= 14; n++){
    const bytes = Uint8Array.from({length: n}, (_, i) => (i * 37 + 11) & 0xff);
    const text = bytesToDense2(bytes);
    assert.equal(dense2ByteLength(text), n, `byteLen mismatch at n=${n}`);
    assert.equal(dense2ByteLength(text), dense2ToBytes(text).length, `disagreement with decoder at n=${n}`);
  }
});

t("recovers every remainder mod 7 exactly, not just a lucky subset", () => {
  // n mod 7 walks 0..6 as n runs 0..6, then repeats — cover both cycles explicitly
  for(let r = 0; r < 7; r++){
    for(const n of [r, r + 7]){
      const bytes = Uint8Array.from({length: n}, (_, i) => i & 0xff);
      assert.equal(dense2ByteLength(bytesToDense2(bytes)), n);
    }
  }
});

t("rejects an empty message the same way the decoder does", () => {
  assert.throws(() => dense2ByteLength(""), /Empty message/);
  assert.throws(() => dense2ToBytes(""), /Empty message/);
});

t("rejects a damaged header (out-of-range remainder symbol) the same way the decoder does", () => {
  const text = bytesToDense2(new Uint8Array([1,2,3]));
  // corrupt the header symbol to sit one past the valid 0..6 remainder range
  const bad = String.fromCharCode(DENSE_BASE + DENSE2_HDR + 7) + text.slice(1);
  assert.throws(() => dense2ByteLength(bad), /header is damaged/);
  assert.throws(() => dense2ToBytes(bad), /header is damaged/);
});

t("rejects a truncated payload the same way the decoder does", () => {
  const text = bytesToDense2(new Uint8Array(20));   // long enough that dropping a char can't collide with a valid shorter n
  const truncated = text.slice(0, -1);
  assert.throws(() => dense2ByteLength(truncated), /truncated/);
  assert.throws(() => dense2ToBytes(truncated), /truncated/);
});

t("a length this accepts is always a length the decoder accepts (no shortcut can diverge)", () => {
  for(let n = 0; n < 60; n++){
    const bytes = Uint8Array.from({length: n}, (_, i) => (i * 91 + 3) & 0xff);
    const text = bytesToDense2(bytes);
    const len = dense2ByteLength(text);       // must not throw
    const decoded = dense2ToBytes(text);      // must not throw either, and must match
    assert.equal(len, decoded.length);
  }
});

console.log(`\n${pass} passed`);
