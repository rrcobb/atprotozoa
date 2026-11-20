// Pure simulation: no DOM, so it runs under node for tests.
// One tick = one day.

export const COST = { smelter: 400, assembler: 600, works: 900, truck: 250, hub: 800 };
export const UPKEEP = { smelter: 3, assembler: 3, works: 5, truck: 4, hub: 8 };
export const RATE = { smelter: 6, assembler: 6, works: 5, truck: 8 }; // units per day
export const TOWN_MAX_WIDGET = 46; // what a town will pay at most for a widget
// rivals ratchet their price up while they sell out, but not past what keeps
// the player in the game; the towns would pay up to TOWN_MAX_WIDGET
export const RIVAL_MAX_PRICE = 32;
// a town spreads its buying: no single supplier fills more than this share of
// its demand, however cheap, so the cheapest rival can't take the whole market
export const SUPPLIER_SHARE_MAX = 0.6;
// rivals stop expanding once together they could cover this share of all demand,
// which leaves a market for the player to win
export const RIVAL_SHARE_MAX = 0.7;
export const TOWN_MAX_GEAR = 16;
export const WORKSHOP_STEP = 40; // gears a town must absorb per workshop level
export const MAX_WORKSHOP = 5;

function rng(state) {
  // mulberry32, advancing state.seed
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newGame(seed = 1) {
  const s = {
    seed, day: 1, cash: 3000, log: [],
    b: { smelter: 1, assembler: 1, works: 1, truck: 1 },
    inv: { ore: 0, plate: 0, gear: 0, widget: 0 },
    price: { widget: 30, gear: 10 },
    shipGears: true,
    mines: [
      { name: "Gritstone Mining Co.", rate: 30, stock: 500, price: 2 },
      { name: "DeepHaul Extraction", rate: 24, stock: 400, price: 2 },
      { name: "Ferrous & Daughters", rate: 20, stock: 300, price: 2 },
    ],
    contract: [4, 4, 4],
    rivals: [
      { name: "Brassworks Ltd", cash: 1200, cap: 12, price: 28, cost: 15, sold: 0 },
      { name: "Autonomo Inc", cash: 1500, cap: 10, price: 27, cost: 14, sold: 0 },
      { name: "Cogsworth & Sons", cash: 900, cap: 14, price: 31, cost: 17, sold: 0 },
    ],
    regions: [
      { name: "Northmarch", hub: false, stock: { widget: 0, gear: 0 },
        dists: [{ name: "FreightBot Express", fee: 1.2, cap: 14 }, { name: "SlowBoat Haulage", fee: 0.6, cap: 8 }],
        towns: [{ name: "Ashby", pop: 1500 }, { name: "Dunmere", pop: 900 }, { name: "Kettle Falls", pop: 600 }] },
      { name: "Southreach", hub: false, stock: { widget: 0, gear: 0 },
        dists: [{ name: "Parcelmind", fee: 1.0, cap: 12 }, { name: "Rattletrap Lines", fee: 0.5, cap: 6 }],
        towns: [{ name: "Port Rue", pop: 1800 }, { name: "Wexcombe", pop: 800 }, { name: "Little Sprockett", pop: 500 }] },
    ],
    last: { sold: 0, revenue: 0, fees: 0, upkeep: 0, oreCost: 0, widgets: 0 },
    totalRevenue: 0,
  };
  for (const r of s.regions) for (const t of r.towns) Object.assign(t, { workshop: 0, gears: 0, sat: 1, demand: 0 });
  return s;
}

export function say(s, msg) {
  s.log.unshift(`day ${s.day}: ${msg}`);
  if (s.log.length > 60) s.log.length = 60; // display buffer only
}

export function totalPop(s) {
  return s.regions.reduce((a, r) => a + r.towns.reduce((b, t) => b + t.pop, 0), 0);
}
export function townDemand(t) { return t.pop * 0.012 * (1 + 0.25 * t.workshop); }

export function netWorth(s) {
  const bv = s.b.smelter * COST.smelter + s.b.assembler * COST.assembler + s.b.works * COST.works +
    s.b.truck * COST.truck + s.regions.filter((r) => r.hub).length * COST.hub;
  const inv = s.inv.ore * 2 + s.inv.plate * 5 + s.inv.gear * 9 + s.inv.widget * 14;
  return Math.round(s.cash + bv * 0.5 + inv);
}
export function rivalWorth(r) { return Math.round(r.cash + r.cap * 60); }

export function build(s, what) {
  if (s.cash < COST[what]) return false;
  if (what === "hub") return false; // hubs are bought per region via buildHub
  s.cash -= COST[what];
  s.b[what]++;
  return true;
}
export function buildHub(s, i) {
  const r = s.regions[i];
  if (r.hub || s.cash < COST.hub) return false;
  s.cash -= COST.hub;
  r.hub = true;
  say(s, `opened a hub in ${r.name}`);
  return true;
}

function mineStep(s) {
  // rivals draw ore too, so the mines' prices respond to how crowded the market is
  const rivalOre = s.rivals.reduce((a, r) => a + r.cap * 0.15, 0);
  const totalRate = s.mines.reduce((a, m) => a + m.rate, 0);
  for (const m of s.mines) {
    m.stock = Math.min(m.rate * 25, m.stock + m.rate);
    m.stock = Math.max(0, m.stock - rivalOre * (m.rate / totalRate));
    m.price = +(1.5 + 5 * (1 - Math.min(1, m.stock / (m.rate * 25)))).toFixed(2);
    // a mine whose ore is selling dear opens a shaft. This is self-limiting: more
    // output refills the stock, which pulls the price back under the threshold.
    if (m.price > 4 && s.day % 4 === 0) { m.rate += 1; if (m.rate % 5 === 0) say(s, `${m.name} drilled deeper (${m.rate}/day)`); }
  }
}

function produce(s) {
  const L = s.last;
  // buy contracted ore
  s.mines.forEach((m, i) => {
    const want = Math.min(s.contract[i], m.stock);
    // ore is bought on the mines' credit, so a cash dip below zero can't cut off
    // the ore that would earn the money back; buildings still need cash on hand
    const afford = want;
    if (afford <= 0) return;
    m.stock -= afford;
    s.inv.ore += afford;
    const c = afford * m.price;
    s.cash -= c; L.oreCost += c;
    m.sold = (m.sold || 0) + afford;
    if (m.sold > 200) { m.rate += 1; m.sold = 0; say(s, `${m.name} opened a new shaft`); }
  });
  const i = s.inv;
  const plates = Math.min(s.b.smelter * RATE.smelter, Math.floor(i.ore / 2));
  i.ore -= plates * 2; i.plate += plates;
  // widgets get plates first: each needs a gear (2 plates) plus 1 plate, and a
  // gear already in stock costs only the 1 plate. Spare plates then become
  // gears for the hubs, so a gear-shipping player can't starve their own works.
  let acap = s.b.assembler * RATE.assembler, widgets = 0;
  for (; widgets < s.b.works * RATE.works; widgets++) {
    if (i.gear > 0 && i.plate >= 1) { i.gear--; i.plate--; }
    else if (acap > 0 && i.plate >= 3) { acap--; i.plate -= 3; }
    else break;
  }
  i.widget += widgets;
  if (s.shipGears || i.gear < s.b.works * RATE.works) {
    const gears = Math.min(acap, Math.floor(i.plate / 2));
    i.plate -= gears * 2; i.gear += gears;
  }
  L.widgets = widgets;
}

function freight(s) {
  let cap = s.b.truck * RATE.truck;
  const open = s.regions.filter((r) => r.hub);
  if (!open.length) return;
  const pops = open.map((r) => r.towns.reduce((a, t) => a + t.pop, 0));
  const sum = pops.reduce((a, b) => a + b, 0);
  const kinds = s.shipGears ? ["widget", "gear"] : ["widget"];
  // widgets first, then gears, each split by the population a hub serves
  for (const k of kinds) {
    const have = Math.min(s.inv[k], cap);
    let left = have;
    open.forEach((r, j) => {
      const n = j === open.length - 1 ? left : Math.min(left, Math.floor((have * pops[j]) / sum));
      r.stock[k] += n; left -= n;
    });
    s.inv[k] -= have; cap -= have;
  }
}

function market(s) {
  const L = s.last;
  const tp = totalPop(s);
  const sold = s.rivals.map(() => 0), supplied = s.rivals.map(() => 0);
  for (const r of s.regions) {
    const rp = r.towns.reduce((a, t) => a + t.pop, 0);
    // distributor capacity, cheapest first
    const dists = [...r.dists].sort((a, b) => a.fee - b.fee);
    let dcap = r.hub ? dists.reduce((a, d) => a + d.cap, 0) : 0;
    const feeFor = (n) => { let left = n, f = 0; for (const d of dists) { const u = Math.min(left, d.cap); f += u * d.fee; left -= u; } return f; };
    let deliveredW = 0, deliveredG = 0;
    const budgetW = Math.min(r.stock.widget, dcap);
    for (const t of r.towns) {
      const share = t.pop / rp;
      let D = townDemand(t);
      t.demand = D;
      // offers: rivals at their own prices, player at the set price
      const offers = s.rivals.map((v, k) => ({ k, price: v.price, avail: (v.cap * t.pop) / tp }));
      offers.push({ k: -1, price: s.price.widget, avail: budgetW * share });
      offers.sort((a, b) => a.price - b.price);
      let got = 0;
      for (const o of offers) {
        if (o.price > TOWN_MAX_WIDGET || D <= 0) continue;
        const n = Math.min(D, o.avail, t.demand * SUPPLIER_SHARE_MAX);
        if (o.k >= 0) { sold[o.k] += n; } else { deliveredW += n; }
        D -= n; got += n;
      }
      // a rival's offer counts as supply whether or not the town had room left for it
      for (const o of offers) if (o.k >= 0) supplied[o.k] += o.avail;
      t.sat = t.demand ? got / t.demand : 1;
      t.pop *= 1 + (t.sat > 0.8 ? 0.0003 + 0.0001 * t.workshop : t.sat < 0.4 ? -0.0001 : 0);
      // gears: towns build local supply chains on top of them
      if (r.hub && s.price.gear <= TOWN_MAX_GEAR && t.workshop < MAX_WORKSHOP) {
        const g = Math.min(r.stock.gear * share, 1 + t.workshop * 2, Math.max(0, dcap - deliveredW - deliveredG) * 0.5);
        if (g > 0.01) {
          deliveredG += g; t.gears += g;
          r.stock.gear -= g;
          L.revenue += g * s.price.gear;
          s.cash += g * s.price.gear;
          if (t.gears >= WORKSHOP_STEP * (t.workshop + 1)) {
            t.workshop++; t.gears = 0;
            say(s, `${t.name} built workshop #${t.workshop} on your gears (+25% demand)`);
          }
        }
      }
    }
    const fees = feeFor(deliveredW + deliveredG);
    r.stock.widget -= deliveredW;
    s.cash += deliveredW * s.price.widget - fees;
    L.revenue += deliveredW * s.price.widget; L.fees += fees; L.sold += deliveredW;
  }
  // rivals bank and adjust
  const totalDemand = s.regions.reduce((a, r) => a + r.towns.reduce((b, t) => b + t.demand, 0), 0);
  const rivalCap = s.rivals.reduce((a, r) => a + r.cap, 0);
  s.rivals.forEach((v, k) => {
    v.sold = sold[k];
    v.cash += sold[k] * (v.price - v.cost - 3) - (30 + 3 * v.cap);
    if (supplied[k] > 0) v.price += sold[k] >= supplied[k] * 0.95 ? 0.6 : -0.6;
    v.price = Math.max(v.cost + 5, Math.min(RIVAL_MAX_PRICE, v.price + (rng(s) - 0.5) * 0.4));
    // capacity follows demand: a rival grows only while it sells out, and sheds
    // capacity it can't sell, so none can balloon into a monopoly
    const used = supplied[k] > 0 ? sold[k] / supplied[k] : 0;
    if (v.cash > 1000 + v.cap * 40 && used >= 0.9 && rivalCap < RIVAL_SHARE_MAX * totalDemand) { v.cash -= 600; v.cap += 1; say(s, `${v.name} expanded to ${v.cap} widgets/day`); }
    else if (used < 0.4 && v.cap > 4 && (s.day + k) % 10 === 0) v.cap -= 1;
    if (v.cash < -200) { v.cash = 0; v.cap = Math.max(4, v.cap - 2); }
  });
}

// Time series, one column per series, sampled every `stride` days. localStorage
// holds the save (~5MB), so when a column passes HIST_MAX points every other
// sample is dropped and the stride doubles: the whole game stays on the chart,
// at coarser resolution, instead of being cut off.
export const HIST_MAX = 480;
export function record(s) {
  const h = s.hist || (s.hist = { stride: 1, day: [], cols: {} });
  if ((s.day - 1) % h.stride) return;
  const put = (k, v) => (h.cols[k] || (h.cols[k] = new Array(h.day.length).fill(null))).push(Math.round(v * 100) / 100);
  const L = s.last;
  put("nw:you", netWorth(s)); put("cash", s.cash);
  s.rivals.forEach((r, i) => { put("nw:r" + i, rivalWorth(r)); put("price:r" + i, r.price); put("sold:r" + i, r.sold); });
  put("price:you", s.price.widget);
  s.mines.forEach((m, i) => { put("oreprice:" + i, m.price); put("orestock:" + i, m.stock); });
  put("revenue", L.revenue); put("costs", L.oreCost + L.fees + L.upkeep); put("profit", L.revenue - L.oreCost - L.fees - L.upkeep);
  put("made", L.widgets); put("sold:you", L.sold);
  s.regions.forEach((r, ri) => { put("hub:" + ri, r.stock.widget); r.towns.forEach((t, ti) => { put(`pop:${ri}:${ti}`, t.pop); put(`sat:${ri}:${ti}`, t.sat * 100); }); });
  h.day.push(s.day - 1);
  if (h.day.length > HIST_MAX) {
    const half = (a) => a.filter((_, i) => i % 2 === 0);
    h.day = half(h.day); for (const k in h.cols) h.cols[k] = half(h.cols[k]);
    h.stride *= 2;
  }
}

export function step(s) {
  s.last = { sold: 0, revenue: 0, fees: 0, upkeep: 0, oreCost: 0, widgets: 0 };
  mineStep(s);
  produce(s);
  freight(s);
  market(s);
  let up = 0;
  for (const k of Object.keys(s.b)) up += s.b[k] * UPKEEP[k];
  up += s.regions.filter((r) => r.hub).length * UPKEEP.hub;
  s.cash -= up; s.last.upkeep = up;
  s.totalRevenue += s.last.revenue;
  s.day++;
  record(s);
  if (s.day % 365 === 1) {
    const board = [{ n: "you", w: netWorth(s) }, ...s.rivals.map((r) => ({ n: r.name, w: rivalWorth(r) }))].sort((a, b) => b.w - a.w);
    say(s, `year ${Math.floor(s.day / 365)} ends: ${board[0].n} leads at $${board[0].w}`);
  }
  return s;
}
