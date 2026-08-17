// GF(2^14) recovery under Compact — the full proof, all from the shipped code.
// Extends what test/rs-from-app.mjs / test/rs-e2e.mjs already established for GF(2^6): a verified field,
// exact erasure recovery, and a full pack -> chunkify -> lose parts -> reassemble -> unpack pipeline that
// produces the original image byte-for-byte. This file is the GF(2^14) mirror of those, plus the
// interactions specific to having TWO fields share one wire format.
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
  "const MAGIC = [0x50,0x58,0x54,0x31];",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */", "/* ---------- CRC-32"),
  slice("/* ---------- CRC-32", "/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon", "/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics", "/* ---------- container (mime"),
  slice("/* ---------- container (mime", "/* ---------- compression ---------- */"),
  `globalThis.__X = {
    pack, unpack, chunkify, reassemble, planParity, lossPosterior,
    GF14_ORDER, GF14_LOG, gf14Mul, gf14Inv, RS14, denseToSyms, symsToDense, enc14, dec14, RS14_META,
    rsRepair, rsRepairDense, RS_BLOCK_CEILING, RS_BLOCK, RS_HALF,
    setLimit: v => { msgLimit = v; }, setCodec: v => { textCodec = v; }, setLevel: v => { recoveryLevel = v; },
    getPlan: () => lastPlan,
  };`,
].join("\n");
new Function("store", src)(store);
const {
  pack, unpack, chunkify, reassemble, planParity, lossPosterior,
  GF14_ORDER, GF14_LOG, gf14Mul, gf14Inv, RS14, denseToSyms, symsToDense, enc14, dec14, RS14_META,
  rsRepair, rsRepairDense, RS_BLOCK_CEILING, RS_BLOCK, RS_HALF,
  setLimit, setCodec, setLevel, getPlan,
} = globalThis.__X;

let pass = 0;
const t = async (n, f) => { await f(); console.log("  ok  " + n); pass++; };
const idxOf = c => +c.match(/^PX[TCD]\/[0-9a-f]+\/(\d+)\//)[1];
const totalOf = c => +c.match(/^PX[TCD]\/[0-9a-f]+\/\d+\/(\d+)\//)[1];
const tagOf = c => c.slice(0, 3);

/* ---------- field ---------- */

await t("GF(2^14) has full closure — no missing element", () => {
  let holes = 0;
  for (let v = 1; v < GF14_ORDER; v++) if (GF14_LOG[v] === -1) holes++;
  assert.equal(holes, 0);
  assert.equal(GF14_ORDER, 16384);
});

await t("mul/inv are exact inverses, and multiplication is commutative", () => {
  let badInv = 0, badComm = 0, n = 0;
  for (let a = 1; a < GF14_ORDER; a += 11) {
    n++;
    if (gf14Mul(a, gf14Inv(a)) !== 1) badInv++;
    for (const b of [1, 999, GF14_ORDER - 1]) if (gf14Mul(a,b) !== gf14Mul(b,a)) badComm++;
  }
  assert.equal(badInv, 0, `${badInv}/${n} inverse failures`);
  assert.equal(badComm, 0, "commutativity failed");
});

/* ---------- RS14 erasure coding ---------- */

const mkShards = (n, len, seed) => Array.from({length:n}, (_,i) => Uint16Array.from({length:len}, (_,b) => ((i*613 + b*211 + seed) & (GF14_ORDER-1))));

await t("RS14: recovers a single loss from a single parity part", () => {
  const data = mkShards(8, 15, 1), parity = RS14.encode(data, 2);
  const present = new Map(data.map((s,i)=>[i,s])); present.delete(4);
  const got = RS14.decode(8, 15, present, new Map([[1, parity[1]]]));
  assert.deepEqual([...got.get(4)], [...data[4]]);
});

await t("RS14: any subset of surviving parity rows decodes, not just the first", () => {
  const data = mkShards(10, 12, 7), parity = RS14.encode(data, 4);
  const present = new Map(data.map((s,i)=>[i,s])); [2,6].forEach(i=>present.delete(i));
  const got = RS14.decode(10, 12, present, new Map([[1,parity[1]],[3,parity[3]]]));
  for (const i of [2,6]) assert.deepEqual([...got.get(i)], [...data[i]]);
});

await t("RS14: refuses rather than guessing when redundancy is short", () => {
  const data = mkShards(8, 10, 3), parity = RS14.encode(data, 1);
  const present = new Map(data.map((s,i)=>[i,s])); [1,5].forEach(i=>present.delete(i));
  assert.equal(RS14.decode(8, 10, present, new Map([[0,parity[0]]])), null);
});

await t("RS14: exhaustive-ish sweep, 32+4 code, every 4-loss pattern in the sample exact", () => {
  const n=32, len=8, data = mkShards(n,len,19), parity = RS14.encode(data,4);
  let checked = 0;
  for (let a=0;a<n;a++) for (let b=a+1;b<n;b++) for (let c=b+1;c<n;c++) for (let d=c+1;d<n;d++) {
    if ((a*3+b*5+c*7+d) % 53 !== 0) continue;
    const present = new Map(data.map((s,i)=>[i,s])); [a,b,c,d].forEach(i=>present.delete(i));
    const got = RS14.decode(n, len, present, new Map(parity.map((p,i)=>[i,p])));
    assert.ok(got, `no solution for ${[a,b,c,d]}`);
    for (const i of [a,b,c,d]) assert.deepEqual([...got.get(i)], [...data[i]]);
    checked++;
  }
  assert.ok(checked > 100, `sweep too small: ${checked}`);
  console.log(`      (${checked} loss patterns, all exact)`);
});

/* ---------- symbol / header codecs ---------- */

await t("denseToSyms/symsToDense round-trip and stay within range", () => {
  const str = "一丁丂七丄丅丆万丈三上下与丏丑丒专且";
  const syms = denseToSyms(str, str.length);
  for (const s of syms) assert.ok(s >= 0 && s < GF14_ORDER);
  assert.equal(symsToDense(syms), str);
});

await t("enc14/dec14 round-trip at the boundaries, and reject foreign input", () => {
  for (const v of [0, 1, GF14_ORDER-1, GF14_ORDER, 1_000_000, (1<<28)-1]) {
    const s = enc14(v, 2);
    assert.equal(dec14(s), v, `v=${v}`);
  }
  assert.equal(enc14(1<<28, 2), null, "must refuse overflow, never silently wrap");
  assert.equal(dec14("AB"), -1, "Base64 characters are not dense characters");
});

/* ---------- full pipeline ---------- */

const img = Uint8Array.from({length:9000}, (_,i) => (i*37+11) & 0xff);

await t("Strong dense send: destroy 4 data parts, image rebuilds byte-for-byte, CRC intact", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  assert.ok(cs.length > total, "must actually carry parity");
  const kept = cs.filter(c => ![3,7,11,19].includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.repaired, 4, `expected 4 rebuilt, got ${r.repaired}`);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, true);
});

