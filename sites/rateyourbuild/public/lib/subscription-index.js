// subscription-index.js — user-owned net.bisks.rateyourbuild.subscription
// records: "notify me" toggles for a site's ratings or a
// genre/subgenre/super-genre's new releases. Subscriptions live in the
// rater's own PDS (user-owned persistence, per house style) — same
// overwrite-in-place shape as rating/vote/reply.
//
// There's no backend here (frontend-first; no Workers AI / Durable Objects /
// KV / cron per house rules), so delivery is honestly scoped to what a
// static site + Jetstream can actually do:
//   - any live rating or review on a subscribed site fires an alert while
//     this tab is open, via global-index.js's onLiveCommit hook (its own
//     Jetstream subscription — this module doesn't open a second socket).
//     Originally scoped to "new 1s" only; broadened 2026-08-29 after
//     @angussoftware.dev pointed out the bell's label promised "all new
//     ratings and reviews" while the code only fired on low scores;
//   - a new site release is detected by diffing the just-fetched
//     catalog.json against the last-seen set of names in localStorage, once
//     per page load.
//   - a "your bugged review got fixed" alert (added 2026-08-29, per
//     @angussoftware.dev) is detected by cross-referencing the rater's own
//     bugged=true ratings (read straight from their PDS, not the network-wide
//     index — a small, fast, own-repo read) against
//     public/data/bugfixes.json, a small manifest the bot appends to by hand
//     whenever a future run actually fixes a bug that was flagged this way
//     (see the standing order in sites/buildthis/builder/INSTRUCTIONS.md).
//     There's no way to prove *the* flagged bug was fixed rather than some
//     other change landing — this is an honest best-effort match on "a fix
//     was logged for this site after you flagged it," same spirit as the
//     rest of this module's caveats.
// Nothing pushes while the tab or browser is closed — that would need a
// server, which is exactly what this constellation avoids paying for.

const COLLECTION = "net.bisks.rateyourbuild.subscription";
const RATING_COLLECTION = "net.bisks.rateyourbuild.rating";
const CATALOG_SEEN_KEY = "rateyourbuild:catalog-seen:v1";
const MAX_ALERTS = 200; // local UI history only — a real localStorage/memory cap, not a network one

function rkeyFor(kind, target, genre) {
  if (kind === "subgenre") return `subgenre:${genre}:${target}`;
  return `${kind}:${target}`;
}

function alertsKey(did) {
  return `rateyourbuild:alerts:v1:${did}`;
}

