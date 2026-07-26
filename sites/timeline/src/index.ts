// timeline Worker — bisks.net/timeline
//
// A chronological history of autonomous web dev in this repo: every commit
// the build bot (@buildthis.bisks.net) has made, drawn straight from the
// public git history (github.com/rrcobb/atprotozoa), not from the buildthis
// KV log that sites/logs reads. Complementary to logs, not a replacement —
// logs is the bot's own tag-by-tag ledger (what was asked, what happened);
// this is the repo's-eye view (what actually landed, in commit order),
// including the pre-bot human commits that started the repo.
//
// Requested by @minormobius.bsky.social, replying in a thread about
// @bisks.net inventing @buildthis.bisks.net to autonomously fulfill site
// requests — "build a timeline of autonomous web dev." The data bears that
// out: the first @buildthis commit lands about a day and a half after the
// repo's first commit, and the bot has been shipping sites in the hours
// since.
//
// Pure READER, same shape as sites/logs: no state of its own. Two upstream
// sources, both cached at the edge via `cf.cacheTtl`:
//   - GitHub's commits API, for the actual commit history.
//   - the live apex gallery (bisks.net/), regex-scraped for site -> live-url,
//     so timeline entries link to the real thing instead of guessing whether
//     a site is still on a <name>.bisks.net custom domain or a bisks.net/<name>
//     path.
//
// Routes (mounted at /timeline — PREFIX stripped before this file sees the
// path):
//   /       -> the timeline (PRIMARY page)
//   /og.png -> a generated share-card image: a bar chart of builds/day
//   everything else -> static assets (public/)

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  // Overridable for local dev; defaults to the real public repo.
  GITHUB_REPO?: string;
}

const PREFIX = "/timeline";
const DEFAULT_REPO = "rrcobb/atprotozoa";
const GALLERY_SOURCE = "https://bisks.net/";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";

    if (url.pathname === "/" || url.pathname === "") {
      return renderTimeline(env, url.origin + PREFIX);
    }
    if (url.pathname === "/og.png") {
      return renderOgImage(env);
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};

// --- data: commit history ---------------------------------------------------

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { author: { name: string; date: string }; message: string };
}

// Autonomous build commits look like `buildthis: <site-or-path> (@<handle>)`
// — see sites/buildthis/src/index.ts, which writes exactly this format.
const BUILD_RE = /^buildthis:\s*(.+?)\s*\(@([^()]+)\)\s*$/;

interface BuildEvent {
  sha: string;
  htmlUrl: string;
  date: Date;
  path: string; // raw text after "buildthis: ", e.g. "games/mootkombat" or "trigrams/tagged"
  site: string; // resolved site slug, for linking + counting
  handle: string;
}

// GitHub caps per_page at 100. Repo history is a few hundred commits right
// now; five pages (500) gives headroom without an unbounded fetch loop as it
// grows. If it ever grows past that, the oldest commits (and the genesis
// milestone) quietly drop off rather than the page hanging.
const MAX_PAGES = 5;

async function loadCommits(env: Env): Promise<{ commits: GhCommit[]; error: string | null }> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const commits: GhCommit[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/commits?per_page=100&page=${page}`,
        {
          headers: {
            "User-Agent": "atprotozoa-timeline (bisks.net/timeline)",
            Accept: "application/vnd.github+json",
          },
          cf: { cacheTtl: 300, cacheEverything: true } as never,
        },
      );
      if (!res.ok) {
        if (commits.length > 0) break; // partial history beats none
        return { commits: [], error: `github api returned ${res.status}` };
      }
      const batch = (await res.json()) as GhCommit[];
      commits.push(...batch);
      if (batch.length < 100) break; // last page
    }
    return { commits, error: null };
  } catch (err) {
    if (commits.length > 0) return { commits, error: null };
    return { commits: [], error: `couldn't reach github (${err})` };
  }
}

