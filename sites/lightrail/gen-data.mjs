// Builds public/data/line.json from the MTA light rail GTFS (extracted to ./gtfs/):
//   node gen-data.mjs /path/to/extracted/gtfs
// Output: platforms (stop_id -> station/direction), station coords, the stop
// sequence of each distinct service pattern (used to place trains between
// stations), and a decimated track polyline per shape.
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2] || "./gtfs";
const csv = (f) => {
  const [h, ...rows] = readFileSync(`${dir}/${f}`, "utf8").trim().split(/\r?\n/);
  const cols = h.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
};
const stops = Object.fromEntries(csv("stops.txt").map((s) => [s.stop_id, s]));
const trips = Object.fromEntries(csv("trips.txt").map((t) => [t.trip_id, t]));
const seqs = {};
for (const r of csv("stop_times.txt")) (seqs[r.trip_id] ||= []).push([+r.stop_sequence, r.stop_id]);
const pats = new Map();
for (const [t, l] of Object.entries(seqs)) {
  l.sort((a, b) => a[0] - b[0]);
  const ids = l.map((x) => x[1]);
  const k = trips[t].direction_id + "|" + ids.join(",");
  pats.set(k, (pats.get(k) || 0) + 1);
}
const patterns = [...pats].filter(([, c]) => c >= 5).map(([k]) => {
  const [d, ids] = k.split("|");
  return { dir: +d, stops: ids.split(",") };
});
const used = new Set(patterns.flatMap((p) => p.stops));
const platforms = {}, stations = {};
for (const id of used) {
  const s = stops[id];
  const m = s.stop_name.match(/^(.*) \((Northbound|Southbound)\)$/i);
  if (!m) continue; // depot / non-revenue stop
  const sid = s.parent_station;
  stations[sid] ||= { id: sid, name: m[1], lat: +s.stop_lat, lon: +s.stop_lon };
  stations[sid][m[2][0].toLowerCase()] = id;
  platforms[id] = { st: sid, d: m[2][0].toLowerCase() === "n" ? 0 : 1 };
}
const keep = patterns.map((p) => ({ dir: p.dir, stops: p.stops.filter((i) => platforms[i]).map((i) => platforms[i].st) }));
const shapes = {};
for (const r of csv("shapes.txt")) (shapes[r.shape_id] ||= []).push([+r.shape_pt_sequence, +r.shape_pt_lat, +r.shape_pt_lon]);
const track = Object.entries(shapes).filter(([id]) => !/^NA_/.test(id)).map(([id, p]) => {
  p.sort((a, b) => a[0] - b[0]);
  return p.filter((_, i) => i % 6 === 0 || i === p.length - 1).map((x) => [+x[1].toFixed(5), +x[2].toFixed(5)]);
});
writeFileSync("public/data/line.json", JSON.stringify({ stations: Object.values(stations), platforms, patterns: keep, track }));
console.log(Object.keys(stations).length, "stations", Object.keys(platforms).length, "platforms", keep.length, "patterns", track.length, "shapes");