await t("destroying the last part exercises the no-padding trim path exactly", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  const kept = cs.filter(c => idxOf(c) !== total);
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.s, await pack(img, "image/webp", ""), "rebuilt dense text must equal the original exactly");
  assert.deepEqual(Uint8Array.from((await unpack(r.s, "")).img), img);
});

await t("encrypted dense payloads recover too, and a wrong password still fails", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", "hunter2"));
  const kept = cs.filter(c => ![2,9].includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.ok(r.repaired >= 2);
  const out = await unpack(r.s, "hunter2");
  assert.deepEqual(Uint8Array.from(out.img), img);
  await assert.rejects(() => unpack(r.s, "wrong"), /Wrong password/);
});

await t("beyond the parity budget it degrades to the old behaviour, not to garbage", async () => {
  setLimit(160); setCodec("dense"); setLevel("light");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  const k = cs.length - total;
  const doomed = Array.from({length: k + 3}, (_,i) => i + 2);
  const kept = cs.filter(c => !doomed.includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.ok(r.missing.length > 0, "must still report what it cannot rebuild");
  assert.ok(r.repaired < doomed.length, "must not claim to have rebuilt what it could not");
});

await t("losing parity parts themselves is harmless", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  const kept = cs.filter(c => idxOf(c) <= total || idxOf(c) % 2 === 0).filter(c => idxOf(c) !== 6);
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.repaired, 1);
  assert.deepEqual(Uint8Array.from((await unpack(r.s, "")).img), img);
});

await t("a mangled parity header cannot make a corrupt image pass as complete", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  const mangled = cs.map(c => idxOf(c) > total
    ? c.replace(/\/([^/]*)$/, "/" + "一".repeat(20))
    : c);
  const kept = mangled.filter(c => idxOf(c) !== 4);
  const r = reassemble(kept.join("\n\n"));
  if (r.missing.length === 0) {
    const out = await unpack(r.s, "");
    assert.deepEqual(Uint8Array.from(out.img), img, "claimed success with a corrupted image");
  } else {
    assert.ok(r.missing.includes(4));
  }
});

