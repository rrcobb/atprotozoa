// stats — per-site request counts for the fleet, from Cloudflare's GraphQL
// Analytics API (sites with their own Worker) and Analytics Engine (hosted
// sites), served CORS-open so any site can show its own traffic.
//
// Why a Worker and not a fetch from each site: the Analytics API needs an
// account-scoped token, which no site (and no bot build) may hold. This one
// Worker holds a read-only token, pulls counts on a cron, and serves them.
// Sites fetch https://stats.bisks.net/stats/<name>.json — no secret involved.
//
// Storage is KV, all of it rebuildable: one key per UTC day holding every
// script's requests and errors for that day, plus one rolled-up document the
// endpoints read. Cloudflare's own retention on this dataset is limited, so a
// day older than that is only here if we fetched it while it was available.
//
// Endpoints:
//   /stats.json          the rolled-up document: every site, last DAYS days
//   /stats/<name>.json   one site: per-day requests + errors, plus totals
//   /refresh             run the cron body now (no auth; it only reads)

export interface Env {
  STATS: KVNamespace;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ACCOUNT_ID: string;
  DAYS?: string;
  CF_ANALYTICS_TOKEN?: string;
}

type DayCounts = Record<string, { requests: number; errors: number }>;

interface Rollup {
  updatedAt: string;
  days: string[]; // oldest first, YYYY-MM-DD
  sites: Record<string, { requests: number[]; errors: number[]; total: number; total7: number }>;
  // Days in the window we have no data for (fetch failed or before retention).
  missing: string[];
}

const ROLLUP_KEY = "stats:all";
// v2: v1 used plain objects, and a site named "constructor" fell through to
// Object.prototype. Null-prototype objects below; the prefix bump refetches.
const DAY_PREFIX = "day2:";
const SCRIPT_PREFIX = "atprotozoa-";
const HOST_SCRIPT = /^host-\d+$/;
const HOSTED_DATASET = "bisks_hosted_requests";
const GQL = "https://api.cloudflare.com/client/v4/graphql";
// Each page is one script per row per day, so 2000 covers one day of the fleet
// with room to grow. Fetching per day is what keeps a query under the cap.
const ROW_LIMIT = 5000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayList(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(isoDay(new Date(now.getTime() - i * 86400e3)));
  }
  return out;
}

// One day of the whole account, keyed by site name (script name minus the
// atprotozoa- prefix; scripts outside that prefix are kept under their raw name).
async function fetchDay(env: Env, day: string): Promise<DayCounts> {
  const query = `
    query ($account: String!, $day: Date!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          workersInvocationsAdaptive(
            limit: ${ROW_LIMIT}
            filter: { date: $day }
          ) {
            sum { requests errors }
            dimensions { scriptName }
          }
        }
      }
    }`;
  const res = await fetch(GQL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { account: env.ACCOUNT_ID, day } }),
  });
  const j = (await res.json()) as {
    errors?: Array<{ message: string }>;
    data?: { viewer: { accounts: Array<{ workersInvocationsAdaptive: Array<{ sum: { requests: number; errors: number }; dimensions: { scriptName: string } }> }> } };
  };
  if (j.errors?.length) throw new Error(`graphql ${day}: ${j.errors.map((e) => e.message).join("; ")}`);
  const rows = j.data?.viewer.accounts[0]?.workersInvocationsAdaptive ?? [];
  const out: DayCounts = Object.create(null);
  for (const r of rows) {
    const name = r.dimensions.scriptName.startsWith(SCRIPT_PREFIX)
      ? r.dimensions.scriptName.slice(SCRIPT_PREFIX.length)
      : r.dimensions.scriptName;
    // A host Worker's count is the sum of its sites, which come in per site
    // from fetchHostedDay below.
    if (HOST_SCRIPT.test(name)) continue;
    const cur = out[name] || { requests: 0, errors: 0 };
    cur.requests += r.sum.requests;
    cur.errors += r.sum.errors;
    out[name] = cur;
  }
  for (const [name, c] of Object.entries(await fetchHostedDay(env, day))) {
    const cur = out[name] || { requests: 0, errors: 0 };
    cur.requests += c.requests;
    cur.errors += c.errors;
    out[name] = cur;
  }
  return out;
}

