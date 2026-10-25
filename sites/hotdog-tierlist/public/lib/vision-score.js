// vision-score.js — pure math for reading toppings off a photo with CLIP
// zero-shot. No DOM, no model: takes already-computed embeddings so tests can
// feed it fake vectors.
//
// CLIP is a similarity model, not a detector, so every call here is a guess
// between two captions. We only keep a topping when the "with X" caption beats
// the plain-dog baseline by a clear margin, and only on photos that first pass
// a "is this a hot dog" gate. Expect misses (CLIP is bad at small garnishes);
// the UI labels these as guesses.

// topping name (matches toppings.js) -> how to describe it to CLIP.
export const VISUAL_PROMPTS = {
  mustard: "a hot dog with yellow mustard",
  ketchup: "a hot dog with red ketchup",
  onions: "a hot dog topped with chopped onions",
  relish: "a hot dog with green pickle relish",
  sauerkraut: "a hot dog topped with sauerkraut",
  chili: "a hot dog covered in meat chili",
  cheese: "a hot dog with melted cheese",
  jalapeños: "a hot dog with sliced jalapeños",
  mayo: "a hot dog with mayonnaise",
  pickles: "a hot dog with a pickle spear",
  tomato: "a hot dog with tomato slices",
  slaw: "a hot dog topped with coleslaw",
  bacon: "a bacon wrapped hot dog",
  avocado: "a hot dog with avocado",
  "crispy onions": "a hot dog with crispy fried onions",
  fries: "a hot dog with french fries",
};

export const GATE_PROMPTS = ["a photo of a hot dog", "a photo of some other food", "a photo that is not food"];
export const BASELINE_PROMPT = "a plain hot dog in a bun with no toppings";

// CLIP's learned temperature (logit scale).
const SCALE = 100;
// Gate: the hot dog caption must take at least this share of the softmax.
export const GATE_MIN = 0.5;
// Topping: "with X" must take at least this share against the plain baseline.
export const TOPPING_MIN = 0.8;

export function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export function softmax(xs) {
  const m = Math.max(...xs);
  const es = xs.map((x) => Math.exp(x - m));
  const s = es.reduce((a, b) => a + b, 0);
  return es.map((e) => e / s);
}

// img: embedding. text: {gate:[emb x3], baseline: emb, toppings:{name: emb}}
// -> {hotdog: number, toppings: [{name, p}]} (toppings empty when gate fails)
export function scoreImage(img, text) {
  const i = normalize(img);
  const gate = softmax(text.gate.map((t) => SCALE * dot(i, normalize(t))));
  const out = { hotdog: gate[0], toppings: [] };
  if (gate[0] < GATE_MIN) return out;
  const base = SCALE * dot(i, normalize(text.baseline));
  for (const [name, emb] of Object.entries(text.toppings)) {
    const p = softmax([SCALE * dot(i, normalize(emb)), base])[0];
    if (p >= TOPPING_MIN) out.toppings.push({ name, p });
  }
  out.toppings.sort((a, b) => b.p - a.p);
  return out;
}
