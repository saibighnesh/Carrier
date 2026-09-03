// The loss model's integrity: counted once, learns from failure, kept per transport, cost-capped.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<0)throw new Error("marker "+(i<0?a:b));return html.slice(i,j);};
const store = new Map();
const src = [
  "let msgLimit = 60000; let recoveryLevel = 'off'; let textCodec = 'b64';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const maxChunkIndexFor = (total, recoveryOn) => recoveryOn ? total * 2 : total;",
  "const MAGIC=[0x50,0x58,0x54,0x31];",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  "globalThis.__M = { pack, chunkify, reassemble, planParity, lossPosterior, recordLoss, observeSend, countedSends, setLimit:v=>{msgLimit=v}, RS_COST_CAP, RS_BLOCK };",
].join("\n");
new Function("store", src)(store);
const { pack, chunkify, reassemble, planParity, lossPosterior, observeSend, countedSends, setLimit, RS_COST_CAP, RS_BLOCK } = globalThis.__M;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};
const idxOf=c=>+c.match(/^PXT\/[0-9a-f]+\/(\d+)\//)[1];
const img = Uint8Array.from({length:2600},(_,i)=>(i*37+11)&0xff);
const reset = () => { store.clear(); countedSends.clear(); };

await t("#208: revealing the same send repeatedly counts it exactly once", async () => {
  reset(); setLimit(160);
  const cs = await chunkify(await pack(img,"image/webp",""), "strong");
  const r = reassemble(cs.filter(c=>![2,5].includes(idxOf(c))).join("\n\n"));
  assert.equal(r.repaired, 2);
  observeSend(r, 0);
  const first = store.get("carrier_loss_160");
  observeSend(r, 0); observeSend(r, 0); observeSend(r, 0);
  assert.equal(store.get("carrier_loss_160"), first, `counted again: ${first} -> ${store.get("carrier_loss_160")}`);
  console.log(`      (4 observations of one send -> stored ${first})`);
});

await t("#208: two genuinely different sends both count", async () => {
  reset(); setLimit(160);
  for (const seed of [1, 2]) {
    const im = Uint8Array.from({length:2600},(_,i)=>(i*seed+3)&0xff);
    const cs = await chunkify(await pack(im,"image/webp",""), "strong");
    observeSend(reassemble(cs.filter(c=>idxOf(c)!==3).join("\n\n")), 0);
  }
  const [L,N] = store.get("carrier_loss_160").split(",").map(Number);
  assert.equal(L, 2, "both sends' losses must count");
  assert.ok(N > 20, `both sends' denominators must count, got ${N}`);
});

await t("#209: an unrecoverable send is counted as the failure it was", async () => {
  reset(); setLimit(160);
  const cs = await chunkify(await pack(img,"image/webp",""), "light");
  const total = +cs[0].match(/\/(\d+)\/[^/]*$/)[1];
  const k = cs.length - total;
  const doomed = Array.from({length: k + 3}, (_,i)=> i + 2);
  const r = reassemble(cs.filter(c=>!doomed.includes(idxOf(c))).join("\n\n"));
  assert.ok(r.missing.length > 0, "need an unrecoverable send for this test");
  observeSend(r, r.missing.length);
  const [L,N] = store.get("carrier_loss_160").split(",").map(Number);
  assert.equal(L, r.repaired + r.missing.length, "losses must include the parts that never arrived");
  assert.equal(N, total);
  console.log(`      (${r.repaired} rebuilt + ${r.missing.length} never arrived of ${total} -> ${L},${N})`);
});

await t("#209: a send with no recovery is still not treated as evidence", async () => {
  reset(); setLimit(160);
  const cs = await chunkify(await pack(img,"image/webp",""), "off");
  const r = reassemble(cs.filter(c=>idxOf(c)!==3).join("\n\n"));
  observeSend(r, r.missing.length);
  assert.equal(store.get("carrier_loss_160"), undefined, "a parity-less send must teach nothing");
});

await t("#210: evidence is kept per transport and does not leak", async () => {
  reset();
  setLimit(160);
  const cs = await chunkify(await pack(img,"image/webp",""), "strong");
  observeSend(reassemble(cs.filter(c=>![2,5].includes(idxOf(c))).join("\n\n")), 0);
  const sms = lossPosterior();
  setLimit(60000);
  const wa = lossPosterior();
  assert.equal(wa.seen, 0, "WhatsApp must start from the prior");
  assert.ok(sms.seen > 0, "SMS must hold its own evidence");
  setLimit(160);
  assert.equal(lossPosterior().seen, sms.seen, "returning to SMS must find its evidence intact");
  assert.deepEqual([...store.keys()], ["carrier_loss_160"]);
});

await t("#210: legacy single-key evidence is migrated on first read, not discarded", () => {
  // migration is lazy by design, so it must fire on the first posterior read rather than at load
  const s2 = new Map([["carrier_loss", "7,50"]]);
  new Function("store", src)(s2);
  const api = globalThis.__M;
  assert.equal(s2.get("carrier_loss"), "7,50", "must not have migrated merely by loading");
  const post = api.lossPosterior();
  assert.equal(s2.get("carrier_loss"), undefined, "legacy key must be removed on first read");
  assert.equal(s2.get("carrier_loss_60000"), "7,50", "evidence must land on the selected app");
  assert.equal(post.lost, 7); assert.equal(post.seen, 50);
  // and the migrated evidence must be the posterior the very first read returns, not the read after
  assert.equal(post.a, 1 + 7);
});

await t("#211: the cost ceiling holds, and capping is reported", () => {
  reset();
  const bad = planParity(24, 0.99, {a:30, b:70});      // ~30% loss
  assert.ok(bad.k <= Math.ceil(24 * RS_COST_CAP), `k=${bad.k} exceeds the cost cap`);
  assert.equal(bad.met, false);
  assert.equal(bad.capped, true, "must report that the search was cost-limited");
  console.log(`      (30% loss, 24 parts: k=${bad.k} not 23, P=${(bad.imageProb*100).toFixed(1)}%, capped)`);
  // a clean pipe must be unaffected by the cap
  const good = planParity(24, 0.99, {a:1, b:499});
  assert.equal(good.met, true);
  assert.equal(good.capped, false);
  assert.ok(good.k < Math.ceil(24 * RS_COST_CAP));
});

await t("#211: parity never exceeds half the data parts in a real send", async () => {
  reset(); setLimit(160);
  for (let i = 0; i < 20; i++) recordLossViaObserve();
  function recordLossViaObserve(){}
  store.set("carrier_loss_160", "60,200");             // 30% measured
  const cs = await chunkify(await pack(img,"image/webp",""), "auto");
  const total = +cs[0].match(/\/(\d+)\/[^/]*$/)[1];
  const parity = cs.length - total;
  const perBlockCap = Math.ceil(Math.min(RS_BLOCK, total) * RS_COST_CAP);
  const blocks = Math.ceil(total / RS_BLOCK);
  assert.ok(parity <= perBlockCap * blocks, `${parity} parity exceeds cap ${perBlockCap}x${blocks}`);
  console.log(`      (30% measured: ${total} data + ${parity} parity, cap ${perBlockCap}/block)`);
});

await t("countedSends is scoped per app, so a scoped reset doesn't affect other apps' dedup", async () => {
  // #lossReset only clears the CURRENT app's stored posterior and (as of this fix) its countedSends
  // entries — the same underlying bug this guards against: without app-scoping in the key, either the
  // reset app could never re-count an already-seen send, or clearing the whole Set would let an
  // untouched app's already-counted send double-count if revisited.
  reset(); setLimit(160);
  const cs = await chunkify(await pack(img,"image/webp",""), "strong");
  const r = reassemble(cs.filter(c=>![2,5].includes(idxOf(c))).join("\n\n"));
  observeSend(r, 0);   // counts under SMS (160)
  const smsFirst = store.get("carrier_loss_160");
  assert.ok(smsFirst);
  setLimit(60000);
  observeSend(r, 0);   // the SAME send, but now under WhatsApp — a different app, must count separately
  assert.ok(store.get("carrier_loss_60000"), "the same send observed under a different app must count for that app too");
  // simulate #lossReset for WhatsApp only
  store.delete("carrier_loss_60000");
  for(const key of [...countedSends]) if(key.startsWith("60000:")) countedSends.delete(key);
  observeSend(r, 0);   // re-observe under WhatsApp after ITS reset — must count again
  assert.ok(store.get("carrier_loss_60000"), "WhatsApp must accept new evidence after its own reset — this was the bug: an unscoped key never forgot it");
  // SMS was never reset — re-observing the same send there must still be deduped
  setLimit(160);
  observeSend(r, 0);
  assert.equal(store.get("carrier_loss_160"), smsFirst, "SMS's dedup must be untouched by WhatsApp's reset");
});

console.log(`\n${pass} passed`);
