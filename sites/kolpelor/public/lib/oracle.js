// oracle.js — the city's citizens. Per @antiali.as's verse: "Πολῖται
// λαλοῦσιν, ὡς εἴθισται, ῥήμαθ' Ὁμηρικά, μεμιγμένα ἐκ φωνῶν ὄντων ἀνδρῶν·
// ψυχὴ μηχανικὴ ῥάπτει λόγους, χρησμοὺς παλαιοὺς ἐκ νέων γραφῶν." (Citizens
// speak, as is customary, Homeric-sounding words, mixed from the voices of
// real men; a mechanical soul stitches the speech, old oracles out of new
// writing.) No inference here, no Workers AI — the "mechanical soul" is
// plain string-splicing: two SimCluster moots' own most recent real posts,
// fetched anonymously off the public AppView (same api.bsky.app pattern as
// cluster.js), each cut at a word boundary near its middle, and glued head
// of one to tail of the other. The words really are real citizens' voices;
// the stitching is the only "mechanical" part.

const PUB = "https://api.bsky.app/xrpc";

async function fetchRecentPostText(did) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", "10");
  u.searchParams.set("filter", "posts_no_replies");
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  for (const item of j.feed || []) {
    const text = (item.post && item.post.record && item.post.record.text || "").replace(/\s+/g, " ").trim();
    if (text.length > 12 && text.length < 260 && !text.startsWith("@")) return text;
  }
  return null;
}

// Cut near the midpoint at the nearest word boundary — [head, tail].
function splitHalf(text) {
  const mid = Math.floor(text.length / 2);
  let i = text.indexOf(" ", mid);
  if (i < 0) i = text.lastIndexOf(" ", mid);
  if (i < 0) i = mid;
  return [text.slice(0, i).trim(), text.slice(i).trim()];
}

// Draw two real, recent posts from distinct moots in `pool` and stitch the
// first's opening half to the second's closing half. Throws if the
// SimCluster is too thin or nobody has a usable recent post to draw from.
export async function citizenOracle(pool, rng = Math.random) {
  if (!pool || pool.length < 2) throw new Error("not enough citizens in this SimCluster to hold an oracle.");
  const shuffled = [...pool].sort(() => rng() - 0.5).slice(0, 8);
  const found = [];
  for (const p of shuffled) {
    try {
      const text = await fetchRecentPostText(p.did);
      if (text) found.push({ handle: p.handle, text });
    } catch {
      // suspended/deleted/rate-limited/no posts — try the next citizen
    }
    if (found.length >= 2) break;
  }
  if (found.length < 2) throw new Error("the citizens have nothing to say right now — try again.");
  const [first, second] = found;
  const [head] = splitHalf(first.text);
  const [, tail] = splitHalf(second.text);
  const text = `${head} ${tail}`.replace(/\s+/g, " ").trim();
  return { text, sources: [first.handle, second.handle] };
}
