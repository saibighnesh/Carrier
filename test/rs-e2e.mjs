// Full pipeline out of index.html: pack -> await chunkify(+parity) -> destroy parts -> reassemble -> unpack.
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
  "const MAGIC = [0x50,0x58,0x54,0x31];",
  slice("/* ---------- byte <-> base64 ---------- */", "/* ---------- CRC-32"),
  slice("/* ---------- CRC-32", "/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon", "/* ---------- container (mime"),
  slice("/* ---------- container (mime", "/* ---------- compression ---------- */"),
  "globalThis.__e = { pack, unpack, chunkify, reassemble, setLimit:v=>{msgLimit=v} };",
].join("\n");
new Function(src)();
const { pack, unpack, chunkify, reassemble, setLimit } = globalThis.__e;

let pass = 0; const t = async (n,f)=>{ await f(); console.log("  ok  "+n); pass++; };
const img = Uint8Array.from({length:2600},(_,i)=>(i*37+11)&0xff);
const idxOf = c => +c.match(/^PXT\/[0-9a-f]+\/(\d+)\//)[1];
const totalOf = c => +c.match(/^PXT\/[0-9a-f]+\/\d+\/(\d+)\//)[1];

await t("Strong: destroy 4 data parts, image still rebuilds byte-for-byte", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "strong");
  const total = totalOf(cs[0]);
  const kept = cs.filter(c => ![3,7,11,19].includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0, "still reports missing parts");
  assert.equal(r.repaired, 4, `expected 4 rebuilt, got ${r.repaired}`);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img, "recovered image differs from the original");
  assert.equal(out.verified, true, "CRC-32 must still pass on a rebuilt payload");
  console.log(`      (${total} parts, lost 3/7/11/19, all rebuilt, CRC intact)`);
});

await t("destroying the LAST part exercises the padding restore", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "strong");
  const total = totalOf(cs[0]);
  const kept = cs.filter(c => idxOf(c) !== total);
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.repaired, 1);
  assert.equal(r.s, b64, "rebuilt payload text must equal the original exactly, padding included");
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
});

await t("encrypted payloads recover too — coding is below the crypto", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "hunter2");
  const cs = await chunkify(b64, "strong");
  const kept = cs.filter(c => ![2,9].includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.repaired, 2);
  const out = await unpack(r.s, "hunter2");
  assert.deepEqual(Uint8Array.from(out.img), img);
  await assert.rejects(() => unpack(r.s, "wrong"), /Wrong password/);
});

await t("beyond the parity budget it degrades to the old behaviour, not to garbage", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "light");
  const total = totalOf(cs[0]);
  const k = cs.length - total;
  const doomed = Array.from({length: k + 3}, (_, i) => i + 2);
  const kept = cs.filter(c => !doomed.includes(idxOf(c)));
  const r = reassemble(kept.join("\n\n"));
  assert.ok(r.missing.length > 0, "must still report the parts it cannot rebuild");
  assert.ok(r.repaired < doomed.length, "must not claim to have rebuilt what it could not");
  console.log(`      (${k} parity vs ${doomed.length} losses -> ${r.repaired} rebuilt, ${r.missing.length} still missing)`);
});

await t("losing parity parts themselves is harmless", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "strong");
  const total = totalOf(cs[0]);
  const kept = cs.filter(c => idxOf(c) <= total || idxOf(c) % 2 === 0).filter(c => idxOf(c) !== 6);
  const r = reassemble(kept.join("\n\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.repaired, 1);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
});

await t("Off changes nothing: no parity, and the payload is unaltered", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "off");
  const total = totalOf(cs[0]);
  assert.equal(cs.length, total, "Off must emit exactly the data parts");
  const r = reassemble(cs.join("\n\n"));
  assert.equal(r.repaired, 0);
  assert.equal(r.s, b64);
});

await t("garbage in the parity header can't corrupt a good send", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const cs = await chunkify(b64, "strong");
  const total = totalOf(cs[0]);
  const mangled = cs.map(c => idxOf(c) > total ? c.replace(/\/([^/]*)$/, "/AAAAAAAAAAAAAAAAAAAA") : c);
  const kept = mangled.filter(c => idxOf(c) !== 4);
  const r = reassemble(kept.join("\n\n"));
  // it may fail to rebuild, but it must never fabricate a payload that passes as complete-and-wrong
  if(r.missing.length === 0){
    const out = await unpack(r.s, "");
    assert.deepEqual(Uint8Array.from(out.img), img, "claimed success with a corrupted image");
  } else {
    assert.ok(r.missing.includes(4), "must still report part 4 missing");
  }
});

await t("recovers when the final part is Base64 padding alone", async () => {
  // sweep payload sizes so the padding lands on a chunk boundary for at least some of them — the case
  // where ceil(core/per) is one short of the sender's part count
  setLimit(160);
  let covered = 0;
  for (let extra = 0; extra < 600 && covered < 3; extra++) {
    const im = Uint8Array.from({length: 900 + extra}, (_, i) => (i * 17 + 3) & 0xff);
    const b64 = await pack(im, "image/webp", "");
    const cs = await chunkify(b64, "strong");
    const total = totalOf(cs[0]);
    const core = b64.replace(/=+$/, "");
    const per = cs.filter(c => idxOf(c) > total)[0].replace(/^PXT\/[0-9a-f]+\/\d+\/\d+\//, "").length - 6;
    if (Math.ceil(core.length / per) === total) continue;   // not the interesting shape
    covered++;
    const kept = cs.filter(c => idxOf(c) !== total && idxOf(c) !== 3);
    const r = reassemble(kept.join("\n\n"));
    assert.equal(r.missing.length, 0, `extra=${extra}: not repaired`);
    assert.equal(r.s, b64, `extra=${extra}: rebuilt payload differs`);
    const out = await unpack(r.s, "");
    assert.deepEqual(Uint8Array.from(out.img), im);
  }
  assert.ok(covered > 0, "sweep never hit the padding-on-boundary shape — test proves nothing");
  console.log(`      (${covered} payload sizes where padding straddled a boundary)`);
});

console.log(`\n${pass} passed`);
