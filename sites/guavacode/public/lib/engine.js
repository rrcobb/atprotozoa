// Genome scanner: counts how many times a piece of text is "encoded" in a DNA
// stream, three ways, on both strands, in one pass.
//
//   text    UTF-8 bytes written as 2 bits per base (A=00 C=01 G=10 T=11,
//           4 bases per byte, high bits first). "Rob" is 12 bases.
//   letters the term itself, if it is spelled only with A, C, G and T.
//   protein the term spelled in one-letter amino acids, found in any of the
//           six reading frames of the genome (a stop codon or an N breaks it).
//
// Matching is Aho-Corasick over every pattern at once, so a few thousand
// names cost the same single pass over the genome as one name does. Pure
// functions and typed arrays only: the same file runs in the browser and
// under node --test.

export const AA = "ACDEFGHIKLMNPQRSTVWY";
const STOP = 20;
const CODON_TCAG = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const TCAG_POS = [2, 1, 3, 0]; // A, C, G, T -> position in T, C, A, G order

// codon = b1*16 + b2*4 + b3 with bases coded A0 C1 G2 T3.
export const CODON_AA = new Uint8Array(64); // amino acid index 0..19, 20 = stop
export const RC_AA = new Uint8Array(64); // amino acid read off the opposite strand
for (let c = 0; c < 64; c++) {
  const b1 = c >> 4, b2 = (c >> 2) & 3, b3 = c & 3;
  const ch = CODON_TCAG[TCAG_POS[b1] * 16 + TCAG_POS[b2] * 4 + TCAG_POS[b3]];
  CODON_AA[c] = ch === "*" ? STOP : AA.indexOf(ch);
}
for (let c = 0; c < 64; c++) {
  const b1 = c >> 4, b2 = (c >> 2) & 3, b3 = c & 3;
  RC_AA[c] = CODON_AA[((3 - b3) << 4) | ((3 - b2) << 2) | (3 - b1)];
}

// ---- encoders -------------------------------------------------------------

export function asciiBases(str) {
  const out = [];
  for (const b of new TextEncoder().encode(str)) out.push((b >> 6) & 3, (b >> 4) & 3, (b >> 2) & 3, b & 3);
  return out;
}

// The case forms people actually write a name in. Each is encoded separately
// because 'R' and 'r' are different bytes.
export function caseForms(str) {
  const cap = str ? str[0].toUpperCase() + str.slice(1).toLowerCase() : str;
  return [...new Set([str, str.toLowerCase(), str.toUpperCase(), cap])];
}

export function literalBases(str) {
  const s = str.toUpperCase().replace(/\s+/g, "");
  if (!/^[ACGT]+$/.test(s)) return null;
  return [...s].map((ch) => "ACGT".indexOf(ch));
}

// -> { seq } or { reason } when some letter has no amino acid.
export function proteinSeq(str) {
  const letters = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return { reason: "no letters" };
  const bad = [...new Set([...letters].filter((ch) => !AA.includes(ch)))];
  if (bad.length) return { reason: `no amino acid for ${bad.join(", ")}` };
  return { seq: [...letters].map((ch) => AA.indexOf(ch)) };
}

const revComp = (seq) => seq.map((b) => 3 - b).reverse();

// ---- Aho-Corasick ---------------------------------------------------------

// patterns: array of int arrays over [0, alpha). Returns a dense automaton;
// `term[s]` is the pattern index ending exactly at state s (-1 if none),
// `link[s]` the nearest proper-suffix state that ends a pattern (0 if none).
export function buildAutomaton(patterns, alpha) {
  let maxStates = 1;
  for (const p of patterns) maxStates += p.length;
  const next = new Int32Array(maxStates * alpha).fill(-1);
  const term = new Int32Array(maxStates).fill(-1);
  let n = 1;
  patterns.forEach((p, idx) => {
    let s = 0;
    for (const a of p) {
      let t = next[s * alpha + a];
      if (t < 0) { t = n++; next[s * alpha + a] = t; }
      s = t;
    }
    term[s] = idx;
  });
  const fail = new Int32Array(n);
  const link = new Int32Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let a = 0; a < alpha; a++) {
    const t = next[a];
    if (t < 0) next[a] = 0;
    else queue[qt++] = t; // depth-1 states fail to root
  }
  while (qh < qt) {
    const s = queue[qh++];
    for (let a = 0; a < alpha; a++) {
      const t = next[s * alpha + a];
      const f = next[fail[s] * alpha + a];
      if (t < 0) { next[s * alpha + a] = f; continue; }
      fail[t] = f;
      link[t] = term[f] >= 0 ? f : link[f];
      queue[qt++] = t;
    }
  }
  return { next: next.subarray(0, n * alpha), term: term.subarray(0, n), link, states: n };
}

