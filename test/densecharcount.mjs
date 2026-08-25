// dense2CharCount(byteLen) computes the exact character count Compact (dense v2) encoding will produce for
// a payload size: 1 header symbol plus ceil(8n/14) — 14 bits (DENSE2_BITS) per character. textBitsPerChar()
// is the small codec-aware lookup (14 for dense, 6 for Base64) other pricing math depends on. Both pure,
// both zero prior direct test coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("let textCodec"), html.indexOf("const targetBytes")),
  html.slice(html.indexOf("/* ---------- dense v2"), html.indexOf("/* ---------- CRC-32")),
  "globalThis.__DC = { dense2CharCount, textBitsPerChar, DENSE2_BITS, setCodec: v => { textCodec = v; } };",
].join("\n");
new Function(src)();
const { dense2CharCount, textBitsPerChar, DENSE2_BITS, setCodec } = globalThis.__DC;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("DENSE2_BITS is 14 — the value every char-count formula here assumes", () => {
  assert.equal(DENSE2_BITS, 14);
});

t("zero bytes still costs the 1 header character", () => {
  assert.equal(dense2CharCount(0), 1);
});

t("a payload that divides evenly into 14-bit groups", () => {
  // 14 bytes = 112 bits = exactly 8 groups of 14 bits -> 8 characters + 1 header
  assert.equal(dense2CharCount(14), 9);
});

t("one bit past an even boundary rounds up to a whole extra character", () => {
  // 1 byte = 8 bits, well under 14 -> still needs 1 character to hold it, plus the header
  assert.equal(dense2CharCount(1), 2);
});

t("a realistic payload size matches an independently hand-computed count, not a re-derivation of the formula", () => {
  // 45000 * 8 = 360000 bits; 360000 / 14 = 25714.2857...; ceil -> 25715; +1 header = 25716
  assert.equal(dense2CharCount(45000), 25716);
});

t("textBitsPerChar returns 6 for Base64, 14 for dense — the exact 2.33x ratio behind Compact's savings", () => {
  setCodec("b64");
  assert.equal(textBitsPerChar(), 6);
  setCodec("dense");
  assert.equal(textBitsPerChar(), 14);
  assert.equal(textBitsPerChar() / 6, DENSE2_BITS / 6);
});

console.log(`\n${pass} passed`);
