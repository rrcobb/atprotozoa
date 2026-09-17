// Side-by-side benchmark: Bluesky's public AppView actor search vs the
// community-run typeahead.waow.tech mirror.
//
// Measures, per query, for each backend: wall-clock latency, HTTP status,
// result count, and the returned handles (so we can diff result sets, not
// just timings). Run it from the repo root:
//
//   node audit/typeahead-bench.mjs > audit/raw/typeahead-bench.json
//
// Prints progress to stderr as it goes so a long run is legible.

const BACKENDS = [
  {
    id: "bsky",
    label: "public.api.bsky.app (searchActorsTypeahead)",
    url: (q, limit) =>
      `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=${limit}`,
    headers: {},
  },
  {
    id: "waow-alias",
    label: "typeahead.waow.tech (bsky-compatible alias)",
    url: (q, limit) =>
      `https://typeahead.waow.tech/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=${limit}`,
    // llms.txt asks callers to identify themselves; this is the site the
    // typeahead lib would be served from if we ever made the swap.
    headers: { "X-Client": "bisks.net" },
  },
  {
    id: "waow-canonical",
    label: "typeahead.waow.tech (canonical tech.waow lexicon)",
    url: (q, limit) =>
      `https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors?q=${encodeURIComponent(q)}&limit=${limit}`,
    headers: { "X-Client": "bisks.net" },
  },
];

// A spread of prefixes: handles the sites actually see (bisks.net regulars),
// short high-traffic prefixes, and a couple of long-tail/unicode cases.
const QUERIES = [
  "cee", "bisks", "zzstoatzz", "brennan", "psingletary",
  "al", "bo", "jay", "mary", "tech",
  "buildthis", "mfzx", "nonexistenthandle12345", "ü", "a",
];

const LIMIT = 8;
const ROUNDS = 3;
const PACE_MS = 1100;

async function timeOne(backend, q) {
  const t0 = performance.now();
  try {
    const res = await fetch(backend.url(q, LIMIT), { headers: backend.headers });
    const body = await res.json().catch(() => null);
    const ms = performance.now() - t0;
    const actors = (body && body.actors) || [];
    return {
      ok: res.ok,
      status: res.status,
      ms: Math.round(ms),
      count: actors.length,
      handles: actors.map((a) => a.handle),
      cors: {
        allowOrigin: res.headers.get("access-control-allow-origin"),
        cacheStatus: res.headers.get("cf-cache-status") || res.headers.get("x-cache"),
        age: res.headers.get("age"),
      },
    };
  } catch (err) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(err), handles: [] };
  }
}

const results = [];
let done = 0;
const total = QUERIES.length * ROUNDS * BACKENDS.length;

for (let round = 1; round <= ROUNDS; round++) {
  for (const q of QUERIES) {
    for (const backend of BACKENDS) {
      const r = await timeOne(backend, q);
      results.push({ round, q, backend: backend.id, ...r });
      done++;
      // waow documents 60 req/min per IP. Pace the whole run under that so
      // the latency numbers measure the service rather than our own burst
      // tripping its rate limiter.
      await new Promise((res) => setTimeout(res, PACE_MS));
      if (done % 10 === 0 || done === total) {
        process.stderr.write(`  ${done}/${total} requests\n`);
      }
    }
  }
}

// Summary: median/p95 latency per backend, over successful responses only.
function pct(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const summary = {};
for (const b of BACKENDS) {
  const rows = results.filter((r) => r.backend === b.id && r.ok);
  const lat = rows.map((r) => r.ms);
  summary[b.id] = {
    label: b.label,
    requests: results.filter((r) => r.backend === b.id).length,
    ok: rows.length,
    medianMs: pct(lat, 50),
    p95Ms: pct(lat, 95),
    minMs: lat.length ? Math.min(...lat) : null,
    maxMs: lat.length ? Math.max(...lat) : null,
    emptyResults: rows.filter((r) => r.count === 0).length,
  };
}

// Result-set agreement: for each query, compare the top-N handle sets from
// bsky vs the waow alias in the final round.
const agreement = QUERIES.map((q) => {
  const pick = (id) => results.find((r) => r.q === q && r.backend === id && r.round === ROUNDS);
  const a = pick("bsky"), b = pick("waow-alias");
  const ha = new Set(a?.handles || []), hb = new Set(b?.handles || []);
  const overlap = [...ha].filter((h) => hb.has(h));
  return {
    q,
    bskyCount: ha.size,
    waowCount: hb.size,
    overlap: overlap.length,
    onlyBsky: [...ha].filter((h) => !hb.has(h)),
    onlyWaow: [...hb].filter((h) => !ha.has(h)),
    sameTop1: (a?.handles || [])[0] === (b?.handles || [])[0],
  };
});

process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), limit: LIMIT, rounds: ROUNDS, summary, agreement, results }, null, 2));
process.stderr.write("\ndone\n");
