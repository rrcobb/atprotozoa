// The "algorithm": a per-topic weight table. A like boosts that topic (and the
// heat it was liked at); everything else drifts a little toward forgotten, so
// the feed narrows onto what you reacted to. Pure functions, no DOM.

export const LIKE_BOOST = 1.8;
// Weights never reach zero: a feed that can only show one topic is a dead end,
// and this keeps a little "you might also be mad about" in the mix on purpose.
export const FLOOR = 0.15;
export const CEIL = 40; // keeps one topic from drowning the float math after hundreds of likes

export function freshModel(keys) {
  return { w: Object.fromEntries(keys.map(k => [k, 1])), heat: 2, likes: 0 };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function applyLike(model, topic, heat, liked = true) {
  const w = { ...model.w };
  if (!(topic in w)) return model;
  w[topic] = clamp(liked ? w[topic] * LIKE_BOOST : w[topic] / LIKE_BOOST, FLOOR, CEIL);
  const likes = Math.max(0, model.likes + (liked ? 1 : -1));
  // heat follows what you like: a moving average, rounded when drawing
  const h = liked ? model.heat * 0.7 + heat * 0.3 : model.heat;
  return { w, heat: clamp(h, 1, 3), likes };
}

// r() in [0,1). Weighted draw over topic keys.
export function pickTopic(model, r) {
  const keys = Object.keys(model.w);
  const total = keys.reduce((s, k) => s + model.w[k], 0);
  let x = r() * total;
  for (const k of keys) { x -= model.w[k]; if (x < 0) return k; }
  return keys[keys.length - 1];
}

export function pickHeat(model, r) {
  const base = Math.round(model.heat);
  const j = r();
  return clamp(base + (j < 0.15 ? -1 : j > 0.85 ? 1 : 0), 1, 3);
}

export function topInterests(model, n = 3) {
  return Object.entries(model.w).filter(([, v]) => v > 1.01).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
