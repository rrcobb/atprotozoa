// corpus.js — build the training corpus: every top-level post of every moot of
// one account, each with its like count.
//
//   moots   = (accounts you follow, read from your own repo CAR)
//           ∩ (accounts that follow you, from Constellation, AppView fallback)
//   posts   = one com.atproto.sync.getRepo CAR per moot — their whole history,
//             no page cap
//   likes   = app.bsky.feed.getPosts, 25 uris a call (repos don't store counts)
//
// Likes are the slow part, so labelling picks randomly from the pool of posts
// still waiting: stopping early leaves a random sample across all moots, not
// "the first few moots' posts".

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { followerDids } from "./microcosm.js";

const PUB = "https://public.api.bsky.app/xrpc";
const CAR_WORKERS = 3; // concurrent repo downloads — browser memory/bandwidth, each CAR can be tens of MB
const LABEL_WORKERS = 5; // concurrent getPosts calls — polite to the public AppView's rate limit
const PAGE_BACKSTOP = 400; // getFollows/getFollowers pages: unreachable runaway guard (100/page = 40,000 accounts)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 2 * (attempt + 1);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0].split("/").pop()}`);
    return res.json();
  }
  throw new Error("rate limited");
}

export function cleanHandle(raw) {
  let h = String(raw || "").trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h.trim();
}

export async function resolveActor(raw) {
  const h = cleanHandle(raw);
  if (!h) throw new Error("type a handle first");
  const prof = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(h)}`);
  return { did: prof.did, handle: prof.handle, displayName: prof.displayName || "" };
}

async function walkGraph(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < PAGE_BACKSTOP; p++) {
    const d = await jget(`${PUB}/${endpoint}?actor=${encodeURIComponent(did)}&limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    for (const it of d[key] || []) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

export async function findMoots(did, onStatus = () => {}) {
  onStatus("reading who you follow…");
  let follows;
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.graph.follow");
    follows = records.map((r) => r.value && r.value.subject).filter(Boolean);
  } catch {
    follows = await walkGraph("app.bsky.graph.getFollows", "follows", did);
  }
  onStatus(`you follow ${follows.length.toLocaleString()} — reading who follows you…`);
  let followers;
  try {
    followers = await followerDids(did);
  } catch {
    followers = await walkGraph("app.bsky.graph.getFollowers", "followers", did);
  }
  const fs = new Set(followers);
  const moots = [...new Set(follows)].filter((d) => fs.has(d));
  onStatus(`${moots.length.toLocaleString()} moots`);
  return moots;
}

// Streams posts into `corpus.posts` ({ uri, text, likes, a }). Resolves when
// every moot is read and labelled, or when ctl.stop is set. onTick() fires as
// counts change.
export async function buildCorpus(moots, corpus, ctl, onTick = () => {}) {
  const pool = []; // posts without a like count yet
  let carsDone = false;
  let nextMoot = 0;
  Object.assign(corpus, { moots: moots.length, readMoots: 0, failedMoots: 0, found: 0, labelled: corpus.posts.length });
  const have = new Set(corpus.posts.map((p) => p.uri));

  async function carWorker() {
    while (!ctl.stop && nextMoot < moots.length) {
      const did = moots[nextMoot++];
      try {
        const pds = await resolvePds(did);
        if (!pds) throw new Error("no PDS");
        const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post");
        for (const r of records) {
          const v = r.value;
          // Top-level posts only: a reply's likes depend on the thread it sits in, which says nothing about the text on its own.
          if (!v || v.reply || typeof v.text !== "string" || !v.text.trim() || have.has(r.uri)) continue;
          pool.push({ uri: r.uri, text: v.text, a: did });
          corpus.found++;
        }
      } catch {
        corpus.failedMoots++;
      }
      corpus.readMoots++;
      onTick();
    }
  }

  async function labelWorker() {
    for (;;) {
      if (ctl.stop) return;
      if (!pool.length) {
        if (carsDone) return;
        await sleep(150);
        continue;
      }
      const batch = [];
      while (batch.length < 25 && pool.length) {
        // random pick: swap-remove from the pool
        const i = Math.floor(Math.random() * pool.length);
        batch.push(pool[i]);
        pool[i] = pool[pool.length - 1];
        pool.pop();
      }
      try {
        const q = batch.map((p) => "uris=" + encodeURIComponent(p.uri)).join("&");
        const d = await jget(`${PUB}/app.bsky.feed.getPosts?${q}`);
        const likes = new Map((d.posts || []).map((p) => [p.uri, p.likeCount || 0]));
        for (const p of batch) {
          if (!likes.has(p.uri)) continue; // deleted or hidden since the repo snapshot
          corpus.posts.push({ uri: p.uri, text: p.text, likes: likes.get(p.uri), a: p.a });
          corpus.labelled++;
        }
      } catch {
        // a failed batch is dropped, not retried forever — its posts simply don't join the corpus
      }
      onTick();
    }
  }

  const cars = Array.from({ length: CAR_WORKERS }, carWorker);
  const labels = Array.from({ length: LABEL_WORKERS }, labelWorker);
  await Promise.all(cars);
  carsDone = true;
  await Promise.all(labels);
  corpus.pending = pool.length;
}

// --- IndexedDB cache so a returning visitor skips the download ----------------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("surprisal", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("corpus");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCorpus(did, data) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("corpus", "readwrite");
      tx.objectStore("corpus").put({ ...data, savedAt: Date.now() }, did);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (_) { /* private mode / quota: caching is optional */ }
}

export async function loadCachedCorpus(did) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const r = db.transaction("corpus").objectStore("corpus").get(did);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  } catch (_) { return null; }
}
