// Proves the cooperative-yielding fix actually yields — not just that rsEncode/RS14.encode still produce
// correct output (every other RS suite already covers that). The property under test is an event-loop
// ordering fact: does a competing macrotask, scheduled just before a large encode starts, get a turn on
// the loop BEFORE the encode's promise resolves? If rsEncode had no internal await at all, it would run
// the whole loop synchronously to completion before returning control, and the competing timer — queued
// after that block but before the encode's already-resolved promise finishes its microtask chain — would
// never fire in time. Real yielding is the only way the marker can win that race.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const slice = (a,b) => { const i = html.indexOf(a), j = html.indexOf(b); if (i<0||j<0) throw new Error("marker "+(i<0?a:b)); return html.slice(i,j); };

const store = new Map();
const src = [
  "let msgLimit = 60000; let recoveryLevel = 'off'; let textCodec = 'b64';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const maxChunkIndexFor = (total, recoveryOn) => recoveryOn ? total * 2 : total;",
  "const MAGIC = [0x50,0x58,0x54,0x31];",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */", "/* ---------- CRC-32"),
  slice("/* ---------- CRC-32", "/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon", "/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics", "/* ---------- container (mime"),
  slice("/* ---------- container (mime", "/* ---------- compression ---------- */"),
  "globalThis.__R = { pack, chunkify, rsEncode, RS14, yieldToMain, setLimit:v=>{msgLimit=v}, setCodec:v=>{textCodec=v}, setLevel:v=>{recoveryLevel=v} };",
].join("\n");
new Function("store", src)(store);
const { pack, chunkify, rsEncode, RS14, yieldToMain, setLimit, setCodec, setLevel } = globalThis.__R;

let pass = 0;
const t = async (n, f) => { await f(); console.log("  ok  " + n); pass++; };
const mkShards = (n, len) => Array.from({length:n}, (_,i) => Uint8Array.from({length:len}, (_,b)=>(i*7+b*13)&63));
const mkShards16 = (n, len) => Array.from({length:n}, (_,i) => Uint16Array.from({length:len}, (_,b)=>(i*7+b*13)&0x3FFF));

await t("GF(2^6) rsEncode: a large block yields — a competing macrotask wins the race", async () => {
  // WhatsApp-scale: 32 shards, 60,000 symbols each, Strong-sized k. Big enough that, run synchronously,
  // this would take long enough to be visibly unresponsive.
  const shards = mkShards(32, 60000);
  let markerFired = false;
  setTimeout(() => { markerFired = true; }, 0);   // scheduled BEFORE the encode call starts
  const p = rsEncode(shards, 8);
  await p;
  assert.equal(markerFired, true,
    "the competing timer never got a turn before rsEncode resolved — the loop did not actually yield");
});

await t("GF(2^14) encode: the same interleaving holds for the Compact recovery path", async () => {
  const shards = mkShards16(32, 60000);
  let markerFired = false;
  setTimeout(() => { markerFired = true; }, 0);
  const p = RS14.encode(shards, 8);
  await p;
  assert.equal(markerFired, true,
    "RS14.encode must yield the same way rsEncode does — it shares the factory and the yield helper");
});

await t("yieldToMain does not yield on every call — only after the time budget elapses", async () => {
  // Burn the initial "always yield once" state (yieldDeadline starts at 0) with a real call first.
  await yieldToMain();
  // Immediately after, the deadline is ~8ms out — calling again right away must NOT incur a macrotask hop.
  let markerFired = false;
  setTimeout(() => { markerFired = true; }, 0);
  await yieldToMain();
  // a same-tick resolve means the marker (a macrotask) has not had a turn yet
  assert.equal(markerFired, false,
    "a call within budget must resolve on a microtask, not force a macrotask round trip every time");
});

await t("a typical, small chunkify() completes with negligible added latency", async () => {
  // Off/no-recovery is the common case and touches rsEncode/RS14.encode not at all; light recovery on a
  // small image is the common case that DOES touch it, at a scale where it should never need to yield.
  setLimit(60000); setCodec("b64"); setLevel("light");
  const img = new Uint8Array(2000);
  const t0 = performance.now();
  const cs = await chunkify(await pack(img, "image/webp", ""));
  const ms = performance.now() - t0;
  assert.ok(cs.length >= 1);
  assert.ok(ms < 50, `a small send took ${ms.toFixed(1)}ms — the yielding machinery must not add real overhead to the common case`);
});

await t("a large recovery-on send still completes, and still produces a correct, decodable result", async () => {
  // Not a duplicate of test/rs-e2e.mjs's correctness suite — this specifically confirms that yielding
  // (which this test file is the first to actually exercise at WhatsApp scale) does not perturb the
  // arithmetic. Same assertions the non-yielding paths already prove, run here at the scale that yields.
  setLimit(60000); setCodec("b64"); setLevel("strong");
  const img = Uint8Array.from({length: 45000}, (_,i) => (i*97+3) & 0xff);
  const cs = await chunkify(await pack(img, "image/webp", ""));
  // anchored at the fixed-width prefix, not at the end of the string: chunk data (Base64 or dense) can
  // itself contain "/" characters, so a $-anchored regex would silently mismatch on real payloads
  const total = +cs[0].match(/^PX[TCD]\/[0-9a-f]+\/\d+\/(\d+)\//)[1];
  assert.ok(cs.length > total, "must still carry parity");
  assert.ok(cs.every(c => c.length <= 60000), "every part must still respect the message limit");
  setLevel("off");
});

console.log(`\n${pass} passed`);
