// The receive size estimate must match the real container in BOTH encodings.
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
  "const lsGet=k=>store.has(k)?store.get(k):null; const lsSet=(k,v)=>store.set(k,String(v)); const lsRemove=k=>store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  // payloadBytes lives in the receive section; pull just that function
  html.slice(html.indexOf("function payloadBytes(r){"), html.indexOf("// peek the header flags byte without decrypting")),
  "globalThis.__S = { pack, chunkify, reassemble, payloadBytes, setLimit:v=>{msgLimit=v}, setCodec:v=>{textCodec=v} };",
].join("\n");
new Function("store", src)(store);
const { pack, chunkify, reassemble, payloadBytes, setLimit, setCodec } = globalThis.__S;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};

const containerBytes = (imgLen, mime, enc) => 5 + 1 + mime.length + imgLen + (enc ? 16+12+16 : 4);

await t("Base64 estimate stays accurate (no regression)", async () => {
  setLimit(60000); setCodec("b64");
  for (const n of [900, 9000, 90000]) {
    const img = Uint8Array.from({length:n},(_,i)=>(i*37)&0xff);
    const r = reassemble((await chunkify(await pack(img,"image/webp",""), "off")).join("\n\n"));
    const truth = containerBytes(n, "image/webp", false);
    const est = payloadBytes(r);
    assert.ok(Math.abs(est - truth) <= 3, `n=${n}: estimated ${est},truth ${truth}`);
    assert.equal(r.dense, false);
  }
});

await t("Compact estimate is now right — it was reporting half", async () => {
  setLimit(60000); setCodec("dense");
  for (const n of [900, 9000, 90000]) {
    const img = Uint8Array.from({length:n},(_,i)=>(i*37)&0xff);
    const r = reassemble((await chunkify(await pack(img,"image/webp",""), "off")).join("\n\n"));
    const truth = containerBytes(n, "image/webp", false);
    const est = payloadBytes(r);
    assert.equal(r.dense, true, "must be recognised as dense");
    assert.ok(Math.abs(est - truth) <= 2, `n=${n}: estimated ${est}, truth ${truth}`);
    // and prove the old formula was wrong by the factor the issue claims
    const oldFormula = Math.floor(r.s.length * 3 / 4);
    // v2 carries 14 bits/char, so the pre-fix formula (Base64's 6/8 ratio) understates by 6/14
    assert.ok(Math.abs(oldFormula * 14 / 6 - truth) <= 6, `old formula should be ~6/14 of truth: ${oldFormula} vs ${truth}`);
  }
  console.log("      (old formula reported ~43% of the real size; new one lands within 2 bytes)");
});

await t("encrypted payloads estimate correctly in both encodings", async () => {
  setLimit(60000);
  const img = Uint8Array.from({length:5000},(_,i)=>(i*13)&0xff);
  for (const codec of ["b64","dense"]) {
    setCodec(codec);
    const r = reassemble((await chunkify(await pack(img,"image/webp","pw"), "off")).join("\n\n"));
    const truth = containerBytes(5000, "image/webp", true);
    assert.ok(Math.abs(payloadBytes(r) - truth) <= 3, `${codec}: ${payloadBytes(r)} vs ${truth}`);
  }
});

await t("the dense flag comes from the prefix, not from the sender's setting", async () => {
  setLimit(60000);
  setCodec("dense"); const d = await chunkify(await pack(Uint8Array.from({length:600},(_,i)=>i&0xff),"image/webp",""), "off");
  setCodec("b64");   // receiver's own setting is the opposite of the sender's
  const r = reassemble(d.join("\n\n"));
  assert.equal(r.dense, true, "must follow the text, not the local setting");
});

await t("a partial dense paste projects the finished size correctly", async () => {
  setLimit(4096); setCodec("dense");
  const img = Uint8Array.from({length:32000},(_,i)=>(i*29)&0xff);   // v2 is denser — needs a bigger payload to split into >=4 parts
  const cs = await chunkify(await pack(img,"image/webp",""), "off");
  assert.ok(cs.length >= 4, `need several parts, got ${cs.length}`);
  const r = reassemble(cs.slice(0, 2).join("\n\n"));
  const projected = Math.floor(payloadBytes(r) * (r.total / r.have));
  const truth = containerBytes(32000, "image/webp", false);
  // have/total scaling assumes every part is full, and the LAST one never is — so the projection reads
  // high by up to one part's worth. That is pre-existing (#195) and applies to Base64 identically; what
  // this pins is that the encoding does not make it worse, and that it errs high rather than low.
  const onePart = Math.floor(cs[0].length * 12 / 8);
  assert.ok(projected >= truth, `projection must not under-state: ${projected} < ${truth}`);
  assert.ok(projected - truth <= onePart, `over by ${projected - truth} B, more than one part (${onePart} B)`);
  setCodec("b64");
  const cs2 = await chunkify(await pack(img,"image/webp",""), "off");
  const r2 = reassemble(cs2.slice(0, 2).join("\n\n"));
  const proj2 = Math.floor(payloadBytes(r2) * (r2.total / r2.have));
  assert.ok(proj2 >= truth, "Base64 over-states in the same direction — not encoding-specific");
  console.log(`      (2 of ${cs.length} parts -> ${projected} B vs truth ${truth} B; Base64 same shape: ${proj2} B)`);
});

console.log(`\n${pass} passed`);
