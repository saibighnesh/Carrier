// The wire format: dense sends must round-trip, and must never be confusable with Base64 sends.
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
  "const lsSet = (k,v) => store.set(k,String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- dense text encoding"),
  slice("/* ---------- dense text encoding","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  "globalThis.__W = { pack, unpack, chunkify, reassemble, setLimit:v=>{msgLimit=v}, setCodec:v=>{textCodec=v} };",
].join("\n");
new Function("store", src)(store);
const { pack, unpack, chunkify, reassemble, setLimit, setCodec } = globalThis.__W;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};
const img = Uint8Array.from({length:9000},(_,i)=>(i*37+11)&0xff);

await t("dense send round-trips end to end, image byte-identical", async () => {
  setLimit(60000); setCodec("dense");
  const txt = await pack(img, "image/webp", "");
  const cs = await chunkify(txt, "off");
  assert.ok(cs.every(c => c.startsWith("PXD/")), "dense chunks must carry their own prefix");
  const r = reassemble(cs.join("\n\n"));
  assert.equal(r.missing.length, 0);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, true, "CRC must still pass through the dense path");
});

await t("dense cuts the character count to 3/7 on a real payload", async () => {
  setLimit(60000);
  setCodec("b64");   const b64 = await pack(img, "image/webp", "");
  setCodec("dense"); const dense = await pack(img, "image/webp", "");
  const ratio = b64.length / dense.length;
  assert.ok(ratio > 2.32, `only ${ratio.toFixed(4)}x — v2 must reach 14/6`);
  console.log(`      (${b64.length} chars -> ${dense.length} chars, ${ratio.toFixed(3)}x denser)`);
});

await t("dense payloads split into fewer messages", async () => {
  setLimit(60000);
  const big = Uint8Array.from({length:200000},(_,i)=>(i*29+7)&0xff);
  setCodec("b64");   const nB64 = (await chunkify(await pack(big,"image/webp",""), "off")).length;
  setCodec("dense"); const nDen = (await chunkify(await pack(big,"image/webp",""), "off")).length;
  assert.ok(nDen < nB64, `${nDen} not fewer than ${nB64}`);
  console.log(`      (200 KB at WhatsApp limit: ${nB64} messages -> ${nDen})`);
});

await t("encrypted dense sends round-trip, and a wrong password still fails", async () => {
  setLimit(60000); setCodec("dense");
  const txt = await pack(img, "image/webp", "hunter2");
  const r = reassemble((await chunkify(txt, "off")).join("\n\n"));
  const out = await unpack(r.s, "hunter2");
  assert.deepEqual(Uint8Array.from(out.img), img);
  await assert.rejects(() => unpack(r.s, "wrong"), /Wrong password/);
});

await t("a Base64 send is untouched — same prefix, same text, byte for byte", async () => {
  setLimit(60000); setCodec("b64");
  const txt = await pack(img, "image/webp", "");
  const cs = await chunkify(txt, "off");
  assert.ok(cs.every(c => c.startsWith("PXT/")));
  const r = reassemble(cs.join("\n\n"));
  assert.equal(r.s, txt);
  assert.deepEqual(Uint8Array.from((await unpack(r.s,"")).img), img);
});

await t("an OLD receiver cannot misread a dense send — it matches nothing", async () => {
  setLimit(60000); setCodec("dense");
  const cs = await chunkify(await pack(img,"image/webp",""), "off");
  const legacy = /PXT\/([0-9a-f]+)\/(\d+)\/(\d+)\/((?:(?!PXT\/[0-9a-f]+\/\d+\/\d+\/)[A-Za-z0-9+/=])+)/g;
  assert.equal([...cs.join("\n\n").matchAll(legacy)].length, 0,
    "a pre-dense build must find no chunks at all, rather than a partial one");
});

await t("both encodings can sit in one box without contaminating each other", async () => {
  setLimit(60000);
  setCodec("b64");   const a = await chunkify(await pack(img,"image/webp",""), "off");
  setCodec("dense"); const b = await chunkify(await pack(img,"image/webp",""), "off");
  const r = reassemble([...a, ...b].join("\n\n"));
  assert.ok(r.multiSession >= 2, "must see two distinct sends");
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img, "whichever it picked must decode correctly");
});

await t("dense sends now carry real parity at every recovery level (GF(2^14))", async () => {
  // this used to assert the OPPOSITE — that dense emitted no parity, because the field was sized to
  // Base64. GF(2^14) recovery (see test/gf14.mjs) removed that limitation; a Compact send should carry
  // and USE parity exactly like a Base64 one does.
  setLimit(160); setCodec("dense");
  for (const lvl of ["light","strong","auto"]) {
    const cs = await chunkify(await pack(img,"image/webp",""), lvl);
    const total = +cs[0].match(/\/(\d+)\/[^/]*$/)[1];
    assert.ok(cs.length > total, `${lvl}: expected parity parts, got none`);
    assert.ok(cs.every(c => c.startsWith("PXD/")), `${lvl}: parity must share the data tag`);
  }
  setCodec("b64");
});

console.log(`\n${pass} passed`);
