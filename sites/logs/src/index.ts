// logs Worker — logs.bisks.net
//
// The build bot's tags-and-outcomes timeline. It's a pure reader: it fetches the
// event log from the buildthis worker (buildthis.bisks.net/logs.json) and renders
// it server-side. No KV of its own — the event log lives on buildthis, keyed by
// mention uri, written by the watcher (seen/gate/dispatch) and the builder
// (outcome). See notes/80-buildthis-bot.md and sites/buildthis/src/index.ts.
//
// Routes:
//   /          -> the tags -> outcomes timeline (PRIMARY page)
//   /stats     -> STUB: cross-microsite request/error stats (SECONDARY, separate)
//   everything else -> static assets (public/), incl. a plain 404-ish index.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  // Where to read the event log. A var (not a secret) so it's easy to point at a
  // local buildthis during dev. Defaults to prod if unset.
  LOGS_SOURCE?: string;
}

const DEFAULT_SOURCE = "https://buildthis.bisks.net/logs.json";

// Mirrors the LogEvent shape the buildthis worker writes. Kept as a local copy —
// house style is copy, don't share — so this site never imports across sites.
interface LogEvent {
  mentionUri: string;
  mentionCid?: string;
  authorHandle?: string;
  authorDid?: string;
  text?: string;
  isReply?: boolean;
  firstSeen: string;
  updatedAt: string;
  mutual?: boolean;
  dispatched?: boolean;
  outcome?: {
    status: "success" | "failure";
    builtName?: string;
    url?: string;
    replyText?: string;
    at: string;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return renderTimeline(env);
    }

    // SECONDARY, deliberately separate from the tags timeline: a cross-microsite
    // stats page (requests + errors per site). Stubbed — see the TODO in
    // renderStats(). Kept as its own route so it never blends into the timeline.
    if (url.pathname === "/stats") {
      return renderStats();
    }

    return env.ASSETS.fetch(request);
  },
};

async function renderTimeline(env: Env): Promise<Response> {
  const source = env.LOGS_SOURCE || DEFAULT_SOURCE;
  let events: LogEvent[] = [];
  let fetchError: string | null = null;
  try {
    const res = await fetch(source, { cf: { cacheTtl: 10 } as never });
    if (!res.ok) {
      fetchError = `log source returned ${res.status}`;
    } else {
      const j = (await res.json()) as { events?: LogEvent[] };
      events = Array.isArray(j.events) ? j.events : [];
    }
  } catch (err) {
    fetchError = `couldn't reach the log source (${err})`;
  }

  const rows = events.map(renderEvent).join("\n");
  const body =
    fetchError !== null
      ? `<p class="empty">${esc(fetchError)}</p>`
      : events.length === 0
        ? `<p class="empty">no tags logged yet. tag <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> and it'll show up here.</p>`
        : rows;

  return html(page(body, events.length));
}

// One timeline entry: who tagged, what they asked, the gate result, and the
// outcome (dispatched -> built/failed -> reply). Each fact is a small labelled
// chip so the row reads as a status line, not prose.
function renderEvent(e: LogEvent): string {
  const handle = e.authorHandle ? `@${esc(e.authorHandle)}` : "someone";
  const profile = e.authorHandle
    ? `https://bsky.app/profile/${esc(e.authorHandle)}`
    : null;
  const who = profile ? `<a href="${profile}">${handle}</a>` : handle;

  const postLink = bskyPostUrl(e.mentionUri, e.authorHandle);
  const when = fmtTime(e.firstSeen);
  const whenEl = postLink
    ? `<a class="when" href="${postLink}">${when}</a>`
    : `<span class="when">${when}</span>`;

  const chips: string[] = [];
  // Gate.
  if (e.mutual === true) chips.push(chip("mutual", "ok"));
  else if (e.mutual === false) chips.push(chip("non-mutual", "muted"));
  // Dispatch.
  if (e.dispatched === true) chips.push(chip("dispatched", "ok"));
  else if (e.dispatched === false)
    chips.push(chip(e.mutual === false ? "no build" : "dispatch failed", e.mutual === false ? "muted" : "bad"));
  // Reply tag context.
  if (e.isReply) chips.push(chip("reply-tag", "muted"));

  // Outcome (from the builder). Success shows the live link; failure is honest.
  let outcomeEl = "";
  if (e.outcome) {
    if (e.outcome.status === "success") {
      chips.push(chip("built", "ok"));
      if (e.outcome.url) {
        outcomeEl = `<div class="outcome"><span class="arrow">→</span> <a href="${esc(e.outcome.url)}">${esc(e.outcome.url)}</a></div>`;
      } else if (e.outcome.builtName) {
        outcomeEl = `<div class="outcome"><span class="arrow">→</span> ${esc(e.outcome.builtName)}</div>`;
      }
    } else {
      chips.push(chip("build failed", "bad"));
    }
  } else if (e.dispatched === true) {
    // Dispatched but no outcome yet: build is in flight (or the bot is down).
    chips.push(chip("pending", "muted"));
  }

  const ask = e.text ? `<div class="ask">${esc(e.text)}</div>` : "";

  return `<article class="event">
  <div class="head">${who} ${whenEl}</div>
  ${ask}
  <div class="chips">${chips.join(" ")}</div>
  ${outcomeEl}
</article>`;
}

