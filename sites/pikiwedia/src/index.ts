// pikiwedia Worker — pikiwedia.bisks.net
//
// @heartpunk.com built sites/spoonerism earlier (a 60-word bank, every pair
// spoonerized) and now asked for the natural next step: run the same swap
// over *real* Wikipedia articles, dressed up as a mobile Wikipedia parody
// ("Pikiwedia, the lee enfryclodepia" — spoonerized "Wikipedia, the free
// encyclopedia"). /wiki/<title> fetches the real lead section (+ first
// section, if it fits) from Wikipedia's public action API server-side,
// spoonerizes it paragraph-by-paragraph, and renders it inside a small
// Minerva-mobile-skin pastiche. /random and /search/<q> are thin redirects
// to a resolved /wiki/<title> so the buttons work even before app.js loads.
//
// The swap algorithm (splitOnset / spoonerize) is a deliberate copy of
// sites/spoonerism/src/index.ts's — and public/app.js below carries its own
// copy again for the client-side live-text toy. Same reasoning as
// didscope/spoonerism's src: server-side duplication of client logic within
// ONE site, not a shared package across sites.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "pikiwedia.bisks.net (atprotozoa build bot; contact via bisks.net)";
const API = "https://en.wikipedia.org/w/api.php";
const MAX_CHARS = 3200; // keep the parsed article body bounded — see notes/40 "keep it self-contained"-ish spirit: a small page, not a scrape mirror

// ---- spoonerism engine -----------------------------------------------
//
// Early version paired *every* adjacent word, stopwords included — tested
// against a real Sandwich extract it produced unreadable soup ("Sa andwich
// is a typish dically vonsisting..."). The brief's own inspo image is much
// more restrained: "the ham sandwich" -> "the sam handwich" leaves "the" and
// "is a common type of" alone and only swaps the meaty nouns. So: small
// words (a/the/is/of/...) pass through untouched and aren't part of the
// pairing at all; only "content" words pair up. A content word with no
// neighbor to pair with (a one-word title like "Sandwich", or an odd word
// left over at the end of a run) gets spoonerized against *itself* — split
// near its middle syllable boundary and swap the two halves' onsets. That
// same self-split is what turns "Wikipedia" into "Pikiwedia" (wiki|pedia -> w/p swap).

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","of","in","on","at","to","for","with","by",
  "from","as","or","and","but","that","this","these","those","it","its","his","her","their","our","your",
  "my","i","you","he","she","we","they","may","can","could","will","would","shall","should","has","have",
  "had","not","no","nor","than","then","so","such","also","which","who","whom","whose","into","onto","upon",
  "about","over","under","between","among","through","during","before","after","above","below","up","down",
  "out","off","again","further","once","here","there","when","where","why","how","all","each","few","more",
  "most","other","some","any","both","either","neither","one","two","if","because","while","do","does","did",
  "done","per","via","vs",
]);

function splitOnset(word: string): [string, string] {
  const m = word.match(/^[^aeiouAEIOU]+/);
  const onset = m ? m[0] : "";
  return [onset, word.slice(onset.length)];
}

function spoonerizePair(a: string, b: string): [string, string] {
  const [oa, ra] = splitOnset(a);
  const [ob, rb] = splitOnset(b);
  return [ob + ra, oa + rb];
}

// Splits a lone word into two "syllable-ish" halves near its middle, at a
// vowel->consonant boundary (the shape "wiki|pedia" has), and spoonerizes
// the halves against each other — so a standalone word (a one-word title,
// an odd word left over at the end of a run) can still get the joke. Only
// accepts a split where both halves keep a short (<=2 letter) onset and a
// non-empty remainder — otherwise it produces an ugly, unpronounceable
// cluster (tried on "sandwich": the only two vowel-boundary candidates give
// "ndwasich" or "chandwis") and it's better to leave the word alone than
// force a bad split. Returns null when no candidate is good enough.
function selfSpoonerize(word: string): string | null {
  if (word.length < 4) return null;
  const isVowel = (c: string) => "aeiouAEIOU".includes(c);
  const candidates: number[] = [];
  for (let i = 1; i < word.length; i++) {
    if (isVowel(word[i - 1]) && !isVowel(word[i])) candidates.push(i);
  }
  const mid = word.length / 2;
  candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (const split of candidates) {
    const h1 = word.slice(0, split);
    const h2 = word.slice(split);
    const [o1, r1] = splitOnset(h1);
    const [o2, r2] = splitOnset(h2);
    if (o1.length <= 2 && o2.length <= 2 && r1.length > 0 && r2.length > 0) {
      const [s1, s2] = spoonerizePair(h1, h2);
      return s1 + s2;
    }
  }
  return null;
}

