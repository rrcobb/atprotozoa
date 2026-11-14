// layout.js — d3-force layout where accounts that interacted pull together and strangers push apart.
// Links carry the interaction count; every community (model.js communities()) of 3+ accounts gets
// its own anchor point, so different communities separate while members cluster around theirs.
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from "./d3-force.js";

const GOLDEN = 2.399963229728653;

export function makeLayout(model, pull = 1) {
  const nodes = model.nodes;
  const sizes = new Map();
  for (const n of nodes) sizes.set(n.comm, (sizes.get(n.comm) || 0) + 1);
  // anchors on a golden-angle spiral, spaced by the area each community needs (~30px² per account)
  const anchors = new Map();
  let used = 0;
  for (const [c, k] of [...sizes].filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    const area = k * 30;
    const r = Math.sqrt((used + area / 2) * 1.6);
    const ang = anchors.size * GOLDEN;
    anchors.set(c, [Math.cos(ang) * r, Math.sin(ang) * r]);
    used += area;
  }
  const ax = (n) => (anchors.get(n.comm) || [0, 0])[0];
  const ay = (n) => (anchors.get(n.comm) || [0, 0])[1];
  // start each account near its anchor, spread by a fixed pseudo-random offset so the layout is stable per load
  nodes.forEach((n, i) => {
    const a = i * GOLDEN, r = 4 + Math.sqrt(i % 997) * 2;
    n.x = ax(n) + Math.cos(a) * r; n.y = ay(n) + Math.sin(a) * r; n.vx = 0; n.vy = 0;
  });
  const links = model.edges.map((e) => ({ source: e.a, target: e.b, n: e.n }));
  const sim = forceSimulation(nodes).stop()
    .alphaDecay(0.025)
    .velocityDecay(0.45)
    .force("link", forceLink(links).id((n) => n.did).distance(22)
      .strength((l) => Math.min(1, (0.25 + 0.12 * Math.min(l.n, 6)) * pull) / Math.min(l.source.deg, l.target.deg)))
    .force("charge", forceManyBody().strength(-16).distanceMax(420).theta(0.9))
    .force("x", forceX(ax).strength((n) => (anchors.has(n.comm) ? 0.07 : 0.012) * Math.max(pull, 0.15)))
    .force("y", forceY(ay).strength((n) => (anchors.has(n.comm) ? 0.07 : 0.012) * Math.max(pull, 0.15)))
    .force("collide", forceCollide((n) => 3 + Math.min(8, Math.sqrt(n.posts.length))).iterations(1));
  return {
    // run ticks for up to ms milliseconds; true while the layout is still moving
    step(ms) {
      const start = performance.now();
      while (sim.alpha() > sim.alphaMin() && performance.now() - start < ms) sim.tick();
      return sim.alpha() > sim.alphaMin();
    },
    // new pull strength from the slider: swap the strength functions' closure value and reheat
    setPull(p) {
      pull = p;
      sim.force("link").links(links); // re-reads the strength function
      sim.force("x").strength((n) => (anchors.has(n.comm) ? 0.07 : 0.012) * Math.max(pull, 0.15));
      sim.force("y").strength((n) => (anchors.has(n.comm) ? 0.07 : 0.012) * Math.max(pull, 0.15));
      sim.alpha(0.6);
    },
    stop() { sim.stop(); },
  };
}
