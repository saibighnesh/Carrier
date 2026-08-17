// The codec must be exactly invertible and must refuse anything it wasn't given.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const a = html.indexOf("/* ---------- dense text encoding"), b = html.indexOf("/* ---------- CRC-32");
new Function(html.slice(a,b) + "\nglobalThis.__D = { bytesToDense, denseToBytes, denseCharCount, b64CharCount, DENSE_BASE };")();
const { bytesToDense, denseToBytes, denseCharCount, b64CharCount, DENSE_BASE } = globalThis.__D;

let pass = 0; const t=(n,f)=>{f();console.log("  ok  "+n);pass++;};

t("round-trips every byte length from 0 to 400, and every byte value", () => {
  for (let n = 0; n <= 400; n++) {
    const src = Uint8Array.from({length:n}, (_,i)=>(i*97+n*31)&0xff);
    assert.deepEqual([...denseToBytes(bytesToDense(src))], [...src], `length ${n}`);
  }
  const every = Uint8Array.from({length:256}, (_,i)=>i);
  assert.deepEqual([...denseToBytes(bytesToDense(every))], [...every], "all 256 byte values");
});

t("round-trips a large random payload exactly", () => {
  const src = Uint8Array.from({length:120000}, (_,i)=>(i*2654435761)&0xff);
  const enc = bytesToDense(src);
  assert.deepEqual([...denseToBytes(enc)], [...src]);
});

t("carries exactly 12 bits per payload character — half of Base64", () => {
  // the payload body is exactly half; the ratio on the TOTAL is diluted by the one-character header,
  // so state the claim where it is true rather than rounding it up
  for (const n of [3, 30, 300, 3000, 30000]) {
    const enc = bytesToDense(new Uint8Array(n));
    assert.equal(enc.length, denseCharCount(n), `predicted length wrong at ${n}`);
    assert.equal(enc.length - 1, Math.ceil(n * 8 / 12), `payload body wrong at ${n}`);
  }
  assert.equal(bytesToDense(new Uint8Array(3)).length - 1, 2, "3 bytes must be 2 payload characters");
  assert.equal(b64CharCount(3), 4);
  // and the total ratio converges to 2 as the header amortises — check it is there at real payload sizes
  for (const [n, floor] of [[300, 1.98], [3000, 1.998], [40 * 1024, 1.9999]]) {
    const ratio = b64CharCount(n) / bytesToDense(new Uint8Array(n)).length;
    assert.ok(ratio > floor, `only ${ratio.toFixed(4)}x at ${n} bytes, expected > ${floor}`);
  }
  // at the smallest sizes the header is a real cost, and pretending otherwise would be dishonest
  assert.ok(b64CharCount(3) / bytesToDense(new Uint8Array(3)).length < 1.4, "tiny payloads gain much less");
});

t("every emitted character is inside the declared alphabet", () => {
  const enc = bytesToDense(Uint8Array.from({length:9000}, (_,i)=>(i*181)&0xff));
  for (const ch of enc) {
    const v = ch.charCodeAt(0) - DENSE_BASE;
    assert.ok(v >= 0 && v < 4096, `emitted U+${ch.codePointAt(0).toString(16)} outside the alphabet`);
  }
  assert.match(enc, /^[一-巿]+$/u);
});

t("survives normalisation, JSON and a UTF-8 byte round trip unchanged", () => {
  const src = Uint8Array.from({length:5000}, (_,i)=>(i*37+11)&0xff);
  const enc = bytesToDense(src);
  for (const form of ["NFC","NFD","NFKC","NFKD"])
    assert.deepEqual([...denseToBytes(enc.normalize(form))], [...src], `mangled by ${form}`);
  assert.deepEqual([...denseToBytes(JSON.parse(JSON.stringify(enc)))], [...src]);
  assert.deepEqual([...denseToBytes(new TextDecoder().decode(new TextEncoder().encode(enc)))], [...src]);
});

t("refuses a foreign character rather than decoding rubbish", () => {
  const enc = bytesToDense(Uint8Array.from({length:60},(_,i)=>i));
  const bad = enc.slice(0, 10) + "A" + enc.slice(11);
  assert.throws(() => denseToBytes(bad), /aren't part of it|altered/);
  const emoji = enc.slice(0, 10) + "\u{1F600}" + enc.slice(11);
  assert.throws(() => denseToBytes(emoji));
});

t("refuses a truncated payload rather than returning a short image", () => {
  const enc = bytesToDense(Uint8Array.from({length:61},(_,i)=>i));
  assert.throws(() => denseToBytes(enc.slice(0, enc.length - 1)), /truncated|damaged/);
  assert.throws(() => denseToBytes(""), /Empty/);
  assert.throws(() => denseToBytes("A".repeat(5)), /damaged/);
});

t("the length header disambiguates tails that share a character count", () => {
  // 2-byte and 3-byte payloads both occupy 2 payload characters; only the header separates them
  const two = bytesToDense(Uint8Array.from([1,2])), three = bytesToDense(Uint8Array.from([1,2,3]));
  assert.equal(two.length, three.length, "precondition: same character count");
  assert.notEqual(two[0], three[0], "headers must differ");
  assert.equal(denseToBytes(two).length, 2);
  assert.equal(denseToBytes(three).length, 3);
});

console.log(`\n${pass} passed`);
