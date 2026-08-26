// queuePersist/flushPersist batch every settings write behind one 250ms debounce so a quality-slider drag
// doesn't hit localStorage on every pixel. Real logic (coalescing, last-write-wins per key, a manual flush
// that must cancel the pending timer rather than double-write) with no prior test — DOM-free enough to run
// with real timers under plain node, the same way test/responsiveness.mjs already waits on real setTimeout.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const store = new Map();
const src = [
  "const lsSet = (k,v) => store.set(k, String(v));",
  html.slice(html.indexOf("let persistTimer"), html.indexOf('$("#quality").addEventListener')),
  "globalThis.__P = { queuePersist, flushPersist };",
].join("\n");
new Function("store", src)(store);
const { queuePersist, flushPersist } = globalThis.__P;
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0;
const t = async (n, f) => { await f(); console.log("  ok  " + n); pass++; };

await t("a single queuePersist call lands in the store after the debounce elapses", async () => {
  store.clear();
  queuePersist("k1", "v1");
  assert.equal(store.has("k1"), false, "must not write synchronously");
  await wait(300);
  assert.equal(store.get("k1"), "v1");
});

await t("several calls inside the debounce window coalesce into one flush with every key", async () => {
  store.clear();
  queuePersist("a", "1");
  queuePersist("b", "2");
  queuePersist("c", "3");
  await wait(300);
  assert.equal(store.get("a"), "1");
  assert.equal(store.get("b"), "2");
  assert.equal(store.get("c"), "3");
});

await t("the same key persisted twice before flush: last write wins, not first", async () => {
  store.clear();
  queuePersist("k", "old");
  queuePersist("k", "new");
  await wait(300);
  assert.equal(store.get("k"), "new");
});

await t("each queuePersist call restarts the debounce clock — a steady drip never flushes early", async () => {
  store.clear();
  queuePersist("k", "1");
  await wait(150);
  queuePersist("k", "2");   // restarts the 250ms window before the first one would have fired
  await wait(150);
  assert.equal(store.has("k"), false, "300ms of drip at 150ms intervals must not have flushed yet");
  await wait(150);
  assert.equal(store.get("k"), "2");
});

await t("a manual flushPersist writes immediately and cancels the pending timer", async () => {
  store.clear();
  queuePersist("k", "v");
  flushPersist();
  assert.equal(store.get("k"), "v", "must be written synchronously by the manual call");
  store.delete("k");
  await wait(300);   // if the original timer wasn't cancelled, it would re-fire and rewrite "k"
  assert.equal(store.has("k"), false, "the cancelled timer must not have fired a second write");
});

await t("flushPersist with nothing pending is a safe no-op", async () => {
  store.clear();
  flushPersist();
  assert.equal(store.size, 0);
});

await t("queuePersist(key, undefined) writes the literal string \"undefined\", not a no-op or a throw", async () => {
  // lsSet's String(v) coercion turns a missing value into the 10-character string "undefined" rather
  // than skipping the write — never hit by any current call site (every one always passes a real value),
  // but a real, surprising failure mode worth pinning down rather than leaving as an unverified assumption
  store.clear();
  queuePersist("k", undefined);
  flushPersist();
  assert.equal(store.get("k"), "undefined");
});

console.log(`\n${pass} passed`);
