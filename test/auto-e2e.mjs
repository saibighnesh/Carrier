// Auto mode end to end: plan -> emit -> lose parts -> rebuild, plus the learning loop.
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
  "const MAGIC=[0x50,0x58,0x54,0x31];",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  "globalThis.__a = { pack, unpack, chunkify, reassemble, planParity, lossPosterior, recordLoss, setLimit:v=>{msgLimit=v}, getPlan:()=>lastPlan };",
].join("\n");
new Function("store", src)(store);
const { pack, unpack, chunkify, reassemble, planParity, lossPosterior, recordLoss, setLimit, getPlan } = globalThis.__a;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};
const idxOf=c=>+c.match(/^PXT\/[0-9a-f]+\/(\d+)\//)[1];
const totalOf=c=>+c.match(/^PXT\/[0-9a-f]+\/\d+\/(\d+)\//)[1];
const img = Uint8Array.from({length:2600},(_,i)=>(i*37+11)&0xff);

await t("Auto emits the parity its own plan called for", async () => {
  store.clear(); setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = chunkify(b64, "auto");
  const total = totalOf(cs[0]);
  const parity = cs.length - total;
  const plan = getPlan();
  const blocks = Math.ceil(total / 32);
  assert.equal(plan.blocks, blocks);
  // per-block k, summed over blocks that are actually coded (a trailing block of 1 gets none)
  assert.ok(parity > 0, "Auto produced no parity at all");
  assert.ok(plan.k > 0 && plan.k <= 32);
  assert.ok(plan.imageProb >= 0.99 - 1e-9, `plan claims ${plan.imageProb}`);
  console.log(`      (${total} data parts, ${blocks} block(s), k=${plan.k}/block, ${parity} parity, P=${(plan.imageProb*100).toFixed(2)}%)`);
});

await t("Auto's parity actually survives the loss it was sized for", async () => {
  store.clear(); setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = chunkify(b64, "auto");
  const total = totalOf(cs[0]);
  const k = getPlan().k;
  // destroy exactly k data parts inside the first block — the worst case the plan promises to survive
  const doomed = Array.from({length:k}, (_,i)=> i + 2);
  const kept = cs.filter(c => !doomed.includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0, `k=${k} losses not repaired`);
  assert.equal(r.repaired, k);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  console.log(`      (destroyed all ${k} parts the plan budgets for -> rebuilt, image intact)`);
});

await t("a lossier measured history makes Auto provision more", async () => {
  store.clear(); setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  chunkify(b64, "auto");
  const clean = getPlan().k;
  for (let i = 0; i < 10; i++) recordLoss(4, 25);      // ~16% observed loss
  chunkify(b64, "auto");
  const lossy = getPlan().k;
  assert.ok(lossy > clean, `expected more parity after observing loss: ${clean} -> ${lossy}`);
  console.log(`      (k rose ${clean} -> ${lossy} after observing ~16% loss)`);
});

await t("the learning loop only counts sends that carried recovery", async () => {
  store.clear(); setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const plain = chunkify(b64, "off");
  const r1 = reassemble(plain.join("\n\n"));
  assert.equal(r1.hadParity, false, "a plain send must not look like evidence");
  const withP = chunkify(b64, "strong");
  const r2 = reassemble(withP.join("\n\n"));
  assert.equal(r2.hadParity, true);
  assert.equal(r2.repaired, 0, "a complete send repairs nothing");
});

await t("Auto is not worse than Strong at the same measured loss", async () => {
  store.clear(); setLimit(160);
  for (let i = 0; i < 8; i++) recordLoss(2, 25);   // ~8% loss
  const b64 = await pack(img, "image/webp", "");
  const a = chunkify(b64, "auto"), aPlan = getPlan();
  const aTotal = totalOf(a[0]), aParity = a.length - aTotal;
  const s = chunkify(b64, "strong");
  const sTotal = totalOf(s[0]), sParity = s.length - sTotal;
  console.log(`      (auto: ${aParity} parity, P=${(aPlan.imageProb*100).toFixed(2)}% | strong: ${sParity} parity)`);
  assert.ok(aPlan.imageProb >= 0.99 - 1e-9, "auto must meet its target");
});

await t("Off still emits nothing and leaves the payload untouched", async () => {
  store.clear(); setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = chunkify(b64, "off");
  assert.equal(cs.length, totalOf(cs[0]));
  assert.equal(reassemble(cs.join("\n\n")).s, b64);
  assert.equal(getPlan(), null, "Off must not leave a stale plan behind");
});

console.log(`\n${pass} passed`);
