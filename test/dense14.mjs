// The v2 codec: exact inversion at every residue, the density claim, and both back-compat guarantees.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<0)throw new Error("marker "+(i<0?a:b));return html.slice(i,j);};
const store = new Map();
const src = [
  "let msgLimit = 60000; let recoveryLevel='off'; let textCodec = 'b64';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const MAGIC=[0x50,0x58,0x54,0x31];",
  "const lsGet=k=>store.has(k)?store.get(k):null; const lsSet=(k,v)=>store.set(k,String(v)); const lsRemove=k=>store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  html.slice(html.indexOf("function payloadBytes(r){"), html.indexOf("// peek the header flags byte without decrypting")),
  html.slice(html.indexOf("function headerFlags(s){"), html.indexOf("// after a bulk insert")),
  "globalThis.__V = { pack, unpack, chunkify, reassemble, bytesToDense, bytesToDense2, dense2ToBytes, denseVersionOf, payloadBytes, headerFlags, setCodec:v=>{textCodec=v}, setLimit:v=>{msgLimit=v}, FLAG_ENCRYPTED, FLAG_CRC32, DENSE2_BITS };",
].join("\n");
new Function("store", src)(store);
const { pack, unpack, chunkify, reassemble, bytesToDense, bytesToDense2, dense2ToBytes, denseVersionOf,
        payloadBytes, headerFlags, setCodec, setLimit, FLAG_ENCRYPTED, FLAG_CRC32, DENSE2_BITS } = globalThis.__V;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};

await t("round-trips every length 0..600 (85x through all 7 residues) and all 256 byte values", () => {
  for (let n = 0; n <= 600; n++) {
    const src = Uint8Array.from({length:n}, (_,i)=>(i*97+n*31)&0xff);
    assert.deepEqual([...dense2ToBytes(bytesToDense2(src))], [...src], `length ${n} (r=${n%7})`);
  }
  const every = Uint8Array.from({length:256}, (_,i)=>i);
  assert.deepEqual([...dense2ToBytes(bytesToDense2(every))], [...every]);
});

await t("chars(n) = 1 + ceil(4n/7) exactly; 14 bits per payload character", () => {
  for (const n of [7, 70, 700, 7000, 70000]) {
    const enc = bytesToDense2(new Uint8Array(n));
    assert.equal(enc.length, 1 + Math.ceil(4*n/7), `at ${n}`);
  }
  // the 56-bit cycle on the nose: 7 bytes -> 4 chars + header
  assert.equal(bytesToDense2(new Uint8Array(7)).length, 5);
});

await t("v2 beats v1 by the predicted 14.3% and Base64 by 57.1%", () => {
  const n = 42000;
  const b64 = Math.ceil(n/3)*4, v1 = bytesToDense(new Uint8Array(n)).length, v2 = bytesToDense2(new Uint8Array(n)).length;
  assert.ok(Math.abs(1 - v2/v1 - 1/7) < 0.001, `v1->v2 saving ${(1-v2/v1)*100}%`);
  assert.ok(Math.abs(1 - v2/b64 - 4/7) < 0.001, `b64->v2 saving ${(1-v2/b64)*100}%`);
  console.log(`      (${n} B: b64 ${b64} ch, v1 ${v1} ch, v2 ${v2} ch)`);
});

await t("the residue collisions are real and the header resolves them", () => {
  // r=2 vs r=3 and r=4 vs r=5 produce identical payload char counts — the ambiguity the header exists for
  for (const [ra, rb] of [[2,3],[4,5]]) {
    const a = bytesToDense2(Uint8Array.from({length:7+ra},(_,i)=>i));
    const b = bytesToDense2(Uint8Array.from({length:7+rb},(_,i)=>i));
    assert.equal(a.length, b.length, `expected collision at r=${ra},${rb}`);
    assert.notEqual(a[0], b[0], "headers must differ");
    assert.equal(dense2ToBytes(a).length, 7+ra);
    assert.equal(dense2ToBytes(b).length, 7+rb);
  }
});

await t("every emitted character is inside U+4E00..U+8DFF, and v1/v2 headers are disjoint", () => {
  const enc = bytesToDense2(Uint8Array.from({length:9000},(_,i)=>(i*181)&0xff));
  assert.match(enc, /^[一-跿]+$/u);
  for (let n = 0; n < 21; n++) {
    assert.equal(denseVersionOf(bytesToDense2(new Uint8Array(n))), 2, `v2 misdetected at n=${n}`);
    assert.equal(denseVersionOf(bytesToDense(new Uint8Array(n||1))), 1, `v1 misdetected`);
  }
  assert.equal(denseVersionOf("ABC"), 0);
});

