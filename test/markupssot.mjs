// Guards the "single source of truth" invariant fixed in PR #596: a UI value that JS sets on load
// (the wire-format version, the quality slider's aria-valuetext) must NOT also be hardcoded in the
// static markup, where a stale copy could silently drift from the real source on a later bump. This
// suite reads index.html as text — no DOM — and asserts both halves: the markup carries no literal,
// and the JS still sets it from the real source. If someone re-adds a hardcoded copy, this fails.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

// isolate the two static elements by id so the assertions can't be fooled by text elsewhere in the file
const appVersionTag = (() => {
  const m = /<span id="appVersion"[^>]*>/.exec(html);
  assert.ok(m, "expected a <span id=\"appVersion\"> in the footer markup");
  return m[0];
})();
const qualityTag = (() => {
  const m = /<input type="range" id="quality"[^>]*>/.exec(html);
  assert.ok(m, "expected the <input id=\"quality\"> range control");
  return m[0];
})();

t("APP_VERSION is the single source for the version string", () => {
  assert.match(html, /const APP_VERSION\s*=\s*"[^"]+";/, "APP_VERSION constant should exist");
});

t("#appVersion static aria-label carries no hardcoded version number", () => {
  const m = /aria-label="([^"]*)"/.exec(appVersionTag);
  assert.ok(m, "#appVersion should keep a static aria-label");
  assert.doesNotMatch(m[1], /v?\d+\.\d+/, "static aria-label must not embed a version number — JS sets the exact one");
});

t("JS sets the #appVersion aria-label from APP_VERSION on load", () => {
  assert.match(html, /Wire format version v\$\{APP_VERSION\}/, "load-time JS should supply the versioned label");
});

t("#quality markup has no hardcoded aria-valuetext", () => {
  assert.doesNotMatch(qualityTag, /aria-valuetext=/, "aria-valuetext duplicates value=\"70\" — setQuality() sets it on load");
});

t("setQuality() sets aria-valuetext from the slider value", () => {
  assert.match(html, /setAttribute\("aria-valuetext",\s*q\s*\+\s*"%"\)/, "setQuality should set aria-valuetext from q");
});

console.log(`\n${pass} passed`);
