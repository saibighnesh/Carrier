// pad2/localDate/localStamp are the date-formatting helpers behind every saved filename's timestamp (the
// .txt save and the received-image download both use localDate/localStamp). Pure given an injected Date —
// neither ever calls `new Date()` argument-less inside a loop or reads the clock twice — but had zero
// direct tests. Uses fixed, explicit Date objects throughout, never the ambient current time, so this file
// itself is fully deterministic no matter when it runs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("const pad2"), html.indexOf("/* ---------- byte <-> base64")),
  "globalThis.__D = { pad2, localDate, localStamp };",
].join("\n");
new Function(src)();
const { pad2, localDate, localStamp } = globalThis.__D;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("pad2 zero-pads single digits, leaves two-digit numbers alone", () => {
  assert.equal(pad2(0), "00");
  assert.equal(pad2(5), "05");
  assert.equal(pad2(12), "12");
});

t("localDate: month is 1-indexed in the output (Date's own getMonth() is 0-indexed)", () => {
  const d = new Date(2026, 0, 5);   // January 5, 2026 — Date's month arg is 0 for January
  assert.equal(localDate(d), "2026-01-05");
});

t("localDate: single-digit month and day both zero-pad", () => {
  const d = new Date(2026, 8, 9);   // September (month index 8) 9th
  assert.equal(localDate(d), "2026-09-09");
});

t("localDate: double-digit month and day pass through unpadded", () => {
  const d = new Date(2026, 11, 25);   // December 25th
  assert.equal(localDate(d), "2026-12-25");
});

t("localStamp appends zero-padded hours, minutes, seconds to localDate's output", () => {
  const d = new Date(2026, 2, 7, 4, 8, 2);   // March 7, 04:08:02
  assert.equal(localStamp(d), "2026-03-07-04-08-02");
});

t("localStamp: double-digit time components pass through unpadded, same as the date half", () => {
  const d = new Date(2026, 2, 7, 23, 59, 9);
  assert.equal(localStamp(d), "2026-03-07-23-59-09");
});

t("midnight: hour 0 zero-pads like any other single digit", () => {
  const d = new Date(2026, 5, 15, 0, 0, 0);
  assert.equal(localStamp(d), "2026-06-15-00-00-00");
});

t("an Invalid Date is not rejected — every field reads NaN, and pad2 leaves it as the literal string \"NaN\"", () => {
  // pad2's String(n).padStart(2,"0") is a no-op here: "NaN" is already 3 characters, longer than the
  // 2-char pad target, so padStart does nothing. Every real call site uses the bare new Date() default,
  // always valid, so this is unreachable in practice — but worth pinning down as verified behavior
  const bad = new Date("not a real date");
  assert.ok(Number.isNaN(bad.getFullYear()), "test precondition: an Invalid Date's fields are all NaN");
  assert.equal(localDate(bad), "NaN-NaN-NaN");
});

console.log(`\n${pass} passed`);
