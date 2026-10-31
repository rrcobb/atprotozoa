// Pure helpers for lightrail: no DOM, so they run under `node --test`.

// Ordered rows for the line diagram, Hunt Valley at the top.
// rows: [{ kind: "label", text } | { kind: "station", id, spur?: true }]
export function buildRows(line) {
  const nameOf = Object.fromEntries(line.stations.map((s) => [s.id, s.name]));
  const north = line.patterns.filter((p) => p.dir === 0);
  const longest = Math.max(...north.map((p) => p.stops.length));
  const [a, b] = north.filter((p) => p.stops.length === longest);
  // The two longest northbound patterns start at different southern termini
  // (BWI Airport, Glen Burnie) and share everything from the junction north.
  let i = a.stops.length - 1, j = b.stops.length - 1;
  while (i >= 0 && j >= 0 && a.stops[i] === b.stops[j]) { i--; j--; }
  const trunk = a.stops.slice(i + 1).reverse();
  const branchA = a.stops.slice(0, i + 1).reverse();
  const branchB = b.stops.slice(0, j + 1).reverse();
  const label = (br, p) => {
    const end = p.stops[0];
    return `${nameOf[end].replace(/ \(.*\)$/, "")} branch`;
  };
  const rows = [];
  const penn = north.find((p) => nameOf[p.stops[p.stops.length - 1]] === "Penn Station");
  const pennId = penn && penn.stops[penn.stops.length - 1];
  const beforePenn = penn && penn.stops[penn.stops.length - 2];
  for (const id of trunk) {
    rows.push({ kind: "station", id });
    if (id === beforePenn) rows.push({ kind: "station", id: pennId, spur: true });
  }
  for (const [br, p] of [[branchA, a], [branchB, b]]) {
    rows.push({ kind: "label", text: label(br, p) });
    for (const id of br) rows.push({ kind: "station", id });
  }
  return rows;
}

// dirData: { "<platform id>": [{ seconds_left, minutes_left, time, vehicle }] } for one direction.
// Returns one entry per vehicle: where it is heading next and its upcoming stops.
export function trainsFromDir(dirData, platforms, dir, fetchedAt) {
  const byVehicle = new Map();
  for (const [pid, list] of Object.entries(dirData || {})) {
    const plat = platforms[pid];
    if (!plat || plat.d !== dir || !Array.isArray(list)) continue;
    for (const a of list) {
      const arriveAt = fetchedAt + a.seconds_left * 1000;
      const t = byVehicle.get(a.vehicle) || { vehicle: a.vehicle, dir, stops: [] };
      t.stops.push({ st: plat.st, arriveAt, time: a.time });
      byVehicle.set(a.vehicle, t);
    }
  }
  const trains = [...byVehicle.values()];
  for (const t of trains) {
    t.stops.sort((x, y) => x.arriveAt - y.arriveAt);
    t.next = t.stops[0];
  }
  return trains.sort((x, y) => x.next.arriveAt - y.next.arriveAt);
}

// Arrivals at one station, both directions merged, soonest first.
export function stationBoard(trainsByDir, stId) {
  const out = [];
  for (const trains of trainsByDir) {
    for (const t of trains) {
      const s = t.stops.find((x) => x.st === stId);
      if (s) out.push({ vehicle: t.vehicle, dir: t.dir, arriveAt: s.arriveAt, time: s.time });
    }
  }
  return out.sort((x, y) => x.arriveAt - y.arriveAt);
}

export function countdown(arriveAt, now) {
  const s = Math.round((arriveAt - now) / 1000);
  if (s <= 45) return "arriving";
  if (s < 90) return "1 min";
  return Math.round(s / 60) + " min";
}

// Great-circle distance in metres; used for "nearest station".
export function distance(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371000;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
