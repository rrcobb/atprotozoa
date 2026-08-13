// Precomputes public/data/subjects.json and public/data/figures.json — a
// static snapshot, re-run by hand. Same "static snapshot" pattern as
// sites/butteredup/gen-fanpage.mjs and sites/simcluster-atlas/gen-atlas.mjs.
//
// subjects.json: everyone who has ever tagged @buildthis.bisks.net with a
// request (the "by" field of every sites/*/site.json manifest), each paired
// with one random top-level (non-reply, non-repost) post pulled live from
// Bluesky's public AppView — the raw material for the museum wall. Some
// accounts have no eligible post (empty feed, all-replies, fetch failure);
// they still get an entry with quote: null so the ledger appendix can list
// everyone, per the brief ("make a list of everyone who has tweeted you").
//
// figures.json: a curated pool of real historical figures, each resolved to
// a real portrait + one-line description live from Wikipedia's public REST
// summary API (en.wikipedia.org/api/rest_v1/page/summary/<title>) — no
// hardcoded/guessed image URLs. Titles that don't resolve or have no
// thumbnail are dropped, not guessed around.
//
// Re-run by hand to refresh the page:
//   node build-data.mjs   # writes ./public/data/{subjects,figures}.json

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const PUB = "https://public.api.bsky.app/xrpc";
const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary";
const UA = "atprotozoa-apocrypha/1.0 (https://apocrypha.bisks.net; contact via bsky.app/profile/bisks.net)";

const FEED_PAGES = 3; // ~300 recent posts scanned per account, plenty for one quote
const MIN_LEN = 20; // a quotable line needs some meat
const MAX_LEN = 240; // fits a plaque without becoming a scroll

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function jget(url, { headers, tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status === 503) && i < tries - 1) {
      await sleep(1200 * (i + 1));
      continue;
    }
    const e = new Error(`HTTP ${r.status} on ${url}`);
    e.status = r.status;
    throw e;
  }
}

