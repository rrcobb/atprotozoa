// bsky38-backfill.js — true network-wide history for the real bsky38.com
// ballot tally. bsky38-vote-client.js's live Jetstream subscription only ever
// sees votes cast after a visitor's short backfill window; this walks every
// repo that has ever written a com.bsky38.influential.vote record and folds
// its full history in. Copied from sites/influential25/public/lib/global-backfill.js
// (copy, don't abstract — see notes/40-new-site-playbook.md), retargeted at
// bsky38.com's own collection instead of an atprotozoa one.
//
// Two-step discovery (see notes/ideas/pds-and-lexicons.md, "Tier 3: use
// listReposByCollection"):
//   1. com.atproto.sync.listReposByCollection finds every repo (DID) that
//      holds at least one vote record.
//   2. For each repo, com.atproto.sync.getRepo downloads the WHOLE repo as
//      one CAR (car.js) instead of a paginated listRecords cursor loop per
//      repo — per the 2026-08-25 standing order in
//      sites/buildthis/builder/INSTRUCTIONS.md ("prefer bulk reads over
//      paginated cursor walks").
//
// Progress persists via bsky38-store.js's meta store so a repeat visit
// resumes instead of re-downloading every repo's CAR from scratch.

import { fetchRepoRecordsWithKeys } from "./car.js";
import * as store from "./bsky38-store.js";

const COLLECTION = "com.bsky38.influential.vote";
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const STATE_KEY = "backfillState";
const REPOS_PER_PAGE = 100;
const REPO_PAGES_PER_STEP = 2;
const DIDS_PER_STEP = 3; // CAR downloads are heavier than a listRecords page; keep steps small
const STEP_DELAY_MS = 400;

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    return res.ok ? res.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.slice("did:web:".length).replace(/:/g, "/");
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    return res.ok ? res.json() : null;
  }
  return null;
}

async function resolvePds(did) {
  try {
    const doc = await didDoc(did);
    const service = (doc?.service || []).find(
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer",
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

// The real ballot's record shape is { subject: <did>, createdAt } (see
// lexicons/com.bsky38.influential.vote.json) — "subject" not slate38's own
// "target", since this is bsky38.com's collection, not ours.
function fromVoteRecord(did, rkey, r) {
  if (!r || typeof r.subject !== "string") return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${did}/${COLLECTION}/${rkey}`,
    voterDid: did,
    targetDid: r.subject,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

export class GlobalBackfill {
  constructor({ onVote, onProgress } = {}) {
    this.onVote = typeof onVote === "function" ? onVote : () => {};
    this.onProgress = typeof onProgress === "function" ? onProgress : () => {};
    this.queue = [];
    this.queued = new Set();
    this.done = new Set();
    this.cursor = undefined;
    this.reposExhausted = false;
    this.finished = false;
    this.running = false;
    this.totalReposSeen = 0;
    this.started = false;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      const raw = await store.getMeta(STATE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved) {
        this.cursor = saved.cursor;
        this.reposExhausted = !!saved.reposExhausted;
        this.done = new Set(Array.isArray(saved.done) ? saved.done : []);
        this.queue = (Array.isArray(saved.queue) ? saved.queue : []).filter((d) => !this.done.has(d));
        this.queued = new Set(this.queue);
        this.totalReposSeen = this.done.size + this.queue.length;
        this.finished = this.reposExhausted && !this.queue.length;
      }
    } catch (_) {
      // A corrupt saved state just restarts the backfill from scratch.
    }
    this.onProgress(this.status());
    this.loop();
  }

  status() {
    return {
      done: this.finished,
      scannedRepos: this.done.size,
      totalReposSeen: Math.max(this.totalReposSeen, this.done.size),
    };
  }

  async persist() {
    try {
      await store.setMeta(
        STATE_KEY,
        JSON.stringify({
          cursor: this.cursor,
          reposExhausted: this.reposExhausted,
          done: Array.from(this.done),
          queue: this.queue,
        }),
      );
    } catch (_) {
      // Best-effort — a lost checkpoint just means a slower resume next time, not lost votes.
    }
  }

  async loop() {
    if (this.running || this.finished) return;
    this.running = true;
    try {
      while (!this.finished) {
        let processed = 0;
        while (this.queue.length && processed < DIDS_PER_STEP) {
          const did = this.queue.shift();
          this.queued.delete(did);
          processed++;
          try {
            await this.backfillDid(did);
          } catch (_) {
            // A broken PDS or oversized repo shouldn't stall the rest of the backfill.
          }
          this.done.add(did);
        }
        if (processed) this.onProgress(this.status());

        if (!this.queue.length && !this.reposExhausted) {
          for (let page = 0; page < REPO_PAGES_PER_STEP; page++) {
            const params = new URLSearchParams({ collection: COLLECTION, limit: String(REPOS_PER_PAGE) });
            if (this.cursor) params.set("cursor", this.cursor);
            const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
            const repos = Array.isArray(data.repos) ? data.repos : [];
            for (const repo of repos) {
              const did = repo?.did;
              if (typeof did === "string" && !this.queued.has(did) && !this.done.has(did)) {
                this.queued.add(did);
                this.queue.push(did);
                this.totalReposSeen++;
              }
            }
            this.cursor = typeof data.cursor === "string" ? data.cursor : undefined;
            if (!this.cursor || !repos.length) {
              this.reposExhausted = true;
              break;
            }
          }
        }

        await this.persist();
        if (this.reposExhausted && !this.queue.length) {
          this.finished = true;
          this.onProgress(this.status());
          break;
        }
        await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      }
    } finally {
      this.running = false;
    }
  }

  async backfillDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return;
    const { records } = await fetchRepoRecordsWithKeys(pds, did, COLLECTION);
    for (const { uri, value } of records) {
      const rkey = uri.split("/").pop();
      const vote = fromVoteRecord(did, rkey, value);
      if (vote) this.onVote(vote);
    }
  }
}
