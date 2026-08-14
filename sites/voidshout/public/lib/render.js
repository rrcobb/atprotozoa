// render.js — small HTML-string builders shared by index/place/shout/map,
// so a shout/echo/murmur card looks identical everywhere. Takes plain data
// (no store/network calls) so it works the same for live nodes (feed.js)
// and demo.json fixtures.

import { COLLECTIONS } from "./voidlogic.mjs";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function timeAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const s = ms / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/** Flattens a feed.js/demo.js tree node (`{uri, rec:{collection,did,value}, score, hidden, homeName?}`)
 *  into the flat shape cardHtml() renders. `homeName` is resolved by the caller
 *  (feed.js nodes don't carry one; demo.js nodes already do). */
export function nodeToCard(node, rootUri, homeName) {
  return {
    uri: node.uri,
    rootUri,
    collection: node.rec.collection,
    homeName: homeName ?? node.homeName ?? node.rec.did,
    place: node.rec.value.place,
    text: node.rec.value.text,
    createdAt: node.rec.value.createdAt,
    score: node.score,
    hidden: node.hidden,
    isDemo: !!node.isDemo,
    sourcePostUri: node.rec.value.sourcePostUri || null,
    canonicalPost: node.canonicalPost || null,
  };
}

/** Renders a hydrated app.bsky.feed.post (see lib/bskypost.js) inline under a
 *  Shout that carries sourcePostUri — the CAR-import provenance link. `post`
 *  is the raw getPosts() result; `null` means "carries sourcePostUri but the
 *  canonical post wasn't resolved (deleted upstream, or not yet fetched)". */
export function canonPostHtml(post) {
  if (!post) return "";
  const author = post.author || {};
  const record = post.record || {};
  const images = post.embed?.images || post.embed?.media?.images || [];
  const imgsHtml = images
    .slice(0, 4)
    .map((im) => `<img src="${esc(im.thumb)}" alt="${esc(im.alt || "")}" loading="lazy" />`)
    .join("");
  return `
    <a class="canon-post" href="https://bsky.app/profile/${esc(author.did || author.handle || "")}/post/${esc((post.uri || "").split("/").pop())}" target="_blank" rel="noopener">
      <div class="canon-post-head">
        ${author.avatar ? `<img class="canon-avatar" src="${esc(author.avatar)}" alt="" />` : ""}
        <span class="canon-handle mono">@${esc(author.handle || "unknown")}</span>
        <span class="badge">imported from bsky</span>
      </div>
      ${record.text ? `<p class="canon-text">${esc(record.text)}</p>` : ""}
      ${imgsHtml ? `<div class="canon-imgs">${imgsHtml}</div>` : ""}
    </a>`;
}

/**
 * @param {{uri:string, collection:string, homeName:string, place:object, text?:string, createdAt:string, score:number, hidden:boolean, isDemo?:boolean}} n
 */
export function cardHtml(n) {
  const kindLabel =
    n.collection === COLLECTIONS.shout ? "shouted" : n.collection === COLLECTIONS.echo ? "echoed" : "murmured";
  const body =
    n.collection === COLLECTIONS.murmur
      ? `<p class="body">${esc(n.text)}</p>`
      : n.collection === COLLECTIONS.shout
        ? `<p class="body">${esc(n.text)}</p>`
        : "";
  const hiddenTag = n.hidden ? `<span class="badge hidden">hidden · score ≤ -5</span>` : "";
  const demoTag = n.isDemo ? `<span class="badge demo">demo</span>` : "";
  const scoreClass = n.score > 0 ? "up" : n.score < 0 ? "down" : "";
  const canon = n.sourcePostUri
    ? n.canonicalPost
      ? canonPostHtml(n.canonicalPost)
      : `<p class="muted mono" style="font-size:0.72rem">🔗 imported from a bsky post (unresolved)</p>`
    : "";
  return `
    <article class="void-card" data-uri="${esc(n.uri)}">
      <div class="void-card-top">
        <span class="who mono">${esc(n.homeName)} ${kindLabel} at ${esc(n.place?.emoji || "❔")} ${esc(n.place?.name || "Elsewhere")}</span>
        <span class="spacer"></span>
        ${hiddenTag}${demoTag}
      </div>
      ${body}
      ${canon}
      <div class="void-card-bottom">
        <a class="perma mono" href="/shout/?uri=${encodeURIComponent(n.rootUri || n.uri)}${n.uri !== (n.rootUri || n.uri) ? "&node=" + encodeURIComponent(n.uri) : ""}">view thread →</a>
        <span class="score mono ${scoreClass}">${n.score > 0 ? "+" : ""}${n.score}</span>
        <span class="when muted mono">${esc(timeAgo(n.createdAt))}</span>
      </div>
    </article>`;
}

export const CARD_STYLE = `
  .void-card { background: var(--panel); border: 1px solid var(--faint); border-radius: 0; border-width: 0 0 1px; padding: 0.9rem 0.1rem; margin-bottom: 0; transition: background-color 0.1s; }
  .void-card:hover { background: var(--void-bg2); }
  .void-card-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.78rem; }
  .void-card-top .spacer { flex: 1 1 auto; }
  .void-card .body { margin: 0.2rem 0 0.55rem; line-height: 1.5; }
  .void-card-bottom { display: flex; align-items: center; gap: 0.75rem; font-size: 0.76rem; }
  .void-card-bottom .score { padding: 0.1rem 0.4rem; border-radius: 999px; border: 1px solid var(--faint); }
  .void-card-bottom .score.up { color: var(--good); border-color: var(--good); }
  .void-card-bottom .score.down { color: var(--bad); border-color: var(--bad); }
  .canon-post { display: block; text-decoration: none; color: inherit; background: var(--void-bg); border: 1px solid var(--faint); border-radius: 12px; padding: 0.55rem 0.65rem; margin: 0.3rem 0 0.6rem; }
  .canon-post:hover { border-color: var(--accent2); background: var(--void-bg); }
  .canon-post-head { display: flex; align-items: center; gap: 0.4rem; font-size: 0.74rem; margin-bottom: 0.3rem; }
  .canon-avatar { width: 18px; height: 18px; border-radius: 50%; }
  .canon-handle { color: var(--muted); }
  .canon-text { margin: 0 0 0.4rem; font-size: 0.86rem; line-height: 1.45; }
  .canon-imgs { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 0.3rem; }
  .canon-imgs img { width: 100%; border-radius: 6px; display: block; }
`;
