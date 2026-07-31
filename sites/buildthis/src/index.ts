// buildthis Worker — handle endpoint + the mention-watcher.
//
// Two entrypoints (see notes/80-buildthis-bot.md):
//   fetch()     -> serves /.well-known/atproto-did (Bluesky handle verification)
//                  and the static landing page for everything else.
//   scheduled() -> the watcher: every couple minutes, poll the bot's mentions,
//                  gate on Rob's mutuals + the daily/per-person budget, and fire
//                  a repository_dispatch that builds the idea. Non-mutuals get a
//                  one-time reply that tags Rob.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STATE: KVNamespace;

  BOT_DID: string;
  ROB_DID: string;
  BOT_IDENTIFIER: string;
  GITHUB_REPO: string;

  MAX_BRIEF_CHARS: string;

  // secrets
  BOT_APP_PASSWORD: string;
  GITHUB_TOKEN: string;
  // Shared secret the builder presents on POST /outcome so a random caller can't
  // forge build outcomes into the event log. Set with `wrangler secret put
  // OUTCOME_SECRET` here and `gh secret set OUTCOME_SECRET` for the Action.
  OUTCOME_SECRET: string;
  // Shared secret the builder BOX presents on POST /next-job to claim a build off
  // the queue. Set with `wrangler secret put QUEUE_TOKEN` here + in the box's
  // /etc/buildthis/env. Without it, /next-job rejects (fail closed).
  QUEUE_TOKEN: string;
  // "1" => the watcher enqueues builds for the box to pull (the live path). Unset
  // or not "1" => the watcher fires the GitHub Action via repository_dispatch (the
  // fallback path). A plain var so the cutover is one dashboard toggle, no deploy.
  USE_BOX_QUEUE?: string;
  // Minutes between dispensed jobs when the queue has a backlog (mobius mode —
  // see the "Build queue" section). "0" or unset disables throttling entirely,
  // restoring the original drain-as-fast-as-possible behavior.
  MOBIUS_INTERVAL_MINUTES?: string;
}

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Bluesky handle verification: the bot's DID as plain text, nothing else.
    // Kept FIRST and unchanged — this is the bot's critical handle endpoint.
    if (url.pathname === "/.well-known/atproto-did") {
      return new Response(env.BOT_DID, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    // Read endpoint for the logs site (logs.bisks.net). Returns the tag/outcome
    // event log as JSON, newest first. Read-only, CORS-open (public data — it's
    // the same tags/outcomes already visible on Bluesky), so logs.bisks.net can
    // fetch it cross-origin. The KV binding stays on this one worker (house style:
    // one site = one worker); logs.bisks.net is a pure reader of this endpoint.
    if (url.pathname === "/logs.json") {
      return handleLogsRead(env, url);
    }

    // Outcome sink for the builder (GitHub Action). The build's final step POSTs
    // its result here — built site name / success|failure / reply text — keyed by
    // the mention uri, so it merges onto the same event the watcher started.
    // Authenticated by a shared secret so a random caller can't forge outcomes.
    if (url.pathname === "/outcome" && request.method === "POST") {
      return handleOutcomePost(request, env);
    }

    // The builder box claims the next queued build here (authed by QUEUE_TOKEN).
    // Returns the job payload, or 204 when the queue is empty.
    if (url.pathname === "/next-job" && request.method === "POST") {
      return handleNextJob(request, env);
    }

    // Health surface. "Is the whole thing OK?" in one place, computed from data
    // already in KV: box heartbeat freshness, queue depth, oldest-job age, orphan
    // count, recent build outcomes. `/health` is JSON (scriptable, for alerting);
    // `/health.html` renders the same snapshot for eyeballing. Public + read-only —
    // it exposes no secrets, just operational counts (the tags are already public
    // on Bluesky), so no auth, so a cron/uptime check can hit it without a token.
    if (url.pathname === "/health" || url.pathname === "/health.html") {
      return handleHealth(env, url.pathname.endsWith(".html"));
    }

    // The bot's own "what I've built, what's still waiting" page. Reads a
    // once-a-day snapshot (see maybeRefreshDirectory) rather than recomputing
    // live on every hit.
    if (url.pathname === "/directory") {
      return handleDirectoryPage(env);
    }

    // The "yes, fine, I titrate too" page — mobius mode's own status surface.
    // See the Mobius mode section near handleNextJob for what it's reporting.
    if (url.pathname === "/mobius") {
      return handleMobiusPage(env);
    }

    return env.ASSETS.fetch(request);
  },

  // Cron entrypoint. Wrapped so a thrown error is logged, not swallowed — a
  // failed tick should be visible in `wrangler tail`, and the next tick retries.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runWatcher(env));
    // Piggybacks on the same 2-min cron rather than adding a second trigger;
    // maybeRefreshDirectory no-ops unless the cached snapshot is >24h old.
    ctx.waitUntil(maybeRefreshDirectory(env));
  },
};

async function runWatcher(env: Env): Promise<void> {
  const session = await login(env);

  // Pull recent mentions. We page a little in case a burst arrived, but the
  // seen-cursor + per-id dedup below is what actually prevents double-handling.
  const mentions = await recentMentions(session);
  if (mentions.length === 0) return;

  for (const m of mentions) {
    // Dedup: skip anything we've already acted on. Keyed by the notification's
    // own uri so a re-list can't re-trigger a build.
    const handledKey = `handled:${m.uri}`;
    if (await env.STATE.get(handledKey)) continue;

    // Log the tag the moment we see it, before any gate. Keyed by the mention
    // uri so subsequent steps (gate, dispatch, and later the build outcome) merge
    // into the SAME record rather than duplicating. See recordEvent + notes on
    // the logs site (sites/logs). Best-effort: a KV write must never abort a tick.
    await recordEvent(env, m.uri, {
      mentionUri: m.uri,
      mentionCid: m.cid,
      authorHandle: m.authorHandle,
      authorDid: m.authorDid,
      text: m.text.slice(0, 600),
      isReply: m.isReply,
    });

    // Rob himself is always allowed (he owns the bot — he's not a "mutual" to be
    // checked; a self-relationship has neither following nor followedBy). Everyone
    // else must be a mutual of Rob's.
    const isAllowed =
      m.authorDid === env.ROB_DID || (await robMutual(env, m.authorDid));

    if (!isAllowed) {
      // Gate result: non-mutual. No dispatch will happen on this path.
      await recordEvent(env, m.uri, { mutual: false, dispatched: false });

      // Reply once, ever, tagging Rob so he can pick it up by hand. The
      // "replied-nonmutual" marker is per-author (not per-post) so someone can't
      // make the bot spam-tag Rob by mentioning it repeatedly.
      const nmKey = `nonmutual-replied:${m.authorDid}`;
      if (!(await env.STATE.get(nmKey))) {
        await replyToPost(
          session,
          m,
          `hi! i'll build for anyone, just not automatically yet — tagging @bisks.net so they can give the go-ahead.`,
          { "bisks.net": env.ROB_DID },
        );
        await env.STATE.put(nmKey, "1", { expirationTtl: 60 * 60 * 24 * 30 });
      }
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
      continue;
    }

    // Gate result: mutual — this tag will be built.
    await recordEvent(env, m.uri, { mutual: true });

    // A mutual: acknowledge the request with a like before doing anything else,
    // so it's visibly clear the bot saw the tag and is working on the build in the
    // background. Guarded by a per-post marker so a dispatch retry (or a re-list)
    // can't stack duplicate likes on the same post.
    const likedKey = `liked:${m.uri}`;
    if (!(await env.STATE.get(likedKey))) {
      await likePost(session, m);
      await env.STATE.put(likedKey, "1", { expirationTtl: 60 * 60 * 24 * 30 });
    }

    // Dispatch the build. There is NO build-count or per-person gate — spend is
    // bounded entirely by the provider spend cap (Rob's call: dollars are the only
    // ceiling). The brief is the tagging post's text; if the tag was a reply, we
    // prepend the ancestor posts so "build this ☝️" resolves to what it points at.
    // All treated as a feature description, not harness instructions.
    const ancestors = await threadContext(session, m);
    const brief = buildBrief(m.text, ancestors, num(env.MAX_BRIEF_CHARS));
    const payload: BuildPayload = {
      brief,
      authorHandle: m.authorHandle,
      // The mention uri keys the event record; the builder echoes it back on the
      // outcome POST so the build result lands on the SAME record.
      mentionUri: m.uri,
      // Everything the reply step needs to answer in-thread.
      replyRootUri: m.rootUri,
      replyRootCid: m.rootCid,
      replyParentUri: m.uri,
      replyParentCid: m.cid,
    };

    // Two paths, selected by the USE_BOX_QUEUE var so the cutover is a toggle:
    //   box queue (live)  -> enqueue for the Hetzner box to pull and build.
    //   dispatch (fallback) -> fire the GitHub Action (the original path).
    // Either way `dispatched` means "the build was successfully handed off."
    const useQueue = env.USE_BOX_QUEUE === "1";
    const dispatched = useQueue
      ? await enqueueJob(env, payload)
      : await dispatchBuild(env, payload);

    // Record whether the handoff actually left, so a failure is visible in the
    // timeline rather than looking like a build that silently never ran.
    await recordEvent(env, m.uri, { dispatched });

    if (dispatched) {
      // Only mark handled if the handoff actually left. A failed one stays
      // un-handled so the next tick retries it.
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    }
  }
}

