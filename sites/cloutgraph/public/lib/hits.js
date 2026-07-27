// hits.js — turn pool + like-edge counts into "network clout": PMI-weight
// the liker->author edges, run HITS on the resulting weighted directed
// graph, then score each pool member as the geometric mean of their hub and
// authority scores. Pure math, no network calls — see lib/likes.js for how
// the edge counts get built.

const ITERATIONS = 100;

// Positive Pointwise Mutual Information: how much more (or less) than
// chance does `from` like `to`, given how often `from` likes anyone in the
// pool and how often `to` gets liked by anyone in the pool. This is what
// keeps one hyperactive liker (high row sum) or one universally-liked
// account (high column sum) from dominating the graph on raw counts alone —
// an edge only carries weight if the pair like each other MORE than their
// individual activity levels would predict. Negative PMI (liked less than
// chance) clamps to 0 (this is the standard "PPMI" variant): an edge that
// under-happened shouldn't subtract from one that over-happened.
export function pmiWeights(edges) {
  const total = edges.reduce((s, e) => s + e.count, 0);
  if (!total) return [];
  const rowSum = new Map();
  const colSum = new Map();
  for (const e of edges) {
    rowSum.set(e.from, (rowSum.get(e.from) || 0) + e.count);
    colSum.set(e.to, (colSum.get(e.to) || 0) + e.count);
  }
  return edges
    .map((e) => {
      const pmi = Math.log((e.count * total) / (rowSum.get(e.from) * colSum.get(e.to)));
      return { from: e.from, to: e.to, count: e.count, weight: Math.max(0, pmi) };
    })
    .filter((e) => e.weight > 0);
}

function l2normalize(scores, ids) {
  let sumSq = 0;
  for (const id of ids) sumSq += scores[id] * scores[id];
  const norm = Math.sqrt(sumSq);
  if (norm > 0) for (const id of ids) scores[id] /= norm;
  return scores;
}

// Classic HITS (Kleinberg), generalized to weighted edges: authority(j) =
// sum over incoming edges of hub(i)*weight(i,j); hub(i) = sum over outgoing
// edges of authority(j)*weight(i,j); L2-normalize after each half-step.
// Returns { hub: {did:score}, authority: {did:score} }, both non-negative
// and L2-normalized.
export function runHits(ids, weightedEdges) {
  const hub = {};
  const authority = {};
  for (const id of ids) {
    hub[id] = 1;
    authority[id] = 0;
  }

  const outEdges = new Map();
  const inEdges = new Map();
  for (const id of ids) {
    outEdges.set(id, []);
    inEdges.set(id, []);
  }
  for (const e of weightedEdges) {
    if (!outEdges.has(e.from) || !inEdges.has(e.to)) continue;
    outEdges.get(e.from).push(e);
    inEdges.get(e.to).push(e);
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newAuth = {};
    for (const id of ids) {
      let s = 0;
      for (const e of inEdges.get(id)) s += hub[e.from] * e.weight;
      newAuth[id] = s;
    }
    l2normalize(newAuth, ids);

    const newHub = {};
    for (const id of ids) {
      let s = 0;
      for (const e of outEdges.get(id)) s += newAuth[e.to] * e.weight;
      newHub[id] = s;
    }
    l2normalize(newHub, ids);

    Object.assign(authority, newAuth);
    Object.assign(hub, newHub);
  }

  return { hub, authority };
}

// network clout = geometric mean of hub and authority — rewards a pool
// member who is BOTH liked by well-connected likers (authority) AND likes
// well-liked accounts (hub), rather than maxing out on just one axis.
export function cloutScores(hub, authority, ids) {
  const clout = {};
  for (const id of ids) clout[id] = Math.sqrt(Math.max(0, hub[id]) * Math.max(0, authority[id]));
  return clout;
}

// Convenience: run the whole pipeline (PMI -> HITS -> clout) and return a
// ranked array of { did, clout, hub, authority }, clout scaled 0-100 for
// display (relative to the pool's own top scorer).
export function rankPool(ids, edges) {
  const weighted = pmiWeights(edges);
  const { hub, authority } = runHits(ids, weighted);
  const clout = cloutScores(hub, authority, ids);
  const maxClout = Math.max(1e-12, ...ids.map((id) => clout[id]));
  return ids
    .map((id) => ({
      did: id,
      clout: (clout[id] / maxClout) * 100,
      hub: hub[id],
      authority: authority[id],
    }))
    .sort((a, b) => b.clout - a.clout);
}
