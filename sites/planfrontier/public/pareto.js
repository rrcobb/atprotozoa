// Pareto-front maths. Each metric: { key, dir: "min" | "max" }.
// A plan is dominated when another plan is at least as good on every metric
// and strictly better on at least one. The front is everything undominated.

function better(a, b, dir) {
  return dir === "min" ? a < b : a > b;
}

export function dominates(a, b, metrics) {
  let strictly = false;
  for (const m of metrics) {
    if (better(b[m.key], a[m.key], m.dir)) return false;
    if (better(a[m.key], b[m.key], m.dir)) strictly = true;
  }
  return strictly;
}

export function paretoFront(plans, metrics) {
  return plans.filter((p) => !plans.some((q) => q !== p && dominates(q, p, metrics)));
}

// Peeling the front repeatedly: rank 1 = frontier, rank 2 = frontier once rank 1 is removed...
export function paretoRanks(plans, metrics) {
  const ranks = new Map();
  let rest = plans.slice();
  let rank = 1;
  while (rest.length) {
    const front = paretoFront(rest, metrics);
    for (const p of front) ranks.set(p, rank);
    rest = rest.filter((p) => !front.includes(p));
    rank++;
  }
  return ranks;
}

// Expected out-of-pocket for a year with `spend` dollars of covered care, ignoring copays:
// you pay everything up to the deductible, then coinsurance, capped at the OOP max.
export function yearlyCost(plan, spend) {
  const ded = Math.min(spend, plan.deductible);
  const after = Math.max(0, spend - plan.deductible);
  const oop = Math.min(plan.oopMax, ded + after * (plan.coinsurance / 100));
  return plan.premium * 12 + oop;
}
