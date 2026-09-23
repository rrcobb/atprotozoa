// spoonternet Worker — spoonternet.bisks.net
//
// Reply-thread request from @cee.wtf on the pikiwedia build: "do this but make
// it proxy any website through the algo." Pikiwedia points the spoonerize
// swap at Wikipedia specifically; spoonternet points it at whatever URL you
// paste — /go?u=<url> fetches that page server-side and streams it back
// through HTMLRewriter with every content word swapped and a <base> tag so
// relative assets still resolve. Links on a proxied page point straight at
// the real target site, not back through the proxy — paste the URL bar
// again if you want to keep spoonerizing where you land.
//
// The swap algorithm (splitOnset / spoonerizePair / selfSpoonerize /
// spoonerizeText) is the same deliberate copy carried by sites/spoonerism and
// sites/pikiwedia — see pikiwedia/src/index.ts's header for why it's copied
// rather than shared. public/app.js below carries its own copy again for the
// home page's live-text toy, same reasoning.
//
// Because this fetches arbitrary user-supplied URLs and re-serves the result
// under our own origin, two things matter more here than in a normal toy:
//  - SSRF: refuse to fetch loopback/private/link-local hosts (isBlockedHost).
//  - XSS: strip <script>/event-attributes/javascript: hrefs AND, as a
//    backstop in case any of that stripping is imperfect against some HTML
//    parsing edge case, ship the proxied response with a `script-src 'none'`
//    CSP so nothing on a proxied page can execute regardless.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA = "spoonternet.bisks.net (atprotozoa build bot; contact via bisks.net)";
const SELF = "https://spoonternet.bisks.net";

// ---- spoonerism engine (copy of pikiwedia's / spoonerism's) --------------

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

// ---- SSRF guard ------------------------------------------------------------

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 127 || a === 10 || a === 0) return true; // loopback / this-network
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }
  if (/^\[?f[cd][0-9a-f]{2}:/i.test(h) || /^\[?fe80:/i.test(h)) return true; // IPv6 ULA / link-local
  return false;
}

function normalizeUrl(raw: string): URL | null {
  let s = (raw || "").trim();
  if (!s) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || isBlockedHost(u.hostname)) return null;
  return u;
}

function proxyUrlFor(target: string): string {
  return `${SELF}/go?u=${encodeURIComponent(target)}`;
}

// ---- rendering helpers ------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

