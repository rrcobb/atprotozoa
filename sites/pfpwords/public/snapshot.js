import { rank } from "./lib/stats.js";

const $ = (id) => document.getElementById(id);

function list(el, rows, key) {
  el.textContent = "";
  if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "not enough data."; el.append(p); return; }
  const max = Math.max(...rows.map((r) => Math.abs(r.lo)));
  for (const r of rows) {
    const d = document.createElement("div"); d.className = "row";
    const b = document.createElement("div"); b.className = "bar"; b.style.width = (Math.abs(r.lo) / max * 100).toFixed(1) + "%";
    const s = document.createElement("span");
    const w = document.createElement("b"); w.textContent = r.word; w.style.fontWeight = "600";
    const small = document.createElement("small"); small.textContent = `${r[key]} vs ${r[key === "cat" ? "anime" : "cat"]}`;
    s.append(w, small); d.append(b, s); el.append(d);
  }
}

(async () => {
  try {
    const res = await fetch("data/snapshot.json");
    if (!res.ok) throw new Error("snapshot " + res.status);
    const snap = await res.json();
    const counts = { cat: { n: snap.cat.n, words: new Map() }, anime: { n: snap.anime.n, words: new Map() } };
    for (const [w, [c, a]] of Object.entries(snap.words)) {
      if (c) counts.cat.words.set(w, c);
      if (a) counts.anime.words.set(w, a);
    }
    const r = rank(counts, { top: 20 });
    $("tc").firstElementChild.textContent = snap.cat.n.toLocaleString();
    $("ta").firstElementChild.textContent = snap.anime.n.toLocaleString();
    $("to").firstElementChild.textContent = snap.skippedOther.toLocaleString();
    list($("listc"), r.cat, "cat");
    list($("lista"), r.anime, "anime");
    const months = Math.round(snap.windowDays / 30.4);
    $("scope").textContent = `from ${(snap.cat.posts + snap.anime.posts).toLocaleString()} original posts over ${months} months`;
    $("status").textContent = `snapshot taken ${snap.generated}`;
    const t = (a) => a.slice(0, 5).map((x) => x.word).join(", ");
    const text = `cat pfps vs anime pfps on bluesky, by what they post (${(snap.cat.n + snap.anime.n).toLocaleString()} accounts, ${months} months):\n🐱 ${t(r.cat)}\n✨ ${t(r.anime)}\nhttps://pfpwords.bisks.net/`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  } catch (e) {
    $("status").textContent = "couldn't load the snapshot: " + ((e && e.message) || e);
    for (const id of ["listc", "lista"]) $(id).textContent = "";
  }
})();
