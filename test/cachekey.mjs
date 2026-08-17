// Every setting that changes the output must change the cache key. This is the test that would have
// caught #196 and #214 — both were a setting silently serving a stale payload.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");

// pull the two key builders out of the file as written
const a = html.indexOf("const packInputs =");
const b = html.indexOf("async function refresh()");
const decls = html.slice(a, html.indexOf("\n", html.indexOf("[packKeyStr, msgLimit, recoveryLevel].join(\"|\")")));

let loadToken = 1, textCodec = "b64", msgLimit = 60000, recoveryLevel = "off";
const mk = () => new Function("state", `
  let { loadToken, textCodec, msgLimit, recoveryLevel } = state;
  ${decls}
  return { packInputs, chunkInputs };
`);

const build = state => mk()(state);
let pass = 0; const t=(n,f)=>{f();console.log("  ok  "+n);pass++;};
const base = { loadToken:1, textCodec:"b64", msgLimit:60000, recoveryLevel:"off" };
const keyFor = (state, d=768, q=70, pw="") => {
  const { packInputs, chunkInputs } = build(state);
  const pk = packInputs(d, q, pw);
  return { pack: pk, chunk: chunkInputs(pk) };
};

t("every pack input changes the pack key", () => {
  const ref = keyFor(base);
  assert.notEqual(keyFor({...base, loadToken:2}).pack, ref.pack, "loadToken (new file / Start over)");
  assert.notEqual(keyFor(base, 512).pack, ref.pack, "max dimension");
  assert.notEqual(keyFor(base, 768, 71).pack, ref.pack, "quality");
  assert.notEqual(keyFor(base, 768, 70, "pw").pack, ref.pack, "password");
  assert.notEqual(keyFor({...base, textCodec:"dense"}).pack, ref.pack, "textCodec — the #214 omission");
});

t("every additional chunk input changes the chunk key", () => {
  const ref = keyFor(base);
  assert.notEqual(keyFor({...base, msgLimit:160}).chunk, ref.chunk, "msgLimit — the #196 omission");
  assert.notEqual(keyFor({...base, recoveryLevel:"strong"}).chunk, ref.chunk, "recovery level");
});

t("a chunk-only input does NOT disturb the pack key", () => {
  // this is the whole point of two keys: changing the chat app must re-chunk without re-encrypting
  // under a fresh IV, which would orphan every part already sent (#183)
  const ref = keyFor(base);
  assert.equal(keyFor({...base, msgLimit:160}).pack, ref.pack, "msgLimit must not force a re-pack");
  assert.equal(keyFor({...base, recoveryLevel:"strong"}).pack, ref.pack, "recovery must not force a re-pack");
});

t("identical inputs produce an identical key, so a no-op refresh is a cache hit", () => {
  assert.equal(keyFor(base).pack, keyFor(base).pack);
  assert.equal(keyFor(base).chunk, keyFor(base).chunk);
});

t("the declared lists are the ones the file actually uses", () => {
  // guard against the lists drifting from the call sites
  assert.match(html, /const packKeyNow = packInputs\(d, q, pw\);/);
  assert.match(html, /const chunkKeyNow = chunkInputs\(packKeyNow\);/);
  // exactly one call site each: the keys must not be rebuilt anywhere else, or the lists stop being
  // the single place a new setting has to be declared
  assert.equal((html.match(/packInputs\(/g) || []).length, 1, "packInputs must have exactly one call site");
  assert.equal((html.match(/chunkInputs\(/g) || []).length, 1, "chunkInputs must have exactly one call site");
  // and nothing may hand-assemble a key alongside them
  assert.ok(!/packKeyNow = `/.test(html), "no hand-built pack key may remain");
  assert.ok(!/chunkKeyNow = `/.test(html), "no hand-built chunk key may remain");
});

console.log(`\n${pass} passed`);
