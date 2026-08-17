// An unsafe alphabet corrupts payloads silently. Try hard to disqualify this one.
import assert from "node:assert/strict";
const BASE = 0x4E00, SIZE = 4096;                 // U+4E00..U+5DFF, CJK Unified Ideographs
const A = Array.from({length: SIZE}, (_, i) => String.fromCharCode(BASE + i));
const all = A.join("");
let pass = 0, fail = 0;
const chk = (name, fn) => { try { fn(); console.log("  ok    " + name); pass++; } catch (e) { console.log("  FAIL  " + name + " — " + e.message); fail++; } };

chk("every symbol is exactly one UTF-16 code unit (so 'length' counts characters)", () => {
  assert.equal(all.length, SIZE);
  for (const ch of A) assert.equal(ch.length, 1);
});

chk("all 4096 symbols are distinct", () => assert.equal(new Set(A).size, SIZE));

chk("NFC-stable: normalisation cannot rewrite them", () => {
  for (const ch of A) assert.equal(ch.normalize("NFC"), ch);
  assert.equal(all.normalize("NFC"), all);
});

chk("NFD-stable: no canonical decomposition to be split apart", () => {
  for (const ch of A) assert.equal(ch.normalize("NFD"), ch);
});

chk("NFKC/NFKD-stable: compatibility folding cannot merge two symbols into one", () => {
  assert.equal(all.normalize("NFKC"), all);
  assert.equal(all.normalize("NFKD"), all);
  assert.equal(new Set(A.map(c => c.normalize("NFKC"))).size, SIZE, "two symbols folded together");
});

chk("no whitespace, control, or line-breaking characters", () => {
  for (const ch of A) {
    assert.ok(!/\s/u.test(ch), `whitespace at U+${ch.codePointAt(0).toString(16)}`);
    assert.ok(!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch), `control/format at U+${ch.codePointAt(0).toString(16)}`);
  }
});

chk("no combining marks or variation selectors (nothing that merges with a neighbour)", () => {
  for (const ch of A) assert.ok(!/[\p{M}︀-️]/u.test(ch), "combining mark present");
  // and no two adjacent symbols form a single grapheme cluster
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  const sample = A.slice(0, 512).join("");
  assert.equal([...seg.segment(sample)].length, 512, "adjacent symbols merged into one grapheme");
});

chk("no markdown-active or quoting characters (chat clients rewrite those)", () => {
  const dangerous = /[*_`~>#\[\]()\\'"|@:\/\-+=!.,;{}^$?&%]/;
  for (const ch of A) assert.ok(!dangerous.test(ch), `active char U+${ch.codePointAt(0).toString(16)}`);
});

chk("disjoint from Base64's alphabet, so the two encodings can never be confused", () => {
  const b64 = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=");
  for (const ch of A) assert.ok(!b64.has(ch));
});

chk("survives JSON, URI encoding, and a UTF-8 byte round trip", () => {
  assert.equal(JSON.parse(JSON.stringify(all)), all);
  assert.equal(decodeURIComponent(encodeURIComponent(all)), all);
  const bytes = new TextEncoder().encode(all);
  assert.equal(new TextDecoder().decode(bytes), all);
  assert.equal(bytes.length, SIZE * 3, "CJK is 3 UTF-8 bytes per character — the cost of this trade");
});

chk("case folding cannot collapse two symbols (ideographs have no case)", () => {
  assert.equal(new Set(A.map(c => c.toLowerCase())).size, SIZE);
  assert.equal(new Set(A.map(c => c.toUpperCase())).size, SIZE);
});

chk("no symbol is a Unicode digit or would be read as a number", () => {
  for (const ch of A) assert.ok(!/\p{Nd}/u.test(ch));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// the honest counterweight
console.log("\nthe cost this trade actually incurs:");
console.log("  UTF-8 bytes per character:  3  (Base64: 1)");
console.log("  so where a limit is counted in BYTES, this is 1.5x WORSE, not 2x better:");
console.log("    3 bytes of payload -> base64 4 chars = 4 bytes");
console.log("    3 bytes of payload -> dense  2 chars = 6 bytes");
console.log("  and SMS switches from GSM-7 (160/segment) to UCS-2 (70/segment) on any non-Latin character.");
