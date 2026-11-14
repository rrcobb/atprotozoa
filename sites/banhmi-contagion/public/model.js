// model.js — turn a pile of posts into carriers (accounts) and infection edges.
// Pure functions, no DOM, so they can be tested under node.

const didOf = (uri) => {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
};

// Every DID this post points at: reply parent + thread root, quoted post, @mentions.
export function linkedDids(rec) {
  const out = new Set();
  const r = rec?.reply;
  if (r) {
    const a = didOf(r.parent?.uri), b = didOf(r.root?.uri);
    if (a) out.add(a);
    if (b) out.add(b);
  }
  const e = rec?.embed;
  const q = e?.record?.uri ? e.record.uri : e?.record?.record?.uri;
  const qd = didOf(q);
  if (qd) out.add(qd);
  for (const f of rec?.facets || []) {
    for (const ft of f.features || []) if (ft.did) out.add(ft.did);
  }
  return out;
}

// posts: [{uri, did, handle, name, text, createdAt(ms), links:Set<did>}]
export function buildModel(posts) {
  posts = posts.slice().sort((a, b) => a.createdAt - b.createdAt);
  const nodes = new Map();
  for (const p of posts) {
    let n = nodes.get(p.did);
    if (!n) {
      n = { did: p.did, handle: p.handle, name: p.name, first: p.createdAt, posts: [], infector: null, infectedVia: null, deg: 0 };
      nodes.set(p.did, n);
    }
    n.posts.push(p);
    if (p.handle && p.handle !== "handle.invalid") n.handle = p.handle;
  }
  // pair edges: key "a|b" (a = the one linked to, b = the one who linked), earliest linking post wins
  const edges = new Map();
  for (const p of posts) {
    for (const t of p.links) {
      if (t === p.did || !nodes.has(t)) continue;
      const k = t + "|" + p.did;
      if (!edges.has(k)) edges.set(k, { a: t, b: p.did, t: p.createdAt, uri: p.uri, infection: false, n: 1 });
      else edges.get(k).n++; // how many posts carried this interaction
    }
  }
  // infector: earliest linking post by B to a carrier A who was already carrying at that moment
  const list = [...edges.values()].sort((x, y) => x.t - y.t);
  for (const e of list) {
    const b = nodes.get(e.b), a = nodes.get(e.a);
    if (!b.infector && a.first <= e.t && e.t <= b.first + 1) {
      // the link is in b's very first post: a plausible "caught it from a"
      b.infector = e.a;
      b.infectedVia = e.uri;
      e.infection = true;
    }
  }
  // a link inside b's first post is the cleanest signal; if none, fall back to the earliest link to an earlier carrier
  for (const e of list) {
    const b = nodes.get(e.b), a = nodes.get(e.a);
    if (!b.infector && a.first < b.first) {
      b.infector = e.a;
      b.infectedVia = e.uri;
      e.infection = true;
    }
  }
  for (const e of list) {
    nodes.get(e.a).deg++;
    nodes.get(e.b).deg++;
  }
  const out = { posts, nodes: [...nodes.values()], edges: list };
  communities(out);
  return out;
}

// Label propagation over the interaction graph: each account adopts the label with the most
// interaction weight among its neighbours, in a fixed order, so the result is deterministic.
// Sets n.comm (a label id) on every node and returns the label -> member count map.
export function communities(model) {
  const idx = new Map(model.nodes.map((n, i) => [n.did, i]));
  const adj = model.nodes.map(() => []);
  for (const e of model.edges) {
    const a = idx.get(e.a), b = idx.get(e.b);
    adj[a].push([b, e.n]); adj[b].push([a, e.n]);
  }
  const label = model.nodes.map((_, i) => i);
  for (let round = 0; round < 30; round++) {
    let moved = 0;
    for (let i = 0; i < label.length; i++) {
      if (!adj[i].length) continue;
      const w = new Map();
      for (const [j, wt] of adj[i]) w.set(label[j], (w.get(label[j]) || 0) + wt);
      let best = label[i], bw = w.get(best) || 0;
      for (const [l, x] of w) if (x > bw || (x === bw && l < best)) { best = l; bw = x; }
      if (best !== label[i]) { label[i] = best; moved++; }
    }
    if (!moved) break; // converged; the cap only stops a pathological flip-flop
  }
  const sizes = new Map();
  model.nodes.forEach((n, i) => { n.comm = label[i]; sizes.set(label[i], (sizes.get(label[i]) || 0) + 1); });
  return sizes;
}
