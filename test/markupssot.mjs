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

t("MSG_LIMITS maps chat app limits and matches select options in markup", () => {
  assert.match(html, /const MSG_LIMITS\s*=\s*\{\s*60000:"WhatsApp",\s*4096:"Telegram",\s*4000:"Slack",\s*2000:"Discord",\s*160:"SMS"\s*\};/, "MSG_LIMITS should map preset limits");
  for (const limit of [60000, 4096, 4000, 2000, 160]) {
    assert.match(html, new RegExp(`<option value="${limit}">`), `select should include option for ${limit}`);
  }
});

t("ALLOWED_IMG whitelist guards against non-raster image types", () => {
  assert.match(html, /const ALLOWED_IMG\s*=\s*new Set\(\["image\/webp","image\/jpeg","image\/png","image\/gif","image\/avif"\]\);/, "ALLOWED_IMG Set should define safe image mime types");
  assert.match(html, /if\(!ALLOWED_IMG\.has\(claimed\)\)\s*throw new Error\(/, "received image decode must check claimed mime against ALLOWED_IMG");
});

t("recvVisible and sendVisible helpers reflect the hidden state of tabs", () => {
  assert.match(html, /const recvVisible\s*=\s*\(\)\s*=>\s*!\$\("#recv"\)\.classList\.contains\("hidden"\);/, "recvVisible should check #recv hidden class");
  assert.match(html, /const sendHidden\s*=\s*\(\)\s*=>\s*\$\("#send"\)\.classList\.contains\("hidden"\);/, "sendHidden should check #send hidden class");
  assert.match(html, /const sendVisible\s*=\s*\(\)\s*=>\s*!sendHidden\(\);/, "sendVisible should negate sendHidden");
});

t("hideResult helper teardown contract is preserved", () => {
  assert.match(html, /const hideResult\s*=\s*\(\)\s*=>\s*\{\s*\$\("#result"\)\.classList\.add\("hidden"\);\s*\$\("#result"\)\.setAttribute\("aria-hidden","true"\);\s*\$\("#result"\)\.setAttribute\("aria-label",RESULT_LABEL\);\s*\};/, "hideResult should hide #result, set aria-hidden, and restore RESULT_LABEL");
});

t("resetReceivedImage helper resets rimg attributes and clears rCaption", () => {
  assert.match(html, /const resetReceivedImage\s*=\s*\(\)\s*=>\s*\{\s*const rimg\s*=\s*\$\("#rimg"\);\s*rimg\.removeAttribute\("src"\);\s*rimg\.alt\s*=\s*RIMG_ALT;\s*rimg\.setAttribute\("aria-label",RIMG_LABEL\);\s*\$\("#rCaption"\)\.textContent\s*=\s*"";\s*\};/, "resetReceivedImage should restore rimg to resting state");
});

t("CHUNK_RENDER_CAP and CHUNK_PREVIEW bounds are defined", () => {
  assert.match(html, /const CHUNK_RENDER_CAP\s*=\s*200;/, "CHUNK_RENDER_CAP should be 200");
  assert.match(html, /const CHUNK_PREVIEW\s*=\s*280;/, "CHUNK_PREVIEW should be 280");
});

t("MAGIC wire signature matches PXT1 format", () => {
  assert.match(html, /const MAGIC\s*=\s*\[0x50,0x58,0x54,0x31\];/, "MAGIC should be [0x50,0x58,0x54,0x31]");
  assert.match(html, /c\.set\(MAGIC,0\);/, "packPlain should prepend MAGIC");
  assert.match(html, /if\(c\[i\]!==MAGIC\[i\]\)\s*throw new Error\("This doesn't look like a Carrier message\."\);/, "parsePlain should validate MAGIC");
});

t("activeAppName resolves active chat app name or fallback", () => {
  assert.match(html, /const activeAppName\s*=\s*fallback\s*=>\s*\$\("#chatLimit"\)\.value\s*===\s*"custom"\s*\?\s*fallback\s*:\s*\(MSG_LIMITS\[String\(msgLimit\)\]\s*\|\|\s*fallback\);/, "activeAppName should check custom first then MSG_LIMITS");
});

t("noTranslate helper scopes translate=no attribute", () => {
  assert.match(html, /const noTranslate\s*=\s*s\s*=>\s*`<span translate="no">\$\{s\}<\/span>`;/, "noTranslate helper should wrap value in span with translate=no");
});

t("lsGet, lsSet, and lsRemove wrap localStorage in try/catch for safe degradation", () => {
  assert.match(html, /const lsGet\s*=\s*k\s*=>\s*\{\s*try\s*\{\s*return localStorage\.getItem\(k\);\s*\}\s*catch\s*\{\s*return null;\s*\}\s*\};/, "lsGet should catch errors and return null");
  assert.match(html, /const lsSet\s*=\s*\(k,\s*v\)\s*=>\s*\{\s*try\s*\{\s*localStorage\.setItem\(k,\s*v\);\s*\}\s*catch\s*\{\}\s*\};/, "lsSet should catch storage errors");
  assert.match(html, /const lsRemove\s*=\s*k\s*=>\s*\{\s*try\s*\{\s*localStorage\.removeItem\(k\);\s*\}\s*catch\s*\{\}\s*\};/, "lsRemove should catch storage errors");
});

t("pad2, localDate, and localStamp format local calendar dates and timestamps", () => {
  assert.match(html, /const pad2\s*=\s*n\s*=>\s*String\(n\)\.padStart\(2,\s*"0"\);/, "pad2 should pad single digits to 2 characters");
  assert.match(html, /const localDate\s*=\s*\(d\s*=\s*new Date\(\)\)\s*=>\s*`\$\{d\.getFullYear\(\)\}-\$\{pad2\(d\.getMonth\(\)\+1\)\}-\$\{pad2\(d\.getDate\(\)\)\}`;/, "localDate should format local YYYY-MM-DD");
  assert.match(html, /const localStamp\s*=\s*\(d\s*=\s*new Date\(\)\)\s*=>\s*`\$\{localDate\(d\)\}-\$\{pad2\(d\.getHours\(\)\)\}-\$\{pad2\(d\.getMinutes\(\)\)\}-\$\{pad2\(d\.getSeconds\(\)\)\}`;/, "localStamp should format local YYYY-MM-DD-HH-MM-SS");
});

t("dense v1 codec constants are defined", () => {
  assert.match(html, /const DENSE_BASE\s*=\s*0x4E00;/, "DENSE_BASE should be 0x4E00");
  assert.match(html, /const DENSE_BITS\s*=\s*12;/, "DENSE_BITS should be 12");
  assert.match(html, /const DENSE_MASK\s*=\s*\(1\s*<<\s*DENSE_BITS\)\s*-\s*1;/, "DENSE_MASK should derive from DENSE_BITS");
  assert.match(html, /const BITS_PER_BYTE\s*=\s*8;/, "BITS_PER_BYTE should be named");
  assert.match(html, /const BYTE_MASK\s*=\s*\(1\s*<<\s*BITS_PER_BYTE\)\s*-\s*1;/, "BYTE_MASK should derive from BITS_PER_BYTE");
  assert.match(html, /const DENSE_CYCLE_BYTES\s*=\s*3,\s*DENSE_CYCLE_CHARS\s*=\s*2;/, "dense v1 cycle should be 3 bytes <-> 2 chars");
  // the dense v1 encoder feeds the bit accumulator one byte at a time — that width is BITS_PER_BYTE, not a loose 8
  assert.match(html, /acc = \(acc << BITS_PER_BYTE\) \| bytes\[i\];/, "bytesToDense should shift in BITS_PER_BYTE, not a literal 8");
  assert.match(html, /nbits \+= BITS_PER_BYTE;/, "bytesToDense should count bits in BITS_PER_BYTE units");
  // the v1 decoders drain the accumulator one byte at a time — same BITS_PER_BYTE width, no bare 8
  assert.match(html, /while\(nbits >= BITS_PER_BYTE && o < n\)\{\s*\n\s*nbits -= BITS_PER_BYTE;/, "denseToBytes should drain in BITS_PER_BYTE units");
  assert.match(html, /while\(nbits >= BITS_PER_BYTE && o < want\)\{ nbits -= BITS_PER_BYTE;/, "densePrefixBytes should drain in BITS_PER_BYTE units");
  // v1's header symbol should carry the declared DENSE_HDR offset explicitly, mirroring v2's DENSE2_HDR
  assert.match(html, /String\.fromCharCode\(DENSE_BASE \+ DENSE_HDR \+ \(bytes\.length % DENSE_CYCLE_BYTES\)\)/, "bytesToDense header should add DENSE_HDR");
  assert.match(html, /const r = text\.charCodeAt\(0\) - DENSE_BASE - DENSE_HDR;/, "denseToBytes should subtract DENSE_HDR from the header symbol");
});

t("dense v2 codec constants are defined", () => {
  assert.match(html, /const DENSE2_BITS\s*=\s*14;/, "DENSE2_BITS should be 14");
  assert.match(html, /const DENSE2_MASK\s*=\s*\(1\s*<<\s*DENSE2_BITS\)\s*-\s*1;/, "DENSE2_MASK should derive from DENSE2_BITS");
  assert.match(html, /const DENSE2_HDR\s*=\s*3;/, "DENSE2_HDR should be 3");
  assert.match(html, /const DENSE2_CYCLE_BYTES\s*=\s*7,\s*DENSE2_CYCLE_CHARS\s*=\s*4;/, "dense v2 cycle should be 7 bytes <-> 4 chars");
  assert.match(html, /const D2_PAY\s*=\s*Array\.from\(\{length:DENSE2_CYCLE_BYTES\},\s*\(_,r\)=>Math\.ceil\(DENSE2_CYCLE_CHARS\*r\/DENSE2_CYCLE_BYTES\)\);/, "D2_PAY should derive from the cycle constants");
  // the v2 codec feeds/drains the accumulator in BITS_PER_BYTE units, and prices chars from byteLen * BITS_PER_BYTE
  assert.match(html, /acc = \(\(acc << BITS_PER_BYTE\) \| bytes\[i\]\) >>> 0;/, "bytesToDense2 should shift in BITS_PER_BYTE");
  assert.match(html, /while\(nbits >= BITS_PER_BYTE && o < n\)\{ nbits -= BITS_PER_BYTE; out\[o\+\+\] = \(acc >>> nbits\) & BYTE_MASK; \}/, "dense2ToBytes should drain in BITS_PER_BYTE units");
  assert.match(html, /const dense2CharCount = byteLen => DENSE_HDR_CHARS \+ Math\.ceil\(byteLen \* BITS_PER_BYTE \/ DENSE2_BITS\);/, "dense2CharCount should price in BITS_PER_BYTE units");
});

t("RS_HALF, RS_BLOCK, and RS_META Reed-Solomon constants are defined", () => {
  assert.match(html, /const RS_HALF\s*=\s*32;/, "RS_HALF should be 32");
  assert.match(html, /const RS_BLOCK\s*=\s*32;/, "RS_BLOCK should be 32");
  assert.match(html, /const RS_HDR_BLK\s*=\s*1,\s*RS_HDR_ROW\s*=\s*1,\s*RS_HDR_LEN\s*=\s*4;/, "parity-header field widths should be named");
  assert.match(html, /const RS_META\s*=\s*RS_HDR_BLK\s*\+\s*RS_HDR_ROW\s*\+\s*RS_HDR_LEN;/, "RS_META should be the sum of the field widths");
});

t("B64A Base64 alphabet string is defined", () => {
  assert.match(html, /const B64A\s*=\s*"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\+\/";/, "B64A alphabet should be RFC 4648 Base64 standard");
});

t("GF14_POLY field generator polynomial is defined", () => {
  assert.match(html, /const GF14_POLY\s*=\s*0x4443;/, "GF14_POLY should be 0x4443");
});

t("RS_LEVELS redundancy level ratios are defined", () => {
  assert.match(html, /const RS_LEVELS\s*=\s*\{\s*off:\s*0,\s*auto:\s*null,\s*light:\s*0\.1,\s*strong:\s*0\.25\s*\};/, "RS_LEVELS should define ratios for off, auto, light, and strong");
});

t("RS_TARGET and RS_COST_CAP Reed-Solomon tuning constants are defined", () => {
  assert.match(html, /const RS_TARGET\s*=\s*0\.99;/, "RS_TARGET should be 0.99");
  assert.match(html, /const RS_COST_CAP\s*=\s*0\.5;/, "RS_COST_CAP should be 0.5");
});

t("FLAG_ENCRYPTED and FLAG_CRC32 wire flags are defined", () => {
  assert.match(html, /const FLAG_ENCRYPTED\s*=\s*1;/, "FLAG_ENCRYPTED should be 1");
  assert.match(html, /const FLAG_CRC32\s*=\s*2;/, "FLAG_CRC32 should be 2");
});

t("MISSING_SHOWN missing parts limit constant is defined", () => {
  assert.match(html, /const MISSING_SHOWN\s*=\s*50;/, "MISSING_SHOWN should be 50");
});

t("CUSTOM_LIMIT_MIN and CUSTOM_LIMIT_MAX custom limit bounds are defined", () => {
  assert.match(html, /const CUSTOM_LIMIT_MIN\s*=\s*20,\s*CUSTOM_LIMIT_MAX\s*=\s*200000;/, "CUSTOM_LIMIT_MIN and CUSTOM_LIMIT_MAX should be 20 and 200000");
});

t("PW_LABELS and PW_MAX password rating constants are defined", () => {
  assert.match(html, /const PW_LABELS\s*=\s*\["",\s*"Weak",\s*"Fair",\s*"Good",\s*"Strong"\];/, "PW_LABELS should match 5 password strength levels");
  assert.match(html, /const PW_MAX\s*=\s*128;/, "PW_MAX should cap password length at 128");
});

t("TUNE_CONTROLS lists all 5 tune control selectors", () => {
  assert.match(html, /const TUNE_CONTROLS\s*=\s*\["#quality",\s*"#maxdim",\s*"#chatLimit",\s*"#chatLimitCustom",\s*"#compact"\];/, "TUNE_CONTROLS should list quality, maxdim, chatLimit, chatLimitCustom, and compact");
});

t("TXT_MAX and REVEAL_BUSY_NOTE constants are defined", () => {
  assert.match(html, /const TXT_MAX\s*=\s*8\s*\*\s*BYTES_PER_MB;/, "TXT_MAX should be 8MB");
  assert.match(html, /const REVEAL_BUSY_NOTE\s*=\s*"Still revealing the previous message — wait a moment and try again\.";/, "REVEAL_BUSY_NOTE should inform the user a reveal is underway");
});

t("DROP_STRONG_DEFAULT and DROP_SMALL_DEFAULT captured drop markup constants are defined", () => {
  assert.match(html, /const DROP_STRONG_DEFAULT\s*=\s*drop\.querySelector\("strong"\)\.textContent;/, "DROP_STRONG_DEFAULT should be captured from markup");
  assert.match(html, /const DROP_SMALL_DEFAULT\s*=\s*drop\.querySelector\("small"\)\.textContent;/, "DROP_SMALL_DEFAULT should be captured from markup");
});

t("DROP_TITLE_DEFAULT and DROP_LABEL_DEFAULT captured drop attributes are defined", () => {
  assert.match(html, /const DROP_TITLE_DEFAULT\s*=\s*drop\.title;/, "DROP_TITLE_DEFAULT should be captured from drop.title");
  assert.match(html, /const DROP_LABEL_DEFAULT\s*=\s*drop\.getAttribute\("aria-label"\);/, "DROP_LABEL_DEFAULT should be captured from aria-label");
});

t("GF_EXP and GF_LOG Galois field tables are initialized", () => {
  assert.match(html, /const B64_ALPHABET_SIZE\s*=\s*B64A\.length;/, "B64_ALPHABET_SIZE should derive from the alphabet");
  assert.match(html, /const GF6_ORDER\s*=\s*B64_ALPHABET_SIZE,\s*GF6_N\s*=\s*GF6_ORDER\s*-\s*1;/, "GF6_ORDER should be the Base64 alphabet size");
  assert.match(html, /const GF_EXP\s*=\s*new Uint8Array\(2\s*\*\s*GF6_N\),\s*GF_LOG\s*=\s*new Uint8Array\(GF6_ORDER\);/, "GF_EXP and GF_LOG should size from GF6_N / GF6_ORDER");
});

t("GF14_ORDER and GF14_N Galois field size constants are defined", () => {
  assert.match(html, /const GF14_ORDER\s*=\s*1\s*<<\s*DENSE2_BITS,\s*GF14_N\s*=\s*GF14_ORDER\s*-\s*1;/, "GF14_ORDER and GF14_N should be tied to DENSE2_BITS");
});

t("RS14 field instantiation is defined with RS_HALF", () => {
  assert.match(html, /const RS14\s*=\s*gfField\(gf14Mul,\s*gf14Inv,\s*RS_HALF\);/, "RS14 should instantiate gfField with gf14Mul, gf14Inv, RS_HALF");
});

t("RS14_META header size constant is defined", () => {
  assert.match(html, /const RS14_HDR_LEN\s*=\s*2;/, "dense core-length field width should be named");
  assert.match(html, /const RS14_META\s*=\s*RS_HDR_BLK\s*\+\s*RS_HDR_ROW\s*\+\s*RS14_HDR_LEN;/, "RS14_META should be the sum of the dense field widths");
});

t("RS_BLOCK_CEILING codec ceiling map is defined", () => {
  assert.match(html, /const RS_BLOCK_CEILING\s*=\s*\{\s*b64:\s*64,\s*dense:\s*GF14_ORDER\s*\};/, "RS_BLOCK_CEILING should map b64 to 64 and dense to GF14_ORDER");
});

t("LOSS_PRIOR_A and LOSS_PRIOR_B beta prior constants are defined", () => {
  assert.match(html, /const LOSS_PRIOR_A\s*=\s*1,\s*LOSS_PRIOR_B\s*=\s*49;/, "LOSS_PRIOR_A and LOSS_PRIOR_B should be 1 and 49");
});

t("targetBytes chunk payload formula is defined", () => {
  assert.match(html, /const WIRE_FILL_RATIO\s*=\s*0\.96;/, "WIRE_FILL_RATIO headroom constant should be defined");
  assert.match(html, /const targetBytes\s*=\s*\(\)\s*=>\s*Math\.floor\(\(msgLimit\s*-\s*chunkPrefixLen\(1\)\)\s*\*\s*\(textBitsPerChar\(\)\s*\/\s*BITS_PER_BYTE\)\s*\*\s*WIRE_FILL_RATIO\);/, "targetBytes should convert bits per char to bytes via BITS_PER_BYTE, not a literal 8");
});

t("SID_LEN constant and chunkPrefixLen helper are defined", () => {
  assert.match(html, /const HEX_PER_BYTE\s*=\s*2;/, "HEX_PER_BYTE should name the two-hex-digits-per-byte ratio");
  assert.match(html, /const SID_LEN\s*=\s*6;/, "SID_LEN should be 6");
  assert.match(html, /new Uint8Array\(SID_LEN\/HEX_PER_BYTE\)/, "sid byte count should derive from SID_LEN / HEX_PER_BYTE");
  assert.match(html, /const chunkPrefixLen\s*=\s*total\s*=>\s*4\s*\+\s*SID_LEN\s*\+\s*3\s*\+\s*2\s*\*\s*String\(total\)\.length;/, "chunkPrefixLen formula should account for brackets, SID, slash, and indices");
});

t("maxChunkIndexFor and textBitsPerChar helpers are defined", () => {
  assert.match(html, /const maxChunkIndexFor\s*=\s*\(total,\s*recoveryOn\)\s*=>\s*recoveryOn\s*\?\s*total\s*\*\s*2\s*:\s*total;/, "maxChunkIndexFor should double total when recovery is enabled");
  assert.match(html, /const B64_BITS\s*=\s*6;/, "B64_BITS should name the Base64 bits-per-char");
  assert.match(html, /const textBitsPerChar\s*=\s*\(\)\s*=>\s*textCodec\s*===\s*"dense"\s*\?\s*DENSE2_BITS\s*:\s*B64_BITS;/, "textBitsPerChar should return DENSE2_BITS for dense or B64_BITS for base64");
});

t("fmtKB byte formatting helper is defined", () => {
  assert.match(html, /const BYTES_PER_KB\s*=\s*1024,\s*BYTES_PER_MB\s*=\s*BYTES_PER_KB\s*\*\s*BYTES_PER_KB;/, "byte-size unit constants should be defined (MB derived from KB)");
  assert.match(html, /const KB_WHOLE_FROM\s*=\s*100;/, "KB_WHOLE_FROM should name the whole-number KB threshold");
  assert.match(html, /const fmtKB\s*=\s*b\s*=>\s*b\s*<\s*BYTES_PER_KB\s*\?\s*b\s*\+\s*" B"/, "fmtKB should format bytes with B, KB, or MB units");
  assert.match(html, /\.toFixed\(b\s*<\s*KB_WHOLE_FROM\s*\*\s*BYTES_PER_KB\s*\?\s*1\s*:\s*0\)/, "fmtKB should switch decimals at KB_WHOLE_FROM");
});

t("dense2CharCount, denseCharCount, and b64CharCount helpers are defined", () => {
  assert.match(html, /const DENSE_HDR_CHARS\s*=\s*1;/, "DENSE_HDR_CHARS should name the one leading header symbol");
  assert.match(html, /const dense2CharCount\s*=\s*byteLen\s*=>\s*DENSE_HDR_CHARS\s*\+\s*Math\.ceil\(byteLen\s*\*\s*BITS_PER_BYTE\s*\/\s*DENSE2_BITS\);/, "dense2CharCount should calculate header plus ceiling 14-bit symbols");
  assert.match(html, /const denseCharCount\s*=\s*byteLen\s*=>\s*DENSE_HDR_CHARS\s*\+\s*Math\.ceil\(byteLen\s*\*\s*BITS_PER_BYTE\s*\/\s*DENSE_BITS\);/, "denseCharCount should calculate header plus ceiling 12-bit symbols");
  assert.match(html, /const B64_CYCLE_BYTES\s*=\s*3,\s*B64_CYCLE_CHARS\s*=\s*4;/, "Base64 3-byte<->4-char cycle should be named");
  assert.match(html, /const b64CharCount\s*=\s*byteLen\s*=>\s*Math\.ceil\(byteLen\s*\/\s*B64_CYCLE_BYTES\)\s*\*\s*B64_CYCLE_CHARS;/, "b64CharCount should derive from the Base64 cycle");
});

t("gfMul and gfInv Galois field arithmetic helpers are defined", () => {
  assert.match(html, /const gfMul\s*=\s*\(a,b\)\s*=>\s*\(a\s*===\s*0\s*\|\|\s*b\s*===\s*0\)\s*\?\s*0\s*:\s*GF_EXP\[GF_LOG\[a\]\s*\+\s*GF_LOG\[b\]\];/, "gfMul should implement GF(64) multiplication");
  assert.match(html, /const gfInv\s*=\s*a\s*=>\s*GF_EXP\[\(GF6_N\s*-\s*GF_LOG\[a\]\)\s*%\s*GF6_N\];/, "gfInv should implement GF(64) inversion");
});

t("gf14Mul and gf14Inv Galois field arithmetic helpers are defined", () => {
  assert.match(html, /const gf14Mul\s*=\s*\(a,b\)\s*=>\s*\(a\s*===\s*0\s*\|\|\s*b\s*===\s*0\)\s*\?\s*0\s*:\s*GF14_EXP\[GF14_LOG\[a\]\s*\+\s*GF14_LOG\[b\]\];/, "gf14Mul should implement GF(16384) multiplication");
  assert.match(html, /const gf14Inv\s*=\s*a\s*=>\s*GF14_EXP\[\(GF14_N\s*-\s*GF14_LOG\[a\]\)\s*%\s*GF14_N\];/, "gf14Inv should implement GF(16384) inversion");
});

t("b64ToSyms and symsToB64 symbol conversion helpers are defined", () => {
  assert.match(html, /const b64ToSyms\s*=\s*\(str,\s*len\)\s*=>\s*\{\s*const out\s*=\s*new Uint8Array\(len\);/, "b64ToSyms should map Base64 chars to numerical symbols");
  assert.match(html, /const symsToB64\s*=\s*syms\s*=>\s*\{\s*let s\s*=\s*"";/, "symsToB64 should map numerical symbols to Base64 chars");
});

t("denseToSyms and symsToDense symbol conversion helpers are defined", () => {
  assert.match(html, /const denseToSyms\s*=\s*\(str,\s*len\)\s*=>\s*\{\s*const out\s*=\s*new Uint16Array\(len\);/, "denseToSyms should map dense chars to numerical symbols");
  assert.match(html, /const symsToDense\s*=\s*syms\s*=>\s*\{\s*let s\s*=\s*"";/, "symsToDense should map numerical symbols to dense chars");
});

t("lossKey storage key generator helper is defined", () => {
  assert.match(html, /const lossKey\s*=\s*\(\)\s*=>\s*`carrier_loss_\$\{msgLimit\}`;/, "lossKey should generate carrier_loss_${msgLimit}");
});

t("scrollBehavior and scrollIntoViewNearest helpers are defined", () => {
  assert.match(html, /const scrollBehavior\s*=\s*\(\)=>prefersReducedMotion\(\)\s*\?\s*"auto"\s*:\s*"smooth";/, "scrollBehavior should respect prefersReducedMotion");
  assert.match(html, /const scrollIntoViewNearest\s*=\s*el\s*=>\s*el\.scrollIntoView\(\{behavior:scrollBehavior\(\),\s*block:"nearest"\}\);/, "scrollIntoViewNearest should scroll with block nearest");
});

t("copyAllLabel dynamic button label helper is defined", () => {
  assert.match(html, /const copyAllLabel\s*=\s*\(\)\s*=>\s*lastChunks\.length\s*===\s*1\s*\?\s*"Copy message"\s*:\s*"Copy all messages";/, "copyAllLabel should distinguish single chunk from multiple chunks");
});

t("packInputs and chunkInputs cache key generators are defined", () => {
  assert.match(html, /const packInputs\s*=\s*\(maxDim,\s*quality,\s*password\)\s*=>\s*\[loadToken,\s*maxDim,\s*quality,\s*password,\s*textCodec\]\.join\("\|"\);/, "packInputs should include loadToken, maxDim, quality, password, textCodec");
  assert.match(html, /const chunkInputs\s*=\s*packKeyStr\s*=>\s*\[packKeyStr,\s*msgLimit,\s*recoveryLevel\]\.join\("\|"\);/, "chunkInputs should include packKeyStr, msgLimit, recoveryLevel");
});

t("pwValue and canCopy helpers are defined", () => {
  assert.match(html, /const pwValue\s*=\s*id\s*=>\s*\$\("#"\+id\)\.value\.slice\(0,\s*PW_MAX\);/, "pwValue should slice password input to PW_MAX");
  assert.match(html, /const canCopy\s*=\s*\(\)\s*=>\s*!!\(navigator\.clipboard\s*&&\s*navigator\.clipboard\.writeText\)\s*\|\|\s*document\.queryCommandSupported\?\.\("copy"\);/, "canCopy should check clipboard API or fallback");
});

t("nextUnsentIndex helper is defined", () => {
  assert.match(html, /const nextUnsentIndex\s*=\s*\(\)\s*=>\s*lastChunks\.findIndex\(c\s*=>\s*!sentChunks\.has\(c\)\);/, "nextUnsentIndex should find first chunk not in sentChunks set");
});

t("customLimitErrorText helper is defined", () => {
  assert.match(html, /const customLimitErrorText\s*=\s*\(\)\s*=>\s*`Enter a whole number between \$\{CUSTOM_LIMIT_MIN\} and \$\{CUSTOM_LIMIT_MAX\.toLocaleString\(\)\}\.`;/, "customLimitErrorText should format bounds string");
});

t("modeBtns modes array is captured from .modes button selectors", () => {
  assert.match(html, /const modeBtns\s*=\s*\[\.\.\.document\.querySelectorAll\("\.modes button"\)\];/, "modeBtns should query all buttons in .modes");
});

t("copyoneTimers and flashState WeakMaps are defined for UI state management", () => {
  assert.match(html, /const copyoneTimers\s*=\s*new WeakMap\(\);/, "copyoneTimers WeakMap should be defined");
  assert.match(html, /const flashState\s*=\s*new WeakMap\(\);/, "flashState WeakMap should be defined");
});

t("logChoose and lbeta math helpers are defined", () => {
  assert.match(html, /const logChoose\s*=\s*\(n,\s*k\)\s*=>\s*\(k\s*<\s*0\s*\|\|\s*k\s*>\s*n\)\s*\?\s*-Infinity\s*:\s*lgamma\(n\s*\+\s*1\)\s*-\s*lgamma\(k\s*\+\s*1\)\s*-\s*lgamma\(n\s*-\s*k\s*\+\s*1\);/, "logChoose should compute log combinations");
  assert.match(html, /const lbeta\s*=\s*\(x,\s*y\)\s*=>\s*lgamma\(x\)\s*\+\s*lgamma\(y\)\s*-\s*lgamma\(x\s*\+\s*y\);/, "lbeta should compute log beta function");
});

t("uncodedParts and isStale helpers are defined", () => {
  assert.match(html, /const uncodedParts\s*=\s*layout\s*=>\s*layout\.reduce\(\(n,\s*blk\)\s*=>\s*n\s*\+\s*\(blk\.k\s*\?\s*0\s*:\s*blk\.n\),\s*0\);/, "uncodedParts should count parts in blocks without parity");
  assert.match(html, /const isStale\s*=\s*myToken\s*=>\s*!srcImage\s*\|\|\s*loadToken\s*!==\s*myToken;/, "isStale should check srcImage presence and loadToken match");
});

t("denseVersionOf codec version dispatch helper is defined", () => {
  assert.match(html, /const denseVersionOf\s*=\s*t\s*=>\s*\{/, "denseVersionOf helper should be defined");
  assert.match(html, /const off\s*=\s*t\.charCodeAt\(0\)\s*-\s*DENSE_BASE;/, "denseVersionOf should calculate offset from DENSE_BASE");
  assert.match(html, /return\s*\(off\s*>=\s*DENSE_HDR\s*&&\s*off\s*<\s*DENSE_HDR\s*\+\s*DENSE_CYCLE_BYTES\)\s*\?\s*1\s*:\s*\(off\s*>=\s*DENSE2_HDR\s*&&\s*off\s*<\s*DENSE2_HDR\s*\+\s*DENSE2_CYCLE_BYTES\)\s*\?\s*2\s*:\s*0;/, "denseVersionOf should distinguish v1 (0..2), v2 (3..9), and invalid (0)");
});

t("dec64 Base64 integer decoder helper is defined", () => {
  assert.match(html, /const dec64\s*=\s*str\s*=>\s*\{\s*let v\s*=\s*0;/, "dec64 helper should be defined");
  assert.match(html, /const cc\s*=\s*str\.charCodeAt\(i\);\s*const d\s*=\s*cc\s*<\s*ASCII_CODE_COUNT\s*\?\s*B64V\[cc\]\s*:\s*-1;/, "dec64 should guard ASCII range before B64V lookup");
});

t("CRC32_TABLE and crc32 checksum helper are defined", () => {
  assert.match(html, /const CRC_TABLE_SIZE\s*=\s*1\s*<<\s*8;/, "CRC_TABLE_SIZE should name the per-byte-value entry count");
  assert.match(html, /for\(let i=0;i<CRC_BYTES;i\+\+\) body\[plain\.length \+ i\] = \(crc >>> \(\(CRC_BYTES - 1 - i\) \* BITS_PER_BYTE\)\) & BYTE_MASK;/, "CRC trailer should be written big-endian off CRC_BYTES/BITS_PER_BYTE/BYTE_MASK");
  assert.match(html, /const CRC32_INIT\s*=\s*0xFFFFFFFF;/, "CRC32_INIT should name the all-ones register");
  assert.match(html, /const CRC32_TABLE\s*=\s*\(\(\)=>\{/, "CRC32_TABLE precomputation should be defined");
  assert.match(html, /const t\s*=\s*new Uint32Array\(CRC_TABLE_SIZE\);/, "CRC32_TABLE should size from CRC_TABLE_SIZE");
  assert.match(html, /function crc32\(bytes\)\{/, "crc32 function should be defined");
});

t("B64V reverse lookup table is initialized", () => {
  assert.match(html, /const B64V\s*=\s*\(\(\)=>\{\s*const v\s*=\s*new Int8Array\(ASCII_CODE_COUNT\)\.fill\(-1\);/, "B64V table should initialize ASCII_CODE_COUNT elements filled with -1");
});

t("GF14_EXP and GF14_LOG Galois field table allocations are defined", () => {
  assert.match(html, /const GF14_EXP\s*=\s*new Uint16Array\(2\s*\*\s*GF14_N\),\s*GF14_LOG\s*=\s*new Int32Array\(GF14_ORDER\)\.fill\(-1\);/, "GF14_EXP and GF14_LOG should allocate 2*GF14_N and GF14_ORDER elements");
});

t("enc64 Base64 integer encoder helper is defined", () => {
  assert.match(html, /function enc64\(v,\s*width\)\{/, "enc64 helper should be defined");
  assert.match(html, /if\(v\s*<\s*0\s*\|\|\s*v\s*>=\s*Math\.pow\(64,\s*width\)\)\s*return null;/, "enc64 should reject out-of-range values");
});

t("enc14 and dec14 dense integer encoder and decoder helpers are defined", () => {
  assert.match(html, /function enc14\(v,\s*width\)\{/, "enc14 function should be defined");
  assert.match(html, /function dec14\(str\)\{/, "dec14 function should be defined");
});

t("countedSends and sentChunks tracking sets are initialized", () => {
  assert.match(html, /const countedSends\s*=\s*new Set\(\);/, "countedSends Set should be initialized");
  assert.match(html, /const sentChunks\s*=\s*new Set\(\);/, "sentChunks Set should be initialized");
});

t("autofitOrigHtml captures the initial autofit button markup", () => {
  assert.match(html, /const autofitOrigHtml\s*=\s*\$\("#autofit"\)\.innerHTML;/, "autofitOrigHtml should capture innerHTML from #autofit");
});

t("fileInput and txtFile file input elements are captured", () => {
  assert.match(html, /const drop\s*=\s*\$\("#drop"\),\s*fileInput\s*=\s*\$\("#file"\);/, "fileInput should capture #file");
  assert.match(html, /const txtFile\s*=\s*\$\("#txtFile"\);/, "txtFile should capture #txtFile");
});

t("bytesToB64 and b64ToBytes byte conversion helpers are defined", () => {
  assert.match(html, /function bytesToB64\(bytes\)\{/, "bytesToB64 function should be defined");
  assert.match(html, /function b64ToBytes\(b64\)\{/, "b64ToBytes function should be defined");
});

t("bytesToDense and denseToBytes dense v1 conversion helpers are defined", () => {
  assert.match(html, /function bytesToDense\(bytes\)\{/, "bytesToDense function should be defined");
  assert.match(html, /function denseToBytes\(text\)\{/, "denseToBytes function should be defined");
});

t("bytesToDense2 and dense2ToBytes dense v2 conversion helpers are defined", () => {
  assert.match(html, /function bytesToDense2\(bytes\)\{/, "bytesToDense2 function should be defined");
  assert.match(html, /function dense2ToBytes\(text\)\{/, "dense2ToBytes function should be defined");
});

t("densePrefixBytes prefix extraction helper is defined", () => {
  assert.match(html, /function densePrefixBytes\(text,\s*want,\s*bits\s*=\s*DENSE_BITS\)\{/, "densePrefixBytes function should be defined");
});

t("dense2ByteLength dense v2 byte length calculator is defined", () => {
  assert.match(html, /function dense2ByteLength\(text\)\{/, "dense2ByteLength function should be defined");
});

t("yieldToMain cooperative scheduler yield helper is defined", () => {
  assert.match(html, /function yieldToMain\(\)\{/, "yieldToMain function should be defined");
});

t("rsMatrix Cauchy generator matrix builder is defined", () => {
  assert.match(html, /function rsMatrix\(rows,\s*n\)\{/, "rsMatrix function should be defined");
});

t("rsEncode and rsDecode Reed-Solomon codec functions are defined", () => {
  assert.match(html, /function rsEncode\(shards,\s*k\)\{/, "rsEncode function should be defined");
  assert.match(html, /function rsDecode\(n,\s*len,\s*present,\s*parity\)\{/, "rsDecode function should be defined");
});

t("lgamma and betaBinomTail statistical math helpers are defined", () => {
  assert.match(html, /function lgamma\(z\)\{/, "lgamma function should be defined");
  assert.match(html, /function betaBinomTail\(m,\s*k,\s*a,\s*b\)\{/, "betaBinomTail function should be defined");
});

t("binomTail binomial distribution tail helper is defined", () => {
  assert.match(html, /function binomTail\(m,\s*k,\s*p\)\{/, "binomTail function should be defined");
});

t("lossPosterior and observeSend Bayesian loss learning helpers are defined", () => {
  assert.match(html, /function lossPosterior\(\)\{/, "lossPosterior function should be defined");
  assert.match(html, /function observeSend\(r,\s*unarrived\)\{/, "observeSend function should be defined");
});

t("deriveKey and getKeyMaterial Web Crypto helpers are defined", () => {
  assert.match(html, /async function deriveKey\(password,\s*salt\)\{/, "deriveKey function should be defined");
  assert.match(html, /async function getKeyMaterial\(password\)\{/, "getKeyMaterial function should be defined");
  assert.match(html, /const AES_KEY_BITS\s*=\s*256;/, "AES_KEY_BITS should name the 256-bit key length");
  assert.match(html, /name:"AES-GCM",\s*length:AES_KEY_BITS\s*\}/, "deriveKey should use AES_KEY_BITS");
  assert.match(html, /return h\[MAGIC\.length\];/, "headerFlags should read the flags byte at MAGIC.length, matching where pack writes it");
  assert.match(html, /const GCM_TAG_BITS\s*=\s*128;/, "GCM_TAG_BITS should name the 128-bit AES-GCM tag");
  assert.match(html, /const SALT_BYTES\s*=\s*16,\s*IV_BYTES\s*=\s*12,\s*GCM_TAG_BYTES\s*=\s*GCM_TAG_BITS\s*\/\s*BITS_PER_BYTE;/, "GCM_TAG_BYTES should derive from GCM_TAG_BITS via BITS_PER_BYTE");
});

t("pack and unpack payload envelope functions are defined", () => {
  assert.match(html, /async function pack\(img,\s*mime,\s*password\)\{/, "pack function should be defined");
  assert.match(html, /async function unpack\(text,\s*password\)\{/, "unpack function should be defined");
});

t("chunkify and reassemble chunk pipeline functions are defined", () => {
  assert.match(html, /async function chunkify\(b64,\s*level\s*=\s*recoveryLevel\)\{/, "chunkify function should be defined");
  assert.match(html, /function reassemble\(text\)\{/, "reassemble function should be defined");
});

t("recordLoss and migrateLoss storage helpers are defined", () => {
  assert.match(html, /function recordLoss\(lost,\s*seen\)\{/, "recordLoss function should be defined");
  assert.match(html, /function migrateLoss\(\)\{/, "migrateLoss function should be defined");
});

t("rsBlockLayout block layout calculation helper is defined", () => {
  assert.match(html, /function rsBlockLayout\(total,\s*kFor,\s*ceiling\s*=\s*RS_BLOCK_CEILING\.b64\)\{/, "rsBlockLayout function should be defined");
});

t("imageProb probability model helper is defined", () => {
  assert.match(html, /function imageProb\(layout,\s*a,\s*b\)\{/, "imageProb function should be defined");
});

t("planParity parity planning helper is defined", () => {
  assert.match(html, /function planParity\(total,\s*target,\s*post,\s*ceiling\s*=\s*RS_BLOCK_CEILING\.b64\)\{/, "planParity function should be defined");
});

t("buildPlain and parsePlain envelope helpers are defined", () => {
  assert.match(html, /function buildPlain\(mime,\s*img\)\{/, "buildPlain function should be defined");
  assert.match(html, /function parsePlain\(bytes\)\{/, "parsePlain function should be defined");
  assert.match(html, /const FLAGS_BYTES\s*=\s*1;/, "FLAGS_BYTES should name the one-byte flags field");
  assert.match(html, /const HEADER_BYTES\s*=\s*MAGIC\.length\s*\+\s*FLAGS_BYTES;/, "HEADER_BYTES should derive from MAGIC.length + FLAGS_BYTES");
  assert.match(html, /const MIMELEN_FIELD\s*=\s*1;/, "MIMELEN_FIELD should name the one-byte length prefix");
  assert.match(html, /const MIMELEN_MAX\s*=\s*\(1\s*<<\s*BITS_PER_BYTE\)\s*-\s*1;/, "MIMELEN_MAX should be the one-byte maximum, derived from BITS_PER_BYTE");
  assert.match(html, /if\(m\.length\s*>\s*MIMELEN_MAX\)/, "buildPlain should guard against MIMELEN_MAX");
});

t("parityChunksB64 and parityChunksDense parity chunk generators are defined", () => {
  assert.match(html, /function parityChunksB64\(b64,\s*sid,\s*total,\s*per,\s*level,\s*tag\)\{/, "parityChunksB64 function should be defined");
  assert.match(html, /function parityChunksDense\(text,\s*sid,\s*total,\s*per,\s*level,\s*tag\)\{/, "parityChunksDense function should be defined");
});

t("reassembleParse message parsing helper is defined", () => {
  assert.match(html, /function reassembleParse\(text\)\{/, "reassembleParse function should be defined");
});

t("rsRepair error correction helper is defined", () => {
  assert.match(html, /function rsRepair\(map,\s*total,\s*parityRaw,\s*isDense\)\{/, "rsRepair function should be defined");
});

t("rsRepairB64 and rsRepairDense error correction wrappers are defined", () => {
  assert.match(html, /function rsRepairB64\(map,\s*total,\s*parityRaw\)\{/, "rsRepairB64 function should be defined");
  assert.match(html, /function rsRepairDense\(map,\s*total,\s*parityRaw\)\{/, "rsRepairDense function should be defined");
});

t("loadImage and detectAlpha image processing helpers are defined", () => {
  assert.match(html, /function loadImage\(file\)\{/, "loadImage function should be defined");
  assert.match(html, /function detectAlpha\(img\)\{/, "detectAlpha function should be defined");
});

t("drawScaled and encodeCanvas canvas rendering helpers are defined", () => {
  assert.match(html, /function drawScaled\(img,\s*maxDim\)\{/, "drawScaled function should be defined");
  assert.match(html, /function encodeCanvas\(cv,\s*q\)\{/, "encodeCanvas function should be defined");
});

t("compressOnce and autoFit image compression pipeline functions are defined", () => {
  assert.match(html, /const QUALITY_SCALE\s*=\s*100;/, "QUALITY_SCALE should name the 0..100 quality slider range");
  assert.match(html, /encodeCanvas\(cv,\s*quality\/QUALITY_SCALE\)/, "compressOnce should convert quality via QUALITY_SCALE");
  assert.match(html, /async function compressOnce\(maxDim,\s*quality\)\{/, "compressOnce function should be defined");
  assert.match(html, /async function autoFit\(onProgress\)\{/, "autoFit function should be defined");
  assert.match(html, /const ENC_OVERHEAD\s*=\s*SALT_BYTES\s*\+\s*IV_BYTES\s*\+\s*GCM_TAG_BYTES;/, "ENC_OVERHEAD should derive from the encrypted field sizes");
  assert.match(html, /const budget\s*=\s*\(\)\s*=>\s*targetBytes\(\)\s*-\s*\(HEADER_BYTES\s*\+\s*MIMELEN_FIELD\s*\+\s*MIME_LEN_EST\s*\+\s*\(\$\("#pass"\)\.value\s*\?\s*ENC_OVERHEAD\s*:\s*CRC_BYTES\)\);/, "autoFit budget should subtract named container overhead, not magic literals");
});

t("updateSendTitle and paintSent transmission UI helpers are defined", () => {
  assert.match(html, /function updateSendTitle\(\)\{/, "updateSendTitle function should be defined");
  assert.match(html, /function paintSent\(\)\{/, "paintSent function should be defined");
});

t("markSent and markSentBatch chunk delivery state helpers are defined", () => {
  assert.match(html, /function markSent\(c\)\{/, "markSent function should be defined");
  assert.match(html, /function markSentBatch\(chunks\)\{/, "markSentBatch function should be defined");
});

t("setOutputStale and showPlan transmission planning helpers are defined", () => {
  assert.match(html, /function setOutputStale\(stale\)\{/, "setOutputStale function should be defined");
  assert.match(html, /function showPlan\(\)\{/, "showPlan function should be defined");
});

t("chunkDataCount and showCompact card layout helpers are defined", () => {
  assert.match(html, /function chunkDataCount\(\)\{/, "chunkDataCount function should be defined");
  assert.match(html, /function showCompact\(\)\{/, "showCompact function should be defined");
});

t("makeChunkCard and updateChunkCard DOM card lifecycle helpers are defined", () => {
  assert.match(html, /function makeChunkCard\(c,\s*i,\s*dataParts\)\{/, "makeChunkCard function should be defined");
  assert.match(html, /function updateChunkCard\(el,\s*c,\s*i,\s*dataParts\)\{/, "updateChunkCard function should be defined");
});

t("renderChunks and setChunkText chunk rendering helpers are defined", () => {
  assert.match(html, /function renderChunks\(\)\{/, "renderChunks function should be defined");
  assert.match(html, /function setChunkText\(full\)\{/, "setChunkText function should be defined");
});

t("waitForIdle and syncPresets background coordination helpers are defined", () => {
  assert.match(html, /const WAIT_IDLE_TIMEOUT_MS\s*=\s*30000,\s*WAIT_IDLE_STEP_MS\s*=\s*50;/, "waitForIdle timing constants should be defined");
  assert.match(html, /function waitForIdle\(timeoutMs\s*=\s*WAIT_IDLE_TIMEOUT_MS,\s*stepMs\s*=\s*WAIT_IDLE_STEP_MS\)\{/, "waitForIdle function should use the named timing constants");
  assert.match(html, /function syncPresets\(\)\{/, "syncPresets function should be defined");
});

t("queuePersist and flushPersist preference persistence helpers are defined", () => {
  assert.match(html, /function queuePersist\(k,\s*v\)\{/, "queuePersist function should be defined");
  assert.match(html, /function flushPersist\(\)\{/, "flushPersist function should be defined");
});

t("parseCustomLimit and applyCustomLimit character limit helpers are defined", () => {
  assert.match(html, /function parseCustomLimit\(raw\)\{/, "parseCustomLimit function should be defined");
  assert.match(html, /function applyCustomLimit\(\)\{/, "applyCustomLimit function should be defined");
});

t("pwScore and pwTruncNote password validation helpers are defined", () => {
  assert.match(html, /function pwScore\(v\)\{/, "pwScore function should be defined");
  assert.match(html, /const PW_LEN_TIERS\s*=\s*\[8,\s*12,\s*16\];/, "PW_LEN_TIERS should name the length thresholds");
  assert.match(html, /const len = PW_LEN_TIERS\.reduce\(\(a, t\) => a \+ \(v\.length >= t \? 1 : 0\), 0\);/, "pwScore should score length by counting PW_LEN_TIERS reached");
  assert.match(html, /const PW_VARIETY_MIN\s*=\s*3;/, "PW_VARIETY_MIN should name the variety-bonus threshold");
  assert.match(html, /variety >= PW_VARIETY_MIN \? 1 : 0/, "pwScore should gate the variety bonus on PW_VARIETY_MIN");
  assert.match(html, /return Math\.max\(1, Math\.min\(PW_LABELS\.length - 1, s\)\);/, "pwScore should clamp to the last PW_LABELS index, not a literal 4");
  assert.match(html, /function pwTruncNote\(id,\s*noteId\)\{/, "pwTruncNote function should be defined");
});

t("updatePwStrength and applyPreset configuration helpers are defined", () => {
  assert.match(html, /function updatePwStrength\(\)\{/, "updatePwStrength function should be defined");
  assert.match(html, /function applyPreset\(q,\s*d\)\{/, "applyPreset function should be defined");
});

t("setTuneDisabled and downloadURL UI utility helpers are defined", () => {
  assert.match(html, /function setTuneDisabled\(off\)\{/, "setTuneDisabled function should be defined");
  assert.match(html, /function downloadURL\(url,\s*filename\)\{/, "downloadURL function should be defined");
});

t("writeToClipboard async clipboard interaction helper is defined", () => {
  assert.match(html, /async function writeToClipboard\(text\)\{/, "writeToClipboard function should be defined");
});

t("flashButton and cancelFlash feedback animation helpers are defined", () => {
  assert.match(html, /function flashButton\(btn,\s*msg,\s*ariaMsg,\s*ms\s*=\s*2000\)\{/, "flashButton function should be defined");
  assert.match(html, /function cancelFlash\(btn\)\{/, "cancelFlash function should be defined");
});

t("showDropErr and clearDropErr drag-and-drop feedback helpers are defined", () => {
  assert.match(html, /function showDropErr\(msg\)\{/, "showDropErr function should be defined");
  assert.match(html, /function clearDropErr\(\)\{/, "clearDropErr function should be defined");
});

t("handleFile file drop and selection processing function is defined", () => {
  assert.match(html, /async function handleFile\(file\)\{/, "handleFile function should be defined");
});

t("resetSend transmission state reset helper is defined", () => {
  assert.match(html, /function resetSend\(\)\{/, "resetSend function should be defined");
});

t("updateProgress reception progress display helper is defined", () => {
  assert.match(html, /function updateProgress\(\)\{/, "updateProgress function should be defined");
});

t("payloadBytes and formatParts message inspection helpers are defined", () => {
  assert.match(html, /function payloadBytes\(r\)\{/, "payloadBytes function should be defined");
  assert.match(html, /function formatParts\(nums\)\{/, "formatParts function should be defined");
});

t("missingList and headerFlags diagnostic helpers are defined", () => {
  assert.match(html, /function missingList\(r\)\{/, "missingList function should be defined");
  assert.match(html, /function headerFlags\(s\)\{/, "headerFlags function should be defined");
});

t("maybeAutoReveal and clearReveal recovery state helpers are defined", () => {
  assert.match(html, /function maybeAutoReveal\(\)\{/, "maybeAutoReveal function should be defined");
  assert.match(html, /function clearReveal\(\)\{/, "clearReveal function should be defined");
});

t("resetReceive reception lifecycle teardown helper is defined", () => {
  assert.match(html, /function resetReceive\(\)\{/, "resetReceive function should be defined");
});

t("loadTextFile and doReveal message decoding functions are defined", () => {
  assert.match(html, /function loadTextFile\(file\)\{/, "loadTextFile function should be defined");
  assert.match(html, /async function doReveal\(\)\{/, "doReveal function should be defined");
});

t("bindZoom and maskPassword UI interaction helpers are defined", () => {
  assert.match(html, /function bindZoom\(imgId,\s*getUrl,\s*noteId\)\{/, "bindZoom function should be defined");
  assert.match(html, /function maskPassword\(id\)\{/, "maskPassword function should be defined");
});

t("beforeprint and afterprint window handlers update chunk rendering for print", () => {
  assert.match(html, /window\.addEventListener\("beforeprint",\s*\(\)=>setChunkText\(true\)\);/, "beforeprint listener should be registered");
  assert.match(html, /window\.addEventListener\("afterprint",\s*\(\)=>setChunkText\(false\)\);/, "afterprint listener should be registered");
});

t("chunks container registers copy event listener for custom copy behavior", () => {
  assert.match(html, /\$\("#chunks"\)\.addEventListener\("copy",\s*e=>\{/, "chunks copy listener should be registered");
});

t("pagehide and pageshow lifecycle event listeners are registered", () => {
  assert.match(html, /window\.addEventListener\("pagehide",\s*\(\)=>\{/, "pagehide listener should be registered");
  assert.match(html, /window\.addEventListener\("pageshow",\s*e=>\{/, "pageshow listener should be registered");
});

t("pwtoggle buttons bind click events and maskPassword helper is defined", () => {
  assert.match(html, /document\.querySelectorAll\("\.pwtoggle"\)\.forEach\(btn=>\{/, "pwtoggle elements should be bound");
  assert.match(html, /function maskPassword\(id\)\{/, "maskPassword function should be defined");
});

t("saveTxt and loadTxt text transport action listeners are registered", () => {
  assert.match(html, /\$\("#saveTxt"\)\.addEventListener\("click",\s*\(\)=>\{/, "saveTxt click listener should be registered");
  assert.match(html, /\$\("#loadTxt"\)\.addEventListener\("click",\s*\(\)=>txtFile\.click\(\)\);/, "loadTxt click listener should be registered");
});

t("pasteInbox and copyMissing reception action listeners are registered", () => {
  assert.match(html, /\$\("#pasteInbox"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "pasteInbox click listener should be registered");
  assert.match(html, /\$\("#copyMissing"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "copyMissing click listener should be registered");
});

t("startOver button registers click event listener to reset transmission", () => {
  assert.match(html, /\$\("#startOver"\)\.addEventListener\("click",\s*resetSend\);/, "startOver click listener should be registered");
});

t("clearInbox button registers click event listener to reset reception", () => {
  assert.match(html, /\$\("#clearInbox"\)\.addEventListener\("click",\s*resetReceive\);/, "clearInbox click listener should be registered");
});

t("footer year notice and application version banner are dynamically populated", () => {
  assert.match(html, /const COPYRIGHT_SINCE\s*=\s*\d{4};/, "COPYRIGHT_SINCE should be the single source for the copyright floor year");
  assert.match(html, /\$\("#year"\)\.textContent\s*=\s*Math\.max\(COPYRIGHT_SINCE,\s*new Date\(\)\.getFullYear\(\)\);/, "footer copyright year should be computed dynamically from COPYRIGHT_SINCE");
  assert.match(html, /verEl\.textContent\s*=\s*`v\$\{APP_VERSION\}`;/, "appVersion element should display current version");
});

t("markup #year no-JS floor matches the COPYRIGHT_SINCE constant", () => {
  // The static <span id="year"> is what a no-JS reader sees; JS overwrites it only when scripting runs.
  // It must equal COPYRIGHT_SINCE, or a bump to one silently drifts from the other (PR #596 invariant).
  const since = /const COPYRIGHT_SINCE\s*=\s*(\d{4});/.exec(html);
  assert.ok(since, "COPYRIGHT_SINCE constant should exist");
  const markup = /<span id="year">(\d{4})<\/span>/.exec(html);
  assert.ok(markup, "markup should carry a static #year floor for no-JS readers");
  assert.equal(markup[1], since[1], "markup #year floor must equal COPYRIGHT_SINCE");
});

t("quality slider input listener updates quality and queues persist", () => {
  assert.match(html, /\$\("#quality"\)\.addEventListener\("input",\s*e=>\{\s*const v\s*=\s*e\.target\.value;\s*setQuality\(v\);/, "quality slider input listener should be registered");
});

t("maxdim dropdown change listener syncs presets and queues refresh", () => {
  assert.match(html, /\$\("#maxdim"\)\.addEventListener\("change",\s*e=>\{\s*queuePersist\(LS_MAXDIM,\s*e\.target\.value\);\s*syncPresets\(\);/, "maxdim change listener should be registered");
});

t("chatLimit select change listener handles limit selection and persistence", () => {
  assert.match(html, /\$\("#chatLimit"\)\.addEventListener\("change",\s*e=>\{/, "chatLimit change listener should be registered");
});

t("recovery and compact codec change listeners persist user selections", () => {
  assert.match(html, /\$\("#recovery"\)\.addEventListener\("change",\s*e=>\{\s*recoveryLevel\s*=\s*e\.target\.value;/, "recovery change listener should be registered");
  assert.match(html, /\$\("#compact"\)\.addEventListener\("change",\s*e=>\{\s*textCodec\s*=\s*e\.target\.value;/, "compact change listener should be registered");
});

t("pass input listeners clear key cache and update strength indicators", () => {
  assert.match(html, /\$\("#pass"\)\.addEventListener\("input",\s*\(\)=>\{\s*keyCache\s*=\s*null;\s*\}\);/, "pass input listener should clear keyCache");
  assert.match(html, /\$\("#pass"\)\.addEventListener\("input",\s*updatePwStrength\);/, "pass input listener should update strength");
});

t("autofit and copyAll button click listeners initiate pipeline actions", () => {
  assert.match(html, /\$\("#autofit"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "autofit click listener should be registered");
  assert.match(html, /\$\("#copyAll"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "copyAll click listener should be registered");
});

t("copyNext and copyRest transmission progression listeners are registered", () => {
  assert.match(html, /\$\("#copyNext"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "copyNext click listener should be registered");
  assert.match(html, /\$\("#copyRest"\)\.addEventListener\("click",\s*async\s*\(\)=>\{/, "copyRest click listener should be registered");
});

t("resetSent click listener resets transmitted chunk state", () => {
  assert.match(html, /\$\("#resetSent"\)\.addEventListener\("click",\s*\(\)=>\{/, "resetSent click listener should be registered");
});

t("drop zone keyboard activation and change listeners are registered", () => {
  assert.match(html, /drop\.addEventListener\("keydown",\s*e=>\{\s*if\(e\.key==="Enter"\|\|e\.key===" "\)/, "drop zone keyboard listener should be registered");
  assert.match(html, /fileInput\.addEventListener\("change",\s*e=>\{\s*const f=e\.target\.files\[0\];/, "fileInput change listener should be registered");
});

t("lossReset button click listener clears loss statistics", () => {
  assert.match(html, /\$\("#lossReset"\)\.addEventListener\("click",\s*\(\)=>\{/, "lossReset click listener should be registered");
});

t("chatLimitCustom input listener handles custom character limits", () => {
  assert.match(html, /\$\("#chatLimitCustom"\)\.addEventListener\("input",\s*\(\)=>\{/, "chatLimitCustom input listener should be registered");
});

t("password input listeners trigger truncation advisory notes", () => {
  assert.match(html, /\$\("#pass"\)\.addEventListener\("input",\s*\(\)=>pwTruncNote\("pass",\s*"passTrunc"\)\);/, "pass input should trigger pwTruncNote");
  assert.match(html, /\$\("#rpass"\)\.addEventListener\("input",\s*\(\)=>pwTruncNote\("rpass",\s*"rpassTrunc"\)\);/, "rpass input should trigger pwTruncNote");
});

t("preset buttons click listeners apply configured quality and dimension presets", () => {
  assert.match(html, /b\.addEventListener\("click",\s*\(\)=>\{\s*if\(srcImage\)\s*applyPreset\(\+b\.dataset\.q,\s*\+b\.dataset\.d\);\s*\}\);/, "preset button click listeners should apply presets");
});

t("document paste event listener handles pasted images in send mode", () => {
  assert.match(html, /document\.addEventListener\("paste",\s*e=>\{\s*if\(sendHidden\(\)\)\s*return;/, "document paste listener should handle images in send mode");
});

t("inbox textarea input and paste listeners update reception progress", () => {
  assert.match(html, /\$\("#inbox"\)\.addEventListener\("input",\s*\(\)=>\{\s*clearTimeout\(progDebounce\);/, "inbox input listener should debounce progress update");
  assert.match(html, /\$\("#inbox"\)\.addEventListener\("paste",\s*\(\)=>\{\s*setTimeout\(\(\)=>\{/, "inbox paste listener should trigger progress and autoReveal");
});

t("reveal button click listener binds decoding pipeline", () => {
  assert.match(html, /\$\("#reveal"\)\.addEventListener\("click",\s*doReveal\);/, "reveal click listener should trigger doReveal");
});

t("save and recvAnother buttons register click handlers for post-reveal actions", () => {
  assert.match(html, /\$\("#save"\)\.addEventListener\("click",\s*\(\)=>\{/, "save click listener should trigger download");
  assert.match(html, /\$\("#recvAnother"\)\.addEventListener\("click",\s*\(\)=>\{/, "recvAnother click listener should reset reception view");
});

t("rpass field and window keydown listeners provide keyboard shortcuts for reveal", () => {
  assert.match(html, /\$\("#rpass"\)\.addEventListener\("keydown",\s*e=>\{\s*if\(e\.key==="Enter"\)\{\s*e\.preventDefault\(\);\s*doReveal\(\);\s*\}\s*\}\);/, "rpass Enter keydown listener should trigger doReveal");
  assert.match(html, /document\.addEventListener\("keydown",\s*e=>\{\s*if\(e\.key==="Enter"&&\(e\.ctrlKey\|\|e\.metaKey\)&&recvVisible\(\)\)\{\s*e\.preventDefault\(\);\s*doReveal\(\);\s*\}\s*\}\);/, "Cmd/Ctrl+Enter shortcut should trigger doReveal");
});

console.log(`\n${pass} passed`);












