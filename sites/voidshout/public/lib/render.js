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
  };
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
  return `
    <article class="void-card" data-uri="${esc(n.uri)}">
      <div class="void-card-top">
        <span class="who mono">${esc(n.homeName)} ${kindLabel} at ${esc(n.place?.emoji || "❔")} ${esc(n.place?.name || "Elsewhere")}</span>
        <span class="spacer"></span>
        ${hiddenTag}${demoTag}
      </div>
      ${body}
      <div class="void-card-bottom">
        <a class="perma mono" href="/shout/?uri=${encodeURIComponent(n.rootUri || n.uri)}${n.uri !== (n.rootUri || n.uri) ? "&node=" + encodeURIComponent(n.uri) : ""}">view thread →</a>
        <span class="score mono ${scoreClass}">${n.score > 0 ? "+" : ""}${n.score}</span>
        <span class="when muted mono">${esc(timeAgo(n.createdAt))}</span>
      </div>
    </article>`;
}

export const CARD_STYLE = `
  .void-card { background: var(--panel); border: 1px solid var(--faint); border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.7rem; }
  .void-card-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.78rem; }
  .void-card-top .spacer { flex: 1 1 auto; }
  .void-card .body { margin: 0.2rem 0 0.55rem; line-height: 1.5; }
  .void-card-bottom { display: flex; align-items: center; gap: 0.75rem; font-size: 0.76rem; }
  .void-card-bottom .score { padding: 0.1rem 0.4rem; border-radius: 6px; border: 1px solid var(--faint); }
  .void-card-bottom .score.up { color: var(--good); border-color: var(--good); }
  .void-card-bottom .score.down { color: var(--bad); border-color: var(--bad); }
`;
