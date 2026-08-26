// global-backfill.js — true network-wide history for socialcredit's
// leaderboard. sc-client.js's live Jetstream subscription only ever sees
// votes cast after a visitor's short backfill window, which is why the
// board used to describe itself as "honestly incomplete" (see the
// 2026-08-15 note in ../../wrangler.toml). This walks every repo that has
// ever written a net.bisks.socialcredit.vote record and folds its full
// history in, so a fresh visitor's board stops depending on how long
// they've had the page open.
//
// Two-step discovery, same shape as
// sites/steamtags/public/lib/global-index.js (the reference implementation
// for this pattern — see notes/ideas/pds-and-lexicons.md, "Tier 3: use
// listReposByCollection"), but Step 2 differs from steamtags on purpose:
//   1. com.atproto.sync.listReposByCollection finds every repo (DID) that
//      holds at least one vote record — a paginated walk over *repos*,
//      which has no bulk alternative.
//   2. For each repo, com.atproto.sync.getRepo downloads the WHOLE repo as
//      one CAR and a local MST walk (car.js) pulls every vote record out in
//      one request, instead of a paginated com.atproto.repo.listRecords
//      cursor loop per repo — per the 2026-08-25 standing order in
//      sites/buildthis/builder/INSTRUCTIONS.md ("prefer bulk reads over
//      paginated cursor walks"). A voter with thousands of historical votes
//      still costs exactly one request.
//
// Only explicit net.bisks.socialcredit.vote records are recoverable this
// way — a historical "socialcredit +1" reply post isn't in this collection,
// so replies before a visitor's own live session are still invisible. That's
// a real, disclosed gap, not a bug: recovering those would mean scanning
// every voter's entire post history instead of one bounded collection.
//
// Progress persists via sc-store.js's meta store so a repeat visit resumes
// instead of re-downloading every repo's CAR from scratch.

import { fetchRepoRecordsWithKeys } from "./car.js";
import * as store from "./sc-store.js";

const COLLECTION = "net.bisks.socialcredit.vote";
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

function fromVoteRecord(did, rkey, r) {
  if (!r || typeof r.target !== "string" || Math.abs(r.delta) !== 1) return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    uri: `at://${did}/${COLLECTION}/${rkey}`,
    voterDid: did,
    targetDid: r.target,
    delta: r.delta,
    reason: typeof r.reason === "string" ? r.reason.slice(0, 280) : "",
    postUrl: typeof r.postUrl === "string" ? r.postUrl : "",
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    source: "backfill",
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