function matchCase(orig: string, transformed: string): string {
  if (!orig) return transformed;
  if (orig.length > 1 && orig === orig.toUpperCase() && /[A-Z]/.test(orig)) {
    return transformed.toUpperCase();
  }
  if (orig[0] >= "A" && orig[0] <= "Z") {
    return transformed.charAt(0).toUpperCase() + transformed.slice(1);
  }
  return transformed;
}

// Spoonerizes one block of running text: tokenizes into word / non-word
// runs, then pairs up consecutive *content* words (stopwords are skipped
// entirely — they stay put and don't consume a pairing slot), swaps each
// pair's onset, and self-splits any content word left without a partner.
// Pairing restarts fresh for every call, so callers pass one
// paragraph/heading/title at a time.
function spoonerizeText(text: string): string {
  const tokens = text.match(/[A-Za-z]+|[^A-Za-z]+/g) || [];
  const contentIdx: number[] = [];
  tokens.forEach((t, i) => {
    if (/^[A-Za-z]/.test(t) && !STOPWORDS.has(t.toLowerCase())) contentIdx.push(i);
  });
  for (let k = 0; k + 1 < contentIdx.length; k += 2) {
    const i = contentIdx[k];
    const j = contentIdx[k + 1];
    const [sa, sb] = spoonerizePair(tokens[i].toLowerCase(), tokens[j].toLowerCase());
    tokens[i] = matchCase(tokens[i], sa);
    tokens[j] = matchCase(tokens[j], sb);
  }
  if (contentIdx.length % 2 === 1) {
    const last = contentIdx[contentIdx.length - 1];
    const self = selfSpoonerize(tokens[last].toLowerCase());
    if (self) tokens[last] = matchCase(tokens[last], self);
  }
  return tokens.join("");
}

function titleCaseFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---- Wikipedia fetches -------------------------------------------------