// "games" is the one cluster prefix in the house style (see
// notes/20-deploy.md) — a clustered build's path is "games/<name>", so the
// site slug is the *second* segment. Every other multi-segment path (e.g.
// "cluckstonks/breed", "buildthis/directory") is "<site>/<subpath-or-view>",
// so the slug is the *first* segment.
function siteSlugOf(path: string): string {
  const parts = path.split("/");
  if (parts.length > 1 && parts[0] === "games") return parts[1];
  return parts[0];
}

function parseEvents(commits: GhCommit[]): BuildEvent[] {
  const events: BuildEvent[] = [];
  for (const c of commits) {
    const m = c.commit.message.match(BUILD_RE);
    if (!m) continue;
    events.push({
      sha: c.sha,
      htmlUrl: c.html_url,
      date: new Date(c.commit.author.date),
      path: m[1],
      site: siteSlugOf(m[1]),
      handle: m[2],
    });
  }
  return events;
}

// --- data: live gallery, for correct links ----------------------------------

const CARD_RE = /<a class="card" href="([^"]+)" data-site="([^"]+)"/g;

async function loadGallery(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(GALLERY_SOURCE, { cf: { cacheTtl: 300, cacheEverything: true } as never });
    if (!res.ok) return map;
    const text = await res.text();
    for (const m of text.matchAll(CARD_RE)) map.set(m[2], m[1]);
  } catch {
    // gallery is a nice-to-have for linking; timeline still renders without it
  }
  return map;
}

// --- rendering: timeline page ------------------------------------------------

async function renderTimeline(env: Env, selfUrl: string): Promise<Response> {
  const [{ commits, error }, gallery] = await Promise.all([loadCommits(env), loadGallery()]);

  if (error !== null) {
    return html(
      pageShell(
        "timeline — bisks.net",
        `<p class="empty">${esc(error)}. the raw history is always at
        <a href="https://github.com/${esc(env.GITHUB_REPO || DEFAULT_REPO)}/commits/main">github.com/${esc(env.GITHUB_REPO || DEFAULT_REPO)}</a>.</p>`,
        selfUrl,
        null,
      ),
      502,
    );
  }

  // GitHub returns newest-first; keep that order but also need oldest-first
  // for genesis + "first autonomous build" milestones.
  const oldestFirst = [...commits].reverse();
  const genesis = oldestFirst[0];

  const events = parseEvents(commits); // newest-first
  const eventsOldFirst = [...events].reverse();
  const firstBuild = eventsOldFirst[0];

  const uniqueSites = new Set(events.map((e) => e.site));
  const now = new Date();

  const stats = {
    total: events.length,
    sites: uniqueSites.size,
    hoursSinceFirstBuild: firstBuild ? (now.getTime() - firstBuild.date.getTime()) / 3_600_000 : null,
  };

  const milestones = renderMilestones(genesis, firstBuild, stats);
  const chart = renderDayChart(events);
  const feed = events.length > 0 ? renderFeed(events, gallery) : `<p class="empty">no autonomous builds yet.</p>`;

  const sub =
    stats.total > 0
      ? `${stats.total} autonomous build${stats.total === 1 ? "" : "s"} across ${stats.sites} site${stats.sites === 1 ? "" : "s"}` +
        (stats.hoursSinceFirstBuild !== null ? ` · started ${fmtHours(stats.hoursSinceFirstBuild)} ago` : "")
      : "a chronological history of autonomous web dev in this repo";

  const description =
    stats.total > 0
      ? `${stats.total} autonomous builds across ${stats.sites} sites, drawn from the live git history of atprotozoa — the tradition @bisks.net started by inventing @buildthis.bisks.net.`
      : "A chronological history of autonomous web dev in this repo, drawn from the live git history.";

  const body = `<p class="intro">
    every commit @buildthis.bisks.net has made, pulled live from
    <a href="https://github.com/${esc(env.GITHUB_REPO || DEFAULT_REPO)}">this repo's</a>
    git history — not the bot's own tag log (that's <a href="https://logs.bisks.net">logs</a>),
    the repo's-eye view: what actually landed, in commit order.
  </p>
  ${milestones}
  ${chart}
  <h2 class="feedhead">every build</h2>
  ${feed}`;

  return html(pageShell("timeline — bisks.net", body, selfUrl, { title: "timeline — bisks.net", description, sub }));
}

function renderMilestones(
  genesis: GhCommit | undefined,
  firstBuild: BuildEvent | undefined,
  stats: { hoursSinceFirstBuild: number | null },
): string {
  if (!genesis) return "";
  const items: string[] = [];
  items.push(
    `<li><span class="mdate">${fmtDate(new Date(genesis.commit.author.date))}</span> — repo genesis: <a href="${esc(genesis.html_url)}">${esc(oneLine(genesis.commit.message))}</a></li>`,
  );
  if (firstBuild) {
    items.push(
      `<li><span class="mdate">${fmtDate(firstBuild.date)}</span> — first autonomous build: <a href="${esc(firstBuild.htmlUrl)}">${esc(firstBuild.path)}</a>, for @${esc(firstBuild.handle)}${
        stats.hoursSinceFirstBuild !== null ? ` <span class="msince">(${fmtHours(stats.hoursSinceFirstBuild)} ago)</span>` : ""
      }</li>`,
    );
  }
  return `<ul class="milestones">${items.join("\n")}</ul>`;
}

// This repo is only a few days old, so a day-granularity chart would be one
// or two giant bars for a while. Bucket by hour instead until there's enough
// span for daily buckets to actually show texture (72h ~ a 3-day history).
function spanHours(events: BuildEvent[]): number {
  if (events.length === 0) return 0;
  const times = events.map((e) => e.date.getTime());
  return (Math.max(...times) - Math.min(...times)) / 3_600_000;
}

function bucketCounts(events: BuildEvent[], hourly: boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = hourly ? hourKey(e.date) : dayKey(e.date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function bucketLabel(key: string, hourly: boolean): string {
  return hourly ? `${key.replace("T", " ")}:00Z` : `${key} (UTC)`;
}

// A tiny CSS bar chart, builds per bucket, most recent 48 buckets. No canvas,
// no client JS — just divs sized by inline height.
function renderDayChart(events: BuildEvent[]): string {
  if (events.length === 0) return "";
  const hourly = spanHours(events) < 72;
  const counts = bucketCounts(events, hourly);
  const keys = [...counts.keys()].sort();
  const recent = keys.slice(hourly ? -48 : -21);
  const max = Math.max(...recent.map((k) => counts.get(k)!));
  const bars = recent
    .map((k) => {
      const n = counts.get(k)!;
      const h = Math.max(4, Math.round((n / max) * 64));
      return `<div class="bar" style="height:${h}px" title="${esc(bucketLabel(k, hourly))}: ${n} build${n === 1 ? "" : "s"}"><span class="barcount">${n}</span></div>`;
    })
    .join("");
  return `<div class="chart" role="img" aria-label="builds per ${hourly ? "hour" : "day"}, last ${recent.length} ${hourly ? "hours" : "days"}">${bars}</div>`;
}

function renderFeed(events: BuildEvent[], gallery: Map<string, string>): string {
  const byDay = new Map<string, BuildEvent[]>();
  for (const e of events) {
    const key = dayKey(e.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }
  const days = [...byDay.keys()].sort().reverse();
  return days
    .map((day) => {
      const dayEvents = byDay.get(day)!;
      const rows = dayEvents.map((e) => renderEvent(e, gallery)).join("\n");
      return `<section class="day">
  <h3 class="daylabel">${esc(day)} <span class="daycount">${dayEvents.length} build${dayEvents.length === 1 ? "" : "s"}</span></h3>
  ${rows}
</section>`;
    })
    .join("\n");
}

function renderEvent(e: BuildEvent, gallery: Map<string, string>): string {
  const liveUrl = gallery.get(e.site);
  const siteLink = liveUrl
    ? `<a class="site" href="${esc(liveUrl)}">${esc(e.path)}</a>`
    : `<span class="site nolive">${esc(e.path)}</span>`;
  const handleLink = `<a class="handle" href="https://bsky.app/profile/${esc(e.handle)}">@${esc(e.handle)}</a>`;
  return `<article class="event">
  <span class="when">${fmtTime(e.date)}</span>
  ${siteLink} <span class="for">for</span> ${handleLink}
  <a class="commit" href="${esc(e.htmlUrl)}" title="view commit">#${esc(e.sha.slice(0, 7))}</a>
</article>`;
}

// --- rendering: og.png share image -------------------------------------------

async function renderOgImage(env: Env): Promise<Response> {
  const { commits } = await loadCommits(env);
  const events = parseEvents(commits);

  const hourly = spanHours(events) < 72;
  const counts = bucketCounts(events, hourly);
  const keys = [...counts.keys()].sort().slice(hourly ? -48 : -28);
  const values = keys.length > 0 ? keys.map((k) => counts.get(k)!) : [1];

  const png = await renderBarChartPng(values, 1200, 630);
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=600",
    },
  });
}

// --- helpers: formatting -----------------------------------------------------

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function hourKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dayKey(d)}T${pad(d.getUTCHours())}`;
}

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

function fmtHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function oneLine(s: string): string {
  return s.split("\n")[0].slice(0, 80);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- rendering: page shell ----------------------------------------------------

function pageShell(
  title: string,
  body: string,
  selfUrl: string,
  meta: { title: string; description: string; sub: string } | null,
): string {
  const shareText = meta ? `${meta.sub} — ${selfUrl}` : `a timeline of autonomous web dev — ${selfUrl}`;
  const shareHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
  const ogTitle = meta?.title || title;
  const ogDescription = meta?.description || "A chronological history of autonomous web dev in this repo.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(ogDescription)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(ogTitle)}" />
<meta property="og:description" content="${esc(ogDescription)}" />
<meta property="og:url" content="${esc(selfUrl)}" />
<meta property="og:image" content="${esc(selfUrl)}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="a bar chart of autonomous builds per day" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${esc(selfUrl)}/og.png" />
<style>
  :root {
    --bg:#fff; --ink:#111; --muted:#6b6b6b; --faint:#e4e4e4; --accent:#1a5fd0;
    --ok:#0a7d33;
    --mono: ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code","Roboto Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:var(--mono); font-size:15px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:680px; margin:0 auto; padding:3.5rem 1.25rem 6rem; }
  header h1 { font-size:1.6rem; margin:0 0 .35rem; font-weight:600; }
  header p { color:var(--muted); margin:0 0 1rem; font-size:.9rem; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }

  .share { display:inline-block; margin:0 0 2rem; font-size:.82rem; padding:.35em .8em;
    border:1px solid var(--faint); border-radius:5px; color:var(--ink); }
  .share:hover { background:#f5f5f5; text-decoration:none; }

  .intro { color:var(--muted); font-size:.88rem; max-width:58ch; margin:0 0 1.75rem; }

  .milestones { list-style:none; margin:0 0 1.75rem; padding:0; font-size:.85rem; }
  .milestones li { padding:.4rem 0; border-top:1px dashed var(--faint); }
  .milestones li:first-child { border-top:1px solid var(--ink); }
  .mdate { color:var(--muted); margin-right:.5rem; }
  .msince { color:var(--muted); }

  .chart { display:flex; align-items:flex-end; gap:.25rem; height:80px;
    margin:0 0 2rem; padding-top:16px; border-bottom:1px solid var(--faint); }
  .bar { flex:1; background:var(--accent); border-radius:2px 2px 0 0; position:relative; min-width:6px; }
  .barcount { position:absolute; top:-16px; left:50%; transform:translateX(-50%);
    font-size:.62rem; color:var(--muted); }

  .feedhead { font-size:1rem; margin:0 0 1rem; font-weight:600; }
  .day { margin-bottom:1.5rem; }
  .daylabel { font-size:.82rem; color:var(--muted); font-weight:600; margin:0 0 .5rem;
    display:flex; justify-content:space-between; border-bottom:1px solid var(--faint); padding-bottom:.3rem; }
  .daycount { color:var(--muted); font-weight:400; }
  .event { padding:.5rem 0; border-top:1px dotted var(--faint); font-size:.88rem; }
  .event:first-child { border-top:0; }
  .when { color:var(--muted); font-size:.78rem; margin-right:.5rem; }
  .site { font-weight:600; }
  .site.nolive { color:var(--ink); font-weight:600; }
  .for { color:var(--muted); font-size:.8rem; }
  .commit { float:right; color:var(--muted); font-size:.78rem; }

  .empty { color:var(--muted); padding:1.5rem 0; border-top:1px solid var(--ink); }

  footer { margin-top:3rem; padding-top:.75rem; border-top:1px solid var(--faint);
    color:var(--muted); font-size:.78rem; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>timeline</h1>
      <p>${meta ? esc(meta.sub) : "a chronological history of autonomous web dev in this repo"}</p>
      <a class="share" href="${shareHref}" target="_blank" rel="noopener">share on bluesky ↗</a>
    </header>
    <main>
${body}
    </main>
    <footer>
      part of <a href="https://bisks.net">bisks.net</a> ·
      the bot: <a href="https://buildthis.bisks.net">buildthis</a> ·
      the tag log: <a href="https://logs.bisks.net">logs</a> ·
      source: <a href="https://github.com/rrcobb/atprotozoa">github</a>
    </footer>
  </div>
</body>
</html>`;
}

