// Pure scoring for mogboard. No DOM, no network — tests/score.test.mjs calls it.

// Words in a post, ignoring bare URLs (a pasted link isn't prose).
export function countWords(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Local-calendar day key (yyyy-mm-dd) for an ISO timestamp.
export function dayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Turn raw post records into { day -> {words, posts, images} }. Replies to
// other people are conversation, not blogging, so only top-level posts and
// self-replies (thread continuations) count.
export function perDay(did, records, startDay, endDay) {
  const days = new Map();
  for (const r of records) {
    const v = r.value || r;
    const day = dayKey(v.createdAt);
    if (!day || day < startDay || day > endDay) continue;
    const parent = v.reply && v.reply.parent && v.reply.parent.uri;
    if (parent && !parent.startsWith("at://" + did + "/")) continue;
    const e = days.get(day) || { words: 0, posts: 0, images: 0 };
    e.words += countWords(v.text);
    e.posts += 1;
    const emb = v.embed || {};
    const imgs = emb.images || (emb.media && emb.media.images) || [];
    e.images += imgs.length;
    days.set(day, e);
  }
  return days;
}

export function daysBetween(startDay, endDay) {
  const out = [];
  const [y, m, d] = startDay.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  for (let i = 0; i < 1000; i++) { // 1000 days ≈ 2.7 years: a render-size bound for the table, not a data cap
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (key > endDay) break;
    out.push(key);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// bloggers: [{ handle, days: Map }]. Returns standings plus per-day winners
// and a head-to-head matrix. A "mog" is a day where you wrote strictly more
// words than another blogger who also wrote something that day... or nothing:
// out-writing a blogger who posted zero still counts, that's the sport.
export function scoreboard(bloggers, dayList) {
  const rows = bloggers.map((b) => ({
    handle: b.handle, words: 0, posts: 0, images: 0, activeDays: 0,
    wins: 0, mogs: 0, mogged: 0, streak: 0, best: 0, bestDay: null,
  }));
  const h2h = bloggers.map(() => bloggers.map(() => 0)); // h2h[i][j] = days i mogged j
  const winners = [];
  for (const day of dayList) {
    const w = bloggers.map((b) => (b.days.get(day) || { words: 0 }).words);
    const top = Math.max(...w);
    const champs = top > 0 ? w.flatMap((x, i) => (x === top ? [i] : [])) : [];
    winners.push({ day, words: w, winners: champs.length === 1 ? champs : [], tie: champs.length > 1 });
    bloggers.forEach((b, i) => {
      const e = b.days.get(day);
      const r = rows[i];
      if (e) {
        r.words += e.words; r.posts += e.posts; r.images += e.images;
        if (e.posts) r.activeDays++;
        if (e.words > r.best) { r.best = e.words; r.bestDay = day; }
      }
      for (let j = 0; j < bloggers.length; j++) {
        if (i !== j && w[i] > w[j]) { h2h[i][j]++; r.mogs++; rows[j].mogged++; }
      }
    });
    if (champs.length === 1) rows[champs[0]].wins++;
  }
  // longest run of consecutive days with at least one post
  bloggers.forEach((b, i) => {
    let run = 0;
    for (const day of dayList) {
      if ((b.days.get(day) || { posts: 0 }).posts) { run++; if (run > rows[i].streak) rows[i].streak = run; }
      else run = 0;
    }
  });
  const ranked = rows.map((r, i) => ({ ...r, index: i }))
    .sort((a, b) => b.mogs - a.mogs || b.words - a.words || a.handle.localeCompare(b.handle));
  return { ranked, winners, h2h };
}
