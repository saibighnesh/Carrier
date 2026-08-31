// Exercise chunkify's parity emission using the shipped code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const slice = (a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<0)throw new Error("marker "+(i<0?a:b));return html.slice(i,j);};
const src = [
  "const __st = new Map(); const lsGet = k => __st.has(k) ? __st.get(k) : null; const lsSet = (k,v) => __st.set(k,String(v)); const lsRemove = k => __st.delete(k);",
  "let msgLimit = 60000; let recoveryLevel = 'off'; let textCodec = 'b64';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const maxChunkIndexFor = (total, recoveryOn) => recoveryOn ? total * 2 : total;",
  "const crypto = globalThis.crypto;",
  // this range now also contains the GF(2^14) block added for Compact recovery; stub what it references
  // (this suite only exercises the original GF(2^6)/Base64 parity path, which is untouched)
  "const DENSE_BASE = 0x4E00, DENSE2_BITS = 14, DENSE2_MASK = 0x3FFF;",
  slice("/* ---------- Reed-Solomon erasure coding", "/* ---------- container (mime"),
  slice("/* ---------- chunking ---------- */", "/* ---------- compression ---------- */"),
  // parityChunks is now a thin dispatcher; parityChunksB64 is where the emission this suite tests lives
  "globalThis.__w = { chunkify, parityChunksB64, rsDecode, b64ToSyms, symsToB64, dec64, enc64, RS_META, RS_BLOCK, setLimit:v=>{msgLimit=v}, rsParityCount };",
].join("\n");
new Function(src)();
const { chunkify, rsDecode, b64ToSyms, symsToB64, dec64, RS_META, setLimit } = globalThis.__w;

// async now — chunkify yields cooperatively (see index.html's yieldToMain), so every call needs awaiting
let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};
const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const mkB64 = len => Array.from({length:len}, (_,i)=>B64A[(i*29+11)%64]).join("");

const parse = c => { const m = c.match(/^PXT\/([0-9a-f]+)\/(\d+)\/(\d+)\/(.*)$/); return {sid:m[1], idx:+m[2], total:+m[3], data:m[4]}; };

await t("off emits no parity and leaves parts at full size", async () => {
  setLimit(160);
  const b64 = mkB64(1000);
  const off = await chunkify(b64, "off");
  assert.ok(off.every(c => parse(c).idx <= parse(c).total));
  assert.ok(off.every(c => c.length <= 160), "a part must never exceed the message limit");
  assert.equal(off.map(c=>parse(c).data).join(""), b64, "data path must be byte-identical to before");
});

await t("light/strong emit parity past <total>, every part within the limit", async () => {
  setLimit(160);
  const b64 = mkB64(3000);
  for (const lvl of ["light","strong"]) {
    const cs = await chunkify(b64, lvl);
    const total = parse(cs[0]).total;
    const data = cs.filter(c=>parse(c).idx <= total), par = cs.filter(c=>parse(c).idx > total);
    assert.ok(par.length > 0, lvl+" produced no parity");
    assert.ok(cs.every(c => c.length <= 160), lvl+": a part exceeded the message limit");
    assert.equal(data.map(c=>parse(c).data).join(""), b64, lvl+": data path altered");
    const want = Math.max(1, Math.ceil(Math.min(total,32) * (lvl==="light"?0.1:0.25)));
    assert.ok(par.length >= want, `${lvl}: expected >= ${want} parity, got ${par.length}`);
  }
});

await t("an OLD receiver ignores parity: indices outside [1,total] are dropped", async () => {
  setLimit(160);
  const b64 = mkB64(2000);
  const cs = await chunkify(b64, "strong");
  const total = parse(cs[0]).total;
  // replicate the legacy filter exactly
  const map = new Map();
  for (const c of cs) { const p = parse(c); if (p.idx >= 1 && p.idx <= total) map.set(p.idx, p.data); }
  assert.equal(map.size, total);
  let s = ""; for (const k of [...map.keys()].sort((a,b)=>a-b)) s += map.get(k);
  assert.equal(s, b64, "legacy reassembly must yield the original payload untouched");
});