// --- Event log -------------------------------------------------------------
//
// The bot's tags-and-outcomes timeline. One record per mention, keyed by the
// mention uri (`event:<uri>` in the STATE KV), accumulated across the steps the
// watcher already runs (seen -> gate -> dispatch) and finished by the builder's
// outcome POST. The logs site (sites/logs) reads these via GET /logs.json.
//
// KV, not D1: the store is already here (buildthis has STATE), the record set is
// small (bounded by the handled-mention window), and "list keys + get each +
// sort in the reader" gives an ordered, readable timeline without a schema. D1
// would be nicer for ad-hoc queries, but there are none — just "show them all,
// newest first," which KV does fine.

const EVENT_PREFIX = "event:";
// Events outlive the 7-day `handled:` dedup window so the timeline stays readable
// after a tag stops being re-checkable. 30 days is plenty for a toy log.
const EVENT_TTL = 60 * 60 * 24 * 30;

interface LogEvent {
  mentionUri: string;
  mentionCid?: string;
  authorHandle?: string;
  authorDid?: string;
  text?: string;
  isReply?: boolean;
  firstSeen: string; // ISO — set once, the timeline sort key
  updatedAt: string; // ISO — last write
  mutual?: boolean; // gate result; undefined until gated
  dispatched?: boolean; // true fired / false failed-or-non-mutual / undefined pre-gate
  // Filled by the builder's outcome POST. builtName is "<site>" or "<site>/<path>".
  outcome?: {
    status: "success" | "failure";
    builtName?: string;
    url?: string;
    replyText?: string;
    // Post-deploy liveness result on a success: true = the box confirmed the URL
    // served; false = it pushed but the URL didn't come up in time (worth a look);
    // undefined = not a success / older record from before the check existed.
    liveVerified?: boolean;
    // A partial build: a real first pass shipped and is live, but the build ran out
    // of turns before finishing. The site is continuable by re-tagging the thread.
    // status is still "success" (it IS live); this flags it as work-in-progress.
    partial?: boolean;
    at: string; // ISO
  };
}

// Merge `patch` into the event keyed by `mentionUri`, preserving firstSeen and
// bumping updatedAt. Best-effort: any failure is logged, never thrown, so a KV
// hiccup can't abort a watcher tick or a build.
async function recordEvent(
  env: Env,
  mentionUri: string,
  patch: Partial<LogEvent>,
): Promise<void> {
  try {
    const key = `${EVENT_PREFIX}${mentionUri}`;
    const now = new Date().toISOString();
    const existing = await env.STATE.get(key);
    const prev: Partial<LogEvent> = existing ? JSON.parse(existing) : {};
    const merged: LogEvent = {
      ...prev,
      ...patch,
      mentionUri,
      firstSeen: prev.firstSeen ?? now,
      updatedAt: now,
    };
    await env.STATE.put(key, JSON.stringify(merged), { expirationTtl: EVENT_TTL });
  } catch (err) {
    console.error(`recordEvent failed for ${mentionUri}: ${err}`);
  }
}

// GET /logs.json — every event, newest first (by firstSeen). CORS-open so the
// logs site can read it cross-origin. This is public data (the same tags and
// replies are already on Bluesky), so no auth on the read.
// Query params:
//   ?limit=N   how many events to return (default 60, max 500)
//   ?rkey=<k>  return just the one event whose mention post has that record key
//
// Both exist so a reader doesn't have to pull the whole log to render a page.
// The timeline shows a screenful and each /tag/<rkey> permalink needs exactly
// one event; without these the reader downloaded all ~470 (434 KB) either way.
async function handleLogsRead(env: Env, url: URL): Promise<Response> {
  const cors = {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  };
  try {
    // A single list() page (1000 keys) still covers the event set well past the
    // 30-day TTL, so we don't paginate.
    const list = await env.STATE.list({ prefix: EVENT_PREFIX });

    // Single-event lookup for /tag/<rkey>. The KV key is `event:<mentionUri>`
    // and the rkey is that uri's last segment, so this is a key filter — no
    // need to read every record and search their contents.
    const wantRkey = url.searchParams.get("rkey");
    if (wantRkey) {
      const hit = list.keys.find((k) => k.name.endsWith(`/${wantRkey}`));
      if (!hit) {
        return new Response(JSON.stringify({ events: [] }), {
          headers: { ...cors, "cache-control": "public, max-age=30" },
        });
      }
      const raw = await env.STATE.get(hit.name);
      const one = raw ? [JSON.parse(raw) as LogEvent] : [];
      return new Response(JSON.stringify({ events: one }), {
        headers: { ...cors, "cache-control": "public, max-age=30" },
      });
    }

    // Read the records CONCURRENTLY. This used to be a sequential await inside
    // a for-loop — one KV round trip per event, in series. That was fine when
    // there were a dozen events and quietly became a 30-second response at ~470
    // (each get is tens of ms, and they added up), which made logs.bisks.net
    // look hung since it blocks on this fetch to render. Promise.all turns the
    // same reads into one wall-clock round trip.
    const raws = await Promise.all(list.keys.map((k) => env.STATE.get(k.name)));

    const events: LogEvent[] = [];
    for (const raw of raws) {
      if (!raw) continue;
      try {
        events.push(JSON.parse(raw) as LogEvent);
      } catch {
        // Skip a corrupt record rather than failing the whole read.
      }
    }
    events.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1)); // newest first

    // Trim to the requested window. The sort key lives inside each record and
    // the KV key is the mention uri, so we can't slice before reading — but we
    // can still keep the whole log off the wire, which is what made the reader
    // slow. `total` lets a caller show "N of M" without asking for all of them.
    const total = events.length;
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 500)
      : 60;
    const page = events.slice(0, limit);

    // Let the edge hold this briefly. The log changes only when the watcher or
    // builder writes an event, so a short TTL is plenty and it keeps a burst of
    // readers (every /tag/<rkey> permalink hits this too) off KV entirely.
    return new Response(JSON.stringify({ events: page, total }), {
      headers: { ...cors, "cache-control": "public, max-age=30" },
    });
  } catch (err) {
    console.error(`logs read failed: ${err}`);
    return new Response(JSON.stringify({ events: [], error: "read failed" }), {
      status: 500,
      headers: cors,
    });
  }
}

// --- Directory + queue -------------------------------------------------------
//
// The bot's own "what have I actually shipped, what's still waiting" page at
// /directory. Built from the same KV event log as /logs.json (see the Event log
// section above), but summarized rather than shown tag-by-tag — a curated list
// of built sites (with links) plus the requests still in flight. Recomputed at
// most once a day: a toy directory doesn't need to be live, and gating a
// recompute behind the existing 2-min watcher cron avoids a second trigger.