function chip(label: string, kind: "ok" | "bad" | "muted"): string {
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

// STUB (SECONDARY concern — kept separate from the tags timeline on purpose).
//
// TODO: cross-microsite request/error stats. Idea: each site's worker already has
// [observability] on, so per-site request + error counts can come from the
// Cloudflare GraphQL Analytics API (see notes/80 "Watching the watcher"), read
// with a scoped API token and rendered here as one row per site. Not built yet —
// this route exists so the tags timeline never gets muddied with site metrics.
function renderStats(): Response {
  const body = `<p class="empty">
    cross-site request &amp; error stats aren't built yet — this is a stub.
    the tags timeline is at <a href="/">/</a>.
  </p>
  <p class="note">
    planned: one row per <code>&lt;name&gt;.bisks.net</code> worker with request
    and error counts from the Cloudflare GraphQL Analytics API. tracked as a TODO
    in <code>sites/logs/src/index.ts</code>.
  </p>`;
  return html(pageShell("stats — bisks.net", "stats", "cross-site request & error counts (stub)", body));
}

// --- rendering helpers -----------------------------------------------------

function page(body: string, count: number): string {
  const sub =
    count > 0
      ? `${count} tag${count === 1 ? "" : "s"} · newest first`
      : "the build bot's tags and what became of them";
  return pageShell("logs — bisks.net", "logs", sub, body);
}

function pageShell(title: string, h1: string, sub: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="The build bot's tags and their outcomes." />
<style>
  :root {
    --bg:#fff; --ink:#111; --muted:#6b6b6b; --faint:#e4e4e4; --accent:#1a5fd0;
    --ok:#0a7d33; --bad:#c02626;
    --mono: ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code","Roboto Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:var(--mono); font-size:15px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:680px; margin:0 auto; padding:3.5rem 1.25rem 6rem; }
  header h1 { font-size:1.6rem; margin:0 0 .35rem; font-weight:600; }
  header p { color:var(--muted); margin:0 0 2.5rem; font-size:.9rem; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }

  .event { padding:1.1rem 0; border-top:1px solid var(--faint); }
  .event:first-of-type { border-top:1px solid var(--ink); }
  .head { display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap; }
  .head a { font-weight:600; }
  .when { color:var(--muted); font-size:.8rem; }
  .ask { margin:.4rem 0 .55rem; color:var(--ink); white-space:pre-wrap; word-break:break-word; }
  .chips { display:flex; gap:.4rem; flex-wrap:wrap; }
  .chip { font-size:.68rem; letter-spacing:.02em; padding:.12em .5em; border-radius:3px;
    border:1px solid var(--faint); color:var(--muted); }
  .chip.ok { color:var(--ok); border-color:var(--ok); }
  .chip.bad { color:var(--bad); border-color:var(--bad); }
  .chip.muted { color:var(--muted); }
  .outcome { margin-top:.5rem; font-size:.9rem; word-break:break-all; }
  .outcome .arrow { color:var(--muted); }

  .empty { color:var(--muted); padding:1.5rem 0; border-top:1px solid var(--ink); }
  .note { color:var(--muted); font-size:.85rem; }
  code { background:rgba(0,0,0,.05); padding:.1em .35em; border-radius:4px; font-size:.9em; }

  footer { margin-top:3rem; padding-top:.75rem; border-top:1px solid var(--faint);
    color:var(--muted); font-size:.78rem; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${esc(h1)}</h1>
      <p>${sub}</p>
    </header>
    <main>
${body}
    </main>
    <footer>
      part of <a href="https://bisks.net">bisks.net</a> ·
      the bot: <a href="https://buildthis.bisks.net">buildthis</a> ·
      <a href="/stats">site stats</a> (stub)
    </footer>
  </div>
</body>
</html>`;
}

function html(s: string): Response {
  return new Response(s, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

// Turn an at:// mention uri into a bsky.app permalink, when we can. The uri looks
// like at://<did>/app.bsky.feed.post/<rkey>; bsky.app wants
// /profile/<handle-or-did>/post/<rkey>. We prefer the handle for readability but
// fall back to the did in the uri.
function bskyPostUrl(uri: string, handle?: string): string | null {
  const m = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) return null;
  const who = handle || m[1];
  return `https://bsky.app/profile/${who}/post/${m[2]}`;
}

function fmtTime(iso: string): string {
  // Compact, locale-stable, UTC. A toy log doesn't need per-viewer timezones.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