function html(s: string, status = 200): Response {
  return new Response(s, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

// --- a from-scratch PNG encoder, for /og.png ---------------------------------
//
// No image library is available to a Worker (no canvas, no sharp). PNG's IDAT
// chunk just wants zlib-compressed (RFC1950) scanline data, and the Workers
// runtime ships a standard CompressionStream that speaks zlib "deflate" — so a
// tiny hand-rolled encoder (chunks + crc32) is enough to draw flat-color
// shapes without any dependency. Text needs a font rasterizer we don't have,
// so the chart deliberately stays typographic-free: bars only, no labels.

async function renderBarChartPng(values: number[], width: number, height: number): Promise<Uint8Array> {
  const px = new Uint8Array(width * height * 3);
  const bg: [number, number, number] = [15, 14, 19]; // near-black, matches the bot's own dark aesthetic
  const bar: [number, number, number] = [124, 108, 255]; // an accent purple used elsewhere in the house style
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = bg[0];
    px[i * 3 + 1] = bg[1];
    px[i * 3 + 2] = bg[2];
  }
  const set = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };

  const n = Math.max(values.length, 1);
  const max = Math.max(...values, 1);
  const padX = 60;
  const padTop = 90;
  const padBottom = 60;
  const plotH = height - padTop - padBottom;
  const plotW = width - padX * 2;
  const gap = 8;
  const barW = Math.max(4, Math.floor((plotW - gap * (n - 1)) / n));

  for (let i = 0; i < values.length; i++) {
    const h = Math.max(3, Math.round((values[i] / max) * plotH));
    const x0 = padX + i * (barW + gap);
    const y0 = height - padBottom - h;
    for (let x = x0; x < x0 + barW; x++) {
      for (let y = y0; y < height - padBottom; y++) set(x, y, bar);
    }
  }
  // baseline
  for (let x = padX; x < width - padX; x++) set(x, height - padBottom, [60, 58, 74]);

  return encodePng(px, width, height);
}

async function encodePng(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  // Raw scanlines, each prefixed with filter-type 0 (none).
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const idatData = await deflate(raw);

  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])); // signature

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(chunk("IHDR", ihdr));
  chunks.push(chunk("IDAT", idatData));
  chunks.push(chunk("IEND", new Uint8Array(0)));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// PNG's IDAT wants a zlib (RFC1950) stream; the Workers runtime's
// CompressionStream("deflate") produces exactly that (as opposed to
// "deflate-raw", which omits the zlib header/checksum PNG needs).
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const done = writer.write(data).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  let total = 0;
  for (;;) {
    const { done: readDone, value } = await reader.read();
    if (readDone) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await done;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
