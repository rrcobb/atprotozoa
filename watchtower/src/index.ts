// watchtower — checks every site is actually serving, from OUTSIDE the zone.
//
// Why this is its own Worker and not a route on buildthis: a Worker routed on
// bisks.net cannot probe bisks.net. Every subrequest to <name>.bisks.net from
// an on-zone Worker comes back 522 ("connection timed out") whether or not the
// site is up — which is why buildthis's own dead-link check had to treat 522 as
// "unknown" and stopped being able to answer the question at all.
//
// This Worker has NO zone route. It's reachable only at its workers.dev
// hostname, so its subrequests leave and re-enter through the edge like any
// outside visitor's would. Verified 2026-07-31: an off-zone probe of
// canvass.bisks.net returns 200 while the identical probe from buildthis
// returns 522.
//
// What it checks, per site:
//   - the root URL serves 2xx
//   - a real asset (a .js or .css the site ships) serves 2xx AND does not come
//     back as text/html
//
// That second check is the point. A site whose Worker strips its mount prefix
// unconditionally still returns 200 for "/" — it just serves index.html for
// every asset alongside it, so the page renders and nothing works. A
// status-only check reads that as healthy. 134 sites had exactly this bug on
// 2026-07-31; it is invisible to anything that only looks at status codes.

export interface Env {
  RESULTS: KVNamespace;
}

interface SiteResult {
  name: string;
  url: string;
  rootStatus: number | null;
  asset?: string;
  assetStatus?: number | null;
  assetType?: string | null;
  problems: string[];
}

interface Report {
  checkedAt: string;
  checked: number;
  healthy: number;
  problems: SiteResult[];
  durationMs: number;
}

const RESULT_KEY = "watchtower:last";
// Keep the fan-out modest: Workers Free allows 50 subrequests per invocation,
// and each site costs up to 2 (root + asset). The cron walks the list in
// chunks, one chunk per tick, rather than trying to do ~190 sites at once.
const CHUNK = 20;
const CURSOR_KEY = "watchtower:cursor";

// The gallery is generated from the site manifests, so it is the current list
// of what should be live — no filesystem needed, and it can't drift from the
// repo the way a hardcoded list would.
async function siteList(): Promise<Array<{ name: string; url: string }>> {
  const res = await fetch("https://bisks.net/", { cf: { cacheTtl: 300 } as never });
  const html = await res.text();
  const seen = new Map<string, string>();
  for (const [, url, name] of html.matchAll(
    /<a class="card" href="([^"]+)"[^>]*data-site="([^"]+)"/g,
  )) {
    seen.set(name, url);
  }
  return [...seen].map(([name, url]) => ({ name, url }));
}

async function probe(url: string): Promise<{ status: number | null; type: string | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    return { status: r.status, type: r.headers.get("content-type") };
  } catch {
    return { status: null, type: null };
  }
}

// Find an asset the site actually references, so we probe something real rather
// than guessing at filenames.
function firstAsset(html: string): string | null {
  const m =
    html.match(/<script[^>]+src="([^":]+\.js)(?:\?[^"]*)?"/i) ||
    html.match(/<link[^>]+href="([^":]+\.css)(?:\?[^"]*)?"/i);
  return m ? m[1] : null;
}

async function checkSite(site: { name: string; url: string }): Promise<SiteResult> {
  const problems: string[] = [];
  const base = site.url.replace(/\/$/, "");

  const root = await probe(base + "/");
  if (root.status === null) problems.push("root unreachable");
  else if (root.status < 200 || root.status >= 300) problems.push(`root ${root.status}`);

  const out: SiteResult = { name: site.name, url: site.url, rootStatus: root.status, problems };

  // Only look for an asset if the root actually served us HTML to read.
  if (root.status && root.status >= 200 && root.status < 300) {
    const html = await (await fetch(base + "/")).text().catch(() => "");
    const asset = firstAsset(html);
    if (asset) {
      const assetUrl = asset.startsWith("http")
        ? asset
        : base + (asset.startsWith("/") ? asset : "/" + asset);
      const a = await probe(assetUrl);
      out.asset = asset;
      out.assetStatus = a.status;
      out.assetType = a.type;
      if (a.status === null) problems.push(`asset ${asset} unreachable`);
      else if (a.status < 200 || a.status >= 300) problems.push(`asset ${asset} ${a.status}`);
      else if (a.type && /text\/html/.test(a.type)) {
        // The silent one: 200, wrong bytes.
        problems.push(`asset ${asset} served as HTML — prefix-strip bug`);
      }
    }
  }

  return out;
}

