// classify.mjs — stage 1 of the static snapshot. Walks the follow graph out
// from the accounts in the request thread, sorts each avatar cat / anime /
// other with the same CLIP model + prompts the live page uses, and stops when
// both camps have TARGET accounts. State is saved to state.json so it resumes.
// Run: node classify.mjs   (needs @xenova/transformers@2.17.2 resolvable)
import fs from "node:fs";
import { classify } from "../public/lib/stats.js";

const API = "https://public.api.bsky.app/xrpc/";
const SEEDS = ["oxidist.bsky.social", "norvid-studies.bsky.social", "bisks.net"];
const TARGET = Number(process.env.TARGET || 1000); // product decision from the ask: ~1000 accounts per camp
const CONFIDENT = 0.5;
const STATE = process.env.STATE || "state.json";
const PROMPTS = [
  ["cat", "a photo of a cat"], ["cat", "a close-up of a cat's face"], ["cat", "a cute kitten"], ["cat", "a cat sitting"],
  ["anime", "an anime character"], ["anime", "anime art of a girl"], ["anime", "a manga illustration"], ["anime", "an anime-style drawing"],
  ["other", "a photo of a person"], ["other", "a selfie of a person"], ["other", "a photo of a dog"], ["other", "a landscape photo"],
  ["other", "a logo or text"], ["other", "a cartoon that is not anime"], ["other", "a photo of an object"], ["other", "a photo of an animal"],
  ["other", "a drawing of a character"], ["other", "a plain colored picture"],
];
const GROUPS = PROMPTS.map((p) => p[0]);

const get = async (path, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API + path, { signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
      if (!r.ok) throw new Error(path.split("?")[0] + " " + r.status);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((s) => setTimeout(s, 1000)); }
  }
};
// getFollows pages until the cursor comes back empty.
async function follows(actor) {
  const out = []; let cursor;
  do {
    const j = await get(`app.bsky.graph.getFollows?actor=${encodeURIComponent(actor)}&limit=100` + (cursor ? "&cursor=" + cursor : ""));
    out.push(...j.follows); cursor = j.cursor;
  } while (cursor);
  return out;
}

const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { seen: {}, queue: [], expanded: [], results: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(st));

const tf = await import("@xenova/transformers");
tf.env.allowLocalModels = false;
const M = "Xenova/clip-vit-base-patch32";
const [tok, tm, proc, vm] = await Promise.all([
  tf.AutoTokenizer.from_pretrained(M), tf.CLIPTextModelWithProjection.from_pretrained(M),
  tf.AutoProcessor.from_pretrained(M), tf.CLIPVisionModelWithProjection.from_pretrained(M),
]);
const { text_embeds } = await tm(tok(PROMPTS.map((p) => p[1]), { padding: true, truncation: true }));
const dim = text_embeds.dims[1];
const text = PROMPTS.map((_, k) => Array.from(text_embeds.data.slice(k * dim, (k + 1) * dim)));

const count = (g) => Object.values(st.results).filter((r) => r.g === g).length;
async function sortProfile(p) {
  try {
    const url = p.avatar.replace("/img/avatar/", "/img/avatar_thumbnail/");
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("avatar " + r.status);
    const img = await tf.RawImage.fromBlob(await r.blob());
    const { image_embeds } = await vm(await proc(img));
    const pr = classify(Array.from(image_embeds.data), text, GROUPS);
    return pr.cat >= CONFIDENT ? "cat" : pr.anime >= CONFIDENT ? "anime" : "other";
  } catch { return "fail"; }
}

// Discovery and classification run as two pipelines: expansion workers walk
// getFollows and push unseen profiles onto `todo`; sort workers (CLIP is the
// bottleneck) drain it. Cat accounts are expanded first since their follows
// are the richest vein of more cats.
const todo = st.todo || [];
const done = () => count("cat") >= TARGET && count("anime") >= TARGET;
const DEADLINE = Date.now() + Number(process.env.MINUTES || 90) * 60000; // wall-clock budget for the crawl
const stop = () => done() || Date.now() > DEADLINE;
const SAVE = () => { st.todo = todo; save(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!Object.keys(st.seen).length) {
  for (const s of SEEDS) {
    const prof = await get("app.bsky.actor.getProfile?actor=" + s);
    st.queue.push(prof.did); st.seen[prof.did] = 1;
    for (const p of await follows(s)) if (!st.seen[p.did]) { st.seen[p.did] = 1; if (p.avatar) todo.push(p); }
  }
  SAVE();
}
const expandedSet = new Set(st.expanded);
const pick = () => {
  const ix = st.queue.findIndex((d) => st.results[d] && st.results[d].g === "cat");
  return ix >= 0 ? st.queue.splice(ix, 1)[0] : st.queue.shift();
};
async function expander() {
  while (!stop()) {
    if (todo.length > 400) { await sleep(2000); continue; }
    const did = pick();
    if (!did) { await sleep(2000); continue; }
    if (expandedSet.has(did)) continue;
    expandedSet.add(did); st.expanded.push(did);
    try { for (const p of await follows(did)) if (!st.seen[p.did]) { st.seen[p.did] = 1; if (p.avatar) todo.push(p); } }
    catch (e) { console.error("follows", did, e.message); }
  }
}
async function sorter() {
  while (!stop()) {
    const p = todo.pop(); // newest-discovered first
    if (!p) { await sleep(1000); continue; }
    const g = await sortProfile(p);
    st.results[p.did] = { g, handle: p.handle, avatar: p.avatar };
    if (g === "cat" || g === "anime") st.queue.push(p.did);
  }
}
const log = setInterval(() => { SAVE(); console.log(`expanded ${st.expanded.length} seen ${Object.keys(st.seen).length} todo ${todo.length} cat ${count("cat")} anime ${count("anime")} other ${count("other")} fail ${count("fail")} queue ${st.queue.length}`); }, 15000);
await Promise.all([expander(), expander(), expander(), expander(), sorter(), sorter()]);
clearInterval(log); SAVE();
console.log("done", count("cat"), count("anime"));
process.exit(0);
