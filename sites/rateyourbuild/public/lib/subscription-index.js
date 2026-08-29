// subscription-index.js — user-owned net.bisks.rateyourbuild.subscription
// records: "notify me" toggles for a site's ratings or a
// genre/subgenre/super-genre's new releases. Subscriptions live in the
// rater's own PDS (user-owned persistence, per house style) — same
// overwrite-in-place shape as rating/vote/reply.
//
// There's no backend here (frontend-first; no Workers AI / Durable Objects /
// KV / cron per house rules), so delivery is honestly scoped to what a
// static site + Jetstream (plus the full-history backfill global-index.js
// and engagement-index.js already do) can actually do:
//   - any rating or review on a subscribed site alerts you: live, while this
//     tab is open, via global-index.js's onLiveCommit hook (its own
//     Jetstream subscription — this module doesn't open a second socket);
//     AND caught up from history the next time you open the tab, via
//     checkMissedRatings() below scanning the same index's backfilled
//     entries against each site subscription's own createdAt. Before
//     2026-08-29 only the live half existed, so a review posted while you
//     weren't watching the tab silently never alerted you — @angussoftware.dev
//     hit exactly that (a review from @rob.bisks.net on a site they were
//     subscribed to never surfaced). Originally scoped to "new 1s" only;
//     broadened 2026-08-29 (same day) after @angussoftware.dev pointed out
//     the bell's label promised "all new ratings and reviews" while the code
//     only fired on low scores;
//   - a new site release is detected by diffing the just-fetched
//     catalog.json against the last-seen set of names in localStorage, once
//     per page load.
//   - a "replies" subscription (kind: "replies", target: "self", added
//     2026-08-29 per @angussoftware.dev) is a standing checkbox rather than
//     a per-thing toggle: while it's on, any reply that lands on one of
//     this rater's own reviews or nested comments alerts you, live via
//     engagement-index.js's onLiveReply hook (its own Jetstream
//     subscription on net.bisks.rateyourbuild.reply — this module doesn't
//     open a second socket for it either) AND caught up from history via
//     checkMissedReplies() below, same shape and same-day fix as ratings.
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
// Nothing pushes while the tab or browser is fully closed — that would need
// a server, which is exactly what this constellation avoids paying for. But
// as of 2026-08-29 you no longer have to have been staring at the tab at the
// exact moment something happened — opening it later catches you up on
// anything since you subscribed, same as the site's history backfill already
// does for everything else.

const COLLECTION = "net.bisks.rateyourbuild.subscription";
const RATING_COLLECTION = "net.bisks.rateyourbuild.rating";
const CATALOG_SEEN_KEY = "rateyourbuild:catalog-seen:v1";
const MAX_ALERTS = 200; // local UI history only — a real localStorage/memory cap, not a network one
const MAX_SEEN_KEYS = 2000; // local dedupe bookkeeping only — a real localStorage cap, not a network one

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

function ratingAlertsSeenKey(did) {
  return `rateyourbuild:rating-alerts-seen:v1:${did}`;
}

