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
      if (!edges.has(k)) edges.set(k, { a: t, b: p.did, t: p.createdAt, uri: p.uri, infection: false });
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
  return { posts, nodes: [...nodes.values()], edges: list };
}

// Seeded PRNG so the layout is the same every load.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Force layout with spatial-hash repulsion (O(n), not O(n^2)), run in slices by the caller.
export function makeLayout(model) {
  const rand = rng(7);
  const idx = new Map();
  model.nodes.forEach((n, i) => {
    idx.set(n.did, i);
    const ang = rand() * Math.PI * 2, r = 40 + Math.sqrt(i) * 14;
    n.x = Math.cos(ang) * r; n.y = Math.sin(ang) * r; n.vx = 0; n.vy = 0;
  });
  const links = model.edges.map((e) => [idx.get(e.a), idx.get(e.b)]);
  const N = model.nodes.length;
  const R = 46; // repulsion radius: beyond this, dots don't push each other
  let alpha = 1;
  function step() {
    const nodes = model.nodes;
    const grid = new Map();
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const k = Math.floor(n.x / R) + "," + Math.floor(n.y / R);
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(i);
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const cx = Math.floor(n.x / R), cy = Math.floor(n.y / R);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get(cx + dx + "," + (cy + dy));
        if (!c) continue;
        for (const j of c) {
          if (j <= i) continue;
          const m = nodes[j];
          let ux = n.x - m.x, uy = n.y - m.y;
          let d2 = ux * ux + uy * uy;
          if (d2 > R * R) continue;
          if (d2 < 0.01) { ux = rand() - 0.5; uy = rand() - 0.5; d2 = 0.25; }
          const d = Math.sqrt(d2), f = ((R - d) / R) * 3 * alpha;
          ux = (ux / d) * f; uy = (uy / d) * f;
          n.vx += ux; n.vy += uy; m.vx -= ux; m.vy -= uy;
        }
      }
    }
    for (const [a, b] of links) {
      const p = nodes[a], q = nodes[b];
      const ux = q.x - p.x, uy = q.y - p.y, d = Math.hypot(ux, uy) || 1;
      const f = (d - 28) * 0.02 * alpha;
      p.vx += (ux / d) * f; p.vy += (uy / d) * f;
      q.vx -= (ux / d) * f; q.vy -= (uy / d) * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.004 * alpha; n.vy -= n.y * 0.004 * alpha;
      n.x += n.vx; n.y += n.vy;
      n.vx *= 0.6; n.vy *= 0.6;
    }
    alpha = Math.max(0.03, alpha * 0.99);
  }
  return { step };
}
