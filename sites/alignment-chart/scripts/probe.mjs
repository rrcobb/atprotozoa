import { fetchRepoRecordsWithKeys } from "../public/lib/car.js";
import { resolvePds } from "../public/lib/identity.js";

const PUB = "https://public.api.bsky.app/xrpc";
async function jget(url) { const r = await fetch(url); if (!r.ok) throw new Error("HTTP "+r.status); return r.json(); }

const listUri = "at://did:plc:vszw3ess46odfhnzdsy4huae/app.bsky.graph.list/3mu3kuorgh322";
const d = await jget(`${PUB}/app.bsky.graph.getList?list=${encodeURIComponent(listUri)}&limit=100`);
const people = (d.items||[]).map(it => it.subject);
console.log("members:", people.length);

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
function squash(pos, neg) { const net = pos - neg; const k = 1.4; return net / (Math.abs(net) + k); }

for (const p of people) {
  try {
    const pds = await resolvePds(p.did);
    if (!pds) { console.log(p.handle, "no pds"); continue; }
    const { records } = await fetchRepoRecordsWithKeys(pds, p.did, "app.bsky.feed.post");
    const parts = [];
    for (const { value: rec } of records) { if (rec.reply) continue; if (rec.text) parts.push(rec.text); }
    const text = parts.join("  \n").toLowerCase();
    const hHits = countHits(text, HARSH), cHits = countHits(text, CHILL);
    const mHits = countHits(text, MOG), gHits = countHits(text, GOON);
    const x = squash(hHits, cHits), y = squash(mHits, gHits);
    console.log(p.handle, "posts:", parts.length, "chars:", text.length, "H/C:", hHits, cHits, "M/G:", mHits, gHits, "x:", x.toFixed(2), "y:", y.toFixed(2));
  } catch (e) {
    console.log(p.handle, "ERR", e.message);
  }
}
