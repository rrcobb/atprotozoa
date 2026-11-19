// posts.mjs — stage 2 of the static snapshot. For every account classify.mjs
// put in a camp, download the whole repo (com.atproto.sync.getRepo, parsed by
// the car.js copied from backscroll), keep original posts from the last
// WINDOW_DAYS, and write each account's distinct word set to posts-cache/.
// Then aggregate into ../public/data/snapshot.json.
// Run: node posts.mjs
import fs from "node:fs";
import { fetchRepoRecordsWithKeys } from "./car.js";
import { tokens } from "../public/lib/stats.js";

const WINDOW_DAYS = 183; // product decision from the ask: "page back, idk, 6 months of posts"
const CONC = Number(process.env.CONC || 6);
const state = JSON.parse(fs.readFileSync(process.env.STATE || "state.json", "utf8"));
const cutoff = Date.now() - WINDOW_DAYS * 864e5;
fs.mkdirSync("posts-cache", { recursive: true });

const pdsOf = async (did) => {
  const u = did.startsWith("did:web:") ? `https://${did.slice(8)}/.well-known/did.json` : `https://plc.directory/${did}`;
  const doc = await (await fetch(u)).json();
  const svc = (doc.service || []).find((x) => x.id === "#atproto_pds");
  if (!svc) throw new Error("no PDS");
  return svc.serviceEndpoint;
};

async function one(did) {
  const f = `posts-cache/${encodeURIComponent(did)}.json`;
  if (fs.existsSync(f)) return;
  let out;
  try {
    const pds = await pdsOf(did);
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post");
    const texts = [];
    for (const { value: r } of records) {
      if (r.reply || !r.text) continue; // original posts only, like the live page
      const t = Date.parse(r.createdAt);
      if (!(t >= cutoff) || t > Date.now() + 864e5) continue;
      texts.push(r.text);
    }
    out = { ok: true, posts: texts.length, words: tokens(texts.join("\n")) };
  } catch (e) { out = { ok: false, err: String(e.message || e).slice(0, 80) }; }
  fs.writeFileSync(f, JSON.stringify(out));
}

const dids = Object.entries(state.results).filter(([, r]) => r.g === "cat" || r.g === "anime").map(([d]) => d);
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < dids.length) {
    await one(dids[next++]);
    if (++done % 25 === 0) console.log(`repos ${done}/${dids.length}`);
  }
}));

// Aggregate. An account with no posts in the window has nothing to say, so it
// doesn't count toward its camp's n (the live page also only counts accounts
// whose text was read).
const camp = { cat: { n: 0, posts: 0, words: {} }, anime: { n: 0, posts: 0, words: {} } };
let failed = 0;
for (const did of dids) {
  const c = JSON.parse(fs.readFileSync(`posts-cache/${encodeURIComponent(did)}.json`, "utf8"));
  if (!c.ok) { failed++; continue; }
  if (!c.posts) continue;
  const g = camp[state.results[did].g];
  g.n++; g.posts += c.posts;
  for (const w of c.words) g.words[w] = (g.words[w] || 0) + 1;
}
// Keep words seen in 3+ accounts overall (the page ranks with a floor of 4;
// 3 leaves headroom) so the file stays small.
const keep = new Set();
for (const g of ["cat", "anime"]) for (const w of Object.keys(camp[g].words)) {
  if ((camp.cat.words[w] || 0) + (camp.anime.words[w] || 0) >= 3) keep.add(w);
}
const words = {};
for (const w of keep) words[w] = [camp.cat.words[w] || 0, camp.anime.words[w] || 0];
const snap = {
  generated: new Date().toISOString().slice(0, 10),
  windowDays: WINDOW_DAYS,
  cat: { n: camp.cat.n, posts: camp.cat.posts }, anime: { n: camp.anime.n, posts: camp.anime.posts },
  classified: dids.length, skippedOther: Object.values(state.results).filter((r) => r.g === "other").length,
  reposFailed: failed, words,
};
fs.mkdirSync("../public/data", { recursive: true });
fs.writeFileSync("../public/data/snapshot.json", JSON.stringify(snap));
console.log("wrote snapshot", snap.cat, snap.anime, "words", keep.size, "failed", failed);
