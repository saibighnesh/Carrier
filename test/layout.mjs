// Does the planner model the layout the encoder actually emits?
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
  "globalThis.__L = { pack, chunkify, planParity, rsBlockLayout, imageProb, uncodedParts, betaBinomTail, rsParityCount, lossPosterior, setLimit:v=>{msgLimit=v}, getPlan:()=>lastPlan, RS_BLOCK, B64A };",
].join("\n");
new Function("store", src)(store);
const { pack, chunkify, planParity, rsBlockLayout, imageProb, uncodedParts, betaBinomTail, rsParityCount, setLimit, getPlan, RS_BLOCK, B64A } = globalThis.__L;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};
const idxOf=c=>+c.match(/^PXT\/[0-9a-f]+\/(\d+)\//)[1];
const totalOf=c=>+c.match(/^PXT\/[0-9a-f]+\/\d+\/(\d+)\//)[1];
const dataOf=c=>c.replace(/^PXT\/[0-9a-f]+\/\d+\/\d+\//,"");

// count parity actually emitted, per block, straight from the headers
function emittedPerBlock(cs){
  const total = totalOf(cs[0]), per = {};
  for (const c of cs) if (idxOf(c) > total) { const b = B64A.indexOf(dataOf(c)[0]); per[b] = (per[b]||0)+1; }
  return { total, per };
}

await t("#203: a 1-part send is never promised parity", () => {
  const p = planParity(1, 0.99, {a:1,b:49});
  assert.equal(p.k, 0, `promised k=${p.k} for a payload that cannot be coded`);
  assert.equal(p.met, false);
  assert.equal(p.uncoded, 1);
  assert.ok(p.imageProb < 0.99);
});

await t("#203: a trailing single-part block is counted as unprotected", () => {
  const p = planParity(33, 0.999, {a:1,b:49});
  const layout = rsBlockLayout(33, () => 5);
  assert.deepEqual(layout.map(b=>b.n), [32, 1]);
  assert.equal(layout[1].k, 0, "a 1-part block must be uncoded");
  assert.ok(p.uncoded >= 1, "planner must report the bare part");
});

await t("#204: quoted probability equals the product over the REAL layout", async () => {
  setLimit(160);
  const img = Uint8Array.from({length:4200},(_,i)=>(i*37+11)&0xff);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "auto");
  const plan = getPlan();
  const { total, per } = emittedPerBlock(cs);
  const blocks = Math.ceil(total / RS_BLOCK);
  assert.ok(blocks >= 2, `need a multi-block send, got ${blocks}`);
  // independent recomputation from what was emitted
  const post = { a: 1, b: 49 };
  let truth = 1;
  for (let b = 0; b < blocks; b++) {
    const n = Math.min(RS_BLOCK, total - b*RS_BLOCK);
    const k = per[b] || 0;
    truth *= betaBinomTail(n + k, k, post.a, post.b);
  }
  assert.ok(Math.abs(plan.imageProb - truth) < 1e-9,
    `plan says ${plan.imageProb}, emitted layout gives ${truth}`);
  console.log(`      (${total} data parts, ${blocks} blocks ${JSON.stringify(per)}, P=${(truth*100).toFixed(3)}%)`);
});

await t("#204: uniform-block assumption is gone — unequal blocks are priced separately", () => {
  const layout = rsBlockLayout(45, () => 5);
  assert.deepEqual(layout.map(b=>b.n), [32, 13]);
  const a=1,b=49;
  const big = betaBinomTail(32+5, 5, a, b), small = betaBinomTail(13+5, 5, a, b);
  assert.ok(small > big, "a smaller block with the same k must be more reliable");
  assert.ok(Math.abs(imageProb(layout,a,b) - big*small) < 1e-12);
  assert.ok(imageProb(layout,a,b) > Math.pow(big,2), "old model understated this");
});

await t("#205: blocks past the addressable range count as unprotected", () => {
  const total = 66 * RS_BLOCK;                    // 66 blocks: 0..63 codable, 64 and 65 not
  const layout = rsBlockLayout(total, () => 4);
  assert.equal(layout.length, 65, "must stop after the first uncodable block");
  assert.equal(layout[63].k, 4, "block 63 is still addressable");
  assert.equal(layout[64].k, 0, "block 64 must be uncoded");
  const p = planParity(total, 0.99, {a:1,b:49});
  assert.equal(p.met, false, "cannot honestly claim the target with bare blocks");
  assert.ok(p.uncoded >= RS_BLOCK, `expected >=32 bare parts, got ${p.uncoded}`);
});

await t("layout mirrors parityChunks for real sends across many sizes", async () => {
  setLimit(160);
  let checked = 0;
  for (const bytes of [400, 900, 1500, 2600, 4200, 6000]) {
    const img = Uint8Array.from({length:bytes},(_,i)=>(i*17+5)&0xff);
    const b64 = await pack(img, "image/webp", "");
    for (const lvl of ["light","strong"]) {
      const cs = await chunkify(b64, lvl);
      const { total, per } = emittedPerBlock(cs);
      const layout = rsBlockLayout(total, n => rsParityCount(n, lvl));
      layout.forEach((blk, b) => {
        assert.equal(blk.k, per[b] || 0,
          `${bytes}B ${lvl}: block ${b} planned k=${blk.k} but ${per[b]||0} emitted`);
      });
      const totalPlanned = layout.reduce((x,blk)=>x+blk.k, 0);
      assert.equal(totalPlanned, cs.length - total, `${bytes}B ${lvl}: parity count mismatch`);
      checked++;
    }
  }
  console.log(`      (${checked} send configurations, planned layout == emitted layout in every one)`);
});

await t("planParity still meets targets it claims, and monotonic in loss", () => {
  for (const total of [4, 12, 32, 45, 80, 200]) for (const target of [0.9, 0.99, 0.999]) {
    const r = planParity(total, target, {a:5,b:95});
    if (r.met) assert.ok(r.imageProb >= target - 1e-12, `total=${total} t=${target} claims ${r.imageProb}`);
  }
  const kAt = (a,b) => planParity(24, 0.99, {a,b}).k;
  assert.ok(kAt(1,9999) <= kAt(1,49));
  assert.ok(kAt(1,49) <= kAt(10,90));
});

console.log(`\n${pass} passed`);
