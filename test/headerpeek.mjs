// headerFlags must read the flags byte in BOTH encodings, at every payload remainder.
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
  "const maxChunkIndexFor = (total, recoveryOn) => recoveryOn ? total * 2 : total;",
  "const MAGIC=[0x50,0x58,0x54,0x31];",
  "const lsGet=k=>store.has(k)?store.get(k):null; const lsSet=(k,v)=>store.set(k,String(v)); const lsRemove=k=>store.delete(k);",
  slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
  slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
  slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
  slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
  html.slice(html.indexOf("function headerFlags(s){"), html.indexOf("// after a bulk insert")),
  "globalThis.__H = { pack, headerFlags, densePrefixBytes, setCodec:v=>{textCodec=v}, FLAG_ENCRYPTED, FLAG_CRC32 };",
].join("\n");
new Function("store", src)(store);
const { pack, headerFlags, densePrefixBytes, setCodec, FLAG_ENCRYPTED, FLAG_CRC32 } = globalThis.__H;

let pass = 0; const t=async(n,f)=>{await f();console.log("  ok  "+n);pass++;};

await t("Base64 still reads correctly (no regression)", async () => {
  setCodec("b64");
  const img = Uint8Array.from({length:4000},(_,i)=>i&0xff);
  assert.equal(headerFlags(await pack(img,"image/webp","")), FLAG_CRC32);
  assert.equal(headerFlags(await pack(img,"image/webp","pw")), FLAG_ENCRYPTED);
});

await t("Compact now reads correctly — it returned null for everything", async () => {
  setCodec("dense");
  const img = Uint8Array.from({length:4000},(_,i)=>i&0xff);
  assert.equal(headerFlags(await pack(img,"image/webp","")), FLAG_CRC32);
  assert.equal(headerFlags(await pack(img,"image/webp","pw")), FLAG_ENCRYPTED);
});

await t("works at EVERY payload remainder — the case a prefix-length decoder would throw on", async () => {
  setCodec("dense");
  const seen = new Set();
  for (let n = 1000; n < 1060; n++) {
    const img = Uint8Array.from({length:n},(_,i)=>(i*7)&0xff);
    const txt = await pack(img,"image/webp","");
    // the container length mod 3 is what selects the header symbol
    const container = 5 + 1 + "image/webp".length + n + 4;
    seen.add(container % 3);
    assert.equal(headerFlags(txt), FLAG_CRC32, `n=${n} (container mod 3 = ${container % 3})`);
  }
  assert.equal(seen.size, 3, `must cover all three remainders, saw ${[...seen]}`);
  console.log(`      (60 payload sizes, all three container remainders)`);
});

await t("rejects a foreign or truncated header rather than guessing", () => {
  assert.equal(headerFlags(""), null);
  assert.equal(headerFlags("AAAA"), null, "valid base64 but wrong magic");
  assert.equal(headerFlags("一丁"), null, "dense but too short for a header");
  assert.equal(densePrefixBytes("一丁", 5), null, "must refuse rather than pad");
  assert.equal(densePrefixBytes("一" + "A".repeat(4), 5), null, "non-alphabet symbol must be rejected");
});

await t("densePrefixBytes agrees with a full decode on the leading bytes", async () => {
  setCodec("dense");
  for (const n of [7, 100, 4000]) {
    const img = Uint8Array.from({length:n},(_,i)=>(i*29+3)&0xff);
    const txt = await pack(img,"image/webp","");
    const prefix = densePrefixBytes(txt, 5, 14);   // pack emits v2 (14-bit) since dense14
    assert.deepEqual([...prefix], [0x50,0x58,0x54,0x31, FLAG_CRC32], `n=${n}`);
  }
});

console.log(`\n${pass} passed`);
