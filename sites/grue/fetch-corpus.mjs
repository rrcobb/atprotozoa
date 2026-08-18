// One-time (re-runnable) script that snapshots @godoglyness.bsky.social's own
// post text into public/data/corpus.json — the training data for the Markov
// chain in public/lib/markov.js. Not part of the deployed site (it's a build
// tool, like og-gen.mjs); re-run it by hand later to refresh the snapshot.
//
//   node fetch-corpus.mjs
//
// Pages app.bsky.feed.getAuthorFeed on the public AppView (no auth). Keeps
// replies (godoglyness's voice shows up there as much as in top-level posts)
// but drops reposts, quote-post wrapper text with no words of its own, and
// duplicates.

const ACTOR = "godoglyness.bsky.social";
const API = "https://public.api.bsky.app/xrpc";
const MAX_POSTS = 4000;
const PAGE_BUDGET = 60;

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function main() {
  const lines = [];
  const seen = new Set();
  let cursor;
  for (let page = 0; page < PAGE_BUDGET && lines.length < MAX_POSTS; page++) {
    const url = new URL(`${API}/app.bsky.feed.getAuthorFeed`);
    url.searchParams.set("actor", ACTOR);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await jget(url.toString());
    for (const item of data.feed || []) {
      if (item.reason) continue; // repost, not godoglyness's own words
      const text = item.post?.record?.text;
      if (!text) continue;
      const trimmed = text.trim();
      if (trimmed.length < 4) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      lines.push(trimmed);
    }
    console.log(`page ${page + 1}: ${lines.length} lines so far`);
    cursor = data.cursor;
    if (!cursor || !(data.feed && data.feed.length)) break;
  }
  console.log(`done: ${lines.length} lines`);
  const fs = await import("node:fs");
  fs.mkdirSync(new URL("./public/data", import.meta.url), { recursive: true });
  fs.writeFileSync(
    new URL("./public/data/corpus.json", import.meta.url),
    JSON.stringify({ actor: ACTOR, fetchedAt: new Date().toISOString(), lines }, null, 0)
  );
  console.log("wrote public/data/corpus.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
