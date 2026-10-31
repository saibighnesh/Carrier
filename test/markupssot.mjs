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
  ["RIMG_LABEL",   /const RIMG_LABEL\s*=\s*document\.getElementById\("rimg"\)\.getAttribute\("aria-label"\);/],
  ["THUMB_ALT",    /const THUMB_ALT\s*=\s*document\.getElementById\("thumb"\)\.getAttribute\("alt"\);/],
  ["THUMB_LABEL",  /const THUMB_LABEL\s*=\s*document\.getElementById\("thumb"\)\.getAttribute\("aria-label"\);/],
  ["REVEAL_LABEL", /const REVEAL_LABEL\s*=\s*document\.getElementById\("reveal"\)\.textContent;/],
  ["REVEAL_TITLE", /const REVEAL_TITLE\s*=\s*document\.getElementById\("reveal"\)\.getAttribute\("title"\);/],
  ["RECOVERY_TITLE", /const RECOVERY_TITLE\s*=\s*document\.getElementById\("recovery"\)\.getAttribute\("title"\);/],
];
for (const [name, re] of capturedLabels) {
  t(`${name} is captured from the markup, not hardcoded`, () => {
    assert.match(html, re, `${name} should read its resting value straight off the element`);
  });
}

t("the received-image teardown restores labels from the captured constants", () => {
  assert.match(html, /setAttribute\("aria-label",\s*RESULT_LABEL\)/, "clearReveal should restore #result from RESULT_LABEL");
  assert.match(html, /rimg\.alt\s*=\s*RIMG_ALT;/, "the teardown should restore the #rimg alt from RIMG_ALT");
  assert.match(html, /setAttribute\("aria-label",\s*RIMG_LABEL\)/, "the teardown should restore the #rimg label from RIMG_LABEL");
});

t("the preview teardown restores its alt and label from the captured constants", () => {
  assert.match(html, /\$\("#thumb"\)\.alt\s*=\s*THUMB_ALT;/, "clear should restore the #thumb alt from THUMB_ALT");
  assert.match(html, /setAttribute\("aria-label",\s*THUMB_LABEL\)/, "clear should restore the #thumb label from THUMB_LABEL");
});

t("showLossHistory restores the recovery control's resting title from RECOVERY_TITLE", () => {
  assert.match(html, /\$\("#recovery"\)\.title\s*=\s*RECOVERY_TITLE;/, "showLossHistory should restore #recovery.title from RECOVERY_TITLE");
});

t("SAVE_TITLE_DEFAULT captures the Save button resting title from markup", () => {
  assert.match(html, /const SAVE_TITLE_DEFAULT\s*=\s*\$\("#save"\)\.title;/, "SAVE_TITLE_DEFAULT should capture resting title from #save");
});

t("clearReveal restores the Save button resting title from SAVE_TITLE_DEFAULT", () => {
  assert.match(html, /\$\("#save"\)\.title\s*=\s*SAVE_TITLE_DEFAULT;/, "clearReveal should restore #save.title from SAVE_TITLE_DEFAULT");
});

t("SEND_TITLE is captured from document.title, not hardcoded", () => {
  assert.match(html, /const SEND_TITLE\s*=\s*document\.title;/, "SEND_TITLE should capture document.title at load");
});

t("clear restores document.title from SEND_TITLE", () => {
  assert.match(html, /document\.title\s*=\s*SEND_TITLE;/, "clear should restore document.title from SEND_TITLE");
});

t("RECV_TITLE constant exists and clearReveal restores it when receive is visible", () => {
  assert.match(html, /const RECV_TITLE\s*=\s*"[^"]+";/, "RECV_TITLE constant should exist");
  assert.match(html, /document\.title\s*=\s*RECV_TITLE;/, "clearReveal should restore document.title from RECV_TITLE");
});

t("REVEAL_BUSY_TITLE and REVEAL_EMPTY_TITLE single-source the Reveal button disabled tooltips", () => {
  assert.match(html, /const REVEAL_BUSY_TITLE\s*=\s*"[^"]+";/, "REVEAL_BUSY_TITLE constant should exist");
  assert.match(html, /const REVEAL_EMPTY_TITLE\s*=\s*"[^"]+";/, "REVEAL_EMPTY_TITLE constant should exist");
  assert.match(html, /REVEAL_BUSY_TITLE\s*:\s*REVEAL_EMPTY_TITLE/, "updateProgress should use the constants for disabled tooltips");
});

t("COPY_FAIL and COPY_FAIL_ARIA single-source the clipboard access denied feedback", () => {
  assert.match(html, /const COPY_FAIL\s*=\s*"Copy failed",\s*COPY_FAIL_ARIA\s*=\s*"Copy failed — clipboard access denied";/, "COPY_FAIL and COPY_FAIL_ARIA constants should exist");
  assert.match(html, /flashButton\(\s*btn,\s*COPY_FAIL,\s*COPY_FAIL_ARIA\s*\);/, "copy paths should use COPY_FAIL and COPY_FAIL_ARIA");
});

t("PW_SHOW and PW_HIDE constants single-source the password visibility toggle labels", () => {
  assert.match(html, /const PW_SHOW\s*=\s*"Show",\s*PW_HIDE\s*=\s*"Hide";/, "PW_SHOW and PW_HIDE constants should exist");
  assert.match(html, /const PW_SHOW_LABEL\s*=\s*"Show password",\s*PW_HIDE_LABEL\s*=\s*"Hide password";/, "PW_SHOW_LABEL and PW_HIDE_LABEL constants should exist");
  assert.match(html, /btn\.textContent\s*=\s*show\s*\?\s*PW_HIDE\s*:\s*PW_SHOW;/, "toggle should set textContent from constants");
  assert.match(html, /btn\.setAttribute\("aria-label",\s*show\s*\?\s*PW_HIDE_LABEL\s*:\s*PW_SHOW_LABEL\);/, "toggle should set aria-label from constants");
});

t("FULLSIZE_HINT single-sources the full-size image accessibility hint", () => {
  assert.match(html, /const FULLSIZE_HINT\s*=\s*" — activate to open full size in a new tab";/, "FULLSIZE_HINT constant should exist");
  assert.match(html, /\$\{previewDesc\}\$\{FULLSIZE_HINT\}/, "preview aria-label should append FULLSIZE_HINT");
});

t("localStorage preference key constants exist and match expected keys", () => {
  assert.match(html, /const LS_QUALITY\s*=\s*"carrier_quality",\s*LS_MAXDIM\s*=\s*"carrier_maxdim",\s*LS_MSGLIMIT\s*=\s*"carrier_msglimit",\s*LS_CODEC\s*=\s*"carrier_codec",\s*LS_RECOVERY\s*=\s*"carrier_recovery",\s*LS_MODE\s*=\s*"carrier_mode";/, "all 6 localStorage key constants should be defined");
});

t("timing constants TUNE_DEBOUNCE_MS and COPY_ALL_REVERT_MS are defined and referenced", () => {
  assert.match(html, /const TUNE_DEBOUNCE_MS\s*=\s*180;/, "TUNE_DEBOUNCE_MS should be defined");
  assert.match(html, /const COPY_ALL_REVERT_MS\s*=\s*2000;/, "COPY_ALL_REVERT_MS should be defined");
  assert.match(html, /setTimeout\(refresh,\s*TUNE_DEBOUNCE_MS\)/, "queueRefresh should reference TUNE_DEBOUNCE_MS");
  assert.match(html, /setTimeout\(restore,\s*COPY_ALL_REVERT_MS\)/, "copyAll restore should reference COPY_ALL_REVERT_MS");
});

console.log(`\n${pass} passed`);