function replyAlertsSeenKey(did) {
  return `rateyourbuild:reply-alerts-seen:v1:${did}`;
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
    this.subs = new Map(); // rkey -> { kind, target, genre, createdAt (ms) }
    this.buggedRatings = new Map(); // subject -> ratedAt (ms) for this rater's own bugged=true reviews
    this.alerts = [];
    // Dedupes "missed" (backfilled) alerts against ones already fired live,
    // so reopening the tab doesn't re-alert on something the live handler
    // already surfaced a moment earlier — see checkMissedRatings/Replies.
    this.ratingAlertsSeen = new Set(); // `${did}::${subject}::${ratedAt}`
    this.replyAlertsSeen = new Set(); // `${did}::${rkey}`
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
    this.ratingAlertsSeen = new Set();
    this.replyAlertsSeen = new Set();
    this.loaded = false;
    if (!session) {
      this.emit();
      return;
    }
    this.restoreAlerts();
    this.restoreSeenSets();
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

  restoreSeenSets() {
    try {
      const raw = localStorage.getItem(ratingAlertsSeenKey(this.session.did));
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this.ratingAlertsSeen = new Set(parsed);
    } catch (_) {
      // A cache miss or a full/blocked localStorage is harmless.
    }
    try {
      const raw = localStorage.getItem(replyAlertsSeenKey(this.session.did));
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this.replyAlertsSeen = new Set(parsed);
    } catch (_) {
      // A cache miss or a full/blocked localStorage is harmless.
    }
  }

  persistRatingAlertsSeen() {
    if (!this.session) return;
    try {
      const list = Array.from(this.ratingAlertsSeen);
      localStorage.setItem(ratingAlertsSeenKey(this.session.did), JSON.stringify(list.slice(-MAX_SEEN_KEYS)));
    } catch (_) {
      // Losing this cache just risks a re-alert on an already-seen rating —
      // noisy, not harmful.
    }
  }

  persistReplyAlertsSeen() {
    if (!this.session) return;
    try {
      const list = Array.from(this.replyAlertsSeen);
      localStorage.setItem(replyAlertsSeenKey(this.session.did), JSON.stringify(list.slice(-MAX_SEEN_KEYS)));
    } catch (_) {
      // Losing this cache just risks a re-alert on an already-seen reply —
      // noisy, not harmful.
    }
  }

  // Marks a (did, subject, ratedAt) rating as already alerted-on. Returns
  // false if it was already marked, so callers can skip re-alerting —
  // shared by the live handler and the missed-history scan so the same
  // rating never fires twice regardless of which path saw it first.
  markRatingAlertSeen(did, subject, ratedAt) {
    const key = `${did}::${subject}::${ratedAt}`;
    if (this.ratingAlertsSeen.has(key)) return false;
    this.ratingAlertsSeen.add(key);
    this.persistRatingAlertsSeen();
    return true;
  }

  // Same idea for a specific reply record (rkeys are unique per reply, so
  // did+rkey alone is enough — no need for a timestamp in the key).
  markReplyAlertSeen(did, rkey) {
    const key = `${did}::${rkey}`;
    if (this.replyAlertsSeen.has(key)) return false;
    this.replyAlertsSeen.add(key);
    this.persistReplyAlertsSeen();
    return true;
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
        this.subs.set(rkey, {
          kind: v.kind,
          target: v.target,
          genre: typeof v.genre === "string" ? v.genre : null,
          createdAt: Date.parse(v.createdAt) || 0,
        });
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
    const createdAtIso = new Date().toISOString();
    const record = { $type: COLLECTION, kind, target, createdAt: createdAtIso };
    if (kind === "subgenre" && genre) record.genre = genre;
    const res = await this.dpopFetch(this.session, `${base}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: this.session.did, collection: COLLECTION, rkey, record }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    this.subs.set(rkey, { kind, target, genre: genre || null, createdAt: Date.parse(createdAtIso) || Date.now() });
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
  handleLiveRating({ did, subject, score, text, ratedAt }) {
    if (!this.loaded || !this.session || did === this.session.did) return;
    if (typeof score !== "number") return;
    if (!this.isSubscribed("site", subject)) return;
    if (typeof ratedAt === "number" && ratedAt && !this.markRatingAlertSeen(did, subject, ratedAt)) return;
    const hasReview = typeof text === "string" && text.trim().length > 0;
    this.pushAlert({
      message: hasReview
        ? `a new ${score}/10 review just landed on "${subject}"`
        : `a new ${score}/10 rating just landed on "${subject}"`,
      href: `/site/${encodeURIComponent(subject)}`,
    });
  }

  // Catches up on ratings the live handler above missed because the tab
  // wasn't open when they landed — same data global-index.js's history
  // backfill already pulled in, just not previously cross-referenced against
  // subscriptions. Safe to call repeatedly (e.g. on every index snapshot
  // rebuild while backfill is still running): markRatingAlertSeen skips
  // anything already alerted, whether that happened just now via the live
  // handler or on a previous call here. Only alerts on ratings that landed
  // after the subscription's own createdAt, so subscribing to a site doesn't
  // dump its entire rating history on you as "new."
  checkMissedRatings(entries) {
    if (!this.loaded || !this.session || !Array.isArray(entries) || !entries.length) return;
    const siteSubs = new Map(); // target -> createdAt (ms)
    for (const sub of this.subs.values()) {
      if (sub.kind === "site" && sub.createdAt) siteSubs.set(sub.target, sub.createdAt);
    }
    if (!siteSubs.size) return;
    for (const entry of entries) {
      if (!entry || entry.did === this.session.did) continue;
      const subscribedAt = siteSubs.get(entry.subject);
      if (!subscribedAt || !entry.ratedAt || entry.ratedAt <= subscribedAt) continue;
      if (!this.markRatingAlertSeen(entry.did, entry.subject, entry.ratedAt)) continue;
      const hasReview = typeof entry.text === "string" && entry.text.trim().length > 0;
      this.pushAlert({
        message: hasReview
          ? `a new ${entry.score}/10 review just landed on "${entry.subject}"`
          : `a new ${entry.score}/10 rating just landed on "${entry.subject}"`,
        href: `/site/${encodeURIComponent(entry.subject)}`,
      });
    }
  }

  // Hooked into engagement-index.js's onLiveReply — fires on any reply
  // (top-level on a review, or nested reply-to-a-reply, same record shape
  // either way per the reply lexicon) that targets this rater directly, i.e.
  // engagement-index.js's derived `targetDid` (the parentKey's author, or
  // the review's own author for a top-level reply — NOT the reply record's
  // `reviewer` field, which is always the thread's root author, not who a
  // given message is addressed to) is their own did. Gated on the "replies"
  // subscription (kind: "replies", target: "self" — there's only one thing
  // to watch) rather than firing unconditionally, same opt-in shape as every
  // other subscription kind here.
  handleLiveReply({ did, subject, targetDid, text, rkey }) {
    if (!this.loaded || !this.session || did === this.session.did) return;
    if (targetDid !== this.session.did) return;
    if (!this.isSubscribed("replies", "self")) return;
    if (typeof rkey === "string" && rkey && !this.markReplyAlertSeen(did, rkey)) return;
    const preview = typeof text === "string" && text.length > 100 ? `${text.slice(0, 100)}…` : text;
    this.pushAlert({
      message: `someone replied to you on "${subject}": ${preview}`,
      href: `/site/${encodeURIComponent(subject)}`,
    });
  }

  // Same catch-up idea as checkMissedRatings, for replies: engagement-index.js's
  // backfill already pulls in every reply record, this just cross-references
  // it against the standing "replies" subscription. repliesByReview is that
  // index's own grouping (reviewKey -> [reply, ...]); only alerts on replies
  // addressed to this rater (own review or own nested comment) that landed
  // after the subscription's createdAt.
  checkMissedReplies(repliesByReview) {
    if (!this.loaded || !this.session || !(repliesByReview instanceof Map)) return;
    if (!this.isSubscribed("replies", "self")) return;
    const sub = this.subs.get(rkeyFor("replies", "self"));
    if (!sub || !sub.createdAt) return;
    for (const list of repliesByReview.values()) {
      for (const reply of list) {
        if (!reply || reply.did === this.session.did) continue;
        const targetDid = reply.parentKey ? reply.parentKey.split("::")[0] : reply.reviewer;
        if (targetDid !== this.session.did) continue;
        if (!reply.createdAt || reply.createdAt <= sub.createdAt) continue;
        if (!this.markReplyAlertSeen(reply.did, reply.rkey)) continue;
        const preview = typeof reply.text === "string" && reply.text.length > 100 ? `${reply.text.slice(0, 100)}…` : reply.text;
        this.pushAlert({
          message: `someone replied to you on "${reply.subject}": ${preview}`,
          href: `/site/${encodeURIComponent(reply.subject)}`,
        });
      }
    }
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