// ---- compile terms into automata -----------------------------------------

// terms: [{ id, text }]. Returns what Scanner needs plus per-term info.
export function compile(terms) {
  const dna = { keys: new Map(), seqs: [], owners: [] };
  const protF = { keys: new Map(), seqs: [], owners: [] };
  const protR = { keys: new Map(), seqs: [], owners: [] };
  const info = new Map();

  const add = (set, seq, owner) => {
    const key = seq.join("");
    let u = set.keys.get(key);
    if (u === undefined) { u = set.seqs.length; set.keys.set(key, u); set.seqs.push(seq); set.owners.push([]); }
    set.owners[u].push(owner);
  };

  for (const { id, text } of terms) {
    const rec = { text, bases: 0, literal: false, protein: null };
    const forms = text ? caseForms(text) : [];
    for (const form of forms) {
      const seq = asciiBases(form);
      rec.bases = Math.max(rec.bases, seq.length);
      add(dna, seq, { id, mode: "text", strand: "+" });
      const rc = revComp(seq);
      // a sequence that is its own reverse complement is one site, not two
      if (rc.join("") !== seq.join("")) add(dna, rc, { id, mode: "text", strand: "-" });
    }
    const lit = literalBases(text);
    if (lit) {
      rec.literal = true;
      add(dna, lit, { id, mode: "letters", strand: "+" });
      const rc = revComp(lit);
      if (rc.join("") !== lit.join("")) add(dna, rc, { id, mode: "letters", strand: "-" });
    }
    const prot = proteinSeq(text);
    if (prot.seq) {
      rec.protein = { length: prot.seq.length };
      add(protF, prot.seq, { id, mode: "protein", strand: "+" });
      add(protR, [...prot.seq].reverse(), { id, mode: "protein", strand: "-" });
    } else {
      rec.protein = { reason: prot.reason };
    }
    info.set(id, rec);
  }

  return {
    info,
    dna: { ...dna, auto: buildAutomaton(dna.seqs, 4) },
    protF: { ...protF, auto: buildAutomaton(protF.seqs, 21) },
    protR: { ...protR, auto: buildAutomaton(protR.seqs, 21) },
  };
}

// ---- scanner ---------------------------------------------------------------

// byte -> 0..3 base, 4 = anything else (N, IUPAC codes: breaks matches),
// 5 = line break (ignored)
const LUT = new Uint8Array(256).fill(4);
for (const [ch, v] of [["A", 0], ["C", 1], ["G", 2], ["T", 3]]) {
  LUT[ch.charCodeAt(0)] = v;
  LUT[ch.toLowerCase().charCodeAt(0)] = v;
}
LUT[10] = 5;
LUT[13] = 5;

export class Scanner {
  constructor(compiled) {
    this.c = compiled;
    this.countsDna = new Float64Array(compiled.dna.seqs.length);
    this.countsF = new Float64Array(compiled.protF.seqs.length);
    this.countsR = new Float64Array(compiled.protR.seqs.length);
    this.freq = [0, 0, 0, 0]; // A C G T actually seen
    this.startRecord();
  }

  // Call before each FASTA record; the first line of the record is a header.
  startRecord() {
    this.inHeader = true;
    this.s = 0;
    this.pf = [0, 0, 0];
    this.pr = [0, 0, 0];
    this.codon = 0;
    this.valid = 0;
    this.pos = 0;
  }

  snapshot() {
    return {
      d: this.countsDna.slice(), f: this.countsF.slice(), r: this.countsR.slice(), freq: this.freq.slice(),
    };
  }
  restore(snap) {
    this.countsDna.set(snap.d); this.countsF.set(snap.f); this.countsR.set(snap.r); this.freq = snap.freq.slice();
  }