// Versioned so a snapshot-shape change (e.g. adding a field like `description`)
// can't get stuck behind the 24h refresh window serving stale-shaped entries —
// bump the suffix and the next hit recomputes live instead of waiting a day.
// v3: fixed a fallbackUrl() bug — bumped so the fix showed up immediately
// instead of waiting out the old snapshot's refresh window.
// v4: every site moved back to its own subdomain (2026-07-31), so every cached
// entry's url is the old path form. Bumped to recompute rather than serve a day
// of stale-shaped links.
const DIRECTORY_KEY = "directory-snapshot:v5";
const DIRECTORY_REFRESH_MS = 24 * 60 * 60 * 1000;

// Every site is served at `<name>.bisks.net` since the 2026-07-31 migration back
// to subdomains (a wildcard *.bisks.net DNS record + wildcard cert mean a plain
// hostname route needs no custom-domain slot — see notes/20-deploy.md). That
// replaced an 88-entry hardcoded snapshot of per-site mount paths, which had to
// exist back when sites were scattered across `bisks.net/<name>` and
// `bisks.net/games/<name>` and a handful of legacy subdomains. The rule is
// uniform again, so a table is no longer needed.
//
// Two exceptions: the apex IS bisks.net itself, and `games` is a path-mounted
// cluster index with no subdomain of its own.
const PATH_MOUNTED: Record<string, string> = {
  apex: "bisks.net",
  games: "bisks.net/games",
};

// Resolve a `builtName` ("<site>" or "<site>/<path>") to its live URL when the
// event has no stored `outcome.url`. Every site is at `<name>.bisks.net` now, so
// this is a rule rather than a lookup — only the apex and the games index are
// path-mounted. Old events whose stored url still points at a `bisks.net/<name>`
// path keep working regardless: those path routes were deliberately kept alive
// for previously-shared links.
function fallbackUrl(builtName: string): string {
  const site = builtName.split("/")[0];
  const rest = builtName.slice(site.length); // "" or "/sub/path..."
  const pathMount = PATH_MOUNTED[site];
  if (pathMount) return `https://${pathMount}${rest}`;
  return `https://${site}.bisks.net${rest}`;
}

// Events built before 2026-07-31 stored a `bisks.net/<name>` path url. Those
// still resolve — the path routes were kept for previously-shared links — but
// they advertise the pre-migration address, so normalise them to the site's own
// subdomain on read rather than rewriting ~470 KV records.
function canonicalUrl(builtName: string, stored?: string): string {
  if (!stored) return fallbackUrl(builtName);
  const m = stored.match(/^https:\/\/bisks\.net\/(?:games\/)?([a-z0-9-]+)(\/.*)?$/i);
  if (!m) return stored; // already a subdomain, or something we don't recognise
  const [, site, rest] = m;
  if (PATH_MOUNTED[site]) return stored; // apex and the games index stay put
  return `https://${site}.bisks.net${rest || "/"}`;
}

interface DirectoryEntry {
  name: string;
  url: string;
  handle?: string;
  at: string; // ISO — when this outcome landed
  description?: string;
}
interface QueueEntry {
  handle?: string;
  text?: string;
  at: string; // ISO — when the request came in
}
interface DirectorySnapshot {
  computedAt: string;
  built: DirectoryEntry[];
  queue: QueueEntry[];
}

async function loadAllEvents(env: Env): Promise<LogEvent[]> {
  const events: LogEvent[] = [];
  const list = await env.STATE.list({ prefix: EVENT_PREFIX });
  for (const k of list.keys) {
    const raw = await env.STATE.get(k.name);
    if (!raw) continue;
    try {
      events.push(JSON.parse(raw) as LogEvent);
    } catch {
      // skip a corrupt record rather than failing the whole computation
    }
  }
  return events;
}

// Two buckets from the same event list: sites successfully built (deduped by
// name, keeping the most recent outcome — a site edited twice shows once), and
// the requests still open — accepted (mutual) but with no outcome yet, whether
// still in flight or waiting on a failed dispatch to retry. A build that
// finished and failed is neither: it's done, not queued, and it wasn't shipped.
function computeDirectory(events: LogEvent[]): DirectorySnapshot {
  const builtByName = new Map<string, DirectoryEntry>();
  const queue: QueueEntry[] = [];

  for (const e of events) {
    if (e.outcome?.status === "success" && e.outcome.builtName) {
      const entry: DirectoryEntry = {
        name: e.outcome.builtName,
        url: canonicalUrl(e.outcome.builtName, e.outcome.url),
        handle: e.authorHandle,
        at: e.outcome.at,
        description: entryDescription(e),
      };
      const prev = builtByName.get(entry.name);
      if (!prev || prev.at < entry.at) builtByName.set(entry.name, entry);
    } else if (e.mutual === true && !e.outcome) {
      queue.push({ handle: e.authorHandle, text: e.text, at: e.firstSeen });
    }
  }

  const built = [...builtByName.values()].sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
  queue.sort((a, b) => (a.at < b.at ? -1 : 1)); // oldest first — it's a queue
  return { computedAt: new Date().toISOString(), built, queue };
}

