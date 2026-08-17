// Extracts Carrier's container + chunking code straight out of index.html and exercises it in Node.
// No DOM is touched by that region, so it runs as-is once msgLimit is supplied.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";

const html = readFileSync(HTML, "utf8");
const slice = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to);
  if (a < 0 || b < 0) throw new Error(`marker not found: ${a < 0 ? from : to}`);
  return html.slice(a, b);
};

const src = [
  "const __st = new Map(); const lsGet = k => __st.has(k) ? __st.get(k) : null; const lsSet = (k,v) => __st.set(k,String(v)); const lsRemove = k => __st.delete(k);",
  "let msgLimit = 60000; let textCodec = 'b64';",
  "let recoveryLevel = 'off';",
  "const SID_LEN = 6;",
  "const chunkPrefixLen = total => 4 + SID_LEN + 3 + 2 * String(total).length;",
  "const MAGIC = [0x50,0x58,0x54,0x31];",
  slice("/* ---------- byte <-> base64 ---------- */", "/* ---------- CRC-32"),
  slice("/* ---------- CRC-32", "/* ---------- Reed-Solomon"),
  slice("/* ---------- Reed-Solomon", "/* ---------- container (mime"),
  slice("/* ---------- container (mime", "/* ---------- compression ---------- */"),
  "globalThis.__api = { pack, unpack, crc32, chunkify, reassemble, FLAG_CRC32, FLAG_ENCRYPTED, setLimit: v => { msgLimit = v; } };",
].join("\n");

new Function(src)();
const { pack, unpack, crc32, chunkify, reassemble, FLAG_CRC32, FLAG_ENCRYPTED, setLimit } = globalThis.__api;

const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = bytes => btoa(String.fromCharCode(...bytes));
const img = Uint8Array.from({ length: 5000 }, (_, i) => (i * 37 + 11) & 0xff);
let pass = 0;
const t = async (name, fn) => { await fn(); console.log("  ok  " + name); pass++; };

// CRC-32 against the canonical IEEE check value
await t("crc32('123456789') === 0xCBF43926", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

await t("unlocked roundtrip preserves bytes and reports verified", async () => {
  const b64 = await pack(img, "image/webp", "");
  const out = await unpack(b64, "");
  assert.equal(out.mime, "image/webp");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, true);
});

await t("unlocked payload sets FLAG_CRC32 and carries a 4-byte trailer", async () => {
  const b64 = await pack(img, "image/webp", "");
  const c = b64ToBytes(b64);
  assert.equal(c[4], FLAG_CRC32);
  assert.equal(c.length, 5 + 1 + "image/webp".length + img.length + 4);
});

await t("a single flipped byte is caught and named", async () => {
  const c = b64ToBytes(await pack(img, "image/webp", ""));
  c[400] ^= 0x01;
  await assert.rejects(() => unpack(bytesToB64(c), ""), /damaged/i);
});

await t("a truncated tail is caught", async () => {
  const c = b64ToBytes(await pack(img, "image/webp", ""));
  await assert.rejects(() => unpack(bytesToB64(c.subarray(0, c.length - 9)), ""), /damaged/i);
});

await t("a pre-checksum sender (flags=0) still decodes, verified=false", async () => {
  const c = b64ToBytes(await pack(img, "image/webp", ""));
  const legacy = new Uint8Array(c.length - 4);
  legacy.set(c.subarray(0, c.length - 4));
  legacy[4] = 0;                                  // old sender: no flags at all
  const out = await unpack(bytesToB64(legacy), "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, false);
});

await t("an OLD receiver still parses a new unlocked payload (trailing 4 bytes only)", async () => {
  // replicate the pre-change reader: ignore flags, parse mime, take the rest as image bytes
  const c = b64ToBytes(await pack(img, "image/webp", ""));
  const body = c.subarray(5);
  const mlen = body[0];
  const mime = new TextDecoder().decode(body.subarray(1, 1 + mlen));
  const got = body.subarray(1 + mlen);
  assert.equal(mime, "image/webp");
  assert.equal(got.length, img.length + 4);
  assert.deepEqual(Uint8Array.from(got.subarray(0, img.length)), img);
});

await t("encrypted roundtrip: flag, verified, and wrong-password rejection", async () => {
  const b64 = await pack(img, "image/jpeg", "hunter2");
  assert.equal(b64ToBytes(b64)[4], FLAG_ENCRYPTED);
  const out = await unpack(b64, "hunter2");
  assert.deepEqual(Uint8Array.from(out.img), img);
  assert.equal(out.verified, true);
  await assert.rejects(() => unpack(b64, "hunter3"), /Wrong password/);
});

await t("chunkify → reassemble roundtrips at SMS-sized limits, order-independent", async () => {
  setLimit(160);
  const b64 = await pack(img, "image/webp", "");
  const chunks = chunkify(b64);
  assert.ok(chunks.length > 30, `expected many parts, got ${chunks.length}`);
  for (const c of chunks) assert.ok(c.length <= 160, `chunk over the limit: ${c.length}`);
  const shuffled = [...chunks].reverse();
  const r = reassemble(shuffled.join("\n"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.s, b64);
  const out = await unpack(r.s, "");
  assert.deepEqual(Uint8Array.from(out.img), img);
  setLimit(60000);
});

await t("chunkify keeps every part under the limit at 6-digit part counts", async () => {
  setLimit(160);   // SMS: the smallest real limit, where a big payload pushes the part count to 6 digits
  const chunks = chunkify("A".repeat(20_000_000));
  assert.ok(chunks.length > 99999, `expected 6-digit part count, got ${chunks.length}`);
  for (const c of chunks) assert.ok(c.length <= 160, `chunk over the limit: ${c.length} — "${c}"`);
  setLimit(60000);
});

console.log(`\n${pass} passed`);

// --- memoization (issue #172) ---
await t("reassemble returns the identical object for an unchanged string", async () => {
  const chunks = chunkify(await pack(img, "image/webp", ""));
  const text = chunks.join("\n");
  const a = reassemble(text);
  const b = reassemble(text);
  assert.equal(a, b, "expected the cached object back");
  const c = reassemble(text + "\nPXT/ffffff/1/1/QQ==");
  assert.notEqual(c, a, "a changed input must re-parse");
});
console.log(`${pass} passed (with memo checks)`);
