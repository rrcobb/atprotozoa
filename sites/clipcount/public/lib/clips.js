// Pure logic for clipcount: parsing a count, breaking it into containers, and
// the physical numbers (volume, mass, length). No DOM, so tests can import it.
//
// Counts are BigInt, and anything that can overflow a double (volume of 1e400
// clips) is carried as a base-10 logarithm instead.

// One standard gem clip (No. 1): ~32 mm long, ~8 mm wide, ~0.5 g of steel wire.
// Loose in a box a clip claims ~0.4 cm^3 of bounding space; real boxes fill to
// about 90%, so each clip costs 0.4 / 0.9 cm^3 of container.
export const CLIP_LEN_M = 0.032;
export const CLIP_MASS_KG = 0.0005;
export const CLIP_VOL_M3 = (0.4 / 0.9) * 1e-6;

// Browser limit, not a product choice: BigInt math and toString on a number
// with more digits than this starts to stall the tab. 100,000 digits is
// already 10^99,999 clips -- hugely past the observable universe (~10^80 atoms).
export const MAX_DIGITS = 100000;

// Sizes are in clips. Dimensions are the physical container, cm / m, derived
// from CLIP_VOL_M3 (volume = clips * CLIP_VOL_M3) so every row is consistent.
export const TIERS = [
  { id: "clip", name: "paperclip", plural: "paperclips", size: 1n, dims: "32 × 8 mm" },
  { id: "box", name: "box of 100", plural: "boxes of 100", size: 100n, dims: "5.5 × 4 × 2 cm" },
  { id: "carton", name: "carton", plural: "cartons", size: 10000n, dims: "22 × 20 × 10 cm" },
  { id: "crate", name: "shipping box", plural: "shipping boxes", size: 100000n, dims: "35 × 35 × 36 cm" },
  { id: "pallet", name: "pallet", plural: "pallets", size: 3000000n, dims: "1.2 × 1.0 × 1.1 m" },
  { id: "container", name: "shipping container", plural: "shipping containers", size: 75000000n, dims: "6.1 × 2.4 × 2.6 m (20 ft)" },
  { id: "ship", name: "container ship", plural: "container ships", size: 1500000000000n, dims: "400 × 59 m, 20,000 containers" },
];

const SUFFIX = { k: 3, m: 6, mm: 6, b: 9, bn: 9, t: 12, tn: 12 };
const WORDS = {
  thousand: 3, million: 6, billion: 9, trillion: 12, quadrillion: 15,
  quintillion: 18, sextillion: 21, septillion: 24, octillion: 27,
  nonillion: 30, decillion: 33, googol: 100,
};

// Accepts "1,000,000", "1e12", "1.5e9", "2^64", "2^64-1", "5k", "3 billion",
// "a googol". Returns a BigInt >= 0, or null if it isn't a count.
export function parseCount(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase().replace(/[,_\s]+/g, " ").trim();
  if (!s) return null;
  if (s === "a googol" || s === "googol") return 10n ** 100n;
  s = s.replace(/^an? /, "");

  let m = s.match(/^2\s*\^\s*(\d+)\s*(?:-\s*1)?$/);
  if (m) {
    const k = Number(m[1]);
    if (k * 0.30103 > MAX_DIGITS) return null;
    const v = 2n ** BigInt(k);
    return /-\s*1\s*$/.test(s) ? v - 1n : v;
  }
  m = s.match(/^10\s*\^\s*(\d+)$/);
  if (m) return Number(m[1]) > MAX_DIGITS ? null : 10n ** BigInt(m[1]);

  // number + optional exponent / suffix / word
  m = s.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(?:e\s*\+?(\d+)|([a-z]+))?$/);
  if (!m) {
    // plain digits with spaces removed ("1 000 000")
    const d = s.replace(/ /g, "");
    return /^\d+$/.test(d) && d.length <= MAX_DIGITS ? BigInt(d) : null;
  }
  let exp = 0;
  if (m[2] !== undefined) exp = Number(m[2]);
  else if (m[3]) {
    if (m[3] in SUFFIX) exp = SUFFIX[m[3]];
    else if (m[3] in WORDS) exp = WORDS[m[3]];
    else return null;
  }
  if (exp > MAX_DIGITS) return null;
  const [ip, fp = ""] = m[1].split(".");
  // shift the decimal point right by exp; any fraction left over is dropped
  const out = (ip + fp.slice(0, exp).padEnd(exp, "0")).replace(/^0+(?=\d)/, "");
  return BigInt(out || "0");
}