  feed(chunk) {
    let i = 0;
    const len = chunk.length;
    if (this.inHeader) {
      while (i < len && chunk[i] !== 10) i++;
      if (i === len) return;
      this.inHeader = false;
      i++;
    }
    const { dna, protF, protR } = this.c;
    const dn = dna.auto.next, dt = dna.auto.term, dl = dna.auto.link, cd = this.countsDna;
    const fn = protF.auto.next, ft = protF.auto.term, fl = protF.auto.link, cf = this.countsF;
    const rn = protR.auto.next, rt = protR.auto.term, rl = protR.auto.link, cr = this.countsR;
    const freq = this.freq;
    let { s, codon, valid, pos } = this;
    const pf = this.pf, pr = this.pr;
    for (; i < len; i++) {
      const b = LUT[chunk[i]];
      if (b === 5) continue;
      if (b === 4) {
        s = 0; valid = 0; pf[0] = pf[1] = pf[2] = 0; pr[0] = pr[1] = pr[2] = 0;
        pos++;
        continue;
      }
      freq[b]++;
      s = dn[s * 4 + b];
      for (let t = dt[s] >= 0 ? s : dl[s]; t > 0; t = dl[t]) cd[dt[t]]++;
      codon = ((codon << 2) | b) & 63;
      if (++valid >= 3) {
        const f = pos % 3;
        const a = CODON_AA[codon];
        if (a === STOP) pf[f] = 0;
        else {
          const st = fn[pf[f] * 21 + a];
          pf[f] = st;
          for (let t = ft[st] >= 0 ? st : fl[st]; t > 0; t = fl[t]) cf[ft[t]]++;
        }
        const ra = RC_AA[codon];
        if (ra === STOP) pr[f] = 0;
        else {
          const st = rn[pr[f] * 21 + ra];
          pr[f] = st;
          for (let t = rt[st] >= 0 ? st : rl[st]; t > 0; t = rl[t]) cr[rt[t]]++;
        }
        if (valid > 1e9) valid = 3;
      }
      pos++;
    }
    this.s = s; this.codon = codon; this.valid = valid; this.pos = pos;
  }

  // Sum counts and the chance-expectation per term:
  // Map id -> { text|letters|protein: { plus, minus, expected } }
  // Expected counts assume the genome is random with the base mix seen so far.
  tally() {
    const total = this.freq[0] + this.freq[1] + this.freq[2] + this.freq[3];
    const p = total ? this.freq.map((x) => x / total) : [0.25, 0.25, 0.25, 0.25];
    const pAa = new Float64Array(21), pAaRc = new Float64Array(21);
    for (let c = 0; c < 64; c++) {
      const pr = p[c >> 4] * p[(c >> 2) & 3] * p[c & 3];
      pAa[CODON_AA[c]] += pr;
      pAaRc[RC_AA[c]] += pr;
    }
    const out = new Map();
    const slot = (id, mode) => {
      let r = out.get(id);
      if (!r) { r = {}; out.set(id, r); }
      return (r[mode] ||= { plus: 0, minus: 0, expected: 0 });
    };
    const { dna, protF, protR } = this.c;
    dna.seqs.forEach((seq, u) => {
      let e = total;
      for (const b of seq) e *= p[b];
      for (const o of dna.owners[u]) {
        const r = slot(o.id, o.mode);
        r[o.strand === "+" ? "plus" : "minus"] += this.countsDna[u];
        r.expected += e;
      }
    });
    protF.seqs.forEach((seq, u) => {
      let e = total;
      for (const a of seq) e *= pAa[a];
      for (const o of protF.owners[u]) {
        const r = slot(o.id, "protein");
        r.plus += this.countsF[u];
        r.expected += e;
      }
    });
    protR.seqs.forEach((seq, u) => {
      let e = total;
      for (const a of seq) e *= pAaRc[a];
      for (const o of protR.owners[u]) {
        const r = slot(o.id, "protein");
        r.minus += this.countsR[u];
        r.expected += e;
      }
    });
    return { rows: out, total };
  }
}