/* ---------- the ordering hazard: parity chunk pasted FIRST ---------- */

await t("all chunks of a dense+recovery send share one tag, regardless of paste order", async () => {
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  assert.ok(cs.every(c => tagOf(c) === "PXD"), "data and parity must share the PXD tag");
  // paste PARITY first — reassemble's encoding detection reads group[0], so if tags ever diverged this
  // would misdetect the whole session as Base64 and corrupt the read
  const reordered = [...cs].sort((a,b) => idxOf(b) - idxOf(a));
  const kept = reordered.filter(c => idxOf(c) !== 5);
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.dense, true, "must still detect dense encoding with parity pasted first");
  assert.equal(r.missing.length, 0);
  assert.deepEqual(Uint8Array.from((await unpack(r.s, "")).img), img);
});

/* ---------- backward compatibility ---------- */

await t("a build with only the OLD (Base64-only) rsRepair degrades safely on a dense+parity send", async () => {
  // Simulates a receiver on the build immediately before this one: dense sends existed (PXD, v2 text) but
  // recovery under Compact did not, so its rsRepair only understood dec64/b64ToSyms. Fed the parity from
  // a NEW dense+recovery send, dec64 (fixed in #225 to bound-check before lookup) rejects every CJK header
  // character immediately -> coreLen never gets set -> the old function returns 0. No corruption, just no
  // recovery: exactly the "clean refusal" posture this project has maintained at every format boundary.
  setLimit(160); setCodec("dense"); setLevel("strong");
  const cs = chunkify(await pack(img, "image/webp", ""));
  const total = totalOf(cs[0]);
  const map = new Map();
  const parityRaw = [];
  for (const c of cs) {
    const i = idxOf(c), data = c.replace(/^PX[TCD]\/[0-9a-f]+\/\d+\/\d+\//, "");
    if (i <= total) map.set(i, data); else parityRaw.push(data);
  }
  map.delete(3); map.delete(8);   // simulate loss
  const oldStyleRepaired = rsRepair(map, total, parityRaw, /*isDense*/ false);   // old build never passes true
  assert.equal(oldStyleRepaired, 0, "an old build must not silently \"recover\" via the wrong field");
  assert.equal(map.size, total - 2, "and must not have touched the map otherwise");
});

/* ---------- planner block-addressing ceiling ---------- */

await t("Auto plans against the DENSE ceiling (16384 blocks), not Base64's (64)", () => {
  const plan = planParity(3000, 0.99, { a:1, b:49 }, RS_BLOCK_CEILING.dense);
  // 3000 parts / 32 per block = 94 blocks — comfortably past Base64's 64-block ceiling but nowhere near
  // dense's, so under the dense ceiling every block should be coded (uncoded === 0)
  assert.equal(plan.uncoded, 0, "no block should be left bare under the dense ceiling at this size");
  const planB64 = planParity(3000, 0.99, { a:1, b:49 }, RS_BLOCK_CEILING.b64);
  assert.ok(planB64.uncoded > 0, "the SAME send under the Base64 ceiling must show bare blocks — proves the parameter matters");
});

await t("a real dense Auto send at this scale plans and ships consistently", async () => {
  setLimit(160); setCodec("dense"); setLevel("auto");
  const big = Uint8Array.from({length:70000}, (_,i) => (i*97+3)&0xff);
  const cs = chunkify(await pack(big, "image/webp", ""));
  const plan = getPlan();
  assert.ok(plan, "auto must produce a plan for a dense send");
  assert.ok(plan.blocks >= 2, `expected a multi-block send, got ${plan.blocks}`);
  const total = totalOf(cs[0]);
  assert.equal(cs.length - total > 0, true);
});

await t("Off still emits nothing under dense, and the payload is unaltered", async () => {
  setLimit(160); setCodec("dense"); setLevel("off");
  const b64 = await pack(img, "image/webp", "");
  const cs = chunkify(b64);
  const total = totalOf(cs[0]);
  assert.equal(cs.length, total, "Off must emit exactly the data parts");
  assert.equal(reassemble(cs.join("\n\n")).s, b64);
});

/* ---------- UI copy: no stale "unavailable" claims ---------- */

await t("no code path disables #recovery or claims it is unavailable under Compact", () => {
  assert.ok(!/rec\.disabled\s*=\s*\(textCodec/.test(html), "must not disable Recovery when Compact is on");
  assert.ok(!/Unavailable while Compact is on/.test(html));
  assert.ok(!/recovery is unavailable while it's on/.test(html));
});

console.log(`\n${pass} passed`);
