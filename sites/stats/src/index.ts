// stats — per-site request counts for the fleet, from Cloudflare's GraphQL
// Analytics API, served CORS-open so any site can show its own traffic.
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
const DAY_PREFIX = "day:";
const SCRIPT_PREFIX = "atprotozoa-";
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
  const out: DayCounts = {};
  for (const r of rows) {
    const name = r.dimensions.scriptName.startsWith(SCRIPT_PREFIX)
      ? r.dimensions.scriptName.slice(SCRIPT_PREFIX.length)
      : r.dimensions.scriptName;
    const cur = out[name] || { requests: 0, errors: 0 };
    cur.requests += r.sum.requests;
    cur.errors += r.sum.errors;
    out[name] = cur;
  }
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
        perDay.set(day, JSON.parse(cached));
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

  const sites: Rollup["sites"] = {};
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
      const s = r.sites[m[1]];
      if (!s) return json({ error: "no data for that site", name: m[1], updatedAt: r.updatedAt }, 404);
      return json({ name: m[1], updatedAt: r.updatedAt, days: r.days, ...s });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env).catch((err) => console.error(String(err))));
  },
};