async function runChunk(env: Env): Promise<void> {
  const started = Date.now();
  const sites = await siteList();
  if (!sites.length) return;

  const cursorRaw = await env.RESULTS.get(CURSOR_KEY);
  const cursor = cursorRaw ? Number(cursorRaw) % sites.length : 0;
  const slice = sites.slice(cursor, cursor + CHUNK);

  const results: SiteResult[] = [];
  for (const s of slice) results.push(await checkSite(s));

  // Merge this chunk's problems into the standing report so the page shows the
  // whole zoo, not just the slice checked in the last minute.
  const prevRaw = await env.RESULTS.get(RESULT_KEY);
  const prev: Report | null = prevRaw ? JSON.parse(prevRaw) : null;
  const carried = (prev?.problems || []).filter((p) => !slice.some((s) => s.name === p.name));
  const fresh = results.filter((r) => r.problems.length);

  const report: Report = {
    checkedAt: new Date().toISOString(),
    checked: sites.length,
    healthy: sites.length - (carried.length + fresh.length),
    problems: [...carried, ...fresh].sort((a, b) => a.name.localeCompare(b.name)),
    durationMs: Date.now() - started,
  };
  await env.RESULTS.put(RESULT_KEY, JSON.stringify(report));
  await env.RESULTS.put(CURSOR_KEY, String((cursor + CHUNK) % sites.length));
}

function page(r: Report | null): string {
  const rows = !r
    ? `<p class="empty">no run yet — the cron hasn't ticked.</p>`
    : r.problems.length === 0
      ? `<p class="ok">all ${r.checked} sites serving correctly.</p>`
      : r.problems
          .map(
            (p) => `<div class="row">
        <a href="${escapeHtml(p.url)}">${escapeHtml(p.name)}</a>
        <span>${escapeHtml(p.problems.join(" · "))}</span>
      </div>`,
          )
          .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>watchtower — bisks.net</title>
<meta name="robots" content="noindex" />
<style>
  :root {
    --bg:#fff; --ink:#111; --muted:#6b6b6b; --faint:#e4e4e4;
    --accent:#1a5fd0; --bad:#b3261e; --good:#1e7a3c;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e0e10; --ink:#ececec; --muted:#9a9a9a; --faint:#262629;
            --accent:#7aa7ff; --bad:#ff6b6b; --good:#6ee7a8; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:var(--mono); font-size:15px; line-height:1.6; }
  .wrap { max-width:680px; margin:0 auto; padding:3.5rem 1.25rem 6rem; }
  h1 { font-size:1.6rem; margin:0 0 0.35rem; font-weight:600; }
  .sub { color:var(--muted); font-size:0.86rem; margin:0 0 2rem; }
  .row { display:flex; gap:0.75rem; align-items:baseline; flex-wrap:wrap;
    padding:0.6rem 0; border-top:1px solid var(--faint); font-size:0.88rem; }
  .row:first-of-type { border-top:1px solid var(--ink); }
  .row a { color:var(--accent); text-decoration:none; font-weight:600; }
  .row span { color:var(--bad); }
  .ok { color:var(--good); }
  .empty { color:var(--muted); }
  footer { margin-top:3rem; padding-top:0.75rem; border-top:1px solid var(--faint);
    color:var(--muted); font-size:0.78rem; }
  footer a { color:var(--accent); text-decoration:none; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>watchtower</h1>
    <p class="sub">
      every site checked from outside the zone — is it serving, and are its
      assets really assets. ${r ? `last run ${escapeHtml(r.checkedAt)} · ${r.checked} sites known` : ""}
    </p>
    ${rows}
    <footer>
      runs on a cron, a slice at a time. an asset coming back as HTML means the
      site's Worker is stripping a mount prefix it shouldn't — the page renders,
      nothing works. · <a href="https://bisks.net/">bisks.net</a>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const raw = await env.RESULTS.get(RESULT_KEY);
    const report: Report | null = raw ? JSON.parse(raw) : null;

    // Run a slice on demand. Handy for checking right after a deploy instead of
    // waiting for the next tick, and for walking the whole list quickly.
    if (url.pathname === "/run") {
      await runChunk(env);
      const updated = await env.RESULTS.get(RESULT_KEY);
      return new Response(updated ?? "{}", {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/report.json") {
      return new Response(JSON.stringify(report ?? { problems: [] }, null, 2), {
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      });
    }

    return new Response(page(report), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runChunk(env));
  },
};
