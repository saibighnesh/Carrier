// copyAllLabel() decides the #copyAll button's label: "Copy message" for a single-part payload (where
// "all" would be a strange thing to say about one message) vs "Copy all messages" otherwise. Depends only
// on the module-level lastChunks array's length, exposed here via a setter — the same injectable-state
// pattern test/renderchunks.mjs already uses for chunkCardContent. Zero prior test coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const src = [
  html.slice(html.indexOf("let lastChunks"), html.indexOf("// which parts have already gone out")),
  "globalThis.__CAL = { copyAllLabel, setLastChunks: v => { lastChunks = v; } };",
].join("\n");
new Function(src)();
const { copyAllLabel, setLastChunks } = globalThis.__CAL;

let pass = 0;
const t = (n, f) => { f(); console.log("  ok  " + n); pass++; };

t("exactly one chunk: the singular label", () => {
  setLastChunks(["PXT/aa/1/1/data"]);
  assert.equal(copyAllLabel(), "Copy message");
});

t("two chunks: the plural label", () => {
  setLastChunks(["PXT/aa/1/2/data1", "PXT/aa/2/2/data2"]);
  assert.equal(copyAllLabel(), "Copy all messages");
});

t("many chunks: still the plural label", () => {
  setLastChunks(Array.from({length: 50}, (_, i) => `PXT/aa/${i+1}/50/data`));
  assert.equal(copyAllLabel(), "Copy all messages");
});

t("zero chunks (nothing packed yet): the check is === 1, so this also falls to the plural label", () => {
  setLastChunks([]);
  assert.equal(copyAllLabel(), "Copy all messages");
});

console.log(`\n${pass} passed`);
