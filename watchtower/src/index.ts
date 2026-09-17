// watchtower — checks every site is actually serving, from OUTSIDE the zone,
// remembers what it saw, and says so when something breaks.
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
//
// What it does with a failure (added 2026-09-17, the "verifier bot" from
// notes/ideas/other-bots.md):
//   - a site that fails is re-probed on the NEXT tick rather than on the next
//     full walk, and only counts as broken once it has failed twice in a row —
//     a single blip from a deploy in progress never becomes an alert
//   - a confirmed break is written to the alerts log (/alerts.json) and, if a
//     Bluesky app password is configured, posted: as a reply in the thread the
//     site was built from when sites/<name>/.buildthis.json names one, else as
//     a top-level post. Recovery is posted as a reply to the alert.
//   - a site that just appeared on the gallery is probed before anything else,
//     so a fresh build is checked within minutes of shipping
//   - it is silent when everything works. No "all clear" posts, ever.
//
// Posting is off until BOT_APP_PASSWORD is set (`wrangler secret put`). The
// alerts log and the page work regardless. See notes/85-watchtower.md.

export interface Env {
  RESULTS: KVNamespace;
  // Optional. Posting is enabled iff BOT_APP_PASSWORD is set.
  BOT_IDENTIFIER?: string;
  BOT_APP_PASSWORD?: string;
  MAX_POSTS_PER_DAY?: string;
  GITHUB_REPO?: string;
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

// Standing summary — what the page and /report.json show.
interface Report {
  checkedAt: string;
  checked: number;
  healthy: number;
  problems: SiteResult[];
  durationMs: number;
}

// Per-site memory: what the last probe said, how many times in a row it
// failed, and — once confirmed broken — the alert that went out for it, so a
// recovery can be posted as a reply to it.
interface SiteState {
  name: string;
  url: string;
  status: "ok" | "suspect" | "broken";
  fails: number;
  problems: string[];
  lastCheckedAt: string;
  brokenSince?: string;
  alertPostUri?: string;
  alertPostCid?: string;
  alertRootUri?: string;
  alertRootCid?: string;
  // Set when the break was folded into a mass-outage summary: its recovery
  // is logged but not posted, so a zone blip doesn't end as N "is back" posts.
  quiet?: boolean;
}

interface Alert {
  at: string;
  kind: "broken" | "recovered" | "mass-outage";
  name: string;
  url: string;
  problems: string[];
  // How long it was down, for a recovery.
  downForMs?: number;
  // Where it was announced, if posting was on. `posted:false` with a `reason`
  // means the alert was logged but deliberately not posted.
  posted: boolean;
  postUri?: string;
  reason?: string;
}

// Something to post. Queued by a check, drained at the top of the next tick,
// so the subrequest budget for probing and posting never collide inside one
// invocation.
interface Outbox {
  kind: "broken" | "recovered" | "mass-outage";
  name: string;
  url: string;
  problems: string[];
  brokenSince?: string;
  // For a mass outage: how many sites broke at once.
  count?: number;
}

const RESULT_KEY = "watchtower:last";
const CURSOR_KEY = "watchtower:cursor";
const PENDING_KEY = "watchtower:pending"; // names to re-probe next tick
const KNOWN_KEY = "watchtower:known"; // names we've seen on the gallery
const ALERTS_KEY = "watchtower:alerts";
const OUTBOX_KEY = "watchtower:outbox";
const SITE_PREFIX = "site:";

// Subrequest budget (Workers Free: 50 per invocation). Per tick:
//   gallery fetch                      1
//   pending re-probes  up to 4 × 2     8
//   chunk              16 × 2         32
//   outbox posts       up to 2 × ~4    8
//                                     49
// Each site costs 2 fetches (root, which also yields the HTML, then one asset).
const CHUNK = 16;
const MAX_PENDING_PER_TICK = 4;
const MAX_POSTS_PER_TICK = 2;
const SUBREQUESTS_PER_POST = 4;
// A break needs this many consecutive failing probes before it's real.
const CONFIRM_FAILS = 2;
// A confirmed-broken site is re-probed at most this often (plus whenever the
// full walk reaches it), so a wide outage doesn't eat the whole budget on
// re-checks.
const BROKEN_RECHECK_MS = 15 * 60 * 1000;
// More than this many sites breaking in one tick is a zone-wide event, not a
// site bug: one summary post instead of a flood.
const MASS_OUTAGE_THRESHOLD = 5;
const ALERT_LOG_MAX = 200;
const DEFAULT_MAX_POSTS_PER_DAY = 12;

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

// --- site list ---------------------------------------------------------------

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

// --- probing -----------------------------------------------------------------

async function probe(
  url: string,
  wantBody = false,
): Promise<{ status: number | null; type: string | null; body: string; error?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    const body = wantBody ? await r.text().catch(() => "") : "";
    return { status: r.status, type: r.headers.get("content-type"), body };
  } catch (err) {
    // A connection-level failure (TLS, DNS, abort) is its own class of problem
    // and should never be coerced into a status code.
    return { status: null, type: null, body: "", error: String((err as Error)?.message || err) };
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

  // One fetch for the root: its status is the first check and its body is
  // where the asset reference comes from.
  const root = await probe(base + "/", true);
  if (root.status === null) problems.push(`root unreachable (${root.error || "no response"})`);
  else if (root.status < 200 || root.status >= 300) problems.push(`root ${root.status}`);

  const out: SiteResult = { name: site.name, url: site.url, rootStatus: root.status, problems };

  if (root.status && root.status >= 200 && root.status < 300) {
    const asset = firstAsset(root.body);
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

// --- KV helpers --------------------------------------------------------------

async function getJson<T>(env: Env, key: string, fallback: T): Promise<T> {
  const raw = await env.RESULTS.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function putJson(env: Env, key: string, value: unknown): Promise<void> {
  await env.RESULTS.put(key, JSON.stringify(value));
}

async function getSiteState(env: Env, name: string): Promise<SiteState | null> {
  return getJson<SiteState | null>(env, SITE_PREFIX + name, null);
}

async function appendAlert(env: Env, alert: Alert): Promise<void> {
  const log = await getJson<Alert[]>(env, ALERTS_KEY, []);
  log.unshift(alert);
  await putJson(env, ALERTS_KEY, log.slice(0, ALERT_LOG_MAX));
}

// --- state transitions -------------------------------------------------------

// Fold one probe result into the site's remembered state. Returns the outbox
// entry to queue, if this probe changed something worth saying.
async function applyResult(
  env: Env,
  r: SiteResult,
  now: Date,
): Promise<{ state: SiteState; outbox?: Outbox; recheck: boolean }> {
  const prev = await getSiteState(env, r.name);
  const failed = r.problems.length > 0;
  const nowIso = now.toISOString();

  let state: SiteState = prev
    ? { ...prev, url: r.url, problems: r.problems, lastCheckedAt: nowIso }
    : { name: r.name, url: r.url, status: "ok", fails: 0, problems: r.problems, lastCheckedAt: nowIso };

  let outbox: Outbox | undefined;
  let recheck = false;

  if (failed) {
    state.fails = (prev?.fails || 0) + 1;
    if (state.status === "broken") {
      // Still broken. Nothing new to say; keep polling it on the slow cadence.
      recheck = true;
    } else if (state.fails >= CONFIRM_FAILS) {
      state.status = "broken";
      state.brokenSince = nowIso;
      outbox = { kind: "broken", name: r.name, url: r.url, problems: r.problems, brokenSince: nowIso };
      recheck = true;
    } else {
      // First failure: suspect. Re-probe next tick before believing it.
      state.status = "suspect";
      recheck = true;
    }
  } else {
    if (state.status === "broken") {
      outbox = {
        kind: "recovered",
        name: r.name,
        url: r.url,
        problems: prev?.problems || [],
        brokenSince: prev?.brokenSince,
      };
    }
    state = {
      name: state.name,
      url: state.url,
      status: "ok",
      fails: 0,
      problems: [],
      lastCheckedAt: nowIso,
      // Keep the alert refs until the recovery has been posted against them.
      alertPostUri: prev?.alertPostUri,
      alertPostCid: prev?.alertPostCid,
      alertRootUri: prev?.alertRootUri,
      alertRootCid: prev?.alertRootCid,
      brokenSince: prev?.brokenSince,
      quiet: prev?.quiet,
    };
  }

  await putJson(env, SITE_PREFIX + r.name, state);
  return { state, outbox, recheck };
}

// --- one tick ----------------------------------------------------------------

interface PendingEntry {
  name: string;
  notBefore: string;
}

async function runChunk(env: Env, opts: { only?: string[] } = {}): Promise<Report> {
  const started = Date.now();
  const now = new Date();
  const sites = await siteList();
  const byName = new Map(sites.map((s) => [s.name, s]));
  const prevReport = await getJson<Report | null>(env, RESULT_KEY, null);
  if (!sites.length) return prevReport ?? emptyReport();

  // 1. Sites that just appeared on the gallery get checked first — that's the
  //    "verify what just shipped" job.
  const known = new Set(await getJson<string[]>(env, KNOWN_KEY, []));
  const fresh = sites.filter((s) => !known.has(s.name)).map((s) => s.name);

  // 2. Sites flagged suspect or broken last time, due for a re-probe.
  const pending = await getJson<PendingEntry[]>(env, PENDING_KEY, []);
  const due = pending.filter((p) => p.notBefore <= now.toISOString()).map((p) => p.name);

  // 3. The next slice of the full walk.
  const cursorRaw = await env.RESULTS.get(CURSOR_KEY);
  const cursor = cursorRaw ? Number(cursorRaw) % sites.length : 0;
  const walk = sites.slice(cursor, cursor + CHUNK).map((s) => s.name);

  let names: string[];
  if (opts.only) {
    names = opts.only.filter((n) => byName.has(n));
  } else {
    // Priority order, deduped, capped so we stay under the subrequest budget.
    // Fresh sites bump walk slots; pending re-probes have their own small cap.
    const ordered = [...new Set([...fresh.slice(0, CHUNK), ...due.slice(0, MAX_PENDING_PER_TICK), ...walk])];
    names = ordered.slice(0, CHUNK + MAX_PENDING_PER_TICK);
  }

  const results: SiteResult[] = [];
  for (const n of names) results.push(await checkSite(byName.get(n)!));

  // Fold results into per-site state and collect what to say.
  const outbox = await getJson<Outbox[]>(env, OUTBOX_KEY, []);
  const nextPending = new Map<string, PendingEntry>(pending.map((p) => [p.name, p]));
  const newlyBroken: Outbox[] = [];
  for (const r of results) {
    const { state, outbox: entry, recheck } = await applyResult(env, r, now);
    if (recheck) {
      const delay = state.status === "broken" ? BROKEN_RECHECK_MS : 0;
      nextPending.set(r.name, { name: r.name, notBefore: new Date(now.getTime() + delay).toISOString() });
    } else {
      nextPending.delete(r.name);
    }
    if (entry?.kind === "broken") newlyBroken.push(entry);
    else if (entry) outbox.push(entry);
  }

  // A pile of sites breaking together is one event, not N.
  if (newlyBroken.length > MASS_OUTAGE_THRESHOLD) {
    outbox.push({
      kind: "mass-outage",
      name: newlyBroken.map((b) => b.name).join(", "),
      url: "https://atprotozoa-watchtower.rwcobbjr.workers.dev/",
      problems: newlyBroken.map((b) => `${b.name}: ${b.problems[0]}`),
      count: newlyBroken.length,
    });
    for (const b of newlyBroken) {
      const s = await getSiteState(env, b.name);
      if (s) await putJson(env, SITE_PREFIX + b.name, { ...s, quiet: true });
    }
  } else {
    outbox.push(...newlyBroken);
  }

  // Drop pending entries for sites that left the gallery.
  for (const n of [...nextPending.keys()]) if (!byName.has(n)) nextPending.delete(n);

  await putJson(env, PENDING_KEY, [...nextPending.values()]);
  await putJson(env, OUTBOX_KEY, outbox);
  await putJson(env, KNOWN_KEY, sites.map((s) => s.name));
  if (!opts.only) {
    await env.RESULTS.put(CURSOR_KEY, String((cursor + CHUNK) % sites.length));
  }

  // The standing report: everything currently broken or suspect, not just
  // this tick's slice.
  const checkedNames = new Set(names);
  const carried = (prevReport?.problems || []).filter(
    (p) => !checkedNames.has(p.name) && byName.has(p.name),
  );
  const freshProblems = results.filter((r) => r.problems.length);
  const report: Report = {
    checkedAt: now.toISOString(),
    checked: sites.length,
    healthy: sites.length - (carried.length + freshProblems.length),
    problems: [...carried, ...freshProblems].sort((a, b) => a.name.localeCompare(b.name)),
    durationMs: Date.now() - started,
  };
  await putJson(env, RESULT_KEY, report);
  return report;
}

function emptyReport(): Report {
  return { checkedAt: new Date().toISOString(), checked: 0, healthy: 0, problems: [], durationMs: 0 };
}

// --- Bluesky -----------------------------------------------------------------

interface Session {
  accessJwt: string;
  did: string;
}

interface StrongRef {
  uri: string;
  cid: string;
}

function postingEnabled(env: Env): boolean {
  return Boolean(env.BOT_APP_PASSWORD && env.BOT_IDENTIFIER);
}

async function login(env: Env): Promise<Session> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: env.BOT_IDENTIFIER, password: env.BOT_APP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { accessJwt: string; did: string };
  return { accessJwt: j.accessJwt, did: j.did };
}

// Link facets need UTF-8 BYTE offsets, not JS char indices.
function linkFacets(text: string): unknown[] {
  const enc = new TextEncoder();
  const facets: unknown[] = [];
  const re = /https?:\/\/[^\s)]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  return facets;
}

async function createPost(
  session: Session,
  text: string,
  reply?: { root: StrongRef; parent: StrongRef },
): Promise<StrongRef> {
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    facets: linkFacets(text),
  };
  if (reply) record.reply = reply;
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  if (!res.ok) throw new Error(`createRecord failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as StrongRef;
}

// The thread a site was built from, via the provenance file box-build.sh
// commits with every bot build. Returns the tagging post as a reply target
// (root + parent), or null when the site wasn't bot-built or the post is gone.
async function buildThread(env: Env, name: string): Promise<{ root: StrongRef; parent: StrongRef } | null> {
  const repo = env.GITHUB_REPO || "rrcobb/atprotozoa";
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/main/sites/${name}/.buildthis.json`, {
      cf: { cacheTtl: 3600 } as never,
    });
    if (!res.ok) return null;
    const prov = (await res.json()) as { mentionUri?: string };
    if (!prov.mentionUri || !prov.mentionUri.startsWith("at://")) return null;
    const posts = await fetch(
      `${APPVIEW}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(prov.mentionUri)}`,
    );
    if (!posts.ok) return null;
    const j = (await posts.json()) as {
      posts: Array<{ uri: string; cid: string; record: { reply?: { root: StrongRef } } }>;
    };
    const p = j.posts?.[0];
    if (!p) return null;
    const parent = { uri: p.uri, cid: p.cid };
    const root = p.record?.reply?.root ?? parent;
    return { root, parent };
  } catch (err) {
    console.error(`buildThread(${name}) failed: ${String(err)}`);
    return null;
  }
}

function humanDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function alertText(o: Outbox): string {
  const host = o.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (o.kind === "mass-outage") {
    return `🔭 ${o.count} sites on bisks.net broke at once — probably the zone, not the sites. ${o.url}`;
  }
  if (o.kind === "recovered") {
    const down = o.brokenSince ? humanDuration(Date.now() - Date.parse(o.brokenSince)) : null;
    return `🔭 ${host} is back${down ? ` (was down ${down})` : ""}.`;
  }
  // Keep the post under 300 graphemes: one line per problem, trimmed.
  const why = o.problems.slice(0, 2).join("; ");
  return `🔭 ${host} looks broken: ${why}. Seen twice in a row from outside the zone. ${o.url}`;
}

// Drain up to MAX_POSTS_PER_TICK queued alerts. Every alert lands in the log
// whether or not it gets posted; the log records why when it didn't.
async function drainOutbox(env: Env): Promise<void> {
  const outbox = await getJson<Outbox[]>(env, OUTBOX_KEY, []);
  if (!outbox.length) return;

  const enabled = postingEnabled(env);
  const day = new Date().toISOString().slice(0, 10);
  const dayKey = `posts:${day}`;
  let postedToday = Number((await env.RESULTS.get(dayKey)) || 0);
  const maxPerDay = Number(env.MAX_POSTS_PER_DAY || DEFAULT_MAX_POSTS_PER_DAY);

  let session: Session | null = null;
  let handled = 0;
  const remaining: Outbox[] = [];

  for (const o of outbox) {
    if (handled >= MAX_POSTS_PER_TICK) {
      remaining.push(o);
      continue;
    }
    handled++;

    const alert: Alert = {
      at: new Date().toISOString(),
      kind: o.kind,
      name: o.name,
      url: o.url,
      problems: o.problems,
      posted: false,
    };
    if (o.kind === "recovered" && o.brokenSince) alert.downForMs = Date.now() - Date.parse(o.brokenSince);

    const state = o.kind === "mass-outage" ? null : await getSiteState(env, o.name);

    if (!enabled) {
      alert.reason = "posting disabled (no BOT_APP_PASSWORD)";
    } else if (o.kind === "recovered" && state?.quiet) {
      alert.reason = "part of a mass outage; recovery not posted";
      await putJson(env, SITE_PREFIX + o.name, { ...state, quiet: undefined, brokenSince: undefined });
    } else if (postedToday >= maxPerDay) {
      alert.reason = `daily post cap (${maxPerDay}) reached`;
    } else {
      try {
        let reply: { root: StrongRef; parent: StrongRef } | undefined;
        if (o.kind === "recovered" && state?.alertPostUri && state.alertPostCid) {
          reply = {
            root: { uri: state.alertRootUri || state.alertPostUri, cid: state.alertRootCid || state.alertPostCid },
            parent: { uri: state.alertPostUri, cid: state.alertPostCid },
          };
        } else if (o.kind === "broken") {
          reply = (await buildThread(env, o.name)) ?? undefined;
        }
        console.log(`posting ${o.kind} for ${o.name}${reply ? ` as a reply to ${reply.parent.uri}` : " top-level"}`);
        session ??= await login(env);
        const ref = await createPost(session, alertText(o), reply);
        alert.posted = true;
        alert.postUri = ref.uri;
        postedToday++;
        if (state) {
          if (o.kind === "broken") {
            state.alertPostUri = ref.uri;
            state.alertPostCid = ref.cid;
            state.alertRootUri = reply?.root.uri ?? ref.uri;
            state.alertRootCid = reply?.root.cid ?? ref.cid;
          } else {
            delete state.alertPostUri;
            delete state.alertPostCid;
            delete state.alertRootUri;
            delete state.alertRootCid;
            delete state.brokenSince;
          }
          await putJson(env, SITE_PREFIX + o.name, state);
        }
      } catch (err) {
        alert.reason = `post failed: ${String((err as Error)?.message || err)}`;
        console.error(alert.reason);
      }
    }
    await appendAlert(env, alert);
  }

  await env.RESULTS.put(dayKey, String(postedToday), { expirationTtl: 2 * 86400 });
  await putJson(env, OUTBOX_KEY, remaining);
}