// Hosted sites (notes/20-deploy.md, "Hosted sites") share four host Workers,
// so the per-Worker numbers above can't tell them apart. Each host writes one
// Analytics Engine data point per request instead, with the site name as
// blob1 and [requests, errors] as doubles. _sample_interval undoes Analytics
// Engine's sampling, so these sums are request counts like the ones above.
async function fetchHostedDay(env: Env, day: string): Promise<DayCounts> {
  const next = isoDay(new Date(Date.parse(day) + 86400e3));
  const sql = `
    SELECT blob1 AS name,
           SUM(_sample_interval * double1) AS requests,
           SUM(_sample_interval * double2) AS errors
    FROM ${HOSTED_DATASET}
    WHERE timestamp >= toDateTime('${day} 00:00:00') AND timestamp < toDateTime('${next} 00:00:00')
    GROUP BY name
    FORMAT JSON`;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: sql,
  });
  if (!res.ok) throw new Error(`analytics engine ${day}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { data?: Array<{ name: string; requests: number | string; errors: number | string }> };
  const out: DayCounts = Object.create(null);
  for (const r of j.data ?? []) out[r.name] = { requests: Number(r.requests), errors: Number(r.errors) };
  return out;
}

async function refresh(env: Env): Promise<Rollup> {
  if (!env.CF_ANALYTICS_TOKEN) throw new Error("CF_ANALYTICS_TOKEN is not set");
  const days = dayList(Number(env.DAYS || 30));
  const today = days[days.length - 1];
  const perDay = new Map<string, DayCounts>();
  const missing: string[] = [];

  for (const day of days) {
    // Today is always re-fetched (it's still accumulating). Past days are
    // fetched once and kept.
    if (day !== today) {
      const cached = await env.STATS.get(DAY_PREFIX + day);
      if (cached) {
        perDay.set(day, Object.assign(Object.create(null), JSON.parse(cached)));
        continue;
      }
    }
    try {
      const counts = await fetchDay(env, day);
      perDay.set(day, counts);
      // Past days never change; keep them well past the window so the API's
      // own retention limit doesn't erase history we already have.
      await env.STATS.put(DAY_PREFIX + day, JSON.stringify(counts), {
        expirationTtl: day === today ? 3 * 86400 : 400 * 86400,
      });
    } catch (err) {
      console.error(String(err));
      missing.push(day);
    }
  }

  const names = new Set<string>();
  for (const c of perDay.values()) for (const n of Object.keys(c)) names.add(n);

  const sites: Rollup["sites"] = Object.create(null);
  for (const n of [...names].sort()) {
    const requests = days.map((d) => perDay.get(d)?.[n]?.requests ?? 0);
    const errors = days.map((d) => perDay.get(d)?.[n]?.errors ?? 0);
    sites[n] = {
      requests,
      errors,
      total: requests.reduce((a, b) => a + b, 0),
      total7: requests.slice(-7).reduce((a, b) => a + b, 0),
    };
  }

  const rollup: Rollup = { updatedAt: new Date().toISOString(), days, sites, missing };
  await env.STATS.put(ROLLUP_KEY, JSON.stringify(rollup));
  return rollup;
}

async function rollup(env: Env): Promise<Rollup | null> {
  const raw = await env.STATS.get(ROLLUP_KEY);
  return raw ? (JSON.parse(raw) as Rollup) : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/refresh") {
      try {
        const r = await refresh(env);
        return json({ ok: true, updatedAt: r.updatedAt, sites: Object.keys(r.sites).length, missing: r.missing });
      } catch (err) {
        return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
      }
    }

    if (url.pathname === "/stats.json") {
      const r = await rollup(env);
      return r ? json(r) : json({ error: "no data yet" }, 503);
    }

    const m = url.pathname.match(/^\/stats\/([a-z0-9-]+)\.json$/);
    if (m) {
      const r = await rollup(env);
      if (!r) return json({ error: "no data yet" }, 503);
      const s = Object.hasOwn(r.sites, m[1]) ? r.sites[m[1]] : undefined;
      if (!s) return json({ error: "no data for that site", name: m[1], updatedAt: r.updatedAt }, 404);
      return json({ name: m[1], updatedAt: r.updatedAt, days: r.days, ...s });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env).catch((err) => console.error(String(err))));
  },
};
