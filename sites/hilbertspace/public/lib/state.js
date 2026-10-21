// A post as a quantum state: each distinct word is a basis state, and the post
// is a unit vector of complex amplitudes over them. Measuring picks one word
// with probability |amplitude|^2 (the Born rule) and the rest are gone.

// Words kept per post. A layout limit, not a data one: the words are drawn as a
// small cloud on screen and more than six overlap into mush.
export const MAX_BASIS = 6;

const STOP = new Set("the and for that this with you your are was but not have has had they them their what when who how why can just like from all out one get got its it's i'm don't about would could there will been were than then also into over some more very really".split(" "));

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function basisWords(text) {
  const seen = new Set();
  const out = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}'#@]+/u)) {
    const w = raw.replace(/^['#@]+|['#@]+$/g, "");
    if (w.length < 3 || STOP.has(w) || /^https?/.test(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  // longer words carry more of the post; keep the heaviest few
  out.sort((a, b) => b.length - a.length);
  return out.slice(0, MAX_BASIS);
}

// Returns { words, re, im, omega } or null if the post has no usable words.
export function makeState(text) {
  const words = basisWords(text);
  if (!words.length) return null;
  const re = [], im = [], omega = [];
  let norm = 0;
  for (const w of words) {
    const h = hash(w);
    const mag = 0.4 + ((h >>> 8) & 255) / 255;
    const ph = ((h >>> 16) / 65536) * Math.PI * 2;
    re.push(mag * Math.cos(ph)); im.push(mag * Math.sin(ph));
    omega.push(0.0004 + (h & 255) / 255 * 0.0012); // each basis state rotates at its own energy
    norm += mag * mag;
  }
  const k = 1 / Math.sqrt(norm);
  for (let i = 0; i < words.length; i++) { re[i] *= k; im[i] *= k; }
  return { words, re, im, omega };
}

export function probs(st) {
  return st.words.map((_, i) => st.re[i] ** 2 + st.im[i] ** 2);
}

// Evolve phases to time t: a_i(t) = a_i * e^{-i omega_i t}. Probabilities stay
// fixed; the phase is what the renderer shows turning.
export function phaseAt(st, i, t) {
  return Math.atan2(st.im[i], st.re[i]) - st.omega[i] * t;
}

// rnd is a [0,1) source so tests can pin it.
export function measure(st, rnd = Math.random) {
  const p = probs(st);
  let r = rnd(), acc = 0;
  for (let i = 0; i < p.length; i++) { acc += p[i]; if (r < acc) return { index: i, word: st.words[i], p: p[i] }; }
  const i = p.length - 1;
  return { index: i, word: st.words[i], p: p[i] };
}