await t("parity header decodes: block, row and core length", async () => {
  setLimit(160);
  const b64 = mkB64(1998) + "==";   // real Base64 is always a multiple of 4
  const cs = await chunkify(b64, "light");
  const total = parse(cs[0]).total;
  const par = cs.filter(c=>parse(c).idx > total).map(c=>parse(c).data);
  const core = b64.replace(/=+$/,"");
  for (const p of par) {
    assert.equal(dec64(p.slice(2,6)), core.length, "core length header wrong");
    assert.ok(dec64(p.slice(0,1)) >= 0 && dec64(p.slice(1,2)) >= 0);
  }
  const per = par[0].length - RS_META;
  assert.equal(per, parse(cs[0]).data.length, "parity shard must match the data part size");
});

await t("END TO END: drop parts, rebuild them from parity, get the payload back", async () => {
  setLimit(160);
  const b64 = mkB64(3999) + "=";    // real Base64 is always a multiple of 4
  const cs = await chunkify(b64, "strong");
  const total = parse(cs[0]).total;
  const dataC = cs.filter(c=>parse(c).idx <= total), parC = cs.filter(c=>parse(c).idx > total);
  const core = b64.replace(/=+$/,"");
  const per = parse(parC[0]).data.length - RS_META;
  const kPerBlock = parC.length / Math.ceil(total/32);

  // lose parts 2 and 5 (1-based) — within one block's budget
  const lost = new Set([2,5]);
  const present = new Map();
  for (const c of dataC) { const p = parse(c); if (!lost.has(p.idx)) present.set(p.idx-1, b64ToSyms(p.data.replace(/=+$/,""), per)); }

  const parity = new Map();
  for (const c of parC) { const d = parse(c).data; if (dec64(d.slice(0,1)) === 0) parity.set(dec64(d.slice(1,2)), b64ToSyms(d.slice(RS_META), per)); }

  const n = Math.min(32, total);
  const blockPresent = new Map([...present].filter(([i])=>i < n));
  const rec = rsDecode(n, per, blockPresent, parity);
  assert.ok(rec, "decode returned null");
  for (const [i, syms] of rec) present.set(i, syms);

  let out = "";
  for (let i = 0; i < total; i++) {
    const syms = present.get(i);
    assert.ok(syms, "still missing "+i);
    const start = i*per;
    out += symsToB64(syms).slice(0, Math.max(0, Math.min(per, core.length - start)));
  }
  while (out.length % 4) out += "=";
  assert.equal(out, b64, "rebuilt payload does not match the original");
  console.log(`      (${total} parts, ${parC.length} parity, ${kPerBlock}/block, lost 2 and 5)`);
});

await t("parity indices past a digit-width boundary still fit msgLimit", async () => {
  // chunkPrefixLen(total) assumes every emitted index is no wider than total's own digit count — true for
  // data chunks (index <= total) but not for parity chunks (index runs total+1..total+parityCount, which
  // can be wider once total sits just under a power of ten). Sweep b64 lengths so `total` crosses 9->10 and
  // 99->100 under recovery, and check every emitted chunk — data AND parity — actually fits.
  setLimit(160);
  let sawSingleToDouble = false, sawDoubleToTriple = false, lastTotal = 0;
  for (let len = 700; len <= 14000; len += 40) {
    const b64 = mkB64(len);
    for (const lvl of ["light", "strong"]) {
      const cs = await chunkify(b64, lvl);
      assert.ok(cs.every(c => c.length <= 160), `${lvl} at len=${len}: a chunk exceeded msgLimit (total=${parse(cs[0]).total})`);
    }
    const total = parse((await chunkify(b64, "strong"))[0]).total;
    if (lastTotal < 10 && total >= 10) sawSingleToDouble = true;
    if (lastTotal < 100 && total >= 100) sawDoubleToTriple = true;
    lastTotal = total;
  }
  assert.ok(sawSingleToDouble, "sweep never crossed the 9->10 digit boundary — test range needs widening");
  assert.ok(sawDoubleToTriple, "sweep never crossed the 99->100 digit boundary — test range needs widening");
});

console.log(`\n${pass} passed`);
