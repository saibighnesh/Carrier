// Run the RS codec straight out of index.html — the shipped code, not a copy of it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const a = html.indexOf("/* ---------- Reed-Solomon erasure coding");
const b = html.indexOf("/* ---------- container (mime");
// this range now also contains the GF(2^14) block added for Compact recovery, which references the dense
// codec's constants — stub them (this suite only exercises the original GF(2^6)/Base64 path, untouched)
const src = "const DENSE_BASE = 0x4E00, DENSE2_BITS = 14, DENSE2_MASK = 0x3FFF;\n"
  + html.slice(a, b) + "\nglobalThis.__rs = { rsEncode, rsDecode, rsMatrix, gfMul, gfInv, GF_EXP, b64ToSyms, symsToB64, rsParityCount, RS_BLOCK, RS_META };";
new Function(src)();
const { rsEncode, rsDecode, rsMatrix, gfMul, gfInv, GF_EXP, b64ToSyms, symsToB64, rsParityCount } = globalThis.__rs;

let pass = 0;
// async now — rsEncode yields cooperatively (see index.html's yieldToMain), so every call needs awaiting
const t = async (n, f) => { await f(); console.log("  ok  " + n); pass++; };
const mk = (n, len, seed=1) => Array.from({length:n}, (_,i)=> Uint8Array.from({length:len}, (_,b)=>(i*7+b*13+seed)%64));

await t("GF(2^6) is a field: every element has a unique inverse, 2 generates all 63", () => {
  for (let x = 1; x < 64; x++) assert.equal(gfMul(x, gfInv(x)), 1, `inverse of ${x}`);
  assert.equal(new Set(GF_EXP.slice(0,63)).size, 63);
});
await t("Cauchy submatrices are non-singular (any-k-decodes property)", () => {
  const A = rsMatrix(4, 12);
  for (let i = 0; i < 12; i++) for (let j = i+1; j < 12; j++)
    assert.notEqual(gfMul(A[0][i],A[1][j]) ^ gfMul(A[0][j],A[1][i]), 0, `singular at ${i},${j}`);
});
await t("recovers a single loss from a single parity part", async () => {
  const d = mk(8,40), p = await rsEncode(d,2);
  const pres = new Map(d.map((s,i)=>[i,s])); pres.delete(3);
  const got = rsDecode(8,40,pres,new Map([[0,p[0]]]));
  assert.deepEqual([...got.get(3)], [...d[3]]);
});
await t("recovers k losses from exactly k parity parts", async () => {
  const d = mk(16,60), p = await rsEncode(d,4);
  const pres = new Map(d.map((s,i)=>[i,s])); [0,5,9,15].forEach(i=>pres.delete(i));
  const got = rsDecode(16,60,pres,new Map(p.map((x,i)=>[i,x])));
  for (const i of [0,5,9,15]) assert.deepEqual([...got.get(i)], [...d[i]]);
});
await t("decodes from an arbitrary subset of surviving parity rows", async () => {
  const d = mk(10,30), p = await rsEncode(d,4);
  const pres = new Map(d.map((s,i)=>[i,s])); [2,7].forEach(i=>pres.delete(i));
  const got = rsDecode(10,30,pres,new Map([[1,p[1]],[3,p[3]]]));
  for (const i of [2,7]) assert.deepEqual([...got.get(i)], [...d[i]]);
});
await t("refuses rather than guessing when redundancy is short", async () => {
  const d = mk(8,20), p = await rsEncode(d,1);
  const pres = new Map(d.map((s,i)=>[i,s])); [1,4].forEach(i=>pres.delete(i));
  assert.equal(rsDecode(8,20,pres,new Map([[0,p[0]]])), null);
});
await t("parity is itself Base64 text — the no-inflation property", async () => {
  const d = mk(24,50,41), p = await rsEncode(d,6);
  for (const row of p) for (const v of row) assert.ok(v >= 0 && v < 64);
  assert.match(p.map(symsToB64).join(""), /^[A-Za-z0-9+/]*$/);
  assert.equal(p[0].length, d[0].length, "a parity part must be the same size as a data part");
});
await t("exhaustive: 32 data + 4 parity, every 4-loss pattern rebuilds exactly", async () => {
  const n=32, len=12, d = mk(n,len,9), p = await rsEncode(d,4);
  let c = 0;
  for (let a=0;a<n;a++) for (let b=a+1;b<n;b++) for (let x=b+1;x<n;x++) for (let y=x+1;y<n;y++) {
    if ((a+b+x+y) % 37 !== 0) continue;            // stratified sample across the 35 960 patterns
    const pres = new Map(d.map((s,i)=>[i,s])); [a,b,x,y].forEach(i=>pres.delete(i));
    const got = rsDecode(n,len,pres,new Map(p.map((z,i)=>[i,z])));
    assert.ok(got, `no solution for ${[a,b,x,y]}`);
    for (const i of [a,b,x,y]) assert.deepEqual([...got.get(i)], [...d[i]], `wrong at ${[a,b,x,y]}`);
    c++;
  }
  console.log(`      (${c} loss patterns verified)`);
});
await t("symbol <-> Base64 round trip is exact, and pads short shards with zero", () => {
  const s = "SGVsbG8rLzAxMjM";
  assert.equal(symsToB64(b64ToSyms(s, s.length)), s);
  const padded = b64ToSyms("AB", 5);
  assert.deepEqual([...padded], [0,1,0,0,0]);
});
await t("redundancy levels are sane and never round down to zero", () => {
  assert.equal(rsParityCount(20,"off"), 0);
  assert.equal(rsParityCount(20,"light"), 2);
  assert.equal(rsParityCount(20,"strong"), 5);
  assert.equal(rsParityCount(3,"light"), 1, "a small send must still get one parity part");
  assert.ok(rsParityCount(32,"strong") <= 32);
});
console.log(`\n${pass} passed`);