// Pull a one-line description for a shipped entry. Prefer the builder's own
// BUILD_NOTE, recovered from replyText by stripping the fixed "built it 🎉 —
// <url> / (give the deploy a minute to go live)" template it's prepended to
// (see reply.mjs) — whatever's left is the note verbatim, or the whole
// replyText for an explain-only reply (no template at all). Fall back to the
// original request text when there's no note to recover from.
const REPLY_TEMPLATE_MARKER = "built it 🎉";
function entryDescription(e: LogEvent): string | undefined {
  const reply = e.outcome?.replyText?.trim();
  if (reply) {
    const idx = reply.indexOf(REPLY_TEMPLATE_MARKER);
    const note = idx === -1 ? reply : reply.slice(0, idx).trim();
    if (note) return truncate(note, 220);
  }
  const text = e.text?.trim();
  return text ? truncate(text, 220) : undefined;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

// Cron-driven: recompute and cache the snapshot once the previous one is more
// than a day old. Best-effort — a failed refresh just leaves the old snapshot
// in place (or, on the very first run, none at all; handleDirectoryPage falls
// back to computing live in that case).
async function maybeRefreshDirectory(env: Env): Promise<void> {
  try {
    const existing = await env.STATE.get(DIRECTORY_KEY);
    if (existing) {
      const snap = JSON.parse(existing) as DirectorySnapshot;
      if (Date.now() - new Date(snap.computedAt).getTime() < DIRECTORY_REFRESH_MS) return;
    }
    const snap = computeDirectory(await loadAllEvents(env));
    await env.STATE.put(DIRECTORY_KEY, JSON.stringify(snap));
  } catch (err) {
    console.error(`directory refresh failed: ${err}`);
  }
}

async function handleDirectoryPage(env: Env): Promise<Response> {
  let snap: DirectorySnapshot;
  try {
    const existing = await env.STATE.get(DIRECTORY_KEY);
    snap = existing
      ? (JSON.parse(existing) as DirectorySnapshot)
      : computeDirectory(await loadAllEvents(env)); // no cron tick yet — compute once, live
  } catch (err) {
    console.error(`directory page failed: ${err}`);
    snap = { computedAt: new Date().toISOString(), built: [], queue: [] };
  }
  return new Response(renderDirectoryPage(snap), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

function renderDirectoryPage(snap: DirectorySnapshot): string {
  const builtRows = snap.built.length
    ? snap.built
        .map(
          (b) => `<a class="card" href="${escHtml(b.url)}">
          <h2>${escHtml(b.name)}</h2>
          ${b.description ? `<p class="desc">${escHtml(b.description)}</p>` : ""}
          <p>${b.handle ? `asked for by @${escHtml(b.handle)} · ` : ""}${escHtml(fmtDay(b.at))}</p>
        </a>`,
        )
        .join("\n")
    : `<p class="empty">nothing shipped yet — tag <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> with an idea.</p>`;

  const queueRows = snap.queue.length
    ? snap.queue
        .map(
          (q) => `<div class="card queued">
          <h2>${q.handle ? `@${escHtml(q.handle)}` : "someone"}</h2>
          <p>${q.text ? escHtml(q.text) : "(no text)"}</p>
          <p class="when">received ${escHtml(fmtDay(q.at))}</p>
        </div>`,
        )
        .join("\n")
    : `<p class="empty">queue's empty — every accepted request has either shipped or is done trying.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>directory — buildthis.bisks.net</title>
    <meta name="description" content="Every site the build bot has shipped, and what's still in the queue." />
    <style>
      :root {
        --bg: #0d0a06; --card: #17130c; --ink: #e8dcc8; --muted: #9c8f78;
        --accent: #c8922e; --link: #e0b23c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(1200px 600px at 50% -10%, #241b0e 0%, var(--bg) 60%);
        background-color: var(--bg); color: var(--ink);
        font-family: Georgia, "Times New Roman", serif; line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      .wrap { max-width: 640px; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
      header h1 {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 1.7rem; margin: 0 0 0.25rem; letter-spacing: -0.02em; color: #e6e8ea;
      }
      header p { color: var(--muted); margin: 0 0 2rem; font-style: italic; }
      section { margin-bottom: 2.5rem; }
      section > h2 {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 1rem; color: var(--accent); margin: 0 0 0.9rem; letter-spacing: 0.02em;
      }
      .card {
        display: block; background: var(--card); border: 1px solid #1f2226;
        border-left: 4px solid var(--accent); border-radius: 10px;
        padding: 0.9rem 1.1rem; margin-bottom: 0.7rem; color: inherit;
        text-decoration: none; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      }
      .card:hover h2 { color: var(--link); }
      .card.queued { border-left-color: var(--muted); }
      .card h2 {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 1.05rem; margin: 0 0 0.3rem; font-weight: 700; color: #aeb4ba;
      }
      .card p { margin: 0 0 0.3rem; color: var(--muted); font-size: 0.9rem; }
      .card p:last-child { margin-bottom: 0; }
      .card .desc { color: var(--ink); }
      .card .when { font-size: 0.78rem; }
      .empty { color: var(--muted); font-style: italic; }
      footer { margin-top: 3rem; color: var(--muted); font-size: 0.82rem; }
      footer a { color: var(--link); }
      a { color: var(--link); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>directory</h1>
        <p>everything I've shipped, and what's still waiting</p>
      </header>
      <main>
        <section>
          <h2>shipped (${snap.built.length})</h2>
          ${builtRows}
        </section>
        <section>
          <h2>queue (${snap.queue.length})</h2>
          ${queueRows}
        </section>
      </main>
      <footer>
        snapshot from ${escHtml(fmtDay(snap.computedAt))} · refreshes once a day ·
        <a href="/">buildthis</a> · <a href="/working/">what's building right now</a> ·
        full tag-by-tag history at
        <a href="https://logs.bisks.net">logs.bisks.net</a>
      </footer>
    </div>
  </body>
</html>`;
}

// Compact, locale-stable, UTC day — a toy directory doesn't need per-viewer
// timezones or full timestamps.
function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GET /mobius — status page for mobius mode (see the "Build queue" section /
// handleNextJob for the actual throttle). A confession, of sorts: the landing
// page has a whole banner insisting this bot has nothing to do with
// @minormobius.bsky.social — this is the one place that's no longer entirely
// true. Public, read-only, no secrets in play (same shape as /health).
async function handleMobiusPage(env: Env): Promise<Response> {
  const intervalMin = num(env.MOBIUS_INTERVAL_MINUTES ?? "0");
  const enabled = intervalMin > 0;

  let queuedCount = 0;
  try {
    const list = await env.STATE.list({ prefix: JOB_PREFIX });
    for (const k of list.keys) {
      const raw = await env.STATE.get(k.name);
      if (!raw) continue;
      try {
        if ((JSON.parse(raw) as QueueJob).status === "queued") queuedCount++;
      } catch {
        // skip a corrupt job
      }
    }
  } catch (err) {
    console.error(`mobius page: queue read failed: ${err}`);
  }

  let lastDispensed: string | null = null;
  try {
    lastDispensed = await env.STATE.get(MOBIUS_LAST_DISPENSED_KEY);
  } catch {
    // non-fatal — the page just shows "—" for last release
  }

  let nextReleaseNote: string;
  if (!enabled) {
    nextReleaseNote = "disabled — every queued job is served the moment it's claimed.";
  } else if (queuedCount <= 1) {
    nextReleaseNote = "no backlog right now, so nothing's being throttled — the lone job (if any) ships on the next poll.";
  } else {
    const lastMs = lastDispensed ? new Date(lastDispensed).getTime() : 0;
    const nextMs = lastMs + intervalMin * 60 * 1000;
    const waitMin = Math.max(0, Math.round((nextMs - Date.now()) / 60000));
    nextReleaseNote = waitMin === 0
      ? "due any poll now."
      : `in about ${waitMin} minute${waitMin === 1 ? "" : "s"}.`;
  }

  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mobius mode — buildthis.bisks.net</title>
<meta name="description" content="How buildthis paces a build backlog instead of dumping it all at once." />
<style>
  body { margin:0; font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    background:#0d0a06; color:#e8dcc8; line-height:1.6; }
  .wrap { max-width:560px; margin:0 auto; padding:3rem 1.25rem 5rem; }
  h1 { font-size:1.4rem; margin:0 0 0.25rem; }
  p.lede { color:#9c8f78; margin:0 0 1.5rem; font-style:italic; }
  table { width:100%; border-collapse:collapse; margin:1rem 0; }
  td { padding:0.4rem 0.5rem; border-bottom:1px solid #1f2226; font-size:0.9rem; }
  td:first-child { color:#9c8f78; width:44%; }
  footer { margin-top:2rem; color:#9c8f78; font-size:0.78rem; }
  a { color:#e0b23c; }
</style></head><body><div class="wrap">
  <h1>mobius mode</h1>
  <p class="lede">${enabled ? "🟢 on" : "🔴 off"} — the one part of this bot that's honestly a bit like <a href="https://bsky.app/profile/minormobius.bsky.social">@minormobius</a>.</p>
  <p>
    Most tags build the moment they're claimed. But when a burst of tags piles
    the queue up, dispensing them all back-to-back would land a pile of commits
    in a few minutes, then nothing for a long stretch after — exactly the kind
    of spiky, gap-y history a steady drip avoids. So once there's more than one
    job waiting, releases space out to at most one every ${intervalMin || "?"} minute${intervalMin === 1 ? "" : "s"}
    until the backlog clears.
  </p>
  <table>
    <tr><td>status</td><td>${escHtml(enabled ? "enabled" : "disabled")}</td></tr>
    <tr><td>interval</td><td>${enabled ? `${intervalMin} min` : "—"}</td></tr>
    <tr><td>queued now</td><td>${queuedCount}</td></tr>
    <tr><td>last release</td><td>${escHtml(lastDispensed ? lastDispensed.replace("T", " ").slice(0, 19) + "Z" : "—")}</td></tr>
    <tr><td>next release</td><td>${escHtml(nextReleaseNote)}</td></tr>
  </table>
  <footer>
    machine status at <a href="/health">/health</a> ·
    <a href="/directory">directory</a> · <a href="/working/">working on now</a> ·
    <a href="/">buildthis</a>
  </footer>
</div></body></html>`;
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

// POST /outcome — the builder reports a finished build. Body:
//   { mentionUri, status: "success"|"failure", builtName?, url?, replyText? }
// Authenticated by the shared OUTCOME_SECRET (Authorization: Bearer <secret>).
// Merges an `outcome` onto the event the watcher started for that mention.
async function handleOutcomePost(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.OUTCOME_SECRET}`;
  // Guard against a misconfig where the secret is unset — never accept then.
  if (!env.OUTCOME_SECRET || auth !== expected) {
    return new Response("unauthorized", { status: 401 });
  }
  let body: {
    mentionUri?: string;
    status?: string;
    builtName?: string;
    url?: string;
    replyText?: string;
    // The box asks to requeue instead of retire when the build was incomplete or
    // out of budget and it wants another attempt. The worker enforces the ceiling.
    requeue?: boolean;
    // Post-deploy liveness result (success only): did the built URL actually serve?
    liveVerified?: boolean;
    // A partial (shipped-but-unfinished) build, continuable by re-tagging.
    partial?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body.mentionUri || (body.status !== "success" && body.status !== "failure")) {
    return new Response("bad request", { status: 400 });
  }

  // Requeue path: the build didn't finish (incomplete with retries left, or out of
  // budget) and the box asked for another attempt. Put the job back to `queued`,
  // bump its attempt count, and move it to the tail (fresh enqueuedAt) so it doesn't
  // starve everyone behind it. Do NOT write a terminal outcome — the build isn't
  // done; recording a `failure` here would wrongly flip the timeline to failed and
  // (via computeDirectory) drop it from the in-flight queue. We still requeue only
  // up to MAX_JOB_ATTEMPTS; past that the box will already have sent a terminal
  // reply, so a stale requeue request just retires the job instead of looping.
  if (body.requeue) {
    const requeued = await requeueJob(env, body.mentionUri);
    return new Response(JSON.stringify({ ok: true, requeued }), {
      headers: { "content-type": "application/json" },
    });
  }

  await recordEvent(env, body.mentionUri, {
    outcome: {
      status: body.status,
      builtName: body.builtName || undefined,
      url: body.url || undefined,
      replyText: body.replyText || undefined,
      liveVerified: typeof body.liveVerified === "boolean" ? body.liveVerified : undefined,
      partial: body.partial === true ? true : undefined,
      at: new Date().toISOString(),
    },
  });
  // A finished outcome also retires the queue job (box path): the build ran and
  // replied, so drop it from the queue. No-op on the dispatch path (no job key).
  try {
    await env.STATE.delete(`${JOB_PREFIX}${body.mentionUri}`);
  } catch {
    // The job ages out on its TTL anyway; a failed delete isn't worth erroring on.
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

// --- Bluesky ---------------------------------------------------------------

interface Session {
  accessJwt: string;
  did: string;
}

async function login(env: Env): Promise<Session> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: env.BOT_IDENTIFIER,
      password: env.BOT_APP_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { accessJwt: string; did: string };
  return { accessJwt: j.accessJwt, did: j.did };
}

interface Mention {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  text: string;
  // Thread root: for a top-level mention the root IS this post; for a mention
  // inside a thread it's the thread's root. Both are filled from the record.
  rootUri: string;
  rootCid: string;
  // True when this mention is itself a reply — i.e. the person tagged the bot in
  // a reply to some other post ("@buildthis build this ☝️"). When set, we fetch
  // the ancestor posts so the brief includes what "this" refers to.
  isReply: boolean;
}

async function recentMentions(session: Session): Promise<Mention[]> {
  const res = await fetch(
    `${PDS}/xrpc/app.bsky.notification.listNotifications?limit=40`,
    { headers: { authorization: `Bearer ${session.accessJwt}` } },
  );
  if (!res.ok) {
    throw new Error(`listNotifications failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { notifications: RawNotif[] };

  return j.notifications
    .filter((n) => n.reason === "mention")
    .map((n) => {
      const rec = (n.record ?? {}) as PostRecord;
      const root = rec.reply?.root;
      return {
        uri: n.uri,
        cid: n.cid,
        authorDid: n.author.did,
        authorHandle: n.author.handle,
        text: rec.text ?? "",
        rootUri: root?.uri ?? n.uri,
        rootCid: root?.cid ?? n.cid,
        isReply: Boolean(rec.reply),
      };
    });
}

// When the mention is a reply, walk the thread's ancestor chain (root -> ... ->
// the post being replied to) and return their text, oldest first, so the build
// brief can include what "this" / "☝️" points at. Best-effort: on any failure we
// return [] and the build just proceeds on the mention text alone.
async function threadContext(session: Session, m: Mention): Promise<string[]> {
  if (!m.isReply) return [];
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread`);
  u.searchParams.set("uri", m.uri);
  u.searchParams.set("parentHeight", "10"); // walk up to 10 ancestors
  u.searchParams.set("depth", "0");
  const res = await fetch(u.toString(), {
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { thread?: ThreadNode };

  // Collect ancestors newest->oldest by following .parent, then reverse.
  const chain: string[] = [];
  let node = j.thread?.parent;
  while (node?.post) {
    const handle = node.post.author?.handle ?? "someone";
    const text = (node.post.record?.text ?? "").trim();
    if (text) chain.push(`@${handle}: ${text}`);
    node = node.parent;
  }
  return chain.reverse();
}

interface ThreadNode {
  post?: {
    author?: { handle?: string };
    record?: { text?: string };
  };
  parent?: ThreadNode;
}

interface RawNotif {
  uri: string;
  cid: string;
  reason: string;
  author: { did: string; handle: string };
  record?: unknown;
}
interface PostRecord {
  text?: string;
  reply?: { root?: { uri: string; cid: string } };
}

// Is `did` a mutual of Rob's? Uses the anonymous AppView — a mutual has BOTH
// `following` (Rob -> them) and `followedBy` (them -> Rob) on the relationship.
async function robMutual(env: Env, did: string): Promise<boolean> {
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.graph.getRelationships`);
  u.searchParams.set("actor", env.ROB_DID);
  u.searchParams.append("others", did);
  const res = await fetch(u.toString());
  if (!res.ok) return false; // fail closed: unknown => not a mutual, don't build
  const j = (await res.json()) as {
    relationships: Array<{ following?: string; followedBy?: string }>;
  };
  const rel = j.relationships?.[0];
  return Boolean(rel?.following && rel?.followedBy);
}

// `mentions` maps each @handle that appears in `text` to its DID, so the tag
// resolves to a real facet. Replies with no tags pass {} and get no facets.
async function replyToPost(
  session: Session,
  m: Mention,
  text: string,
  mentions: Record<string, string> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: now,
    reply: {
      root: { uri: m.rootUri, cid: m.rootCid },
      parent: { uri: m.uri, cid: m.cid },
    },
    facets: mentionFacets(text, mentions),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) {
    // Don't throw — a failed reply shouldn't abort the whole tick. Log it.
    console.error(`reply failed: ${res.status} ${await res.text()}`);
  }
}

// Like a post — the bot's "working on it" acknowledgement. Creates an
// app.bsky.feed.like record pointing at the mention's strongRef (uri + cid).
// Best-effort like replyToPost: a failed like is logged, not thrown, so it can
// never abort the tick or block the build that follows.
async function likePost(session: Session, m: Mention): Promise<void> {
  const record = {
    $type: "app.bsky.feed.like",
    subject: { uri: m.uri, cid: m.cid },
    createdAt: new Date().toISOString(),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.like",
      record,
    }),
  });
  if (!res.ok) {
    console.error(`like failed: ${res.status} ${await res.text()}`);
  }
}

// Build a mention facet for each @handle in the text that we have a DID for, so
// the tag actually notifies. Uses UTF-8 BYTE offsets (atproto requires bytes,
// not JS char indices) — the lesson baked into mino's reply builder (notes/70).
// A handle with no DID in the map gets no facet (renders as plain text).
function mentionFacets(text: string, mentions: Record<string, string>): unknown[] {
  const enc = new TextEncoder();
  const facets: unknown[] = [];
  const re = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const handle = match[1];
    const did = mentions[handle];
    if (!did) continue;
    const before = enc.encode(text.slice(0, match.index)).length;
    const len = enc.encode(match[0]).length;
    facets.push({
      index: { byteStart: before, byteEnd: before + len },
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
  }
  return facets;
}

// --- GitHub dispatch -------------------------------------------------------

interface BuildPayload {
  brief: string;
  authorHandle: string;
  mentionUri: string;
  replyRootUri: string;
  replyRootCid: string;
  replyParentUri: string;
  replyParentCid: string;
}

async function dispatchBuild(env: Env, payload: BuildPayload): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "buildthis-bot",
      },
      body: JSON.stringify({ event_type: "buildthis", client_payload: payload }),
    },
  );
  if (!res.ok) {
    console.error(`dispatch failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

// --- Build queue (box path) ------------------------------------------------
//
// A KV-backed FIFO the Hetzner builder box drains. A job is the same BuildPayload
// the Action's dispatch carries, plus a claim lifecycle. Keyed by mention uri so a
// re-tick can't enqueue the same mention twice (put is idempotent on the key), and
// so it lines up with the event:<uri> record the timeline reads.
//
// KV, not a real queue: the store is already here, the job set is tiny (one box,
// serialized builds), and "list queued keys, take the oldest, mark claimed" is all
// we need. Claims aren't perfectly atomic on KV, but a single box means no
// contention — the claim marker just stops the same job being served twice.

const JOB_PREFIX = "job:";
// Jobs live long enough to survive a box outage + retries, then age out. The box
// deletes a job when it finishes; this TTL is the backstop for one that never does.
const JOB_TTL = 60 * 60 * 24 * 3;
// Last time the box polled /next-job. Written every poll (~15s), read by /health.
const BOX_HEARTBEAT_KEY = "box-heartbeat";
// How many times a job may run before we stop retrying it. An incomplete build
// (agent worked but nothing landed on main) requeues until this ceiling, then the
// box sends a terminal honest-failure reply. Each attempt is a full Sonnet run, so
// keep this modest — most incompletes are genuinely-too-big asks a retry won't fix.
// The box reads `attempts` off the job and gives up on its side at the same number;
// this is the worker-side backstop so a buggy box can't loop forever.
const MAX_JOB_ATTEMPTS = 3;
// Last time /next-job actually handed a job to the box (not just polled — see
// BOX_HEARTBEAT_KEY for that). Mobius mode reads this to pace a backlog.
const MOBIUS_LAST_DISPENSED_KEY = "mobius-last-dispensed";

interface QueueJob extends BuildPayload {
  status: "queued" | "claimed";
  enqueuedAt: string; // ISO — FIFO order; reset on requeue so a retry goes to the tail
  claimedAt?: string; // ISO — when the box took it
  attempts: number; // 1-based; bumped on each requeue. The box caps retries on this.
}

// Enqueue a build for the box. Idempotent on mention uri: if a job for this
// mention already exists (queued or in-flight), leave it. Returns true on success.
async function enqueueJob(env: Env, payload: BuildPayload): Promise<boolean> {
  try {
    const key = `${JOB_PREFIX}${payload.mentionUri}`;
    if (await env.STATE.get(key)) return true; // already queued/claimed — no dup
    const job: QueueJob = {
      ...payload,
      status: "queued",
      enqueuedAt: new Date().toISOString(),
      attempts: 1,
    };
    await env.STATE.put(key, JSON.stringify(job), { expirationTtl: JOB_TTL });
    return true;
  } catch (err) {
    console.error(`enqueueJob failed for ${payload.mentionUri}: ${err}`);
    return false;
  }
}

// Requeue a claimed job for another attempt: flip it back to `queued`, bump its
// attempt count, and move it to the tail (fresh enqueuedAt) so a repeatedly-failing
// build doesn't block the ones behind it. Returns true if the job was put back,
// false if it was retired — either because it hit the attempt ceiling or because no
// job record exists (already retired / aged out). On the ceiling we delete the job
// so the box's terminal failure reply is the last word. Best-effort like the rest
// of the queue: a KV hiccup is logged, and the job ages out on its TTL regardless.
async function requeueJob(env: Env, mentionUri: string): Promise<boolean> {
  try {
    const key = `${JOB_PREFIX}${mentionUri}`;
    const raw = await env.STATE.get(key);
    if (!raw) return false; // nothing to requeue — already retired or aged out
    const job = JSON.parse(raw) as QueueJob;
    const nextAttempt = (job.attempts ?? 1) + 1;
    if (nextAttempt > MAX_JOB_ATTEMPTS) {
      // Out of retries. The box already sent the terminal reply on this attempt;
      // drop the job so it can't be served again.
      await env.STATE.delete(key);
      return false;
    }
    const requeued: QueueJob = {
      ...job,
      status: "queued",
      attempts: nextAttempt,
      enqueuedAt: new Date().toISOString(), // tail of the FIFO
      claimedAt: undefined,
    };
    await env.STATE.put(key, JSON.stringify(requeued), { expirationTtl: JOB_TTL });
    return true;
  } catch (err) {
    console.error(`requeueJob failed for ${mentionUri}: ${err}`);
    return false;
  }
}

// POST /next-job — the box claims the oldest queued build. Authed by QUEUE_TOKEN.
// Flips the job to "claimed" and returns it; 204 when nothing's queued. The job is
// retired when the box reports its outcome (POST /outcome deletes it), so there's
// no separate done endpoint — claim here, report there.
async function handleNextJob(request: Request, env: Env): Promise<Response> {
  if (!env.QUEUE_TOKEN || request.headers.get("authorization") !== `Bearer ${env.QUEUE_TOKEN}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Box heartbeat: the box polls this every ~15s, so recording "last poll" here is
  // a free liveness signal — /health reads it to tell a dead box from an idle one.
  // Best-effort: a failed write must never block claiming a job.
  try {
    await env.STATE.put(BOX_HEARTBEAT_KEY, new Date().toISOString());
  } catch {
    // non-fatal — the heartbeat just goes stale, which /health surfaces anyway
  }
  const list = await env.STATE.list({ prefix: JOB_PREFIX });
  const jobs: QueueJob[] = [];
  for (const k of list.keys) {
    const raw = await env.STATE.get(k.name);
    if (!raw) continue;
    try {
      jobs.push(JSON.parse(raw) as QueueJob);
    } catch {
      // skip a corrupt job rather than wedge the queue
    }
  }
  // Oldest queued job first. Claimed jobs are a build in flight — normally skipped.
  const queued = jobs
    .filter((j) => j.status === "queued")
    .sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : 1));

  // Mobius mode: titrate a BACKLOG instead of draining it all at once. A single
  // queued job is always served right away — most tags arrive one at a time and
  // should still build promptly. It's only a *pile-up* (queued.length > 1, e.g. a
  // burst of tags landing together) that gets spaced out: without this, a burst
  // becomes a burst of commits landing in the same few minutes, followed by a long
  // silent stretch until the next tag — exactly the "unsightly gap" pattern this
  // bot's own landing page swore up and down it had nothing to do with
  // (public/index.html's "not @minormobius" banner). MOBIUS_INTERVAL_MINUTES unset
  // or "0" disables this and restores drain-as-fast-as-possible.
  const mobiusIntervalMs = num(env.MOBIUS_INTERVAL_MINUTES ?? "0") * 60 * 1000;
  if (mobiusIntervalMs > 0 && queued.length > 1) {
    const lastRaw = await env.STATE.get(MOBIUS_LAST_DISPENSED_KEY);
    const lastMs = lastRaw ? new Date(lastRaw).getTime() : 0;
    if (Date.now() - lastMs < mobiusIntervalMs) {
      return new Response(null, { status: 204 }); // titrating — try again next poll
    }
  }

  // Orphan reclaim (self-healing): a build that died mid-run (crash, box reboot, a
  // SIGKILLed process) leaves its job stuck `claimed` forever — the box only serves
  // `queued` jobs, so without this it would never be retried and the requester is
  // left hanging (exactly the orphan /health flags). When there's nothing queued,
  // reclaim the oldest claimed job that's been held longer than any real build could
  // take (ORPHAN_AGE_MS): treat it as failed-in-flight and serve it as a fresh
  // attempt. `attempts` still bounds it (the box gives up at MAX), so a genuinely
  // wedged job can't loop forever. This makes death-mid-build recover on its own
  // instead of needing a hand-requeue.
  const now = Date.now();
  let next: QueueJob | undefined = queued[0];
  let reclaimed = false;
  if (!next) {
    const orphans = jobs
      .filter((j) => j.status === "claimed" && j.claimedAt)
      .filter((j) => now - new Date(j.claimedAt as string).getTime() > ORPHAN_AGE_MS)
      .sort((a, b) => ((a.claimedAt as string) < (b.claimedAt as string) ? -1 : 1));
    for (const orphan of orphans) {
      // Mirror requeueJob()'s ceiling: unbounded here, a job whose build keeps
      // dying before reply.mjs runs (no /outcome POST, so no terminal event) got
      // reclaimed and re-served forever — /working/ showed it as a permanently
      // stuck "building now" and /health flagged it as an orphan forever too.
      const nextAttempt = (orphan.attempts ?? 1) + 1;
      if (nextAttempt > MAX_JOB_ATTEMPTS) {
        console.warn(
          `giving up on orphaned job ${orphan.mentionUri} after ${orphan.attempts} attempt(s) — retiring`,
        );
        await env.STATE.delete(`${JOB_PREFIX}${orphan.mentionUri}`);
        await recordEvent(env, orphan.mentionUri, {
          outcome: {
            status: "failure",
            replyText: "gave up — the build kept dying before it could report back. sorry about that one.",
            at: new Date().toISOString(),
          },
        });
        continue;
      }
      next = orphan;
      reclaimed = true;
      console.warn(`reclaiming orphaned job ${orphan.mentionUri} (claimed ${orphan.claimedAt}, attempts ${orphan.attempts})`);
      break;
    }
  }
  if (!next) return new Response(null, { status: 204 });

  // Reclaimed jobs count as another attempt (the prior claim died); fresh queued
  // jobs keep their attempt count (this IS the attempt about to run).
  next.status = "claimed";
  next.claimedAt = new Date().toISOString();
  if (reclaimed) next.attempts = (next.attempts ?? 1) + 1;
  await env.STATE.put(`${JOB_PREFIX}${next.mentionUri}`, JSON.stringify(next), {
    expirationTtl: JOB_TTL,
  });
  // Stamp the dispense clock every time a job actually goes out (not just when
  // mobius mode gated on it) so the pacing window is measured from the last real
  // release, whether or not a throttle happened to apply to it.
  try {
    await env.STATE.put(MOBIUS_LAST_DISPENSED_KEY, next.claimedAt);
  } catch {
    // non-fatal — worst case mobius mode under-paces by one interval next time
  }
  return new Response(JSON.stringify(next), {
    headers: { "content-type": "application/json" },
  });
}

// --- Health ----------------------------------------------------------------
//
// One place to answer "is the whole thing OK?", computed from data already in KV.
// The unattended failure modes this catches — each invisible before:
//   - box is dead: no heartbeat in a while → tags pile up, nobody builds or replies
//   - queue is backing up: builds slower than tags arrive → growing delay
//   - a job is stuck claimed: a build died mid-run and never reported → requester
//     is left hanging (the day-old orphan we found in the audit)
// `ok` is the single boolean an uptime check / cron alert can watch.

// Box is considered alive if it polled /next-job within this window. Subtlety: the
// box only polls WHEN IDLE — during a build it's heads-down and doesn't poll — so
// the window must exceed the longest a build can take, or a healthy building box
// would false-alarm as "down". A max-turns-60 Sonnet build runs ~5-10 min, plus the
// ~90s post-deploy liveness poll, so 12 min covers a full build with margin. A
// genuinely dead box (process gone) stops polling AND its claimed job ages into an
// orphan (see ORPHAN_AGE_MS) — so a real outage still trips within a bounded time,
// via one signal or the other. This window is the "idle loop stopped" detector.
const BOX_ALIVE_WINDOW_MS = 12 * 60 * 1000;
// A claimed job older than this is treated as an orphan: a real build is bounded by
// the box's max-turns + wall clock (minutes), so a job claimed far longer than any
// build takes has almost certainly died without reporting. Also the queue-stuck
// signal — the oldest claimed job shouldn't sit this long.
const ORPHAN_AGE_MS = 30 * 60 * 1000;
// Queue is "backing up" past this many waiting jobs — with one box building
// serially, a handful is normal churn; a deep backlog means arrivals outpace builds.
const QUEUE_BACKLOG_WARN = 8;

interface HealthSnapshot {
  ok: boolean;
  checkedAt: string;
  box: { lastPoll: string | null; secondsAgo: number | null; alive: boolean };
  queue: {
    queued: number;
    claimed: number;
    oldestQueuedAgeMin: number | null;
    oldestClaimedAgeMin: number | null;
    backlog: boolean;
  };
  orphans: number; // claimed jobs stuck past ORPHAN_AGE_MS (died without reporting)
  recent: { window: number; successes: number; failures: number };
  deadLinks: string[]; // recent successes whose URL didn't serve after deploy
  // Recent successes this Worker couldn't verify either way — a same-zone probe
  // returns 522 regardless of whether the site is up. Reported, but not an issue.
  unverifiable: string[];
  issues: string[]; // human-readable list of what's wrong (empty when ok)
}

async function computeHealth(env: Env): Promise<HealthSnapshot> {
  const now = Date.now();

  // Box heartbeat.
  const hb = await env.STATE.get(BOX_HEARTBEAT_KEY);
  const lastPollMs = hb ? new Date(hb).getTime() : null;
  const secondsAgo = lastPollMs ? Math.round((now - lastPollMs) / 1000) : null;
  const alive = lastPollMs !== null && now - lastPollMs < BOX_ALIVE_WINDOW_MS;

  // Queue: read all job records, bucket by status, find the oldest of each.
  const jobList = await env.STATE.list({ prefix: JOB_PREFIX });
  let queued = 0,
    claimed = 0,
    orphans = 0;
  let oldestQueuedMs: number | null = null;
  let oldestClaimedMs: number | null = null;
  for (const k of jobList.keys) {
    const raw = await env.STATE.get(k.name);
    if (!raw) continue;
    let job: QueueJob;
    try {
      job = JSON.parse(raw) as QueueJob;
    } catch {
      continue;
    }
    if (job.status === "queued") {
      queued++;
      const t = new Date(job.enqueuedAt).getTime();
      if (!isNaN(t) && (oldestQueuedMs === null || t < oldestQueuedMs)) oldestQueuedMs = t;
    } else if (job.status === "claimed") {
      claimed++;
      const t = new Date(job.claimedAt ?? job.enqueuedAt).getTime();
      if (!isNaN(t)) {
        if (oldestClaimedMs === null || t < oldestClaimedMs) oldestClaimedMs = t;
        if (now - t > ORPHAN_AGE_MS) orphans++;
      }
    }
  }
  const ageMin = (ms: number | null) => (ms === null ? null : Math.round((now - ms) / 60000));
  const backlog = queued > QUEUE_BACKLOG_WARN;

  // Recent build outcomes — a quick "is it actually producing?" over the last events.
  const events = await loadAllEvents(env);
  events.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1));
  const recentWindow = events.slice(0, 20);
  let successes = 0,
    failures = 0;
  // Candidates for the dead-link check: recent successes the box couldn't verify
  // live at build time (liveVerified===false). But that's often just new-custom-
  // -domain lag — the cert/DNS provisions a minute or two after the box's 90s
  // window (favstar and mahjong-solitaire both did this, then came up fine). So we
  // don't flag on the stored flag alone; we RE-PROBE the URL live below and only
  // flag the ones STILL down. undefined liveVerified = older record from before the
  // check existed — not a candidate.
  const deadLinkCandidates: Array<{ name: string; url: string }> = [];
  for (const e of recentWindow) {
    if (e.outcome?.status === "success") {
      successes++;
      if (e.outcome.liveVerified === false && e.outcome.builtName) {
        deadLinkCandidates.push({
          name: e.outcome.builtName,
          url: canonicalUrl(e.outcome.builtName, e.outcome.url),
        });
      }
    } else if (e.outcome?.status === "failure") failures++;
  }

  // Re-probe each candidate live: a site that serves NOW has recovered (new-domain
  // provisioning lag), so it isn't a real dead link. Bounded work — the candidate
  // set is tiny (recent unverified successes).
  //
  // A Worker cannot reliably probe its OWN zone. A subrequest from here to
  // <name>.bisks.net gets routed internally and comes back 522 ("connection
  // timed out") even while the site serves 200 to the outside world. Verified
  // 2026-07-31: canvass, gridlock, mootree, simcluster-guests and aphoverb were
  // all reported dead within an hour of shipping fine, and every probe returned
  // exactly 522. cf.resolveOverride does not work around it.
  //
  // So 522 (and a network-level throw) means UNKNOWN, not dead. Reporting a
  // healthy site as broken trains everyone to ignore this endpoint, which is
  // worse than staying quiet — the point is to catch real "looks fine, isn't"
  // failures, and a permanently-red check catches nothing.
  const deadLinks: string[] = [];
  const unverifiable: string[] = [];
  for (const c of deadLinkCandidates) {
    let status: number | null = null;
    try {
      const r = await fetch(c.url, { method: "GET", redirect: "manual" });
      status = r.status;
    } catch {
      status = null; // network-level failure
    }
    if (status !== null && status >= 200 && status < 400) continue; // live
    if (status === 522 || status === null) unverifiable.push(c.name);
    else deadLinks.push(c.name);
  }

  // Roll up the issues. `ok` is false if any of these fire.
  const issues: string[] = [];
  if (!alive) {
    issues.push(
      lastPollMs === null
        ? "box has never polled (no heartbeat yet)"
        : `box last polled ${Math.round((secondsAgo ?? 0) / 60)}min ago (>${BOX_ALIVE_WINDOW_MS / 60000}min — likely down)`,
    );
  }
  if (orphans > 0) issues.push(`${orphans} orphaned job(s) stuck claimed >${ORPHAN_AGE_MS / 60000}min`);
  if (backlog) issues.push(`queue backlog: ${queued} waiting (>${QUEUE_BACKLOG_WARN})`);
  if (deadLinks.length) issues.push(`${deadLinks.length} recent build(s) pushed but not live: ${deadLinks.join(", ")}`);

  return {
    ok: issues.length === 0,
    checkedAt: new Date(now).toISOString(),
    box: { lastPoll: hb ?? null, secondsAgo, alive },
    queue: {
      queued,
      claimed,
      oldestQueuedAgeMin: ageMin(oldestQueuedMs),
      oldestClaimedAgeMin: ageMin(oldestClaimedMs),
      backlog,
    },
    orphans,
    recent: { window: recentWindow.length, successes, failures },
    deadLinks,
    unverifiable,
    issues,
  };
}

async function handleHealth(env: Env, asHtml: boolean): Promise<Response> {
  let snap: HealthSnapshot;
  try {
    snap = await computeHealth(env);
  } catch (err) {
    console.error(`health check failed: ${err}`);
    // A health endpoint that errors is itself a red signal — report it as not-ok
    // rather than 500 into the void, so a watcher sees `ok:false` not a blank.
    const body = {
      ok: false,
      checkedAt: new Date().toISOString(),
      issues: [`health check threw: ${err}`],
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  if (asHtml) {
    return new Response(renderHealthPage(snap), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  return new Response(JSON.stringify(snap, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
    },
  });
}

function renderHealthPage(s: HealthSnapshot): string {
  const dot = (ok: boolean) => (ok ? "🟢" : "🔴");
  const row = (label: string, value: string) =>
    `<tr><td>${escHtml(label)}</td><td>${escHtml(value)}</td></tr>`;
  const issues = s.issues.length
    ? `<ul class="issues">${s.issues.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>`
    : `<p class="ok">no issues — everything's nominal.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>buildthis health</title>
<style>
  body { margin:0; font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    background:#0d0a06; color:#e8dcc8; line-height:1.6; }
  .wrap { max-width:560px; margin:0 auto; padding:3rem 1.25rem 5rem; }
  h1 { font-size:1.4rem; margin:0 0 0.25rem; }
  .status { font-size:1.15rem; margin:0 0 1.5rem; }
  table { width:100%; border-collapse:collapse; margin:1rem 0; }
  td { padding:0.4rem 0.5rem; border-bottom:1px solid #1f2226; font-size:0.9rem; }
  td:first-child { color:#9c8f78; width:52%; }
  .issues { color:#ff9b6b; } .ok { color:#7fd08a; }
  h2 { font-size:0.95rem; color:#c8922e; margin:1.6rem 0 0.3rem; }
  footer { margin-top:2rem; color:#9c8f78; font-size:0.78rem; }
  a { color:#e0b23c; }
</style></head><body><div class="wrap">
  <h1>buildthis health</h1>
  <p class="status">${dot(s.ok)} ${s.ok ? "OK" : "ATTENTION"} · <span style="color:#9c8f78">as of ${escHtml(s.checkedAt.replace("T", " ").slice(0, 19))}Z</span></p>
  ${issues}
  <h2>box (builder)</h2>
  <table>
    ${row("alive", `${dot(s.box.alive)} ${s.box.alive ? "yes" : "no"}`)}
    ${row("last poll", s.box.secondsAgo === null ? "never" : `${s.box.secondsAgo}s ago`)}
  </table>
  <h2>queue</h2>
  <table>
    ${row("waiting", String(s.queue.queued))}
    ${row("building now", String(s.queue.claimed))}
    ${row("oldest waiting", s.queue.oldestQueuedAgeMin === null ? "—" : `${s.queue.oldestQueuedAgeMin} min`)}
    ${row("oldest building", s.queue.oldestClaimedAgeMin === null ? "—" : `${s.queue.oldestClaimedAgeMin} min`)}
    ${row("orphaned jobs", `${dot(s.orphans === 0)} ${s.orphans}`)}
  </table>
  <h2>recent builds (last ${s.recent.window})</h2>
  <table>
    ${row("shipped", String(s.recent.successes))}
    ${row("failed", String(s.recent.failures))}
    ${row("pushed but not live", `${dot(s.deadLinks.length === 0)} ${s.deadLinks.length}${s.deadLinks.length ? " (" + s.deadLinks.join(", ") + ")" : ""}`)}
    ${(s.unverifiable || []).length ? row("couldn't verify (same-zone probe)", `${(s.unverifiable || []).length} (${(s.unverifiable || []).join(", ")})`) : ""}
  </table>
  <footer>
    machine-readable at <a href="/health">/health</a> ·
    tag timeline at <a href="https://logs.bisks.net">logs.bisks.net</a> ·
    <a href="/directory">directory</a> ·
    <a href="/working/">working on now</a>
  </footer>
</div></body></html>`;
}

// --- small helpers ---------------------------------------------------------

function num(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

// Assemble the build brief from the tagging post plus any ancestor posts (when
// the tag was a reply). The tagging post is the instruction ("build this"); the
// ancestors are the context it points at. We include the ancestor posts IN FULL —
// a Bluesky post is ~300 chars, so ≤10 of them is ~3000 chars (<1k tokens),
// trivial for the builder's context and not worth truncating mid-idea. The only
// bound on thread context is the 10-ancestor limit in threadContext(). The tag
// post keeps a generous cap purely as a sanity guard.
function buildBrief(tagText: string, ancestors: string[], max: number): string {
  const ask = tagText.trim().slice(0, max);
  if (ancestors.length === 0) return ask;
  const ctx = ancestors.join("\n").trim();
  return `The person tagged the bot in a reply. The post they tagged it in says:\n${ask}\n\nThe thread it's replying to, oldest first (this is the context "this" refers to):\n${ctx}`;
}