// --- page --------------------------------------------------------------------

function page(r: Report | null, alerts: Alert[], enabled: boolean): string {
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

  const history = alerts.length
    ? alerts
        .slice(0, 30)
        .map(
          (a) => `<div class="row alert ${a.kind}">
        <time>${escapeHtml(a.at.slice(0, 16).replace("T", " "))}</time>
        <b>${escapeHtml(a.kind)}</b>
        <a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>
        <span>${escapeHtml(a.kind === "recovered" && a.downForMs ? `down ${humanDuration(a.downForMs)}` : a.problems.join(" · "))}</span>
        ${a.postUri ? `<a class="post" href="${escapeHtml(bskyUrl(a.postUri))}">posted</a>` : a.reason ? `<i>${escapeHtml(a.reason)}</i>` : ""}
      </div>`,
        )
        .join("\n")
    : `<p class="empty">nothing has broken since the log started.</p>`;

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
  .wrap { max-width:720px; margin:0 auto; padding:3.5rem 1.25rem 6rem; }
  h1 { font-size:1.6rem; margin:0 0 0.35rem; font-weight:600; }
  h2 { font-size:1rem; margin:2.5rem 0 0.5rem; font-weight:600; }
  .sub { color:var(--muted); font-size:0.86rem; margin:0 0 2rem; }
  .row { display:flex; gap:0.75rem; align-items:baseline; flex-wrap:wrap;
    padding:0.6rem 0; border-top:1px solid var(--faint); font-size:0.88rem; }
  .row:first-of-type { border-top:1px solid var(--ink); }
  .row a { color:var(--accent); text-decoration:none; font-weight:600; }
  .row span { color:var(--bad); }
  .row time { color:var(--muted); font-size:0.8rem; }
  .row i { color:var(--muted); font-size:0.8rem; }
  .row a.post { font-weight:400; font-size:0.8rem; }
  .row.recovered span, .row.recovered b { color:var(--good); }
  .row.broken b, .row.mass-outage b { color:var(--bad); }
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
      · posting ${enabled ? "on" : "off"}
    </p>
    ${rows}
    <h2>recent alerts</h2>
    ${history}
    <footer>
      runs on a cron, a slice at a time; a site that fails is re-checked on the
      next tick and only counts as broken after failing twice. new sites are
      checked first. an asset coming back as HTML means the site's Worker is
      stripping a mount prefix it shouldn't — the page renders, nothing works.
      · <a href="/report.json">report.json</a> · <a href="/alerts.json">alerts.json</a>
      · <a href="https://bisks.net/">bisks.net</a>
    </footer>
  </div>
</body>
</html>`;
}

function bskyUrl(atUri: string): string {
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : atUri;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// --- entry -------------------------------------------------------------------

async function tick(env: Env): Promise<void> {
  // Posting first: it spends the smaller, bounded part of the budget and the
  // queued alerts are already a tick old.
  await drainOutbox(env);
  await runChunk(env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Run a slice on demand. Handy for checking right after a deploy instead of
    // waiting for the next tick, and for walking the whole list quickly.
    if (url.pathname === "/run") {
      await tick(env);
      return json(await getJson<Report | null>(env, RESULT_KEY, null));
    }

    // Check one site right now, with full state handling — the box can call
    // this after a deploy for a real off-zone verdict instead of its own
    // root-only poll.
    if (url.pathname === "/check") {
      const name = url.searchParams.get("name");
      if (!name) return json({ error: "name required" }, 400);
      await runChunk(env, { only: [name] });
      const state = await getSiteState(env, name);
      return state ? json(state) : json({ error: "not on the gallery" }, 404);
    }

    if (url.pathname.startsWith("/site/")) {
      const name = url.pathname.slice("/site/".length).replace(/\.json$/, "");
      const state = await getSiteState(env, name);
      return state ? json(state) : json({ error: "unknown site" }, 404);
    }

    if (url.pathname === "/report.json") {
      return json((await getJson<Report | null>(env, RESULT_KEY, null)) ?? { problems: [] });
    }

    if (url.pathname === "/alerts.json") {
      return json({
        posting: postingEnabled(env),
        alerts: await getJson<Alert[]>(env, ALERTS_KEY, []),
      });
    }

    const report = await getJson<Report | null>(env, RESULT_KEY, null);
    const alerts = await getJson<Alert[]>(env, ALERTS_KEY, []);
    return new Response(page(report, alerts, postingEnabled(env)), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env));
  },
};