async function wikiQuery(params: Record<string, string>): Promise<any> {
  const url = new URL(API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { "user-agent": UA },
    cf: { cacheTtl: 1800, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`wikipedia api ${res.status}`);
  return res.json();
}

async function fetchExtract(title: string): Promise<{ title: string; extract: string; missing: boolean; pageUrl: string }> {
  const data = await wikiQuery({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) {
    return { title, extract: "", missing: true, pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  }
  return {
    title: page.title,
    extract: page.extract || "",
    missing: false,
    pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  };
}

async function fetchRandomTitle(): Promise<string> {
  const data = await wikiQuery({ action: "query", list: "random", rnnamespace: "0", rnlimit: "1" });
  return data?.query?.random?.[0]?.title || "Sandwich";
}

async function fetchBestMatch(q: string): Promise<string | null> {
  const data = await wikiQuery({ action: "query", list: "search", srsearch: q, srlimit: "1" });
  return data?.query?.search?.[0]?.title || null;
}

// ---- rendering -----------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Parses a bounded prefix of an explaintext extract into paragraph/heading
// blocks. MediaWiki's plaintext extracts mark section headings as their own
// line wrapped in "== ... ==" (more "="s for deeper levels) — everything
// else is a paragraph, blank lines separate them.
function parseBlocks(extract: string, maxChars: number): { type: "p" | "h2"; text: string }[] {
  const blocks: { type: "p" | "h2"; text: string }[] = [];
  let used = 0;
  const lines = extract.split(/\n+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(=+)\s*(.+?)\s*\1$/);
    const type: "p" | "h2" = h ? "h2" : "p";
    const text = h ? h[2] : line;
    if (used + text.length > maxChars && blocks.length > 0) break;
    blocks.push({ type, text });
    used += text.length;
    if (used > maxChars) break;
  }
  return blocks;
}

function pageShell(head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.svg">
${head}
</head>
<body>
${body}
<script src="/app.js" type="module"></script>
</body>
</html>`;
}

function header(): string {
  return `<header class="chrome">
  <button class="hamburger" aria-label="Menu" type="button">&#9776;</button>
  <a class="wordmark" href="/">Pikiwedia</a>
  <form class="chrome-search" action="/search" method="get">
    <input type="search" name="q" placeholder="Search Pikiwedia" aria-label="Search Pikiwedia" autocomplete="off">
  </form>
</header>`;
}

function footer(): string {
  return `<footer class="site-footer">
  <p>Pikiwedia spoonerizes real Wikipedia ledes, one adjacent word-pair at a time. Not affiliated with the Wikimedia Foundation, obviously.</p>
  <p><a href="/random">Random article</a> · <a href="https://bisks.net/">bisks.net</a></p>
</footer>`;
}

function renderArticle(orig: { title: string; extract: string; missing: boolean; pageUrl: string }): string {
  const spoonTitle = titleCaseFirst(spoonerizeText(orig.title));
  const canonicalUrl = `https://pikiwedia.bisks.net/wiki/${encodeURIComponent(orig.title.replace(/ /g, "_"))}`;

  if (orig.missing) {
    const body = `${header()}
<main class="wiki-wrap">
  <div class="redlink-box">
    <h1 class="article-title">${esc(titleCaseFirst(spoonerizeText(orig.title)))}</h1>
    <p>Pikiwedia does not yet have a spoonerized article with this exact title. You can <a href="/search?q=${encodeURIComponent(orig.title)}">search for it</a> or try a <a href="/random">random article</a> instead.</p>
  </div>
</main>
${footer()}`;
    const head = `<title>${esc(spoonTitle)} — Pikiwedia</title>
<meta name="description" content="Pikiwedia doesn't have this one yet.">`;
    return pageShell(head, body);
  }

  const blocks = parseBlocks(orig.extract, MAX_CHARS);
  const bodyHtml = blocks
    .map((b) => {
      const s = spoonerizeText(b.text);
      return b.type === "h2" ? `<h2>${esc(s)}</h2>` : `<p>${esc(s)}</p>`;
    })
    .join("\n");

  const hatnote = spoonerizeText(`For other uses, see ${orig.title} (disambiguation).`);
  const firstPara = blocks.find((b) => b.type === "p");
  const descRaw = firstPara ? spoonerizeText(firstPara.text) : `The Pikiwedia entry for ${spoonTitle}.`;
  const desc = descRaw.length > 260 ? descRaw.slice(0, 259).trimEnd() + "…" : descRaw;
  const titleChanged = spoonTitle.toLowerCase() !== orig.title.toLowerCase();
  const shareText = titleChanged
    ? `Pikiwedia says the article on ${orig.title} is actually about "${spoonTitle}" — ${canonicalUrl}`
    : `Pikiwedia's spoonerized take on ${orig.title}: ${desc} ${canonicalUrl}`;

  const body = `${header()}
<main class="wiki-wrap">
  <p class="wiki-crumb"><a href="/">Pikiwedia</a></p>
  <p class="hatnote">${esc(hatnote)}</p>
  <h1 class="article-title">${esc(spoonTitle)}</h1>
  <nav class="page-tabs">
    <span class="tab active">Tarticle</span>
    <span class="tab">Alk</span>
    <span class="tab">Loots</span>
  </nav>
  <div class="article-body">
${bodyHtml}
  </div>
  <p class="attribution">Based on the real <a href="${esc(orig.pageUrl)}" rel="noopener">Wikipedia article on ${esc(orig.title)}</a>, text spoonerized word-pair by word-pair, ${esc(String(blocks.length))} block(s) shown.</p>
  <p class="share-row">
    <a class="share-link" id="share-bsky" href="#" target="_blank" rel="noopener">Share to Bluesky</a>
    <a class="share-link" href="/random">Random article</a>
  </p>
</main>
${footer()}`;

  const head = `<title>${esc(spoonTitle)} — Pikiwedia</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(spoonTitle)} — Pikiwedia">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://pikiwedia.bisks.net/og.png">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(spoonTitle)} — Pikiwedia">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="https://pikiwedia.bisks.net/og.png">
<meta name="pikiwedia:share-text" content="${esc(shareText.length > 300 ? shareText.slice(0, 296).trimEnd() + `… ${canonicalUrl}` : shareText)}">`;

  return pageShell(head, body);
}

async function handleWiki(rawTitle: string): Promise<Response> {
  const title = decodeURIComponent(rawTitle.replace(/_/g, " ")).trim();
  if (!title) return Response.redirect("https://pikiwedia.bisks.net/", 302);
  try {
    const page = await fetchExtract(title);
    const html = renderArticle(page);
    return new Response(html, {
      status: page.missing ? 404 : 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" },
    });
  } catch (e) {
    return new Response(`Pikiwedia hit a snag talking to Wikipedia: ${esc(String((e as Error)?.message || e))}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    const wikiMatch = url.pathname.match(/^\/wiki\/(.+)$/);
    if (wikiMatch) return handleWiki(wikiMatch[1]);

    if (url.pathname === "/random") {
      try {
        const title = await fetchRandomTitle();
        return Response.redirect(`https://pikiwedia.bisks.net/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, 302);
      } catch (e) {
        return new Response("couldn't reach Wikipedia for a random title, try again", { status: 502 });
      }
    }

    if (url.pathname === "/search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return Response.redirect("https://pikiwedia.bisks.net/", 302);
      try {
        const best = await fetchBestMatch(q);
        if (best) {
          return Response.redirect(`https://pikiwedia.bisks.net/wiki/${encodeURIComponent(best.replace(/ /g, "_"))}`, 302);
        }
        return Response.redirect(`https://pikiwedia.bisks.net/wiki/${encodeURIComponent(q.replace(/ /g, "_"))}`, 302);
      } catch (e) {
        return new Response("couldn't reach Wikipedia to search, try again", { status: 502 });
      }
    }

    return _env.ASSETS.fetch(request);
  },
};
