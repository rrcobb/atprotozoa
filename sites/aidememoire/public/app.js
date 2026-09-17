// app.js — aidememoire.bisks.net client logic.
//
// No AI, no LLM, no Workers AI (Cloudflare cost wall) — this is a local
// keyword/structure classifier run against real, publicly-downloadable
// repo data. Two CAR downloads (lib/car.js, see wrangler.toml's comment for
// why one request beats paginating):
//   1. the blocker's own repo, filtered to app.bsky.graph.block +
//      app.bsky.feed.post/like/repost in one shot — finds the block record
//      for the target (public data, no OAuth needed), supplies "years of
//      tweets" for the blocker's own profile, and supplies every like/repost
//      the blocker ever sent.
//   2. the target's repo, filtered to the same post/like/repost types —
//      supplies "what they were posting at the time of the block" plus
//      their own likes/reposts.
// interactionsBetween() cross-references each side's likes/reposts/reply
// targets against the other account's DID for a real "did these two accounts
// ever interact" history, not an imputed one. recentInteractionItems() and
// latestContactMeaning() go a step further: they resolve the actual liked/
// reposted post text (looked up against the counterpart's own downloaded
// posts, since both repos are already in memory) and run it back through the
// same classifier, so the most recent contact gets a "meaning" tag too.
//
// Everything past that (category scoring, the "imputed rationale"
// paragraph, the confidence number) is deterministic string/regex work on
// real post text and real record fields. It is satire dressed as casework,
// not a real psychological instrument — see the disclaimer in index.html.

import { resolvePds } from "./lib/identity.js";
import { fetchRepoRecordsWithKeys } from "./lib/car.js";

