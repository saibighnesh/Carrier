// The 16,384-symbol alphabet U+4E00..U+8DFF must pass every check the 4,096 one did. Try to disqualify it.
import assert from "node:assert/strict";
const BASE = 0x4E00, SIZE = 16384;
let pass = 0, fail = 0;
const chk = (name, fn) => { try { fn(); console.log("  ok    " + name); pass++; } catch (e) { console.log("  FAIL  " + name + " — " + e.message); fail++; } };
const A = Array.from({length: SIZE}, (_, i) => String.fromCharCode(BASE + i));
const all = A.join("");

chk("one UTF-16 code unit each (top symbol U+8DFF is far below surrogates at U+D800)", () => {
  assert.equal(all.length, SIZE);
  assert.ok(BASE + SIZE - 1 < 0xD800);
});
chk("all 16384 distinct", () => assert.equal(new Set(A).size, SIZE));
chk("NFC/NFD-stable: no canonical decomposition anywhere in the block", () => {
  assert.equal(all.normalize("NFC"), all);
  assert.equal(all.normalize("NFD"), all);
});
chk("NFKC/NFKD-stable: no compatibility folding merges two symbols", () => {
  assert.equal(all.normalize("NFKC"), all);
  assert.equal(all.normalize("NFKD"), all);
  assert.equal(new Set(A.map(c => c.normalize("NFKC"))).size, SIZE);
});
chk("no whitespace, control, format, or line/paragraph separators", () => {
  for (const ch of A) {
    if (/\s/u.test(ch)) throw new Error(`ws U+${ch.codePointAt(0).toString(16)}`);
    if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch)) throw new Error(`ctl U+${ch.codePointAt(0).toString(16)}`);
  }
});
chk("no unassigned code points hiding in the block", () => {
  for (const ch of A) if (/\p{Cn}/u.test(ch)) throw new Error(`unassigned U+${ch.codePointAt(0).toString(16)}`);
});
chk("no combining marks; adjacent symbols never merge into one grapheme", () => {
  for (const ch of A) if (/[\p{M}︀-️]/u.test(ch)) throw new Error(`mark U+${ch.codePointAt(0).toString(16)}`);
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (let off = 0; off < SIZE; off += 1024) {
    const sample = A.slice(off, off + 512).join("");
    assert.equal([...seg.segment(sample)].length, sample.length, `merge near U+${(BASE+off).toString(16)}`);
  }
});
chk("no markdown-active or quoting characters", () => {
  const bad = /[*_`~>#\[\]()\\'"|@:\/\-+=!.,;{}^$?&%<\s]/;
  for (const ch of A) if (bad.test(ch)) throw new Error(`active U+${ch.codePointAt(0).toString(16)}`);
});
chk("disjoint from Base64's alphabet and from ASCII entirely", () => {
  for (const ch of A) assert.ok(ch.charCodeAt(0) > 0x7F);
});
chk("survives JSON, URI, and UTF-8 byte round trips; every symbol is exactly 3 UTF-8 bytes", () => {
  assert.equal(JSON.parse(JSON.stringify(all)), all);
  assert.equal(decodeURIComponent(encodeURIComponent(all)), all);
  const bytes = new TextEncoder().encode(all);
  assert.equal(new TextDecoder().decode(bytes), all);
  assert.equal(bytes.length, SIZE * 3);
});
chk("case folding is identity (ideographs have no case)", () => {
  assert.equal(all.toLowerCase(), all);
  assert.equal(all.toUpperCase(), all);
});
chk("no Unicode digits", () => { for (const ch of A) if (/\p{Nd}/u.test(ch)) throw new Error("digit"); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
