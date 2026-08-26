// pwScore is the password-strength meter's scoring function: length thresholds at 8/12/16 chars, plus a
// bonus for hitting 3+ of {lower, upper, digit, symbol}, clamped to 1-4 (any non-empty password is at
// least Weak). Pure and DOM-free — updatePwStrength (untested, DOM-coupled) just reads the number back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("function pwScore"), html.indexOf("let lastPwScore")),
  "globalThis.__PW = { pwScore };",
].join("\n");
new Function(src)();
const { pwScore } = globalThis.__PW;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("empty string scores 0 — the no-password state, handled specially by callers", () => {
  assert.equal(pwScore(""), 0);
});

t("any non-empty password is at least Weak (1), even a single character", () => {
  assert.equal(pwScore("a"), 1);
});

t("length alone climbs the score without variety: 8/12/16 are the thresholds", () => {
  assert.equal(pwScore("aaaaaaa"), 1);     // 7 chars: below every threshold, still floors at 1 (non-empty)
  assert.equal(pwScore("aaaaaaaa"), 1);    // 8 chars: crosses the first threshold (len=1), no variety bonus
  assert.equal(pwScore("aaaaaaaaaaaa"), 2);    // 12 chars: len=2
  assert.equal(pwScore("aaaaaaaaaaaaaaaa"), 3);   // 16 chars: len=3, still capped by lack of variety
});

t("hitting 3 of the 4 character classes adds exactly one bonus point", () => {
  // 8 chars, lower+upper+digit (3 classes) -> len=1, variety bonus +1 -> 2
  assert.equal(pwScore("Aaaaaaa1"), 2);
});

t("all 4 classes is still only a +1 bonus, not +1 per extra class", () => {
  assert.equal(pwScore("Aa1!aaaa"), 2);   // same score as the 3-class case above at the same length
});

t("only 2 of the 4 classes never earns the variety bonus", () => {
  assert.equal(pwScore("aaaaaaaa1"), 1);   // lower+digit only, 9 chars (still len=1 bracket)
});

t("length and variety compound at the top end", () => {
  assert.equal(pwScore("Aa1!Aa1!Aa1!Aa1!"), 4);   // 16 chars, all 4 classes: len=3 + bonus=1, capped at 4
});

t("the score never exceeds 4 even past every threshold with full variety", () => {
  const long = "Aa1!".repeat(20);   // 80 chars, all 4 classes
  assert.equal(pwScore(long), 4);
});

t("v.length counts UTF-16 code units, not visual characters — emoji inflate the length silently", () => {
  // each lock emoji is a surrogate pair (2 UTF-16 code units), so 8 emoji is 8 VISIBLE characters to a
  // user but v.length reports 16 — crossing every length threshold (8/12/16) a full bracket early. Only
  // the symbol class matches (no lower/upper/digit), so variety stays 1 — no bonus, but len alone reaches 3
  const e4 = "🔒🔒🔒🔒", e8 = "🔒🔒🔒🔒🔒🔒🔒🔒";
  assert.equal(e4.length, 8, "4 emoji read as 8 UTF-16 code units, not 4");
  assert.equal(pwScore(e4), 1);
  assert.equal(e8.length, 16, "8 emoji read as 16 UTF-16 code units, not 8");
  assert.equal(pwScore(e8), 3, "scores as if it were a 16-character password, though only 8 were typed");
});

console.log(`\n${pass} passed`);
