// enc64(v, width) is the Base64 metadata encoder used in every RS parity header (block index, row index,
// core length) — the exact round-trip counterpart of the already-tested dec64. Pure and DOM-free, but had
// zero coverage of its own: dec64 (the decode half) is tested in fixes.mjs and rs-wire.mjs, enc64 nowhere.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const slice = (a,b) => { const i = html.indexOf(a), j = html.indexOf(b); if(i<0||j<0) throw new Error("marker "+(i<0?a:b)); return html.slice(i,j); };
const store = new Map();
const src = [
  "let msgLimit = 60000; let recoveryLevel = 'off'; let textCodec = 'b64';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const MAGIC = [0x50,0x58,0x54,0x31];",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */", "/* ---------- CRC-32"),
  slice("/* ---------- CRC-32", "/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon", "/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics", "/* ---------- container (mime"),
  slice("/* ---------- container (mime", "/* ---------- compression ---------- */"),
  "globalThis.__E = { enc64, dec64 };",
].join("\n");
new Function("store", src)(store);
const { enc64, dec64 } = globalThis.__E;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("width-1: every value 0-63 round-trips through dec64", () => {
  for(let v = 0; v < 64; v++){
    const s = enc64(v, 1);
    assert.equal(s.length, 1);
    assert.equal(dec64(s), v);
  }
});

t("width-1: 64 is one past what a single character can hold — rejected, not silently wrapped", () => {
  assert.equal(enc64(64, 1), null);
  assert.equal(enc64(100, 1), null);
});

t("negative values are rejected at every width", () => {
  assert.equal(enc64(-1, 1), null);
  assert.equal(enc64(-1, 4), null);
});

t("non-integer values are NOT rejected — the guard only checks range, not Number.isInteger", () => {
  // the bitwise `>>` used to build the output string truncates toward zero, so a fractional value
  // silently produces the exact same output as its integer part — never hit by any real caller (every
  // one passes an integer block/row index or length), but worth pinning down as documented behavior
  // rather than an unverified assumption
  assert.equal(enc64(5.5, 1), enc64(5, 1));
  assert.equal(enc64(5.9, 1), enc64(5, 1));
});

t("NaN slips past the range guard entirely and encodes as 0, rather than being rejected", () => {
  // NaN < 0 and NaN >= ceiling are both false, so the guard's early return never fires; NaN >> 0 is 0
  assert.equal(enc64(NaN, 1), enc64(0, 1));
});

t("wider widths round-trip and pad with leading 'A' (zero), matching dec64's big-endian read", () => {
  assert.equal(enc64(0, 4), "AAAA");
  assert.equal(dec64(enc64(0, 4)), 0);
  const v = 12345;
  const s = enc64(v, 4);
  assert.equal(s.length, 4);
  assert.equal(dec64(s), v);
});

t("the exact ceiling for a given width is accepted; one past it is rejected", () => {
  const width = 2;
  const ceiling = Math.pow(64, width) - 1;   // 4095 for width 2
  assert.notEqual(enc64(ceiling, width), null);
  assert.equal(dec64(enc64(ceiling, width)), ceiling);
  assert.equal(enc64(ceiling + 1, width), null);
});

t("a large realistic value (a dense block length header, width 4) round-trips exactly", () => {
  const v = 16000000;   // within width-4's ceiling (64^4 - 1 = 16,777,215)
  const s = enc64(v, 4);
  assert.equal(s.length, 4);
  assert.equal(dec64(s), v);
});

console.log(`\n${pass} passed`);
