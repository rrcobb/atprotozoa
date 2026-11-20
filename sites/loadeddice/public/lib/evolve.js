// A small genetic algorithm over the whole set of dice. A genome is one gene per
// die (face-plane distances, face-normal directions, face values); fitness is how
// much the distribution of summed top faces overlaps the target picture.
// Pure logic, no DOM.
import { SET, MAX_VAL, randomGene, fitness } from "./dice.js";

const POP = 40;      // population size: big enough to keep variety, small enough to run a generation in ~10ms in the page
const KEEP = 8;      // elites carried over unchanged

function gauss(rand) { return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand()); }

function cloneGene(g) {
  return { normals: g.normals.map((v) => v.slice()), logd: g.logd.slice(), vals: g.vals.slice() };
}

function mutateGene(g, sigma, rand) {
  const c = cloneGene(g);
  const n = c.logd.length;
  const rate = Math.max(1 / n, 0.12);
  for (let i = 0; i < n; i++) {
    if (rand() < rate) c.logd[i] = Math.max(-1.2, Math.min(1.2, c.logd[i] + gauss(rand) * sigma));
    if (rand() < rate * 0.7) {
      if (rand() < 0.15) c.vals[i] = Math.floor(rand() * (MAX_VAL + 1));
      else c.vals[i] = Math.max(0, Math.min(MAX_VAL, Math.round(c.vals[i] + gauss(rand) * (1 + sigma * 20))));
    }
    if (rand() < rate * 0.5) {
      const v = c.normals[i].map((x) => x + gauss(rand) * sigma * 0.5);
      const l = Math.hypot(...v) || 1;
      c.normals[i] = v.map((x) => x / l);
    }
  }
  return c;
}

export function createEvolver(target, rand = Math.random) {
  const evalInd = (genes) => ({ genes, ...fitness(genes, target) });
  let pop = Array.from({ length: POP }, () => evalInd(SET.map((n) => randomGene(n, rand))));
  pop.sort((a, b) => b.fit - a.fit);
  const ev = {
    generation: 0,
    get best() { return pop[0]; },
    step() {
      // anneal: wide jumps early, fine tuning later
      const sigma = 0.02 + 0.3 / (1 + ev.generation / 120);
      const next = pop.slice(0, KEEP);
      while (next.length < POP) {
        // tournament pick of a parent, mutate one or two dice (crossover = swap dice from another parent)
        const pa = tour(pop, rand), pb = tour(pop, rand);
        const genes = pa.genes.map((g, i) => (rand() < 0.25 ? pb.genes[i] : g));
        const k = Math.floor(rand() * genes.length);
        genes[k] = mutateGene(genes[k], sigma, rand);
        if (rand() < 0.5) { const k2 = Math.floor(rand() * genes.length); if (k2 !== k) genes[k2] = mutateGene(genes[k2], sigma, rand); }
        next.push(evalInd(genes));
      }
      next.sort((a, b) => b.fit - a.fit);
      pop = next;
      ev.generation++;
      return pop[0];
    },
  };
  return ev;
}

function tour(pop, rand) {
  const a = pop[Math.floor(rand() * pop.length)], b = pop[Math.floor(rand() * pop.length)];
  return a.fit >= b.fit ? a : b;
}
