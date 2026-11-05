// index.js — network-wide view of every net.bisks.vulnvote.vote and .vouch
// record: com.atproto.sync.listReposByCollection finds the repos, each repo's
// own PDS listRecords backfills them (walked to exhaustion), and a Jetstream
// socket keeps it live. Adapted from sites/rateyourbuild/public/lib/global-index.js.
// Account creation dates (for voter weight) come from the plc directory audit
// log and are cached in localStorage.

import { normaliseId, validId } from "./logic.js";

export const VOTE = "net.bisks.vulnvote.vote";
export const VOUCH = "net.bisks.vulnvote.vouch";
const JETSTREAM = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${VOTE}&wantedCollections=${VOUCH}`;
const RELAY = "https://bsky.network";
const PLC = "https://plc.directory";
const AGE_CACHE = "vulnvote:ages:v1";
// Repos backfilled in parallel — a politeness limit on PDS hosts, not a data cap.
const PARALLEL = 6;

async function json(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function pdsOf(did) {
  let doc = null;
  if (did.startsWith("did:plc:")) doc = await json(`${PLC}/${did}`);
  else if (did.startsWith("did:web:")) doc = await json(`https://${did.slice(8).replace(/:/g, "/")}/.well-known/did.json`);
  const s = (doc?.service || []).find((x) => x.id === "#atproto_pds" || x.type === "AtprotoPersonalDataServer");
  return typeof s?.serviceEndpoint === "string" ? s.serviceEndpoint.replace(/\/$/, "") : null;
}

function normaliseVote(did, rkey, r) {
  if (!r || typeof r !== "object") return null;
  const subject = normaliseId(r.subject);
  if (!validId(subject)) return null;
  const dir = r.dir === 1 ? 1 : r.dir === -1 ? -1 : 0;
  if (!dir) return null;
  const sev = Number(r.severity);
  const aliases = (Array.isArray(r.aliases) ? r.aliases : []).map(normaliseId).filter(validId).slice(0, 20);
  return {
    did, rkey, subject, aliases, dir,
    severity: r.severity != null && Number.isInteger(sev) && sev >= 0 && sev <= 10 ? sev : null,
    title: typeof r.title === "string" ? r.title.slice(0, 200) : "",
    official: typeof r.official === "string" ? r.official.slice(0, 20) : "",
    at: Date.parse(r.createdAt) || 0,
  };
}

export class VoteIndex {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.votes = new Map();
    this.vouches = new Map();
    this.ages = new Map();
    this.backfilled = false;
    this.live = false;
    this.error = "";
    this.timer = null;
    try {
      for (const [d, t] of Object.entries(JSON.parse(localStorage.getItem(AGE_CACHE) || "{}"))) this.ages.set(d, t);
    } catch (_) {}
  }

  start() {
    this.connect();
    this.backfill();
  }

  emit() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onUpdate();
    }, 120);
  }

  votesList() { return [...this.votes.values()]; }
  vouchList() { return [...this.vouches.values()]; }
  ownVote(did, subject) { return this.votesList().find((v) => v.did === did && (v.subject === subject || v.aliases.includes(subject))) || null; }

  apply(coll, did, rkey, record, del) {
    const key = `${did}::${rkey}`;
    if (coll === VOTE) {
      const v = del ? null : normaliseVote(did, rkey, record);
      if (v) this.votes.set(key, v); else this.votes.delete(key);
    } else if (coll === VOUCH) {
      const to = del ? null : record?.subject;
      if (typeof to === "string" && to.startsWith("did:") && to !== did) this.vouches.set(key, { from: did, to });
      else this.vouches.delete(key);
    }
    this.emit();
  }

  applyOwn(coll, did, rkey, record) { this.apply(coll, did, rkey, record, false); }
  removeOwn(coll, did, rkey) { this.apply(coll, did, rkey, null, true); }

  connect() {
    let ws;
    try { ws = new WebSocket(JETSTREAM); } catch (_) { return; }
    ws.onopen = () => { this.live = true; this.delay = 1000; this.emit(); };
    ws.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch (_) { return; }
      const c = ev.commit;
      if (ev.kind !== "commit" || !c || (c.collection !== VOTE && c.collection !== VOUCH)) return;
      this.apply(c.collection, ev.did, c.rkey, c.record, c.operation === "delete");
      this.resolveAges([ev.did]);
    };
    ws.onclose = () => {
      this.live = false;
      this.emit();
      this.delay = Math.min((this.delay || 1000) * 2, 30000);
      setTimeout(() => this.connect(), this.delay);
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }

  async backfill() {
    try {
      const dids = new Set();
      for (const coll of [VOTE, VOUCH]) {
        let cursor;
        do {
          const p = new URLSearchParams({ collection: coll, limit: "1000" });
          if (cursor) p.set("cursor", cursor);
          const d = await json(`${RELAY}/xrpc/com.atproto.sync.listReposByCollection?${p}`);
          for (const r of d.repos || []) dids.add(r.did);
          cursor = d.cursor;
          if (!(d.repos || []).length) break;
        } while (cursor);
      }
      const queue = [...dids];
      await Promise.all(Array.from({ length: PARALLEL }, async () => {
        for (let did; (did = queue.shift()); ) {
          try { await this.backfillDid(did); } catch (_) { /* one broken PDS shouldn't stall the rest */ }
        }
      }));
      this.backfilled = true;
      this.emit();
      await this.resolveAges([...dids]);
    } catch (err) {
      this.error = "history backfill failed — showing live votes only";
      console.warn("vulnvote backfill", err);
      this.emit();
    }
  }

  async backfillDid(did) {
    const pds = await pdsOf(did);
    if (!pds) return;
    for (const coll of [VOTE, VOUCH]) {
      let cursor;
      do {
        const p = new URLSearchParams({ repo: did, collection: coll, limit: "100" });
        if (cursor) p.set("cursor", cursor);
        const d = await json(`${pds}/xrpc/com.atproto.repo.listRecords?${p}`);
        for (const rec of d.records || []) this.apply(coll, did, rec.uri.split("/").pop(), rec.value, false);
        cursor = (d.records || []).length ? d.cursor : undefined;
      } while (cursor);
    }
  }

  async resolveAges(dids) {
    const todo = dids.filter((d) => !this.ages.has(d) && d.startsWith("did:plc:"));
    let changed = false;
    const queue = [...new Set(todo)];
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      for (let did; (did = queue.shift()); ) {
        try {
          const log = await json(`${PLC}/${did}/log/audit`);
          const t = Date.parse(log?.[0]?.createdAt);
          if (t) { this.ages.set(did, t); changed = true; }
        } catch (_) { /* unknown age scores neutral */ }
      }
    }));
    if (changed) {
      try { localStorage.setItem(AGE_CACHE, JSON.stringify(Object.fromEntries(this.ages))); } catch (_) {}
      this.emit();
    }
  }
}
