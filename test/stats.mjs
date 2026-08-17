// Validate the reliability maths against closed forms and independent computation, from index.html itself.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HTML = fileURLToPath(new URL("../index.html", import.meta.url));
import assert from "node:assert/strict";
const html = readFileSync(HTML, "utf8");
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b);if(i<0||j<0)throw new Error("marker "+(i<0?a:b));return html.slice(i,j);};
const store = new Map();
const src = [
  "let msgLimit = 60000;",
  "const RS_BLOCK = 32, RS_HALF = 32;",
  "const lsGet = k => store.has(k) ? store.get(k) : null;",
  "const lsSet = (k,v) => store.set(k, String(v));",
  "const lsRemove = k => store.delete(k);",
  slice("/* ---------- reliability mathematics", "/* ---------- container (mime"),
  "globalThis.__s = { lgamma, logChoose, lbeta, betaBinomTail, binomTail, planParity, lossPosterior, recordLoss };",
].join("\n");
new Function("store", src)(store);
const { lgamma, logChoose, betaBinomTail, binomTail, planParity, lossPosterior, recordLoss } = globalThis.__s;

let pass = 0; const t=(n,f)=>{f();console.log("  ok  "+n);pass++;};
const close = (x, y, eps, msg) => assert.ok(Math.abs(x - y) < eps, `${msg}: ${x} vs ${y}`);

t("lgamma matches known closed forms", () => {
  close(lgamma(1), 0, 1e-12, "lgamma(1)=0");
  close(lgamma(2), 0, 1e-12, "lgamma(2)=0");
  close(lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12, "lgamma(1/2)=ln sqrt(pi)");
  // lgamma(n+1) = ln(n!)
  let f = 1;
  for (let n = 1; n <= 20; n++) { f *= n; close(lgamma(n + 1), Math.log(f), 1e-9, `ln(${n}!)`); }
  close(lgamma(0.25) + lgamma(0.75), Math.log(Math.PI / Math.sin(Math.PI * 0.25)), 1e-11, "reflection");
});