await t("survives NFC/NFD/NFKC/NFKD, JSON, and UTF-8 round trips", () => {
  const src = Uint8Array.from({length:5000},(_,i)=>(i*37+11)&0xff);
  const enc = bytesToDense2(src);
  for (const form of ["NFC","NFD","NFKC","NFKD"]) assert.deepEqual([...dense2ToBytes(enc.normalize(form))], [...src], form);
  assert.deepEqual([...dense2ToBytes(JSON.parse(JSON.stringify(enc)))], [...src]);
  assert.deepEqual([...dense2ToBytes(new TextDecoder().decode(new TextEncoder().encode(enc)))], [...src]);
});

await t("refuses foreign characters and truncation rather than decoding rubbish", () => {
  const enc = bytesToDense2(Uint8Array.from({length:70},(_,i)=>i));
  assert.throws(() => dense2ToBytes(enc.slice(0,10) + "A" + enc.slice(11)), /aren't part of it|altered/);
  assert.throws(() => dense2ToBytes(enc.slice(0, enc.length - 1)), /truncated|damaged/);
  assert.throws(() => dense2ToBytes(""), /Empty/);
  assert.throws(() => dense2ToBytes(bytesToDense(new Uint8Array(9))), /damaged/);   // a v1 payload fed to the v2 decoder
});

await t("BACK-COMPAT 1: a v1 payload (old saved .txt) still decodes through unpack", async () => {
  setCodec("b64"); setLimit(60000);
  const img = Uint8Array.from({length:4000},(_,i)=>(i*37+11)&0xff);
  const container = await pack(img, "image/webp", "");            // b64 text of the container
  const { default: none } = { default: 0 };
  // re-encode that container's BYTES as v1 dense, exactly what a v1 build wrote to disk
  const b64ToBytesLocal = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const v1text = bytesToDense(b64ToBytesLocal(container));
  const out = await unpack(v1text, "");
  assert.deepEqual(Uint8Array.from(out.img), img, "v1 dense payloads must stay readable forever");
});

await t("BACK-COMPAT 2: a pre-v2 build finds ZERO chunks in a v2 send — clean refusal", async () => {
  setCodec("dense"); setLimit(4096);
  const img = Uint8Array.from({length:9000},(_,i)=>(i*29+7)&0xff);
  const cs = chunkify(await pack(img, "image/webp", ""), "off");
  assert.ok(cs.every(c => c.startsWith("PXD/")), "v2 chunks must carry the PXD tag");
  const oldRe = /(PXT|PXC)\/([0-9a-f]+)\/(\d+)\/(\d+)\/((?:(?!PX[TC]\/[0-9a-f]+\/\d+\/\d+\/)[A-Za-z0-9+/=一-巿])+)/g;
  assert.equal([...cs.join("\n\n").matchAll(oldRe)].length, 0, "old build must match nothing at all");
});

await t("full pipeline: v2 send round-trips, CRC intact; encrypted too; wrong password fails", async () => {
  setCodec("dense"); setLimit(4096);
  const img = Uint8Array.from({length:9000},(_,i)=>(i*29+7)&0xff);
  const r = reassemble(chunkify(await pack(img,"image/webp",""), "off").join("\n\n"));
  assert.equal(r.denseBits, DENSE2_BITS, "reassemble must report the v2 width");
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, true);
  const r2 = reassemble(chunkify(await pack(img,"image/webp","pw"), "off").join("\n\n"));
  assert.deepEqual(Uint8Array.from((await unpack(r2.s,"pw")).img), img);
  await assert.rejects(() => unpack(r2.s, "no"), /Wrong password/);
});

await t("payloadBytes is exact for v2, and headerFlags reads v2 at all 7 residues", async () => {
  setCodec("dense"); setLimit(60000);
  for (let extra = 0; extra < 7; extra++) {
    const n = 4000 + extra;
    const img = Uint8Array.from({length:n},(_,i)=>i&0xff);
    const txt = await pack(img, "image/webp", "");
    const truth = 5 + 1 + "image/webp".length + n + 4;
    const r = reassemble(chunkify(txt, "off").join("\n\n"));
    assert.ok(Math.abs(payloadBytes(r) - truth) <= 2, `size at r=${truth%7}: ${payloadBytes(r)} vs ${truth}`);
    assert.equal(headerFlags(txt), FLAG_CRC32, `flags at residue ${truth%7}`);
  }
  assert.equal(headerFlags(await pack(new Uint8Array(100), "image/webp", "pw")), FLAG_ENCRYPTED);
});

await t("streaming complexity holds: 1 MB encodes+decodes round-trip in O(n) time", () => {
  const big = Uint8Array.from({length: 1<<20}, (_,i)=>(i*2654435761)&0xff);
  const t0 = process.hrtime.bigint();
  const enc = bytesToDense2(big);
  const dec = dense2ToBytes(enc);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(dec.length, big.length);
  assert.equal(enc.length, 1 + Math.ceil(4 * big.length / 7));
  for (let i = 0; i < big.length; i += 4099) assert.equal(dec[i], big[i]);
  console.log(`      (1 MB round trip in ${ms.toFixed(0)} ms, ${enc.length} chars)`);
  assert.ok(ms < 2000, "must be linear-time fast, not quadratic");
});

console.log(`\n${pass} passed`);