function errorPage(status: number, message: string): Response {
  const body = `<header class="chrome">
  <a class="wordmark" href="/">🥄 spoonternet</a>
</header>
<main class="wrap">
  <div class="error-box">
    <h1>couldn't do that one</h1>
    <p>${esc(message)}</p>
    <p><a href="/">back to spoonternet</a></p>
  </div>
</main>`;
  const head = `<title>spoonternet — couldn't do that one</title>`;
  return new Response(pageShell(head, body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// ---- proxying ---------------------------------------------------------------

// Shared, mutable per-request state the head/title handlers fill in and the
// body handler reads back — title arrives (and closes) before <body> opens in
// virtually all real-world HTML, so by the time the body handler fires the
// spoonerized title is already populated. Falls back to the hostname if a
// page has no <title>, or on the rare document where body precedes it.
class ProxyState {
  spoonTitle = "";
}

class TitleHandler {
  buffer = "";
  constructor(private state: ProxyState) {}
  text(chunk: { text: string; lastInTextNode: boolean; replace(s: string): void; remove(): void }) {
    this.buffer += chunk.text;
    if (chunk.lastInTextNode) {
      const out = spoonerizeText(this.buffer);
      chunk.replace(out);
      this.state.spoonTitle = out.trim();
      this.buffer = "";
    } else {
      chunk.remove();
    }
  }
}

class MetaContentHandler {
  element(el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) {
    const content = el.getAttribute("content");
    if (content != null) el.setAttribute("content", spoonerizeText(content));
  }
}

class HttpEquivHandler {
  element(el: { getAttribute(n: string): string | null; remove(): void }) {
    const equiv = (el.getAttribute("http-equiv") || "").toLowerCase();
    if (equiv === "refresh" || equiv === "content-security-policy") el.remove();
  }
}

class RemoveHandler {
  element(el: { remove(): void }) {
    el.remove();
  }
}

class EventAttrStripper {
  element(el: { attributes: Iterable<[string, string]>; removeAttribute(n: string): void; getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) {
    const toStrip: string[] = [];
    for (const [name] of el.attributes) {
      if (name.toLowerCase().startsWith("on")) toStrip.push(name);
    }
    for (const name of toStrip) el.removeAttribute(name);
    for (const attr of ["href", "src", "action", "formaction"]) {
      const v = el.getAttribute(attr);
      if (v && /^\s*javascript:/i.test(v)) el.setAttribute(attr, "#");
    }
  }
}

// Resolves relative links against the proxied page's real URL and leaves them
// pointing at the real site, rather than routing back through /go. Previously
// every link stayed inside the proxy, which let crawlers walk the entire
// target site (e.g. ~all of Wikipedia) through this Worker one HTMLRewriter
// pass at a time — see the crawler-gate comment on looksLikeCrawler below for
// the traffic numbers that came from that. Clicking out now leaves
// spoonternet like clicking any other link; paste the new URL back in to keep
// spoonerizing.
class LinkHandler {
  constructor(private base: URL) {}
  element(el: { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void }) {
    const href = el.getAttribute("href");
    if (!href) return;
    if (/^\s*(javascript|data):/i.test(href)) return; // left to EventAttrStripper / untouched
    if (/^\s*(mailto|tel):/i.test(href)) return;
    let resolved: URL;
    try {
      resolved = new URL(href, this.base);
    } catch {
      return;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
    el.setAttribute("href", resolved.toString());
  }
}

class HeadHandler {
  constructor(private base: URL) {}
  element(el: { prepend(s: string, opts: { html: boolean }): void }) {
    el.prepend(
      `<base href="${esc(this.base.toString())}"><meta name="robots" content="noindex, nofollow"><link rel="stylesheet" href="${SELF}/proxy-bar.css">`,
      { html: true },
    );
  }
}

class BodyHandler {
  constructor(private base: URL, private state: ProxyState) {}
  element(el: { prepend(s: string, opts: { html: boolean }): void }) {
    const title = this.state.spoonTitle || this.base.hostname;
    const shareUrl = proxyUrlFor(this.base.toString());
    const shareText = `spoonternet says ${this.base.hostname} is actually about "${title}" — ${shareUrl}`;
    const shareHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(
      shareText.length > 300 ? shareText.slice(0, 296).trimEnd() + "…" : shareText,
    )}`;
    const banner = `<div id="spoonternet-bar">
  <a href="/" id="spoonternet-bar-brand">🥄 spoonternet</a>
  <span id="spoonternet-bar-target">proxying <a href="${esc(this.base.toString())}" rel="noopener" target="_blank">${esc(this.base.hostname)}</a></span>
  <span id="spoonternet-bar-actions"><a href="${esc(shareHref)}" target="_blank" rel="noopener">share</a> · <a href="/">new url</a></span>
</div>`;
    el.prepend(banner, { html: true });
  }
}

class BodyTextSpoonerizer {
  buffer = "";
  text(chunk: { text: string; lastInTextNode: boolean; replace(s: string): void; remove(): void }) {
    this.buffer += chunk.text;
    if (chunk.lastInTextNode) {
      chunk.replace(spoonerizeText(this.buffer));
      this.buffer = "";
    } else {
      chunk.remove();
    }
  }
}

// Spoonerizing is deterministic — the same target URL always produces the same
// page, and nothing in the output depends on who asked (the banner's share link
// is derived from the target, not the request). So a successful proxy render is
// cacheable, keyed on the normalized target alone.
//
// Worth it because the upstream fetch plus the HTMLRewriter pass is the whole
// cost of this Worker: p50 was 46ms against ~0.5ms for a normal site here. A
// hit skips both.
//
// Only 200s are cached. Error pages already carry no-store and are built
// separately, so a 502 from a site being down doesn't get remembered.
const CACHE_TTL = 3600;

function cacheKeyFor(target: URL): Request {
  return new Request(proxyUrlFor(target.toString()), { method: "GET" });
}

async function handleProxy(raw: string, ctx: ExecutionContext): Promise<Response> {
  const target = normalizeUrl(raw);
  if (!target) {
    return errorPage(400, "that doesn't look like a fetchable http(s) URL.");
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const key = cacheKeyFor(target);
  const hit = await cache.match(key);
  if (hit) return hit;

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      cf: { cacheTtl: 120, cacheEverything: false } as unknown as Record<string, unknown>,
    });
  } catch (e) {
    return errorPage(502, `couldn't reach ${target.hostname}: ${String((e as Error)?.message || e)}`);
  }

  const finalUrl = (() => {
    try {
      return new URL(res.url || target.toString());
    } catch {
      return target;
    }
  })();
  if (isBlockedHost(finalUrl.hostname)) {
    return errorPage(400, "that URL redirected somewhere spoonternet won't fetch.");
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("html")) {
    return errorPage(415, `${finalUrl.href} isn't an HTML page (content-type: ${ct || "unknown"}) — spoonternet only spoonerizes web pages, not images/files/APIs.`);
  }

  const state = new ProxyState();
  const rewriter = new HTMLRewriter()
    .on("head", new HeadHandler(finalUrl))
    .on("title", new TitleHandler(state))
    .on('meta[name="description"]', new MetaContentHandler())
    .on('meta[property="og:title"]', new MetaContentHandler())
    .on('meta[property="og:description"]', new MetaContentHandler())
    .on('meta[name="twitter:title"]', new MetaContentHandler())
    .on('meta[name="twitter:description"]', new MetaContentHandler())
    .on("meta[http-equiv]", new HttpEquivHandler())
    .on("script", new RemoveHandler())
    .on("style", new RemoveHandler())
    .on("noscript", new RemoveHandler())
    .on("iframe", new RemoveHandler())
    .on("*", new EventAttrStripper())
    .on("a[href]", new LinkHandler(finalUrl))
    .on("body", new BodyHandler(finalUrl, state))
    .on("body", new BodyTextSpoonerizer());

  const transformed = rewriter.transform(res);
  const out = new Response(transformed.body, {
    status: res.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL}`,
      // Keep proxied pages out of search indexes in the header and the <head>
      // both — they're a live-rendered copy of someone else's content.
      "x-robots-tag": "noindex, nofollow",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "no-referrer",
      // Backstop: even if script-stripping missed something, nothing executes.
      "content-security-policy": "script-src 'none'; object-src 'none';",
    },
  });

  // Only remember successful renders. cache.put streams the body, so hand it a
  // clone and let it finish after the response goes out.
  if (res.status === 200) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

// Crawler gate for /go. Found 2026-09-17 via stats.bisks.net: spoonternet was
// doing ~300k requests/day, 50x the next site, and zone analytics showed it
// was GPTBot (~120k/day), Meta's crawler fleet, Semrush, and one IP sending
// 116k/day under a fake Chrome UA — all walking the web through the proxy,
// because every proxied link routes back to /go. Three checks, any one
// refuses:
//   - Cloudflare says it's a verified bot (request.cf.verifiedBotCategory)
//   - the UA names itself a bot/crawler/spider
//   - the UA claims a modern browser but sends no Sec-Fetch-Mode header, which
//     every real Chrome/Firefox/Safari navigation does and curl-with-a-UA
//     doesn't
// robots.txt disallows /go too, for the ones that ask first.
function looksLikeCrawler(request: Request): boolean {
  const cf = (request as Request & { cf?: { verifiedBotCategory?: string } }).cf;
  if (cf?.verifiedBotCategory) return true;
  const ua = request.headers.get("user-agent") || "";
  if (/bot|crawl|spider|slurp|externalagent|externalhit|fetch\b/i.test(ua)) return true;
  const claimsBrowser = /Chrome\/|Firefox\/|Safari\//.test(ua);
  if (claimsBrowser && !request.headers.get("sec-fetch-mode")) return true;
  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/go") {
      if (looksLikeCrawler(request)) {
        return errorPage(403, "spoonternet is for people. crawlers: the links on these pages loop back through this proxy, so please don't follow them.");
      }
      const u = url.searchParams.get("u") || "";
      return handleProxy(u, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
