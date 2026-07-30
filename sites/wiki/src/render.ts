// Shared page chrome for every dynamically-rendered article. Kept as plain
// string templates — no framework, this is one small Worker.

export const MOUNT = "";
export const SITE_URL = "https://wiki.bisks.net" + MOUNT;

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtDate(iso?: string): string {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function fmtNum(n?: number): string {
  if (n === undefined || n === null) return "0";
  return n.toLocaleString("en-US");
}

export interface InfoRow {
  label: string;
  html: string;
}

export function infobox(opts: {
  title: string;
  image?: string;
  imageAlt?: string;
  rows: InfoRow[];
}): string {
  const img = opts.image
    ? `<img src="${esc(opts.image)}" alt="${esc(opts.imageAlt || opts.title)}" loading="lazy" />`
    : `<div class="infobox-noimg">no image</div>`;
  const rows = opts.rows
    .map((r) => `<tr><th>${esc(r.label)}</th><td>${r.html}</td></tr>`)
    .join("");
  return `
  <aside class="infobox">
    <div class="infobox-title">${esc(opts.title)}</div>
    <div class="infobox-image">${img}</div>
    <table>${rows}</table>
  </aside>`;
}

export function categoriesBar(cats: string[]): string {
  if (!cats.length) return "";
  const items = cats
    .map((c) => `<span class="cat">${esc(c)}</span>`)
    .join(" · ");
  return `<div class="categories"><b>Categories:</b> ${items}</div>`;
}

export function page(opts: {
  title: string;
  namespace: string; // "Poster" | "Post" | "Feed"
  description: string;
  canonicalPath: string; // e.g. /poster/handle
  bodyHtml: string;
  ogImage?: string;
}): string {
  const fullTitle = `${opts.namespace}:${opts.title}`;
  const url = SITE_URL + opts.canonicalPath;
  const shareText = `${fullTitle} — ${url}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(fullTitle)} — bisksipedia</title>
<meta name="description" content="${esc(opts.description)}" />
<link rel="canonical" href="${url}" />
<link rel="stylesheet" href="${MOUNT}/style.css" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="bisksipedia" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(fullTitle)}" />
<meta property="og:description" content="${esc(opts.description)}" />
${opts.ogImage ? `<meta property="og:image" content="${esc(opts.ogImage)}" />` : ""}
<meta name="twitter:card" content="${opts.ogImage ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${esc(fullTitle)}" />
<meta name="twitter:description" content="${esc(opts.description)}" />
</head>
<body>
<div class="wiki-wrap">
  <header class="wiki-header">
    <a class="wordmark" href="${MOUNT}/">bisksipedia</a>
    <form class="searchbox" action="${MOUNT}/go" method="get">
      <input type="text" name="q" placeholder="a handle, a did, or a post URL" autocomplete="off" />
      <button type="submit">Go</button>
    </form>
  </header>
  <nav class="wiki-crumb"><a href="${MOUNT}/">bisksipedia</a> &rsaquo; ${esc(opts.namespace)} &rsaquo; ${esc(opts.title)}</nav>
  <h1 class="article-title">${esc(fullTitle)}</h1>
  <div class="article-body">
    ${opts.bodyHtml}
  </div>
  <div class="share-row">
    <a class="share-link" href="https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Share this entry on Bluesky</a>
    <a class="share-link" href="${MOUNT}/">&larr; back to bisksipedia</a>
  </div>
  <footer class="wiki-footer">
    Auto-rendered from Bluesky's public AppView at request time. Not affiliated
    with Wikipedia or the Wikimedia Foundation — a loving parody, one of many
    tiny <a href="https://bisks.net">bisks.net</a> experiments, built by
    <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis</a>.
  </footer>
</div>
</body>
</html>`;
}

export function noArticlePage(namespace: string, title: string, reason: string): Response {
  const body = `
    <h1 class="article-title">${esc(namespace)}:${esc(title)}</h1>
    <div class="redlink-box">
      <p>Bisksipedia does not currently have an article at this exact title.</p>
      <p class="dim">${esc(reason)}</p>
    </div>
    <div class="share-row">
      <a class="share-link" href="${MOUNT}/">&larr; back to bisksipedia</a>
    </div>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(namespace)}:${esc(title)} does not exist — bisksipedia</title>
<link rel="stylesheet" href="${MOUNT}/style.css" /></head>
<body><div class="wiki-wrap">
<header class="wiki-header"><a class="wordmark" href="${MOUNT}/">bisksipedia</a></header>
${body}
</div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