function postUrl(handle, uri) {
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// ---- 1. Who has ever tagged the bot? (the same source apex/receipts read) --

function everyoneWhoAsked() {
  const handles = readdirSync("../")
    .filter((n) => existsSync(`../${n}/site.json`))
    .map((n) => JSON.parse(readFileSync(`../${n}/site.json`, "utf8")))
    .map((s) => s.by)
    .filter(Boolean)
    // A real atproto handle always has a dot (name.bsky.social, name.tld).
    // "theme-box" is the one non-handle value in the wild — a recurring
    // internal ideation label ("this tick's theme-box idea"), not an
    // account that ever tagged the bot — so it's excluded, not resolved.
    .filter((h) => h.includes("."));
  return [...new Set(handles)].sort((a, b) => a.localeCompare(b));
}

// ---- 2. One random top-level post per account ------------------------------

function isQuotable(text) {
  const t = (text || "").trim();
  if (t.length < MIN_LEN) return false;
  if (!/[a-zA-Z]{4}/.test(t)) return false; // needs actual words, not just emoji/links
  return true;
}

async function pickQuote(handle) {
  let did;
  try {
    const d = await jget(
      `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    );
    did = d.did;
  } catch (e) {
    console.log(`  ✗ ${handle}: couldn't resolve (${e.message})`);
    return { handle, did: null, displayName: null, avatar: null, quote: null };
  }

  let profile = null;
  try {
    profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    // profile lookup failing isn't fatal — we can still hunt for posts
  }

  const good = [];
  const fallback = [];
  let cursor = "";
  for (let pg = 0; pg < FEED_PAGES; pg++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      if (item.reason) continue; // skip reposts — only their own words
      const post = item.post;
      if (post?.record?.reply) continue; // belt & suspenders on "top-level"
      const text = post?.record?.text;
      if (!text || !text.trim()) continue;
      const entry = {
        text: text.trim(),
        uri: post.uri,
        url: postUrl(handle, post.uri),
        createdAt: post.record.createdAt,
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        replyCount: post.replyCount || 0,
      };
      (isQuotable(text) ? good : fallback).push(entry);
    }
    cursor = d.cursor;
    if (!cursor) break;
  }

  const pool = good.length ? good : fallback;
  const quote = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

  return {
    handle,
    did,
    displayName: profile?.displayName || null,
    avatar: profile?.avatar || null,
    quote: quote ? { text: quote.text, url: quote.url, createdAt: quote.createdAt } : null,
  };
}

// ---- 3. Historical figures, resolved to real portraits via Wikipedia -------

const FIGURE_TITLES = [
  "Socrates", "Plato", "Aristotle", "Confucius", "Sun_Tzu", "Diogenes",
  "Epictetus", "Seneca_the_Younger", "Marcus_Aurelius", "Cicero", "Pythagoras",
  "Zeno_of_Citium", "Laozi", "Hypatia",
  "Cleopatra", "Julius_Caesar", "Alexander_the_Great", "Napoleon",
  "Genghis_Khan", "Cyrus_the_Great", "Hannibal", "Boudica", "Joan_of_Arc",
  "Catherine_the_Great", "Queen_Victoria", "Elizabeth_I", "George_Washington",
  "Abraham_Lincoln", "Winston_Churchill", "Benjamin_Franklin", "Thomas_Jefferson",
  "Mark_Twain", "Oscar_Wilde", "William_Shakespeare", "Jane_Austen",
  "Mary_Shelley", "Virginia_Woolf", "Emily_Dickinson", "Walt_Whitman",
  "Ernest_Hemingway", "Franz_Kafka", "Homer", "Sappho", "Henry_David_Thoreau",
  "Ralph_Waldo_Emerson",
  "Albert_Einstein", "Isaac_Newton", "Marie_Curie", "Charles_Darwin",
  "Nikola_Tesla", "Galileo_Galilei", "Archimedes", "Ada_Lovelace", "Sigmund_Freud",
  "Mahatma_Gandhi", "Frederick_Douglass", "Susan_B._Anthony", "Sojourner_Truth",
  "Harriet_Tubman", "Rosa_Parks", "Martin_Luther_King_Jr.", "Malcolm_X",
  "Elizabeth_Cady_Stanton",
  "Leonardo_da_Vinci", "Michelangelo", "Vincent_van_Gogh", "Pablo_Picasso",
  "Ludwig_van_Beethoven", "Wolfgang_Amadeus_Mozart", "Frida_Kahlo",
  "Niccolò_Machiavelli", "Voltaire", "Immanuel_Kant", "Friedrich_Nietzsche",
  "Karl_Marx",
];

async function fetchFigure(title) {
  try {
    const d = await jget(`${WIKI}/${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } });
    if (!d.thumbnail?.source) {
      console.log(`  ✗ ${title}: no portrait, dropped`);
      return null;
    }
    return {
      name: d.title,
      description: d.description || "",
      thumb: d.thumbnail.source,
    };
  } catch (e) {
    console.log(`  ✗ ${title}: ${e.message}, dropped`);
    return null;
  }
}

// ---- run ---------------------------------------------------------------

async function main() {
  const handles = everyoneWhoAsked();
  console.log(`${handles.length} accounts have tagged the bot`);

  const subjects = [];
  for (const h of handles) {
    const s = await pickQuote(h);
    console.log(`  ${s.quote ? "✓" : "·"} ${h}${s.quote ? "" : " (no eligible post)"}`);
    subjects.push(s);
    await sleep(120);
  }

  const figures = [];
  for (const t of FIGURE_TITLES) {
    const f = await fetchFigure(t);
    if (f) figures.push(f);
    await sleep(350);
  }
  console.log(`${figures.length}/${FIGURE_TITLES.length} figures resolved with portraits`);

  writeFileSync("public/data/subjects.json", JSON.stringify(subjects, null, 2) + "\n");
  writeFileSync("public/data/figures.json", JSON.stringify(figures, null, 2) + "\n");
  console.log("wrote public/data/subjects.json and public/data/figures.json");
}

main();
