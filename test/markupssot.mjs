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
const qvalTag = (() => {
  const m = /<output id="qval"[^>]*>([^<]*)<\/output>/.exec(html);
  assert.ok(m, "expected the <output id=\"qval\"> quality readout");
  return m;
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

t("#qval readout is empty in markup, not a hardcoded default", () => {
  assert.equal(qvalTag[1].trim(), "", "#qval must not embed a literal percentage — setQuality() fills it on load");
});

t("setQuality() writes the #qval readout from the slider value", () => {
  assert.match(html, /\$\("#qval"\)\.textContent\s*=\s*q\s*\+\s*"%"/, "setQuality should set #qval textContent from q");
});

// --- resting labels captured from the markup (PRs #603–#607) ---
// A handful of control labels — the received image's region label and alt, the compressed preview's
// alt and label, and the Reveal button's label and ready-state title — live once in the markup and are
// restored by JS on teardown. Each is captured into a constant read straight off its own element, so the
// reset path never hardcodes a second copy that could drift from the markup. Guard both halves: the
// capturing constant exists, and the reset reads the constant rather than re-typing the string.
const capturedLabels = [
  ["RESULT_LABEL", /const RESULT_LABEL\s*=\s*document\.getElementById\("result"\)\.getAttribute\("aria-label"\);/],
  ["RIMG_ALT",     /const RIMG_ALT\s*=\s*document\.getElementById\("rimg"\)\.getAttribute\("alt"\);/],
  ["THUMB_ALT",    /const THUMB_ALT\s*=\s*document\.getElementById\("thumb"\)\.getAttribute\("alt"\);/],
  ["THUMB_LABEL",  /const THUMB_LABEL\s*=\s*document\.getElementById\("thumb"\)\.getAttribute\("aria-label"\);/],
  ["REVEAL_LABEL", /const REVEAL_LABEL\s*=\s*document\.getElementById\("reveal"\)\.textContent;/],
  ["REVEAL_TITLE", /const REVEAL_TITLE\s*=\s*document\.getElementById\("reveal"\)\.getAttribute\("title"\);/],
];
for (const [name, re] of capturedLabels) {
  t(`${name} is captured from the markup, not hardcoded`, () => {
    assert.match(html, re, `${name} should read its resting value straight off the element`);
  });
}

t("the received-image teardown restores labels from the captured constants", () => {
  assert.match(html, /setAttribute\("aria-label",\s*RESULT_LABEL\)/, "clearReveal should restore #result from RESULT_LABEL");
  assert.match(html, /rimg\.alt\s*=\s*RIMG_ALT;/, "the teardown should restore the #rimg alt from RIMG_ALT");
});

t("the preview teardown restores its alt and label from the captured constants", () => {
  assert.match(html, /\$\("#thumb"\)\.alt\s*=\s*THUMB_ALT;/, "clear should restore the #thumb alt from THUMB_ALT");
  assert.match(html, /setAttribute\("aria-label",\s*THUMB_LABEL\)/, "clear should restore the #thumb label from THUMB_LABEL");
});

console.log(`\n${pass} passed`);