function bugfixesSeenKey(did) {
  return `rateyourbuild:bugfixes-seen:v1:${did}`;
}

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export class SubscriptionAlerts {
  constructor({ dpopFetch, onUpdate } = {}) {
    this.dpopFetch = dpopFetch;
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.session = null;
    this.subs = new Map(); // rkey -> { kind, target, genre }
    this.buggedRatings = new Map(); // subject -> ratedAt (ms) for this rater's own bugged=true reviews
    this.alerts = [];
    this.loaded = false;
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("rateyourbuild subscription render failed", err);
    }
  }

  snapshot() {
    return {
      loaded: this.loaded,
      subscriptions: Array.from(this.subs.values()),
      alerts: this.alerts,
      unreadCount: this.alerts.filter((a) => !a.read).length,
      notifPermission: (typeof Notification !== "undefined" && Notification.permission) || "unsupported",
    };
  }

  isSubscribed(kind, target, genre = null) {
    return this.subs.has(rkeyFor(kind, target, genre));
  }

  // Called on sign-in/out. Subscriptions are PDS records and alerts are
  // scoped per-did in localStorage, so both are meaningless without a
  // session — this clears prior state before (re)loading.
  async setSession(session) {
    this.session = session;
    this.subs.clear();
    this.buggedRatings.clear();
    this.alerts = [];
    this.loaded = false;
    if (!session) {
      this.emit();
      return;
    }
    this.restoreAlerts();
    this.emit();
    try {
      await this.loadSubscriptions();
    } catch (err) {
      console.warn("rateyourbuild: couldn't load subscriptions", err);
    }
    try {
      await this.loadBuggedRatings();
    } catch (err) {
      console.warn("rateyourbuild: couldn't load own bugged ratings", err);
    }
    this.loaded = true;
    this.emit();
  }

  restoreAlerts() {
    try {
      const raw = localStorage.getItem(alertsKey(this.session.did));
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this.alerts = parsed.slice(0, MAX_ALERTS);
    } catch (_) {
      // A cache miss or a full/blocked localStorage is harmless.
    }
  }

  persistAlerts() {
    if (!this.session) return;
    try {
      localStorage.setItem(alertsKey(this.session.did), JSON.stringify(this.alerts.slice(0, MAX_ALERTS)));
    } catch (_) {
      // The in-memory alert list stays usable even if persisting fails.
    }
  }

  // No page cap: a rater's own subscription list is small and this walks
  // one account's own repo, not the network-wide "someone's whole history"
  // case the bulk-reads house rule is about.
  async loadSubscriptions() {
    const base = this.session.pdsUrl.replace(/\/$/, "");
    let cursor;
    for (;;) {
      const params = new URLSearchParams({ repo: this.session.did, collection: COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const rec of records) {
        const rkey = typeof rec?.uri === "string" ? rec.uri.split("/").pop() : "";
        const v = rec?.value;
        if (!rkey || !v || typeof v.kind !== "string" || typeof v.target !== "string") continue;
        this.subs.set(rkey, { kind: v.kind, target: v.target, genre: typeof v.genre === "string" ? v.genre : null });
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
  }

  // A rater's own bugged=true reviews, read straight from their PDS (a small
  // own-repo walk, not the network-wide index) so "did a fix land for one of
  // my bug reports" doesn't have to wait on global-index.js's backfill.
  async loadBuggedRatings() {
    const base = this.session.pdsUrl.replace(/\/$/, "");
    let cursor;
    for (;;) {
      const params = new URLSearchParams({ repo: this.session.did, collection: RATING_COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const rec of records) {
        const rkey = typeof rec?.uri === "string" ? rec.uri.split("/").pop() : "";
        const v = rec?.value;
        if (!rkey || !v || v.bugged !== true) continue;
        const subject = typeof v.subject === "string" && v.subject ? v.subject : rkey;
        this.buggedRatings.set(subject, Date.parse(v.ratedAt) || 0);
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
  }

  async subscribe(kind, target, genre = null) {
    if (!this.session) throw new Error("not signed in");
    const rkey = rkeyFor(kind, target, genre);
    const base = this.session.pdsUrl.replace(/\/$/, "");
    const record = { $type: COLLECTION, kind, target, createdAt: new Date().toISOString() };
    if (kind === "subgenre" && genre) record.genre = genre;
    const res = await this.dpopFetch(this.session, `${base}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: this.session.did, collection: COLLECTION, rkey, record }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    this.subs.set(rkey, { kind, target, genre: genre || null });
    this.requestNotificationPermission();
    this.emit();
  }

  async unsubscribe(kind, target, genre = null) {
    if (!this.session) throw new Error("not signed in");
    const rkey = rkeyFor(kind, target, genre);
    const base = this.session.pdsUrl.replace(/\/$/, "");
    const res = await this.dpopFetch(this.session, `${base}/xrpc/com.atproto.repo.deleteRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: this.session.did, collection: COLLECTION, rkey }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    this.subs.delete(rkey);
    this.emit();
  }

  requestNotificationPermission() {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    Notification.requestPermission().then(() => this.emit());
  }

  pushAlert({ message, href }) {
    const alert = { id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, message, href: href || null, at: Date.now(), read: false };
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, MAX_ALERTS);
    this.persistAlerts();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const n = new Notification("rateyourbuild", { body: message, tag: alert.id });
        if (href) n.onclick = () => { window.focus(); location.href = href; };
      } catch (_) {
        // Some browsers throw constructing Notification outside a user gesture
        // in certain contexts — the in-app alert list above already has it.
      }
    }
    this.emit();
  }

  markAllRead() {
    let changed = false;
    for (const a of this.alerts) {
      if (!a.read) {
        a.read = true;
        changed = true;
      }
    }
    if (changed) {
      this.persistAlerts();
      this.emit();
    }
  }

  // Hooked into global-index.js's onLiveCommit — a rating that arrives over
  // Jetstream after this tab is already open, not backfilled history (which
  // shouldn't retroactively alert anyone about ratings from before they
  // subscribed). Skips your own ratings; fires on every new rating/review on
  // a subscribed site, not just low scores.
  handleLiveRating({ did, subject, score, text }) {
    if (!this.loaded || !this.session || did === this.session.did) return;
    if (typeof score !== "number") return;
    if (!this.isSubscribed("site", subject)) return;
    const hasReview = typeof text === "string" && text.trim().length > 0;
    this.pushAlert({
      message: hasReview
        ? `a new ${score}/10 review just landed on "${subject}"`
        : `a new ${score}/10 rating just landed on "${subject}"`,
      href: `/site/${encodeURIComponent(subject)}`,
    });
  }

  // Diffs the freshly-fetched catalog against the last-seen set of site
  // names (kept globally, not per-account — the catalog itself is public)
  // and alerts on any newly-released site matching a subscribed genre,
  // subgenre, or super-genre. Runs once per page load: a static build-time
  // catalog has no live update stream the way ratings do.
  checkNewReleases(catalog, genresByKey, supersByKey) {
    let known;
    try {
      known = new Set(JSON.parse(localStorage.getItem(CATALOG_SEEN_KEY) || "[]"));
    } catch (_) {
      known = new Set();
    }
    const firstRun = known.size === 0;
    const names = catalog.map((s) => s.name);

    if (!firstRun && this.loaded && this.session) {
      for (const site of catalog) {
        if (known.has(site.name)) continue;
        const meta = genresByKey[site.genre];
        const superKey = meta ? meta.super : null;

        if (this.isSubscribed("genre", site.genre)) {
          this.pushAlert({
            message: `"${site.title}" just landed in the ${site.genre} genre`,
            href: `/site/${encodeURIComponent(site.name)}`,
          });
        }
        if (site.subgenre && this.isSubscribed("subgenre", site.subgenre, site.genre)) {
          this.pushAlert({
            message: `"${site.title}" just landed in ${site.subgenre} (${site.genre})`,
            href: `/site/${encodeURIComponent(site.name)}`,
          });
        }
        if (superKey && this.isSubscribed("super", superKey)) {
          const supMeta = supersByKey[superKey];
          this.pushAlert({
            message: `"${site.title}" just landed in ${supMeta ? supMeta.label : superKey}`,
            href: `/site/${encodeURIComponent(site.name)}`,
          });
        }
      }
    }

    try {
      localStorage.setItem(CATALOG_SEEN_KEY, JSON.stringify(names));
    } catch (_) {
      // Losing this cache just means the next visit re-treats the current
      // catalog as the baseline instead of alerting on the real diff.
    }
  }

  // "if I leave review as bugged, then you see that and later fix it, I
  // want to always receive a notification" (@angussoftware.dev, 2026-08-29).
  // bugfixes is public/data/bugfixes.json — a small manifest the bot appends
  // to by hand whenever a future run fixes a bug that was flagged this way.
  // For each of this rater's own bugged reviews, alert once if a fix was
  // logged for that site after the review was written. Runs once per page
  // load, same shape as checkNewReleases; dedupes per (subject, fixedAt) in
  // localStorage so a fix already seen doesn't re-alert on every visit.
  checkBugFixes(bugfixes) {
    if (!this.loaded || !this.session || !Array.isArray(bugfixes) || !bugfixes.length) return;
    let seen;
    try {
      seen = new Set(JSON.parse(localStorage.getItem(bugfixesSeenKey(this.session.did)) || "[]"));
    } catch (_) {
      seen = new Set();
    }
    let changed = false;
    for (const fix of bugfixes) {
      const subject = typeof fix?.subject === "string" ? fix.subject : "";
      const fixedAt = Date.parse(fix?.fixedAt);
      if (!subject || !Number.isFinite(fixedAt)) continue;
      const ratedAt = this.buggedRatings.get(subject);
      if (ratedAt === undefined || fixedAt <= ratedAt) continue;
      const seenKey = `${subject}:${fix.fixedAt}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      changed = true;
      this.pushAlert({
        message: fix.note
          ? `the bug you flagged on "${subject}" looks fixed: ${fix.note}`
          : `the bug you flagged on "${subject}" looks fixed — worth another look`,
        href: `/site/${encodeURIComponent(subject)}`,
      });
    }
    if (changed) {
      try {
        localStorage.setItem(bugfixesSeenKey(this.session.did), JSON.stringify(Array.from(seen)));
      } catch (_) {
        // Losing this cache just means an already-seen fix might alert again
        // on a future visit — noisy, not harmful.
      }
    }
  }
}