// "1,234,567" for modest numbers, "1.23 × 10^40" once it stops fitting.
// Returns plain text; fmtHTML wraps the exponent in <sup>.
export function fmtCount(n) {
  const s = n.toString();
  if (s.length <= 15) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sci(s);
}
function sci(s) {
  const e = s.length - 1;
  let mant = s.slice(0, 1) + "." + s.slice(1, 4);
  mant = mant.replace(/\.?0+$/, "");
  return `${mant} × 10^${e}`;
}
export function fmtHTML(text) {
  return text.replace(/\^(-?\d+)/g, "<sup>$1</sup>");
}

// log10 of a positive BigInt without converting to a double.
export function log10Big(n) {
  const s = n.toString();
  if (s.length <= 15) return Math.log10(Number(s));
  return s.length - 1 + Math.log10(Number(s.slice(0, 15)) / 1e14);
}

// "12.3 million"-style short form of 10^l with a unit, or plain sci.
export function fmtLog(l, digits = 3) {
  if (!isFinite(l)) return "0";
  if (l < 6) {
    const v = 10 ** l;
    if (v >= 100) return Math.round(v).toLocaleString("en-US");
    return Number(v.toPrecision(digits)).toString();
  }
  let e = Math.floor(l);
  let m = 10 ** (l - e);
  if (Number(m.toFixed(digits - 1)) >= 10) { m = 1; e += 1; }
  return `${m.toFixed(digits - 1).replace(/\.?0+$/, "")} × 10^${e}`;
}

// Greedy breakdown: biggest container first. Returns [{tier, n}] for n > 0.
export function breakdown(count) {
  const out = [];
  let rem = count;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const n = rem / TIERS[i].size;
    if (n > 0n) { out.push({ tier: TIERS[i], n }); rem -= n * TIERS[i].size; }
  }
  return out;
}

// Physical numbers, all as log10 so any size works. count must be > 0.
export function physical(count) {
  const l = log10Big(count);
  return {
    logCount: l,
    logVolM3: l + Math.log10(CLIP_VOL_M3),
    logMassKg: l + Math.log10(CLIP_MASS_KG),
    logLenM: l + Math.log10(CLIP_LEN_M), // laid end to end
  };
}

// Reference objects: [name, log10 of the quantity in SI]. Sources are the
// usual round figures; precision beyond two digits would be fake.
export const VOLUME_REFS = [
  ["a bathtub", Math.log10(0.3)],
  ["an Olympic swimming pool", Math.log10(2500)],
  ["the Great Pyramid of Giza", Math.log10(2.6e6)],
  ["Lake Geneva", Math.log10(8.9e10)],
  ["Mount Everest", Math.log10(1.0e12)],
  ["all of Earth's oceans", Math.log10(1.33e18)],
  ["the Earth", Math.log10(1.083e21)],
  ["Jupiter", Math.log10(1.43e24)],
  ["the Sun", Math.log10(1.41e27)],
  ["the observable universe", Math.log10(3.6e80)],
];
export const MASS_REFS = [
  ["a house cat", Math.log10(4)],
  ["a grand piano", Math.log10(400)],
  ["an elephant", Math.log10(6000)],
  ["a blue whale", Math.log10(1.5e5)],
  ["the Eiffel Tower", Math.log10(1.0e7)],
  ["the Great Pyramid", Math.log10(5.7e9)],
  ["every human alive, combined", Math.log10(4.0e11)],
  ["the Moon", Math.log10(7.35e22)],
  ["the Earth", Math.log10(5.97e24)],
  ["the Sun", Math.log10(1.99e30)],
];
export const LENGTH_REFS = [
  ["a football pitch", Math.log10(105)],
  ["Mount Everest's height", Math.log10(8849)],
  ["the Great Wall of China", Math.log10(2.1e7)],
  ["the Earth's circumference", Math.log10(4.0075e7)],
  ["the way to the Moon", Math.log10(3.844e8)],
  ["the way to the Sun", Math.log10(1.496e11)],
  ["Neptune's orbit", Math.log10(4.5e12)],
  ["a light-year", Math.log10(9.461e15)],
  ["the way to the nearest star", Math.log10(4.0e16)],
  ["the Milky Way's width", Math.log10(9.5e20)],
  ["the observable universe", Math.log10(8.8e26)],
];

// Largest reference at or below the value -> "about 3.2× the Earth".
// Below the smallest reference, compare to it as a fraction.
export function compare(logValue, refs) {
  let pick = refs[0];
  for (const r of refs) if (r[1] <= logValue) pick = r;
  const ratioLog = logValue - pick[1];
  return { name: pick[0], ratioLog, ratio: 10 ** ratioLog };
}

// Slider (log scale) <-> count.
export function countFromLog(l) {
  if (l <= 0) return 1n;
  const e = Math.floor(l);
  const m = 10 ** (l - e);
  const keep = Math.min(e, 6);
  return BigInt(Math.round(m * 10 ** keep)) * 10n ** BigInt(e - keep);
}
