// The three quality fixes: codec-aware auto-fit budget, dec64 bounds, and the compression cache key.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(HTML, "utf8");
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<0)throw new Error("marker "+(i<0?a:b));return html.slice(i,j);};
let pass = 0; const t=(n,f)=>{f();console.log("  ok  "+n);pass++;};

// --- targetBytes must price the codec that will carry the text ---
{
  const store = new Map();
  const src = [
    "let msgLimit = 60000; let recoveryLevel='off'; let textCodec = 'b64';",
    "const SID_LEN = 6;",
    "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
    "const MAGIC=[0x50,0x58,0x54,0x31];",
    "const lsGet=k=>store.has(k)?store.get(k):null; const lsSet=(k,v)=>store.set(k,String(v)); const lsRemove=k=>store.delete(k);",
    html.slice(html.indexOf("const textBitsPerChar"), html.indexOf("const CHUNK_RENDER_CAP")),
    slice("/* ---------- byte <-> base64 ---------- */","/* ---------- CRC-32"),
    slice("/* ---------- CRC-32","/* ---------- Reed-Solomon"),
    slice("/* ---------- Reed-Solomon","/* ---------- reliability mathematics"),
    slice("/* ---------- reliability mathematics","/* ---------- container (mime"),
    slice("/* ---------- container (mime","/* ---------- compression ---------- */"),
    "globalThis.__F = { targetBytes, dec64, pack, chunkify, setCodec:v=>{textCodec=v}, setLimit:v=>{msgLimit=v}, DENSE2_BITS };",
  ].join("\n");
  new Function("store", src)(store);
}
const { targetBytes, dec64, pack, chunkify, setCodec, setLimit, DENSE2_BITS } = globalThis.__F;

t("auto-fit budget under Compact is 14/6 of the Base64 budget — not equal to it", () => {
  setLimit(60000);
  setCodec("b64");   const b = targetBytes();
  setCodec("dense"); const d = targetBytes();
  assert.ok(Math.abs(d / b - DENSE2_BITS / 6) < 0.01, `ratio ${(d/b).toFixed(3)}, expected ${(DENSE2_BITS/6).toFixed(3)}`);
  // and the Base64 budget is exactly what it always was: 0.75 * 0.96 = 0.72
  assert.equal(b, Math.floor((60000 - 15) * 0.72), "the Base64 budget must not move");
  console.log(`      (b64 ${b} B, dense ${d} B per message)`);
});

t("a payload sized to the dense budget genuinely fits one message", async () => {
  setLimit(4096); setCodec("dense");
  const budget = targetBytes() - (5 + 1 + 10 + 4);            // container overhead, unlocked
  const img = new Uint8Array(budget);
  const cs = chunkify(await pack(img, "image/webp", ""), "off");
  assert.equal(cs.length, 1, `budget-sized payload split into ${cs.length} messages`);
  assert.ok(cs[0].length <= 4096, "and stays inside the limit");
  // the OLD budget left this much on the table:
  const oldBudget = Math.floor((4096 - 15) * 0.72);
  console.log(`      (old budget ${oldBudget} B -> new ${budget + 20} B usable: ${((budget+20)/oldBudget).toFixed(2)}x the image quality headroom)`);
  setCodec("b64");
});

t("dec64 rejects char codes past the table instead of producing NaN", () => {
  assert.equal(dec64("AAAA"), 0);
  assert.equal(dec64("//"), 4095);
  assert.equal(dec64("一"), -1, "a CJK char must be rejected, not NaN");
  assert.equal(dec64("A一"), -1, "…anywhere in the string");
  assert.ok(!Number.isNaN(dec64(String.fromCharCode(200))), "high-latin must not be NaN either");
  assert.equal(dec64(String.fromCharCode(200)), -1);
});

t("the compression cache key exists and covers exactly what compressOnce consumes", () => {
  assert.match(html, /const imgKeyNow = `\$\{loadToken\}\|\$\{d\}\|\$\{q\}`/, "image cache keyed on source + dims + quality");
  assert.ok(html.includes("imgKey = null; imgCache = null;"), "must be invalidated on Start over");
  // and the pack cache must still sit downstream, keyed via the declared lists (the #221 invariant)
  assert.match(html, /const packKeyNow = packInputs\(d, q, pw\);/);
});

console.log(`\n${pass} passed`);
