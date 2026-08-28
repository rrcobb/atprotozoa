import { fetchRepoRecordsWithKeys } from "../public/lib/car.js";
import { resolvePds } from "../public/lib/identity.js";

const PUB = "https://public.api.bsky.app/xrpc";
async function jget(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP "+r.status); return r.json(); }

const listUri = "at://did:plc:vszw3ess46odfhnzdsy4huae/app.bsky.graph.list/3mu3kuorgh322";
const d = await jget(`${PUB}/app.bsky.graph.getList?list=${encodeURIComponent(listUri)}&limit=100`);
const people = (d.items||[]).map(it => it.subject);

const HARSH = ["kill","die","hate","rage","furious","cope","seethe","mald","ratio","dunk","beef","block","clown","idiot","stupid","trash","garbage","cringe","ban","war","fight","destroy","obliterate","💢","😡","🤬","🔪","💀","rant","mad","unhinged","feral","screaming","doom","collapse","fascist","cursed","brutal"];
const CHILL = ["cozy","gentle","soft","calm","peace","peaceful","tea","blanket","nap","cat","dog","plants","garden","tender","kind","grateful","thankful","love you","hug","sweet","vibes","chill","relax","comfy","warm","🥰","😊","☺️","🌸","🫶","💛","🍵","cottage","slow morning","little guy","be kind"];
const MOG = ["locked in","grind","gym","lift","deadlift","shipped","shipping","built","based","sigma","mog","mogging","gigachad","alpha","discipline","5am","cold shower","protein","gains","dub","cracked","hustle","launch","productive","deep work","focus","optimize","peak","winning","🏋️","💪","🚀","📈","monk mode"];
const GOON = ["goon","gooning","down bad","horny","coom","edging","rizz","🥵","😩","🍑","🍆","💦","brainrot","degen","freak","milf","dilf","thirst","simp","unwell","obsessed","need him","need her","insane over","losing it","cannot stop","3am thoughts","no thoughts","brain empty","yearning","malewife","femboy"];

function countHits(text, words) {
  let n = 0;
  for (const w of words) {
    if (/^[a-z]+$/.test(w) && w.length <= 4) {
      const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "g");
      n += (text.match(re) || []).length;
    } else {
      let idx = 0;
      while ((idx = text.indexOf(w, idx)) !== -1) { n++; idx += w.length; }
    }
  }
  return n;
}
// rate per 1000 words, then squash with a k tuned for rate-scale numbers
function squashRate(posN, negN, words, k) {
  const scale = 1000 / Math.max(words, 1);
  const net = (posN - negN) * scale;
  return net / (Math.abs(net) + k);
}

const rows = [];
for (const p of people) {
  try {
    const pds = await resolvePds(p.did);
    if (!pds) { console.log(p.handle, "no pds"); continue; }
    const { records } = await fetchRepoRecordsWithKeys(pds, p.did, "app.bsky.feed.post");
    const parts = [];
    for (const { value: rec } of records) { if (rec.reply) continue; if (rec.text) parts.push(rec.text); }
    const text = parts.join("  \n").toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    const hHits = countHits(text, HARSH), cHits = countHits(text, CHILL);
    const mHits = countHits(text, MOG), gHits = countHits(text, GOON);
    rows.push({ handle: p.handle, words, hHits, cHits, mHits, gHits });
  } catch (e) {
    console.log(p.handle, "ERR", e.message);
  }
}

for (const k of [0.5, 1, 1.4, 2, 3]) {
  console.log(`\n--- k=${k} (rate per 1000 words) ---`);
  const cells = new Set();
  for (const r of rows) {
    const x = squashRate(r.hHits, r.cHits, r.words, k);
    const y = squashRate(r.mHits, r.gHits, r.words, k);
    const col = x < -1/3 ? 0 : x > 1/3 ? 2 : 1;
    const row = y > 1/3 ? 0 : y < -1/3 ? 2 : 1;
    const cell = row*3+col;
    cells.add(cell);
    console.log(r.handle.padEnd(28), "x:", x.toFixed(2), "y:", y.toFixed(2), "cell:", cell);
  }
  console.log("coverage:", cells.size, "/9");
}