t("logChoose is exact where a double can hold the answer, and survives where it can't", () => {
  const C = (n,k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  for (const [n,k] of [[5,2],[10,5],[52,5],[80,40],[170,3]])
    close(Math.exp(logChoose(n,k)), C(n,k), C(n,k) * 1e-9, `C(${n},${k})`);
  assert.ok(Number.isFinite(logChoose(60000, 30000)), "must not overflow where the raw value would");
  assert.equal(logChoose(5, 6), -Infinity);
  assert.equal(logChoose(5, -1), -Infinity);
});

t("Beta-Binomial with a uniform prior is uniform over outcomes (classic identity)", () => {
  // Beta(1,1) => P(X=i) = 1/(m+1) for every i, so the tail is exactly (k+1)/(m+1)
  for (const m of [1, 5, 20, 63]) for (const k of [0, 1, Math.floor(m/2), m-1])
    close(betaBinomTail(m, k, 1, 1), (k + 1) / (m + 1), 1e-12, `m=${m} k=${k}`);
});

t("Beta-Binomial is a proper distribution: the full tail is exactly 1", () => {
  for (const [m,a,b] of [[10,1,49],[30,2,8],[63,0.5,0.5],[40,5,120]])
    close(betaBinomTail(m, m, a, b), 1, 1e-12, `m=${m} a=${a} b=${b}`);
});

t("Beta-Binomial converges to the Binomial as the posterior sharpens", () => {
  // a/(a+b) fixed at 0.05, strength growing -> must approach Binomial(m, 0.05)
  const m = 40, k = 3, p = 0.05;
  const exact = binomTail(m, k, p);
  let prev = Infinity;
  for (const s of [50, 500, 5000, 50000]) {
    const d = Math.abs(betaBinomTail(m, k, p * s, (1 - p) * s) - exact);
    assert.ok(d < prev, `not converging at strength ${s}`);
    prev = d;
  }
  assert.ok(prev < 1e-4, `did not converge: ${prev}`);
});

t("binomTail agrees with direct summation", () => {
  const direct = (m,k,p) => { let s = 0; for (let i=0;i<=k;i++){ let c=1; for(let j=0;j<i;j++) c=c*(m-j)/(j+1); s += c*Math.pow(p,i)*Math.pow(1-p,m-i);} return s; };
  for (const [m,k,p] of [[20,2,0.05],[30,5,0.1],[15,0,0.02],[50,10,0.25]])
    close(binomTail(m,k,p), direct(m,k,p), 1e-10, `m=${m} k=${k} p=${p}`);
  assert.equal(binomTail(10, 10, 0.3), 1);
  assert.equal(binomTail(10, 0, 0), 1, "a lossless pipe never needs parity");
});

t("uncertainty makes the predictive strictly more conservative than a point estimate", () => {
  // same mean loss rate, far less evidence -> fatter tail -> lower survival probability
  const m = 40, k = 2;
  const weak = betaBinomTail(m, k, 1, 49);        // mean 2%, strength 50
  const strong = betaBinomTail(m, k, 100, 4900);  // mean 2%, strength 5000
  assert.ok(weak < strong, `expected weak(${weak}) < strong(${strong})`);
});

t("planParity: a clean pipe needs little, a lossy one needs more, monotonically", () => {
  const plan = (a,b,total=24) => planParity(total, 0.99, {a,b}).k;
  const clean = plan(1, 9999), typical = plan(1, 49), lossy = plan(10, 90), awful = plan(30, 70);
  assert.ok(clean <= typical, `clean ${clean} > typical ${typical}`);
  assert.ok(typical <= lossy, `typical ${typical} > lossy ${lossy}`);
  assert.ok(lossy <= awful, `lossy ${lossy} > awful ${awful}`);
  console.log(`      (parity for 24 parts @99%: clean ${clean}, typical ${typical}, 10% loss ${lossy}, 30% loss ${awful})`);
});

t("planParity actually meets the target it reports", () => {
  for (const total of [3, 12, 24, 32, 40, 80, 200]) for (const target of [0.9, 0.99, 0.999]) {
    const r = planParity(total, target, {a:5, b:95});
    if (!r.met) continue;
    assert.ok(r.imageProb >= target - 1e-9, `total=${total} target=${target}: claimed ${r.imageProb}`);
    assert.ok(r.k >= 0 && r.k <= 32);
  }
});

t("multi-block sends demand a stricter per-block target", () => {
  // 200 parts is 7 blocks; each must clear target^(1/7), so it needs at least as much parity as one block
  const one = planParity(32, 0.99, {a:5,b:95});
  const many = planParity(200, 0.99, {a:5,b:95});
  assert.equal(many.blocks, 7);
  assert.ok(many.k >= one.k, `7 blocks (${many.k}) must not need less than 1 block (${one.k})`);
  assert.ok(many.imageProb >= 0.99 - 1e-9);
});

t("planParity admits when the target is out of reach instead of pretending", () => {
  const r = planParity(32, 0.999999, {a:60, b:40});   // 60% loss
  assert.equal(r.met, false);
  assert.ok(r.imageProb < 0.999999);
});

t("posterior updates conjugately, and ages so an old bad pipe can be forgiven", () => {
  store.clear();
  let p = lossPosterior();
  assert.equal(p.a, 1); assert.equal(p.b, 49);
  recordLoss(3, 30);
  p = lossPosterior();
  assert.equal(p.a, 4, "a = prior + losses"); assert.equal(p.b, 76, "b = prior + successes");
  for (let i = 0; i < 300; i++) recordLoss(1, 20);
  p = lossPosterior();
  assert.ok(p.seen <= 4000, `history must be aged, got ${p.seen}`);
  store.clear();
  recordLoss(5, 3);            // nonsense
  assert.equal(lossPosterior().seen, 0, "must reject more losses than parts");
  store.set("carrier_loss", "999,1");
  assert.equal(lossPosterior().seen, 0, "must reject a corrupt record");
});

console.log(`\n${pass} passed`);
