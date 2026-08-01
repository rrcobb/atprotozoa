// westmeadow Worker — westmeadow.bisks.net
//
// A bare list of just the sites @fromthewestmeadow.com has asked buildthis to
// build. Same idea as buildthis's own /live (recomputed fresh on every load,
// no snapshot) but scoped to one requester's handle — @fromthewestmeadow.com
// asked for exactly that after /live turned out to list everyone's requests.
//
// Pure reader, same pattern as sites/logs: fetches buildthis.bisks.net/logs.json
// and filters/renders client-... no, server-side. No KV of its own — the event
// log lives on the buildthis worker, keyed by mention uri, written by its
// watcher (seen/gate/dispatch) and builder (outcome). See
// sites/buildthis/src/index.ts (computeDirectory / handleLiveSitesPage) for the
// source of truth this mirrors. House style is copy, don't share, so this is a
// local copy rather than an import.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  // Where to read the event log. A var (not a secret) so it's easy to point at
  // a local buildthis during dev. Defaults to prod if unset.
  LOGS_SOURCE?: string;
}

const DEFAULT_SOURCE = "https://buildthis.bisks.net/logs.json";

// The requester this site is scoped to. Matched case-insensitively against
// each event's authorHandle.
const REQUESTER_HANDLE = "fromthewestmeadow.com";

// Mirrors the LogEvent shape the buildthis worker writes (only the fields this
// page actually reads).
interface LogEvent {
  authorHandle?: string;
  firstSeen: string;
  outcome?: {
    status: "success" | "failure";
    builtName?: string;
    url?: string;
    at: string;
  };
}

interface BuiltEntry {
  name: string;
  url: string;
  at: string;
}

// Every site is served at `<name>.bisks.net` since the 2026-07-31 migration
// back to subdomains (see notes/20-deploy.md) — the two exceptions are the
// apex itself and the `games` cluster index, which stay path-mounted.
const PATH_MOUNTED: Record<string, string> = {
  apex: "bisks.net",
  games: "bisks.net/games",
};

function fallbackUrl(builtName: string): string {
  const site = builtName.split("/")[0];
  const rest = builtName.slice(site.length); // "" or "/sub/path..."
  const pathMount = PATH_MOUNTED[site];
  if (pathMount) return `https://${pathMount}${rest}`;
  return `https://${site}.bisks.net${rest}`;
}

// Old events (pre-2026-07-31) stored a `bisks.net/<name>` path url. Normalise
// those to the site's own subdomain rather than trusting the stored value —
// same rule buildthis's own canonicalUrl() applies.
function canonicalUrl(builtName: string, stored?: string): string {
  if (!stored) return fallbackUrl(builtName);
  const m = stored.match(/^https:\/\/bisks\.net\/(?:games\/)?([a-z0-9-]+)(\/.*)?$/i);
  if (!m) return stored;
  const [, site, rest] = m;
  if (PATH_MOUNTED[site]) return stored;
  return `https://${site}.bisks.net${rest || "/"}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return renderPage(env);
    }
    return env.ASSETS.fetch(request);
  },
};

// Pull the log (500 is the source endpoint's own hard cap — see its `limit`
// docs in sites/buildthis/src/index.ts — so a requester with more than 500
// *other people's* tags between now and their oldest ask would fall off the
// end; fine for one account's history today) and reduce it to this requester's
// shipped sites, deduped by name (an edit re-ships the same name — keep the
// most recent outcome), newest first.
async function loadBuilt(env: Env): Promise<{ built: BuiltEntry[]; error: string | null }> {
  const source = new URL(env.LOGS_SOURCE || DEFAULT_SOURCE);
  source.searchParams.set("limit", "500");
  let events: LogEvent[];
  try {
    // No edge caching here beyond whatever the source itself applies (30s) —
    // the point of this page is "always current," so we don't add our own.
    const res = await fetch(source.toString());
    if (!res.ok) return { built: [], error: `log source returned ${res.status}` };
    const j = (await res.json()) as { events?: LogEvent[] };
    events = Array.isArray(j.events) ? j.events : [];
  } catch (err) {
    return { built: [], error: `couldn't reach the log source (${err})` };
  }

  const byName = new Map<string, BuiltEntry>();
  for (const e of events) {
    if (e.authorHandle?.toLowerCase() !== REQUESTER_HANDLE) continue;
    if (e.outcome?.status !== "success" || !e.outcome.builtName) continue;
    const entry: BuiltEntry = {
      name: e.outcome.builtName,
      url: canonicalUrl(e.outcome.builtName, e.outcome.url),
      at: e.outcome.at,
    };
    const prev = byName.get(entry.name);
    if (!prev || prev.at < entry.at) byName.set(entry.name, entry);
  }

  const built = [...byName.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  return { built, error: null };
}

