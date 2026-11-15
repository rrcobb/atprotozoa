// genome.js — every account's DID hashes to a locus in the guava genome
// (Psidium guajava 'New Age', GCA_016432845.1, 11 chromosomes). The 60 bases
// there are fetched live from NCBI (efetch allows cross-origin reads, ~3
// requests/second without a key, so fetches are spaced out and cached) and
// shown as the fighter's gene: GC%, translated peptide, locus.
// Inspired by @abeliansoup.bsky.social's guava genome posts (genome league,
// proteins fighting in the octagon).

const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const LEN = 60; // 20 codons: short enough to read in a move panel
const CHROMS = [
  ["CM028224.1", 40370300], ["CM028225.1", 38465871], ["CM028226.1", 50577630], ["CM028227.1", 48287879],
  ["CM028228.1", 44769864], ["CM028229.1", 42823316], ["CM028230.1", 35363649], ["CM028231.1", 33379055],
  ["CM028232.1", 32331238], ["CM028233.1", 37879573], ["CM028234.1", 37021556],
];
const AA = "KNKNTTTTRSRSIIMIQHQHPPPPRRRRLLLLEDEDAAAAGGGGVVVV*Y*YSSSS*CWCLFLF";
const B = { A: 0, C: 1, G: 2, T: 3 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function locusFor(key) {
  const h = hash("guava:" + key);
  const [acc, len] = CHROMS[h % CHROMS.length];
  const pos = 1 + (Math.imul(h, 2654435761) >>> 0) % (len - LEN);
  return { acc, chr: (h % CHROMS.length) + 1, pos };
}

export function translate(dna) {
  let out = "";
  for (let i = 0; i + 3 <= dna.length; i += 3) {
    const [a, b, c] = [B[dna[i]], B[dna[i + 1]], B[dna[i + 2]]];
    out += a === undefined || b === undefined || c === undefined ? "X" : AA[a * 16 + b * 4 + c];
  }
  return out;
}

export const gcPercent = (dna) => Math.round((100 * (dna.match(/[GC]/g) || []).length) / dna.length);

const cache = new Map(); // key -> Promise<{chr,pos,dna,peptide,gc}|null>
let chain = Promise.resolve();

export function geneFor(key) {
  if (cache.has(key)) return cache.get(key);
  const loc = locusFor(key);
  const p = (chain = chain.then(async () => {
    await new Promise((r) => setTimeout(r, 350));
    try {
      const r = await fetch(`${EFETCH}?db=nuccore&id=${loc.acc}&rettype=fasta&seq_start=${loc.pos}&seq_stop=${loc.pos + LEN - 1}`);
      if (!r.ok) return null;
      const dna = (await r.text()).split("\n").filter((l) => !l.startsWith(">")).join("").trim().toUpperCase();
      if (!/^[ACGTN]+$/.test(dna)) return null;
      return { ...loc, dna, peptide: translate(dna), gc: gcPercent(dna) };
    } catch { return null; }
  }));
  cache.set(key, p);
  return p;
}
