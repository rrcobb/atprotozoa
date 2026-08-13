export const CONSTANTS = {
  DAMPING: 0.85, ITERATIONS: 40, EPSILON: 1e-9,
  STREAK_CAP_DAYS: 10, STREAK_BONUS_MAX: 0.5, RECIPROCITY_BONUS: 0.5,
  POST_PAGE_LIMIT: 100, MAX_POST_PAGES: 3, LIKES_PAGE_LIMIT: 100,
  MAX_LIKE_PAGES_PER_POST: 2, FETCH_CONCURRENCY: 5, MAX_RETRIES: 3,
  RETRY_BASE_MS: 400,
};
const HANDLE_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+)$/;
const AT_URI_RE = /^at:\/\/(did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+)|[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)(\/[^\s]+)?$/;
const CURSOR_RE = /^[a-zA-Z0-9_.:-]{1,512}$/;
export const isValidHandle = (s) => typeof s === "string" && s.length <= 253 && HANDLE_RE.test(s);
export const isValidDid = (s) => typeof s === "string" && s.length <= 2048 && DID_RE.test(s);
export const isValidAtUri = (s) => typeof s === "string" && s.length <= 8192 && AT_URI_RE.test(s);
export const isValidCursor = (s) => typeof s === "string" && CURSOR_RE.test(s);
export const isValidSubject = (s) => isValidDid(s) || isValidHandle(s);
export function distinctDaysUTC(times) {
  const days = new Set();
  for (const t of times) if (Number.isFinite(t)) { const d = new Date(t); days.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`); }
  return days.size;
}
const key = (a, b) => `${a}\0${b}`;
export function computeEdgeWeights(edges) {
  const present = new Set(edges.map((e) => key(e.from, e.to)));
  return edges.map((e) => {
    const reciprocal = present.has(key(e.to, e.from));
    const streak = Math.min(e.distinctDays / CONSTANTS.STREAK_CAP_DAYS, 1) * CONSTANTS.STREAK_BONUS_MAX;
    const weight = e.likeCount * (1 + streak) * (1 + (reciprocal ? CONSTANTS.RECIPROCITY_BONUS : 0));
    return { ...e, reciprocal, weight };
  });
}
export function computePrestige(nodeIds, weightedEdges, opts = {}) {
  const d = opts.damping ?? CONSTANTS.DAMPING, max = opts.iterations ?? CONSTANTS.ITERATIONS, eps = opts.epsilon ?? CONSTANTS.EPSILON, n = nodeIds.length;
  if (!n) return { scores: new Map(), iterations: 0, converged: true };
  const idx = new Map(nodeIds.map((id, i) => [id, i])), out = new Float64Array(n), incoming = Array.from({ length: n }, () => []);
  for (const e of weightedEdges) { const f = idx.get(e.from), t = idx.get(e.to); if (f === undefined || t === undefined || e.weight <= 0) continue; out[f] += e.weight; incoming[t].push([f, e.weight]); }
  let scores = new Float64Array(n).fill(1), converged = false, iterations = 0;
  for (; iterations < max; iterations++) {
    let dangling = 0; for (let i = 0; i < n; i++) if (!out[i]) dangling += scores[i];
    const next = new Float64Array(n).fill(1 - d + (d * dangling) / n);
    for (let t = 0; t < n; t++) for (const [f, w] of incoming[t]) next[t] += d * (w / out[f]) * scores[f];
    let delta = 0; for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(next[i] - scores[i]));
    scores = next; if (delta < eps) { converged = true; iterations++; break; }
  }
  return { scores: new Map(nodeIds.map((id, i) => [id, scores[i]])), iterations, converged };
}
export const toPrestigeIndex = (score) => Math.round(score * 1000) / 10;
