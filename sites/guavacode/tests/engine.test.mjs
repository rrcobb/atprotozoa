import test from "node:test";
import assert from "node:assert";
import { compile, Scanner, asciiBases, CODON_AA, AA } from "../public/lib/engine.js";

const B = "ACGT";
const rc = (s) => [...s].reverse().map((c) => ({ A: "T", C: "G", G: "C", T: "A", N: "N" }[c])).join("");
const countAll = (hay, needle) => { let n = 0; for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) n++; return n; };
const translate = (seq, f) => {
  let out = "";
  for (let i = f; i + 3 <= seq.length; i += 3) {
    const cod = seq.slice(i, i + 3);
    if (/N/.test(cod)) { out += "?"; continue; }
    const c = [...cod].reduce((a, ch) => a * 4 + B.indexOf(ch), 0);
    out += CODON_AA[c] === 20 ? "*" : AA[CODON_AA[c]];
  }
  return out;
};
const toBases = (str) => asciiBases(str).map((b) => B[b]).join("");

function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

test("scanner matches brute force on both strands, N breaks, chunk splits", () => {
  const r = rng(7);
  let seq = "";
  for (let i = 0; i < 60000; i++) seq += r() < 0.002 ? "N" : B[Math.floor(r() * 4)];
  // plant some hits
  const plant = (s, at) => seq = seq.slice(0, at) + s + seq.slice(at + s.length);
  plant(toBases("Hi"), 1000);
  plant(rc(toBases("Hi")), 5000);
  plant("GATTACA", 9000);
  plant("GATTACA", 9001 + 7);
  const terms = [
    { id: 0, text: "Hi" }, { id: 1, text: "GATTACA" }, { id: 2, text: "AC" }, { id: 3, text: "KA" }, { id: 4, text: "CAT" },
    { id: 5, text: "A" }, { id: 6, text: "Konami ↑" },
  ];
  const sc = new Scanner(compile(terms));
  sc.startRecord();
  const fasta = new TextEncoder().encode(">header line\n" + seq.match(/.{1,70}/g).join("\n") + "\n");
  for (let i = 0; i < fasta.length; i += 777) sc.feed(fasta.subarray(i, i + 777));
  const { rows } = sc.tally();

  // text mode, case forms
  const forms = (t) => [...new Set([t, t.toLowerCase(), t.toUpperCase(), t[0].toUpperCase() + t.slice(1).toLowerCase()])];
  for (const t of terms) {
    let plus = 0, minus = 0;
    for (const f of forms(t.text)) {
      const b = toBases(f);
      plus += countAll(seq, b);
      if (rc(b) !== b) minus += countAll(seq, rc(b));
    }
    assert.strictEqual(rows.get(t.id).text.plus, plus, `text+ ${t.text}`);
    assert.strictEqual(rows.get(t.id).text.minus, minus, `text- ${t.text}`);
  }
  assert.strictEqual(rows.get(1).letters.plus, countAll(seq, "GATTACA"));
  assert.strictEqual(rows.get(1).letters.minus, countAll(seq, rc("GATTACA")));
  assert.ok(rows.get(1).letters.plus >= 2);
  assert.strictEqual(rows.get(6).protein, undefined); // arrow has no amino acid

  // protein, six frames
  for (const t of [terms[2], terms[3], terms[4], terms[5]]) {
    const p = t.text.toUpperCase();
    let plus = 0, minus = 0;
    for (let f = 0; f < 3; f++) {
      plus += countAll(translate(seq, f), p);
      minus += countAll(translate(rc(seq), f), p);
    }
    // frames of the reverse strand partition the same windows, so totals agree
    assert.strictEqual(rows.get(t.id).protein.plus, plus, `prot+ ${p}`);
    assert.strictEqual(rows.get(t.id).protein.minus, minus, `prot- ${p}`);
  }
});

test("palindromic site counts once; expected is sane", () => {
  const sc = new Scanner(compile([{ id: 0, text: "ACGT" }]));
  sc.startRecord();
  sc.feed(new TextEncoder().encode(">h\nTTACGTTT\n"));
  const r = sc.tally().rows.get(0);
  assert.strictEqual(r.letters.plus, 1);
  assert.strictEqual(r.letters.minus, 0);
  assert.ok(r.letters.expected > 0 && r.letters.expected < 1);
});

test("konami code: not encodable as protein, essentially absent as text", () => {
  const c = compile([{ id: 0, text: "↑↑↓↓←→←→BA" }]);
  assert.ok(c.info.get(0).protein.reason);
  assert.strictEqual(c.info.get(0).bases, 104);
});