const PUBLIC_API = "https://public.api.bsky.app";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cleanHandle(raw) {
  let h = String(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

async function resolveHandle(handle) {
  if (handle.startsWith("did:")) return handle;
  try {
    const r = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
    if (!r.ok) return null;
    return (await r.json()).did || null;
  } catch {
    return null;
  }
}

async function getProfile(actor) {
  try {
    const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// --- classifier -------------------------------------------------------------
//
// Every category is a plain function over a post's text + record. Keyword
// categories match real phrases; structural ones read record fields
// (reply/embed shape, caps ratio) that a keyword scan can't see. One pass
// over the post list scores all of them at once.

function normalize(t) {
  return String(t || "").replace(/[‘’]/g, "'").toLowerCase();
}

function capsRatio(t) {
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 15) return 0;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length;
}

const CATEGORIES = [
  { key: "doom", label: "doomposting", test: (t) => /\b(we're so back|it's so over|doomscroll\w*|the collapse|dystopia\w*|we're cooked|everything is (?:terrible|cooked|awful))\b/.test(t) },
  { key: "discourse", label: "discourse-baiting", test: (t) => /\b(unpopular opinion|hot take|hear me out|curious why)\b/.test(t) || t.includes("🧵") },
  { key: "promo", label: "self-promotion", test: (t) => /\b(check out my|link in bio|new (?:blog|video|episode|single|drop)|just (?:shipped|launched|released)|buy my|pre-?order|my new (?:book|project))\b/.test(t) },
  { key: "politics", label: "political hot takes", test: (t) => /\b(election|senator|congress\w*|the president|policy|ballots?|fascis\w*|liberals?|conservatives?|democrats?|republicans?|parliament|legislation)\b/.test(t) },
  { key: "crypto", label: "crypto-brain", test: (t) => /\b(crypto|nft|web3|blockchain|airdrop|wagmi|hodl)\b/.test(t) },
  { key: "ai", label: "AI-slop posting", test: (t) => /\b(chatgpt|as an ai|generative ai|midjourney|stable diffusion|large language model|llm|prompted)\b/.test(t) },
  { key: "sealion", label: "sealioning", test: (t) => /\b(just asking questions|source\?|citation needed|genuinely curious|not trying to be (?:rude|mean))\b/.test(t) },
  { key: "sports", label: "sports-yelling", test: (t) => /\b(touchdown|playoffs?|the refs?\b|referee|final score|overtime|halftime|home ?run)\b/.test(t) },
  { key: "weather", label: "weather-noticing", test: (t) => /\b(so (?:humid|muggy)|heat wave|polar vortex|it's (?:raining|snowing)|weather (?:today|out here))\b/.test(t) },
  { key: "food", label: "food-posting", test: (t) => /\b(recipe|made (?:dinner|this) (?:tonight|myself)|meal prep|baked (?:a|some))\b/.test(t) },
  { key: "negativity", label: "chronic negativity", test: (t) => /\b(literally the worst|i hate (?:this|it|when)|can't stand|worst (?:day|thing)|ugh)\b/.test(t) },
  { key: "mainchar", label: "main-character energy", test: (t) => /\b(no because|the way i |i'm gonna be so real|it's giving)\b/.test(t) },
  { key: "reply", label: "reply-guying", test: (_t, p) => !!p.reply },
  { key: "quote", label: "quote-dunking", test: (t, p) => (p.embed?.$type === "app.bsky.embed.record" || p.embed?.$type === "app.bsky.embed.recordWithMedia") && t.length < 80 },
  { key: "caps", label: "all-caps yelling", test: (t) => capsRatio(t) > 0.5 },
  { key: "photo", label: "photo-dumping", test: (_t, p) => p.embed?.$type === "app.bsky.embed.images" },
  { key: "link", label: "link-dropping", test: (_t, p) => p.embed?.$type === "app.bsky.embed.external" },
];

function classify(posts) {
  const buckets = CATEGORIES.map((c) => ({ ...c, count: 0, examples: [] }));
  for (const post of posts) {
    const rec = post.value;
    const raw = rec.text || "";
    const t = normalize(raw);
    for (const b of buckets) {
      if (b.test(t, rec)) {
        b.count++;
        if (b.examples.length < 3) b.examples.push({ text: raw, uri: post.uri, createdAt: rec.createdAt });
      }
    }
  }
  const total = posts.length;
  return buckets
    .map((b) => ({ ...b, ratio: total ? b.count / total : 0 }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || b.ratio - a.ratio);
}

// categoriesFor() runs the same classifier against a single piece of text —
// used to tag the "meaning" of one recent like/reply rather than a whole
// archive.
function categoriesFor(raw, rec) {
  const t = normalize(raw || "");
  return CATEGORIES.filter((c) => c.test(t, rec || {})).map((c) => c.label);
}

// --- windowing: "what were they posting at the time of the block" -----------

const WINDOWS = [
  { days: 21, label: "3 weeks before the block" },
  { days: 42, label: "6 weeks before the block" },
  { days: 90, label: "3 months before the block" },
  { days: 365, label: "the year before the block" },
];

function pickWindow(posts, blockMs) {
  for (const w of WINDOWS) {
    const from = blockMs - w.days * 86400000;
    const hit = posts.filter((p) => {
      const t = Date.parse(p.value.createdAt);
      return Number.isFinite(t) && t >= from && t <= blockMs;
    });
    if (hit.length >= 5) return { posts: hit, label: w.label, expanded: false };
  }
  const upTo = posts.filter((p) => {
    const t = Date.parse(p.value.createdAt);
    return Number.isFinite(t) && t <= blockMs;
  });
  if (upTo.length) return { posts: upTo, label: "their whole history up to the block (too quiet right before it to narrow further)", expanded: true };
  return { posts, label: "their whole history (no posts landed with a timestamp before the block)", expanded: true };
}

// --- cross-account interaction history ---------------------------------------
//
// `records` is one account's full repo (posts + likes + reposts, mixed);
// `towardDid` is the other account. Finds every like/repost whose subject
// points at a record in the other repo, and every reply whose parent does,
// up to (and including) the block — anything after is moot, since a block
// stops both sides from being able to interact at all.

function interactionsBetween(records, towardDid, uptoMs) {
  const prefix = `at://${towardDid}/`;
  const before = (r) => {
    const t = Date.parse(r.value.createdAt);
    return !Number.isFinite(t) || t <= uptoMs;
  };
  const likes = records.filter((r) => r.value.$type === "app.bsky.feed.like" && r.value.subject?.uri?.startsWith(prefix) && before(r));
  const reposts = records.filter((r) => r.value.$type === "app.bsky.feed.repost" && r.value.subject?.uri?.startsWith(prefix) && before(r));
  const replies = records.filter((r) => r.value.$type === "app.bsky.feed.post" && r.value.reply?.parent?.uri?.startsWith(prefix) && before(r));
  const all = [...likes, ...reposts, ...replies].sort((a, b) => Date.parse(b.value.createdAt) - Date.parse(a.value.createdAt));
  return { likes, reposts, replies, total: likes.length + reposts.length + replies.length, latest: all[0] || null };
}

// recentInteractionItems() pulls the most recent likes/reposts/replies out
// of an interactionsBetween() result and resolves what they were actually
// on: for a reply that's the replier's own text (already on the record);
// for a like/repost the record only stores the *subject* URI, so it's
// looked up against the other account's own downloaded posts (both repos
// were already pulled in full — see the module header). Each item is then
// run through the classifier so a recent like/reply carries the same
// "meaning" tags a whole archive gets, not just a bare count.
function recentInteractionItems(stats, subjectPostsByUri, limit = 3) {
  const items = [
    ...stats.likes.map((r) => ({ kind: "like", record: r })),
    ...stats.reposts.map((r) => ({ kind: "repost", record: r })),
    ...stats.replies.map((r) => ({ kind: "reply", record: r })),
  ].sort((a, b) => Date.parse(b.record.value.createdAt) - Date.parse(a.record.value.createdAt));

  return items.slice(0, limit).map(({ kind, record }) => {
    let text, postUri, classifyRec;
    if (kind === "reply") {
      text = record.value.text || "";
      postUri = bskyPostLink(record.uri);
      classifyRec = record.value;
    } else {
      const subjectUri = record.value.subject?.uri;
      const subjectPost = subjectUri ? subjectPostsByUri.get(subjectUri) : null;
      text = subjectPost ? subjectPost.value.text || "" : null;
      postUri = subjectUri ? bskyPostLink(subjectUri) : null;
      classifyRec = subjectPost ? subjectPost.value : null;
    }
    return {
      kind,
      createdAt: record.value.createdAt,
      text,
      postUri,
      categories: text ? categoriesFor(text, classifyRec) : [],
    };
  });
}

function interactionLine(dirLabel, stats) {
  if (!stats.total) return `${dirLabel} — nothing on record.`;
  const bits = [];
  if (stats.likes.length) bits.push(`${stats.likes.length} like${stats.likes.length === 1 ? "" : "s"}`);
  if (stats.reposts.length) bits.push(`${stats.reposts.length} repost${stats.reposts.length === 1 ? "" : "s"}`);
  if (stats.replies.length) bits.push(`${stats.replies.length} repl${stats.replies.length === 1 ? "y" : "ies"}`);
  return `${dirLabel} — ${bits.join(", ")}.`;
}

function interactionAddendum(yourToTarget, targetToYou, yourHandle, targetHandle) {
  const total = yourToTarget.total + targetToYou.total;
  if (!total) {
    return `No likes, replies, or reposts between the two accounts turn up in either archive — no engagement history to weigh against the block.`;
  }
  if (yourToTarget.total && !targetToYou.total) {
    return `Notably, @${yourHandle} engaged with @${targetHandle} ${yourToTarget.total} time${yourToTarget.total === 1 ? "" : "s"} beforehand and never got anything back — the block wasn't for lack of exposure.`;
  }
  if (targetToYou.total && !yourToTarget.total) {
    return `@${targetHandle} engaged with @${yourHandle} ${targetToYou.total} time${targetToYou.total === 1 ? "" : "s"} beforehand and got silence in return, then a block.`;
  }
  return `The two accounts weren't strangers: @${yourHandle} engaged ${yourToTarget.total} time${yourToTarget.total === 1 ? "" : "s"}, @${targetHandle} engaged ${targetToYou.total} time${targetToYou.total === 1 ? "" : "s"}, before it ended in a block.`;
}

// latestContactMeaning() finds whichever side made last contact (comparing
// interactionsBetween()'s .latest on each side) and classifies what that
// specific like/repost/reply was actually about, so the case file can say
// something about the *meaning* of the last touch, not just its timestamp.
function latestContactMeaning(yourToTarget, targetToYou, yourPostsByUri, targetPostsByUri, yourHandle, targetHandle) {
  const yLatest = yourToTarget.latest;
  const tLatest = targetToYou.latest;
  if (!yLatest && !tLatest) return null;
  const yMs = yLatest ? Date.parse(yLatest.value.createdAt) : -Infinity;
  const tMs = tLatest ? Date.parse(tLatest.value.createdAt) : -Infinity;
  const fromYou = yMs >= tMs;
  const record = fromYou ? yLatest : tLatest;
  const actor = fromYou ? yourHandle : targetHandle;
  const towardLookup = fromYou ? targetPostsByUri : yourPostsByUri;

  const kindType = record.value.$type;
  let kind, text, verb, classifyRec;
  if (kindType === "app.bsky.feed.like") { kind = "like"; verb = "liked"; }
  else if (kindType === "app.bsky.feed.repost") { kind = "repost"; verb = "reposted"; }
  else { kind = "reply"; verb = "replied to"; }

  if (kind === "reply") {
    text = record.value.text || "";
    classifyRec = record.value;
  } else {
    const subjectUri = record.value.subject?.uri;
    const subjectPost = subjectUri ? towardLookup.get(subjectUri) : null;
    text = subjectPost ? subjectPost.value.text || "" : null;
    classifyRec = subjectPost ? subjectPost.value : null;
  }
  if (!text) return `The last direct contact was @${actor} ${verb} something now missing from the record — the post itself didn't survive to be read.`;

  const categories = categoriesFor(text, classifyRec);
  const tag = categories.length ? esc(categories[0]) : null;
  const snippetRaw = text.length > 90 ? text.slice(0, 87) + "…" : text;
  const snippet = esc(snippetRaw);
  return tag
    ? `The last direct contact: @${actor} ${verb} "${snippet}" — reads as <b>${tag}</b>, for what that's worth.`
    : `The last direct contact: @${actor} ${verb} "${snippet}" — no particular category jumped out.`;
}

// --- stable per-pair pseudo-randomness ---------------------------------------

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// --- the write-up -------------------------------------------------------------

function fmtCount(n, total) {
  return `${n}/${total}`;
}

const TEMPLATES = [
  (c) => `In ${c.windowLabel}, @${c.targetHandle} ran hot on <b>${c.targetTop}</b> — ${fmtCount(c.targetTopCount, c.targetTotal)} posts on file scored for it${c.targetSecond ? `, with a secondary lean toward <b>${c.targetSecond}</b>` : ""}. Cross-referenced against your own multi-year archive, which skews hardest into <b>${c.yourTop}</b>, the block reads less like a snap decision and more like a boundary your feed had already drawn for itself.`,
  (c) => `Best available read: @${c.targetHandle}'s <b>${c.targetTop}</b> output spiked in ${c.windowLabel} (${fmtCount(c.targetTopCount, c.targetTotal)}), landing directly across the grain from your own well-established <b>${c.yourTop}</b> streak. Two incompatible timelines, one mute finger.`,
  (c) => `Imputed cause: sustained <b>${c.targetTop}</b> content from an account you had no prior reason to track, arriving while your own feed was already deep in a <b>${c.yourTop}</b> phase. The overlap was not load-bearing.`,
  (c) => `The evidence: ${fmtCount(c.targetTopCount, c.targetTotal)} posts pulled from @${c.targetHandle}'s activity in ${c.windowLabel} score for <b>${c.targetTop}</b>. Your own archive says you've spent years mostly on <b>${c.yourTop}</b>. Explicated: incompatible wavelengths, resolved the only way the app allows.`,
  (c) => `Working theory, moderate confidence: @${c.targetHandle} was mid-<b>${c.targetTop}</b> arc in ${c.windowLabel}, a register that shows up nowhere in your own <b>${c.yourTop}</b>-leaning history. Sometimes that's all it takes.`,
];

function noSignalWriteup(c) {
  return `No strong signal in @${c.targetHandle}'s posts from ${c.windowLabel} — either they were uncharacteristically quiet, or the block predates anything interesting enough to leave a trace. Filed under: vibes.`;
}

function confidenceFor(topRatio, total) {
  const pct = Math.round(topRatio * 70 + Math.min(total, 20) / 20 * 30);
  return Math.max(8, Math.min(96, pct));
}

// --- DOM ----------------------------------------------------------------------

const els = {
  form: document.getElementById("f"),
  yourInput: document.getElementById("yourHandle"),
  targetInput: document.getElementById("targetHandle"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  card: document.getElementById("card"),
  shareCanvas: document.getElementById("shareCanvas"),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (isErr ? " err" : "");
}

let lastShareText = "";
let lastResult = null;

async function run(yourHandleRaw, targetHandleRaw) {
  const yourHandle = cleanHandle(yourHandleRaw);
  const targetHandle = cleanHandle(targetHandleRaw);
  if (!yourHandle || !targetHandle) return setStatus("enter both handles.", true);
  if (yourHandle.toLowerCase() === targetHandle.toLowerCase()) {
    return setStatus("you can't block yourself into a case file. try two different handles.", true);
  }

  els.go.disabled = true;
  els.card.classList.remove("show");
  setStatus(`resolving @${yourHandle} and @${targetHandle} ...`);

  try {
    const [yourDid, targetDid] = await Promise.all([resolveHandle(yourHandle), resolveHandle(targetHandle)]);
    if (!yourDid) throw new Error(`couldn't resolve @${yourHandle}`);
    if (!targetDid) throw new Error(`couldn't resolve @${targetHandle}`);

    const [yourProfile, targetProfile] = await Promise.all([getProfile(yourDid), getProfile(targetDid)]);

    setStatus(`downloading @${yourHandle}'s repo ...`);
    const yourPds = await resolvePds(yourDid);
    if (!yourPds) throw new Error(`couldn't find @${yourHandle}'s PDS`);
    const { records: yourRecords } = await fetchRepoRecordsWithKeys(
      yourPds, yourDid,
      ["app.bsky.graph.block", "app.bsky.feed.post", "app.bsky.feed.like", "app.bsky.feed.repost"],
      (m) => setStatus(m),
    );

    const blockRecord = yourRecords.find((r) => r.value.$type === "app.bsky.graph.block" && r.value.subject === targetDid);
    if (!blockRecord) {
      throw new Error(
        `@${yourHandle} doesn't have a public block record aimed at @${targetHandle}. This only reads real app.bsky.graph.block records — mutes are private AppView state and aren't wired up here yet.`,
      );
    }
    const blockMs = Date.parse(blockRecord.value.createdAt);

    const yourPosts = yourRecords.filter((r) => r.value.$type === "app.bsky.feed.post");
    if (!yourPosts.length) throw new Error(`@${yourHandle} has no posts on file to build a profile from.`);

    setStatus(`downloading @${targetHandle}'s repo ...`);
    const targetPds = await resolvePds(targetDid);
    if (!targetPds) throw new Error(`couldn't find @${targetHandle}'s PDS`);
    const { records: targetRecords } = await fetchRepoRecordsWithKeys(
      targetPds, targetDid,
      ["app.bsky.feed.post", "app.bsky.feed.like", "app.bsky.feed.repost"],
      (m) => setStatus(m),
    );

    setStatus("");

    const targetPosts = targetRecords.filter((r) => r.value.$type === "app.bsky.feed.post");
    const windowPick = pickWindow(targetPosts, blockMs);
    const targetScored = classify(windowPick.posts);
    const yourScored = classify(yourPosts);

    const yourToTarget = interactionsBetween(yourRecords, targetDid, blockMs);
    const targetToYou = interactionsBetween(targetRecords, yourDid, blockMs);

    const yourPostsByUri = new Map(yourPosts.map((p) => [p.uri, p]));
    const targetPostsByUri = new Map(targetPosts.map((p) => [p.uri, p]));
    const yourToTargetRecent = recentInteractionItems(yourToTarget, targetPostsByUri);
    const targetToYouRecent = recentInteractionItems(targetToYou, yourPostsByUri);

    const targetTop = targetScored[0];
    const targetSecond = targetScored[1];
    const yourTop = yourScored[0];

    // esc() here because the write-up is rendered via innerHTML (for the
    // <b> emphasis around category names) — handles are validated by
    // resolveHandle before this point so they can't carry markup, but
    // escaping the interpolated strings anyway costs nothing.
    const ctx = {
      yourHandle: esc(yourHandle), targetHandle: esc(targetHandle),
      windowLabel: windowPick.label,
      targetTop: targetTop?.label,
      targetSecond: targetSecond?.label,
      targetTopCount: targetTop?.count,
      targetTotal: windowPick.posts.length,
      yourTop: yourTop?.label || "no clear obsession (a rare balanced diet)",
    };

    const seed = hashStr(blockRecord.uri + targetDid);
    const writeup = targetTop ? TEMPLATES[seed % TEMPLATES.length](ctx) : noSignalWriteup(ctx);
    const confidence = targetTop ? confidenceFor(targetTop.ratio, ctx.targetTotal) : confidenceFor(0, 1);
    const quote = targetTop?.examples?.[0];
    const interactionWriteup = interactionAddendum(yourToTarget, targetToYou, ctx.yourHandle, ctx.targetHandle);
    const latestContactWriteup = latestContactMeaning(yourToTarget, targetToYou, yourPostsByUri, targetPostsByUri, ctx.yourHandle, ctx.targetHandle);

    lastResult = {
      yourHandle, targetHandle, yourProfile, targetProfile,
      blockRecord, blockMs, windowPick, targetScored, yourScored, writeup, confidence, quote,
      yourToTarget, targetToYou, interactionWriteup, latestContactWriteup,
      yourToTargetRecent, targetToYouRecent,
      yourPostsTotal: yourPosts.length,
    };
    render(lastResult);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    els.go.disabled = false;
  }
}

function bskyPostLink(uri) {
  const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

function fmtDate(ms) {
  if (!Number.isFinite(ms)) return "unknown date";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function renderChecklist(scored, total, targetElId) {
  const el = document.getElementById(targetElId);
  el.innerHTML = "";
  scored.slice(0, 5).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = `${s.label} — ${fmtCount(s.count, total)} posts scanned`;
    el.appendChild(li);
  });
  if (!scored.length) {
    const li = document.createElement("li");
    li.textContent = "nothing scored — genuinely unremarkable posting.";
    el.appendChild(li);
  }
}

const KIND_VERB = { like: "liked", repost: "reposted", reply: "replied to" };

function renderRecentItems(items, dirLabel, targetElId) {
  const el = document.getElementById(targetElId);
  el.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "recent-dir";
  heading.textContent = dirLabel;
  el.appendChild(heading);

  if (!items.length) {
    const div = document.createElement("div");
    div.className = "recent-empty";
    div.textContent = "nothing on record.";
    el.appendChild(div);
    return;
  }

  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "recent-item";

    const meta = document.createElement("div");
    meta.className = "recent-meta";
    meta.textContent = `${KIND_VERB[it.kind]} · ${fmtDate(Date.parse(it.createdAt))}`;
    if (it.categories.length) {
      const tag = document.createElement("span");
      tag.className = "recent-tag";
      tag.textContent = it.categories[0];
      meta.appendChild(tag);
    }
    div.appendChild(meta);

    const body = document.createElement("div");
    body.className = "recent-text";
    body.textContent = it.text ? "“" + it.text + "”" : "(original post no longer on record)";
    div.appendChild(body);

    if (it.text && it.postUri) {
      const a = document.createElement("a");
      a.href = it.postUri;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "recent-link";
      a.textContent = "view →";
      div.appendChild(a);
    }
    el.appendChild(div);
  });
}

function render(r) {
  document.getElementById("caseNum").textContent = "Case No. AM-" + (hashStr(r.blockRecord.uri) % 90000 + 10000);
  document.getElementById("caseDate").textContent = "Filed " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  document.getElementById("subjectHandle").textContent = "@" + (r.targetProfile?.handle || r.targetHandle);
  document.getElementById("subjectAvatar").src = r.targetProfile?.avatar || "";
  document.getElementById("subjectAvatar").style.visibility = r.targetProfile?.avatar ? "visible" : "hidden";
  document.getElementById("filedByHandle").textContent = "@" + (r.yourProfile?.handle || r.yourHandle);

  document.getElementById("blockDate").textContent = fmtDate(r.blockMs);
  document.getElementById("confidenceFill").style.width = r.confidence + "%";
  document.getElementById("confidenceLabel").textContent = r.confidence + "% confidence";

  document.getElementById("writeup").innerHTML = r.writeup;

  const quoteBlock = document.getElementById("quoteBlock");
  if (r.quote) {
    document.getElementById("quoteText").textContent = "“" + r.quote.text + "”";
    const link = document.getElementById("quoteLink");
    link.href = bskyPostLink(r.quote.uri);
    link.textContent = fmtDate(Date.parse(r.quote.createdAt));
    quoteBlock.style.display = "";
  } else {
    quoteBlock.style.display = "none";
  }

  renderChecklist(r.targetScored, r.windowPick.posts.length, "targetChecklist");
  renderChecklist(r.yourScored, r.yourPostsTotal, "yourChecklist");

  document.getElementById("interactionWriteup").textContent = r.interactionWriteup;
  const interactionLog = document.getElementById("interactionLog");
  interactionLog.innerHTML = "";
  [
    interactionLine(`@${r.yourHandle} → @${r.targetHandle}`, r.yourToTarget),
    interactionLine(`@${r.targetHandle} → @${r.yourHandle}`, r.targetToYou),
  ].forEach((text) => {
    const div = document.createElement("div");
    div.textContent = text;
    interactionLog.appendChild(div);
  });

  const latestContactEl = document.getElementById("latestContact");
  if (r.latestContactWriteup) {
    latestContactEl.innerHTML = r.latestContactWriteup;
    latestContactEl.style.display = "";
  } else {
    latestContactEl.style.display = "none";
  }

  renderRecentItems(r.yourToTargetRecent, `@${r.yourHandle} → @${r.targetHandle}`, "recentYourToTarget");
  renderRecentItems(r.targetToYouRecent, `@${r.targetHandle} → @${r.yourHandle}`, "recentTargetToYou");

  els.card.classList.add("show");

  const shareText =
    `filed a case file on why I blocked @${r.targetHandle} ` +
    `(${r.confidence}% confidence, per a keyword-matching robot, not real psychology) ` +
    `\n\naidememoire.bisks.net`;
  lastShareText = shareText;
  document.getElementById("shareBluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  buildShareCard(r);
}

// --- share card canvas --------------------------------------------------------

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
      lines++;
      if (maxLines && lines >= maxLines - 1) { line += "…"; break; }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function buildShareCard(r) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const avatar = await loadImg(r.targetProfile?.avatar);

  ctx.fillStyle = "#f2eee2";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#b5ac8f";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = `800 28px ${mono}`;
  ctx.fillText("AIDE MEMOIRE — CASE FILE", 64, 92);
  ctx.fillStyle = "#6b6250";
  ctx.font = `400 16px ${mono}`;
  ctx.fillText("Dept. of Retroactive Boundary Enforcement · aidememoire.bisks.net", 64, 118);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 138);
  ctx.lineTo(W - 64, 138);
  ctx.stroke();

  let textX = 64;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(92, 192, 32, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 60, 160, 64, 64);
    ctx.restore();
    textX = 140;
  }
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("Subject: @" + (r.targetProfile?.handle || r.targetHandle), textX, 186);
  ctx.fillStyle = "#6b6250";
  ctx.font = `400 16px ${mono}`;
  ctx.fillText("Filed by @" + (r.yourProfile?.handle || r.yourHandle) + " · blocked " + fmtDate(r.blockMs), textX, 210);

  ctx.fillStyle = "#a3392f";
  ctx.font = `800 22px ${mono}`;
  ctx.fillText("CONFIDENCE: " + r.confidence + "%", 64, 258);

  ctx.fillStyle = "#6b6250";
  ctx.font = `400 14px ${mono}`;
  ctx.fillText(
    `ENGAGEMENT: you→them ${r.yourToTarget.total}x · them→you ${r.targetToYou.total}x`,
    64, 282,
  );

  ctx.fillStyle = "#1a1a1a";
  ctx.font = `400 20px ${mono}`;
  const plain = r.writeup.replace(/<\/?b>/g, "");
  wrapCanvasText(ctx, plain, 64, 320, W - 128, 30, 7);

  ctx.strokeStyle = "#b5ac8f";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(64, H - 90);
  ctx.lineTo(W - 64, H - 90);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#6b6250";
  ctx.font = `italic 16px ${mono}`;
  ctx.fillText("not real psychology — a keyword-matching robot wrote this", 64, H - 60);
  ctx.fillStyle = "#a3392f";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("aidememoire.bisks.net", 64, H - 32);
}

document.getElementById("shareDownload").addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (lastResult?.targetHandle || "case").replace(/[^a-z0-9.-]/gi, "_");
    a.download = "aidememoire-" + who + ".png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
if (canShareFiles()) {
  const btn = document.getElementById("shareNative");
  btn.style.display = "";
  btn.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const who = (lastResult?.targetHandle || "case").replace(/[^a-z0-9.-]/gi, "_");
      const file = new File([blob], "aidememoire-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "aidememoire" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

// --- boot -----------------------------------------------------------------

document.getElementById("ceeHook")?.addEventListener("click", () => {
  const input = els.yourInput;
  if (!input) return;
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

if (window.attachHandleTypeahead) {
  window.attachHandleTypeahead(els.yourInput);
  window.attachHandleTypeahead(els.targetInput);
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.yourInput.value, els.targetInput.value);
});