async function renderPage(env: Env): Promise<Response> {
  const { built, error } = await loadBuilt(env);
  return new Response(renderHtml(built, error), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

function renderHtml(built: BuiltEntry[], error: string | null): string {
  const body = error
    ? `<p class="empty">${escHtml(error)}</p>`
    : built.length
      ? `<ul>\n${built.map((b) => `  <li><a href="${escHtml(b.url)}">${escHtml(b.name)}</a></li>`).join("\n")}\n</ul>`
      : `<p class="empty">nothing yet — @${REQUESTER_HANDLE} hasn't had one built.</p>`;

  const shareText = `everything @${REQUESTER_HANDLE} has asked @buildthis.bisks.net to build, always up to date: https://westmeadow.bisks.net/`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>everything @${escHtml(REQUESTER_HANDLE)} has built</title>
    <meta name="description" content="A bare list of every site @fromthewestmeadow.com has asked buildthis to build, recomputed fresh on every page load." />
    <meta property="og:title" content="everything @${escHtml(REQUESTER_HANDLE)} has built" />
    <meta property="og:description" content="Recomputed live from buildthis's event log on every load — just this requester's sites, nothing else." />
    <meta property="og:url" content="https://westmeadow.bisks.net/" />
    <meta name="twitter:card" content="summary" />
    <style>
      body {
        margin: 0; background: #0d0a06; color: #e8dcc8;
        font-family: Georgia, "Times New Roman", serif; line-height: 1.6;
      }
      .wrap { max-width: 560px; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
      h1 { font-size: 1.4rem; margin: 0 0 0.4rem; }
      p.lede { color: #9c8f78; margin: 0 0 1.75rem; font-style: italic; font-size: 0.92rem; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { margin: 0 0 0.5rem; }
      a { color: #e0b23c; }
      .empty { color: #9c8f78; font-style: italic; }
      footer { margin-top: 3rem; color: #9c8f78; font-size: 0.82rem; }
      footer a { color: #e0b23c; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>everything @${escHtml(REQUESTER_HANDLE)} has built (${built.length})</h1>
      <p class="lede">every site this account has asked <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> for, recomputed straight from the event log on every load.</p>
      ${body}
      <footer>
        the full list of everything, everyone: <a href="https://buildthis.bisks.net/live">/live</a> ·
        tag-by-tag history: <a href="https://logs.bisks.net">logs.bisks.net</a> ·
        the bot: <a href="https://buildthis.bisks.net">buildthis</a> ·
        <a href="https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}">share this page</a>
      </footer>
    </div>

    <!-- chicken mode (added across projects by @buildthis.bisks.net) -->
    <style>
      #cm-toggle {
        position: fixed;
        right: 0.85rem;
        bottom: 0.85rem;
        z-index: 2147483000;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.7rem;
        line-height: 1;
        background: rgba(20, 20, 20, 0.72);
        color: #ddd;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 999px;
        padding: 0.45rem 0.6rem;
        cursor: pointer;
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      #cm-toggle.on { background: #f4b400; color: #1a1206; border-color: #f4b400; }
      #cm-coop {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2.2rem;
        overflow: hidden;
        pointer-events: none;
        z-index: 2147483000;
        display: none;
      }
      #cm-coop.on { display: block; }
      .cm-chicken {
        position: absolute;
        bottom: 0.1rem;
        font-size: 1.5rem;
        transform: scaleX(-1);
        animation-name: cm-strut;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
        filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
      }
      @keyframes cm-strut {
        0% { transform: translateX(-3rem) scaleX(-1); }
        48% { transform: translateX(calc(100vw + 3rem)) scaleX(-1) translateY(-0.3rem); }
        50% { transform: translateX(calc(100vw + 3rem)) scaleX(1); }
        98% { transform: translateX(-3rem) scaleX(1) translateY(-0.3rem); }
        100% { transform: translateX(-3rem) scaleX(-1); }
      }
    </style>
    <button id="cm-toggle" type="button" title="it's not really corgi mode">🐔</button>
    <div id="cm-coop"></div>
    <script>
      (function () {
        var coop = document.getElementById("cm-coop");
        var toggle = document.getElementById("cm-toggle");
        if (!coop || !toggle) return;
        var KEY = "chicken-mode";
        var spawner = null;

        function spawn() {
          var c = document.createElement("div");
          c.className = "cm-chicken";
          c.textContent = Math.random() < 0.15 ? "🐓" : "🐔";
          var duration = 14 + Math.random() * 10;
          c.style.animationDuration = duration + "s";
          c.style.animationDelay = -Math.random() * duration + "s";
          c.style.fontSize = (1.1 + Math.random() * 0.9) + "rem";
          coop.appendChild(c);
        }
        function start() {
          if (spawner) return;
          coop.innerHTML = "";
          for (var i = 0; i < 5; i++) spawn();
          spawner = setInterval(function () {
            if (coop.children.length < 8) spawn();
          }, 4000);
        }
        function stop() {
          if (spawner) clearInterval(spawner);
          spawner = null;
          coop.innerHTML = "";
        }
        function setMode(on) {
          coop.classList.toggle("on", on);
          toggle.classList.toggle("on", on);
          if (on) start(); else stop();
          try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
        }
        toggle.addEventListener("click", function () {
          setMode(!coop.classList.contains("on"));
        });
        var startedOn = false;
        try { startedOn = localStorage.getItem(KEY) === "1"; } catch (e) {}
        if (startedOn) setMode(true);
      })();
    </script>
    <!-- /chicken mode -->
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
