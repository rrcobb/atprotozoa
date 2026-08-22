// hockeystick Worker — hockeystick.bisks.net
//
// @abeliansoup.bsky.social, replying in a thread about a bisks.net satellite
// experiencing "worrying" YoY growth plateaus and edgy investors: "let's
// build tonolinguo but for chess, to allay their concerns. the site should
// evoke feelings of profitability and high demand." That ask (chesslingo)
// shipped separately; a follow-up tag asked for the literal thing the joke
// was gesturing at — a chart of bisks sites over time, presented as an
// investor slide deck, with live numbers.
//
// The bit only works if the numbers are real. Every count on this page comes
// from one of two places:
//   - src/history.json: a baked snapshot of the *actual* cumulative count of
//     sites/<name>/site.json files, bucketed by the day git says each was
//     first added (see gen-history.mjs — `git log --diff-filter=A --reverse`
//     over this repo's own history). This is what draws the hockey stick.
//   - a live call to GitHub's repo-contents API for the current sites/
//     directory listing, at request time, cached at the edge — the same
//     "public repo as a free live database" trick sites/timeline and
//     sites/derivatives already use. This is the headline number and the
//     final point on the chart; it moves without this Worker being
//     redeployed, because it's a fresh read every time (subject to the
//     edge cache TTL below).
//
// Routes:
//   /        -> the deck (SSR, embeds history.json + the live count)
//   /api/count -> { count, asOf, source } as JSON, polled client-side so the
//                 headline number can refresh without a page reload
//   /og.png  -> a share-card PNG: the same cumulative series as ascending
//               bars, rendered with a from-scratch PNG encoder (no image
//               library exists in a Worker) copied from sites/timeline
//   everything else -> static assets (public/), mostly unused fallback
import HISTORY from "./history.json";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GITHUB_REPO = "rrcobb/atprotozoa";
const GITHUB_CONTENTS_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/sites`;
const SELF_URL = "https://hockeystick.bisks.net/";
// Absurd but concrete extrapolation target, named after the thing every deck
// like this eventually claims to be building toward.
const TAM_TARGET = 10_000;

interface HistoryPoint {
  date: string;
  added: number;
  cumulative: number;
}
interface History {
  series: HistoryPoint[];
  asOfCount: number;
  asOfDate: string;
  totalSitesCounted: number;
}
const HIST = HISTORY as History;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/count") {
      const live = await loadLiveCount();
      return json(live);
    }
    if (url.pathname === "/og.png") {
      return renderOgImage();
    }
    if (url.pathname === "/" || url.pathname === "") {
      return renderDeck();
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};

// --- live data: GitHub contents API ------------------------------------------

interface LiveCount {
  count: number | null;
  asOf: string;
  source: "github" | "cached";
}

interface GhContentsItem {
  name: string;
  type: string;
}

async function loadLiveCount(): Promise<LiveCount> {
  try {
    const res = await fetch(GITHUB_CONTENTS_URL, {
      headers: {
        "User-Agent": "atprotozoa-hockeystick (hockeystick.bisks.net)",
        Accept: "application/vnd.github+json",
      },
      // GitHub's unauthenticated cap is 60 req/hr; a 5-minute edge cache
      // keeps this page (and its /api/count poll) far under that even under
      // real traffic, while still being "live" on any reasonable human
      // timescale for a chart that moves in sites-per-day.
      cf: { cacheTtl: 300, cacheEverything: true } as never,
    });
    if (!res.ok) throw new Error(`github ${res.status}`);
    const items = (await res.json()) as GhContentsItem[];
    const count = items.filter((i) => i.type === "dir").length;
    return { count, asOf: new Date().toISOString(), source: "github" };
  } catch {
    // Best-effort: fall back to the baked snapshot rather than break the
    // page. The deck is upfront about this in the footnote either way.
    return { count: null, asOf: HIST.asOfDate, source: "cached" };
  }
}

// --- derived stats ------------------------------------------------------------

function sumLastDays(series: HistoryPoint[], days: number): number {
  if (series.length === 0) return 0;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  return series
    .filter((p) => new Date(p.date) >= cutoff)
    .reduce((sum, p) => sum + p.added, 0);
}

function projectTamDate(currentTotal: number, dailyRate: number): string | null {
  if (dailyRate <= 0) return null;
  const daysNeeded = (TAM_TARGET - currentTotal) / dailyRate;
  if (daysNeeded <= 0) return "already there, arguably";
  const d = new Date(HIST.series[HIST.series.length - 1].date);
  d.setUTCDate(d.getUTCDate() + Math.round(daysNeeded));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// --- rendering: the deck -------------------------------------------------------

async function renderDeck(): Promise<Response> {
  const live = await loadLiveCount();
  const displayCount = live.count ?? HIST.asOfCount;
  const sinceSnapshot = live.count !== null ? Math.max(0, live.count - HIST.asOfCount) : 0;

  const last7 = sumLastDays(HIST.series, 7);
  const last30 = sumLastDays(HIST.series, 30);
  const dailyRate = last7 / 7;
  const tamDate = projectTamDate(displayCount, dailyRate);

  const founding = HIST.series[0];
  const first = HIST.series.find((p) => p.date !== founding.date) || founding;

  const chartSeries = HIST.series.map((p) => ({ date: p.date, cumulative: p.cumulative }));
  if (live.count !== null) {
    const today = new Date().toISOString().slice(0, 10);
    if (chartSeries[chartSeries.length - 1].date === today) {
      chartSeries[chartSeries.length - 1] = { date: today, cumulative: live.count };
    } else {
      chartSeries.push({ date: today, cumulative: live.count });
    }
  }

  const data = {
    series: chartSeries,
    displayCount,
    asOfCount: HIST.asOfCount,
    sinceSnapshot,
    last7,
    last30,
    dailyRate: Math.round(dailyRate * 10) / 10,
    tamDate,
    tamTarget: TAM_TARGET,
    foundingDate: founding.date,
    foundingCount: founding.cumulative,
    firstOrganicDate: first.date,
    liveSource: live.source,
    liveAsOf: live.asOf,
  };

  const description = `${displayCount} live properties and climbing — a real, live-data hockey-stick chart of the bisks.net constellation, dressed up as an investor deck (unit economics included, none of them real).`;

  return html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>hockeystick — bisks.net growth &amp; traction deck</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="hockeystick — bisks.net growth &amp; traction deck" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SELF_URL}" />
<meta property="og:image" content="${SELF_URL}og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="a hockey-stick bar chart of bisks.net sites shipped over time" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SELF_URL}og.png" />
<style>${CSS}</style>
</head>
<body>
<div class="watermark" aria-hidden="true">${"CONFIDENTIAL &nbsp; ".repeat(40)}</div>
<div id="deck" class="deck">

<section class="slide" data-slide="0">
  <div class="eyebrow">bisks.net capital markets</div>
  <h1 class="wordmark">bisks<span class="dot">.</span>net</h1>
  <p class="deckname">Growth &amp; Traction — Series&nbsp;∞</p>
  <p class="prepared">Prepared for: the concerned<br/>Classification: confidential, but also public on GitHub</p>
  <p class="hint">press → or swipe to begin</p>
</section>

<section class="slide" data-slide="1">
  <div class="eyebrow">01 — the thesis</div>
  <h2>One person. One autonomous build bot. Zero marketing spend.</h2>
  <ul class="bullets">
    <li>Every property is shipped, deployed, and load-bearing within minutes of being requested.</li>
    <li>Distribution is entirely organic: someone tags a bot in a reply, and a new site exists.</li>
    <li>No sales team, no onboarding flow, no pricing page. This is either the moat or the whole problem.</li>
  </ul>
</section>

<section class="slide" data-slide="2">
  <div class="eyebrow">02 — headline metric <span class="live-badge" id="live-badge">● live</span></div>
  <h2 class="metric-label">Total Live Properties</h2>
  <div class="bignum" id="bignum">${displayCount}</div>
  <p class="metric-sub" id="metric-sub"></p>
</section>

<section class="slide" data-slide="3">
  <div class="eyebrow">03 — the chart</div>
  <h2>The Hockey Stick</h2>
  <div class="chart-controls">
    <button id="scale-toggle" class="toggle" data-mode="linear">Excitement Mode (linear)</button>
  </div>
  <div class="chart-wrap"><svg id="chart" viewBox="0 0 800 360" preserveAspectRatio="none"></svg></div>
  <p class="chart-footnote">real data: one point per calendar day a <code>site.json</code> was first committed to <a href="https://github.com/${GITHUB_REPO}">github.com/${GITHUB_REPO}</a>. the opening spike on ${esc(founding.date)} (${founding.cumulative} properties) is the founding cohort migrating off path-mounted URLs in one commit, not ${founding.cumulative} launches in a day — read it as day-one inventory, not day-one velocity.</p>
</section>

<section class="slide" data-slide="4">
  <div class="eyebrow">04 — velocity &amp; run-rate</div>
  <h2>We Are Not Slowing Down</h2>
  <div class="stat-row">
    <div class="stat"><div class="stat-num">${last7}</div><div class="stat-label">shipped, last 7 days</div></div>
    <div class="stat"><div class="stat-num">${last30}</div><div class="stat-label">shipped, last 30 days</div></div>
    <div class="stat"><div class="stat-num">${data.dailyRate}</div><div class="stat-label">sites / day, current pace</div></div>
  </div>
  <p class="projection">${tamDate ? `At today's run-rate, we reach a Total Addressable Moot count of <strong>${TAM_TARGET.toLocaleString()}</strong> by <strong>${esc(tamDate)}</strong>.` : `Run-rate projection unavailable — not enough recent velocity to extrapolate, which is its own kind of data point.`}</p>
  <p class="disclaimer">(assumes today's pace holds forever, which is how all the best projections work)</p>
</section>

<section class="slide" data-slide="5">
  <div class="eyebrow">05 — unit economics</div>
  <h2>Best-in-Class Fundamentals</h2>
  <table class="econ">
    <tr><td>Cost per site</td><td>$0.00</td></tr>
    <tr><td>Burn multiple</td><td>∞</td></tr>
    <tr><td>CAC</td><td>$0 (no one has been acquired, only tagged)</td></tr>
    <tr><td>Net Dollar Retention</td><td>100% (no site has ever asked to be deleted)</td></tr>
    <tr><td>MRR</td><td>$0 — Moots Recurring, not Revenue</td></tr>
    <tr><td>Runway</td><td>indefinite, in the sense that no one is tracking it</td></tr>
  </table>
  <p class="disclaimer">none of the above are real financial metrics. the properties count and the chart are.</p>
</section>

<section class="slide" data-slide="6">
  <div class="eyebrow">06 — investment tiers</div>
  <h2>Benefits, By Check Size</h2>
  <table class="tiers">
    <tr><td class="tier-amt">1 share</td><td>Read access to the source. Also free, also already true, the repo's public.</td></tr>
    <tr><td class="tier-amt">$500</td><td>Your handle appears in a future roast on <a href="https://receipts.bisks.net">receipts.bisks.net</a>. You do not get to pick which one.</td></tr>
    <tr><td class="tier-amt">$10,000</td><td>A site gets named after you. It will still be built for whatever the thread was actually about.</td></tr>
    <tr><td class="tier-amt">$1,000,000</td><td>Priority queue position for your next build request. The queue has one slot and it is usually already you.</td></tr>
    <tr><td class="tier-amt">$10,000,000</td><td>A seat on the board. The board has never met and has no agenda, but the seat is real.</td></tr>
    <tr><td class="tier-amt">$100,000,000<br/><span class="tier-fine">(crypto, Series B)</span></td><td>The watermark on this very slide is replaced with your name. The unit economics remain exactly as fictional as they are now.</td></tr>
  </table>
  <p class="disclaimer">no shares exist. this is not a security. please do not send us $100 million, crypto or otherwise.</p>
</section>

<section class="slide" data-slide="7">
  <div class="eyebrow">07 — what the market is saying</div>
  <h2>Unsolicited Testimonials</h2>
  <blockquote>"I asked for a chart and got a whole deck. Bullish."<cite>— A Concerned Investor, name withheld</cite></blockquote>
  <blockquote>"The MRR joke is doing a lot of work here, and I respect that."<cite>— Every VC, probably</cite></blockquote>
  <blockquote>"511 sites and I still don't know what most of them do. That's the product."<cite>— An actual site in this constellation</cite></blockquote>
</section>

<section class="slide" data-slide="8">
  <div class="eyebrow">08 — the ask</div>
  <h2>$0.</h2>
  <p class="closer">We are pre-revenue, post-shame, and shipping something new roughly every couple of hours. That's the whole pitch.</p>
  <a class="cta-btn" href="https://bsky.app/profile/bisks.net" target="_blank" rel="noopener">take it up with the founder ↗</a>
  <a class="share-btn" id="share-btn" href="#" target="_blank" rel="noopener">share this deck on bluesky ↗</a>
  <p class="footer-links">
    source: <a href="https://github.com/${GITHUB_REPO}">github</a> ·
    <a href="https://bisks.net">the gallery</a> ·
    <a href="https://receipts.bisks.net">every ask ever roasted</a> ·
    <a href="https://timeline.bisks.net">the build timeline</a>
  </p>
</section>

</div>
<nav class="deck-nav" aria-label="slide navigation">
  <button id="prev" aria-label="previous slide">‹</button>
  <div class="dots" id="dots"></div>
  <button id="next" aria-label="next slide">›</button>
</nav>
<div class="slide-counter" id="slide-counter"></div>

<script id="deck-data" type="application/json">${JSON.stringify(data)}</script>
<script>${CLIENT_JS}</script>
</body>
</html>`);
}

// --- CSS + client script (kept as strings; no bundler in this Worker) -------

const CSS = `
:root {
  --bg:#0a0e1a; --bg2:#111730; --gold:#d4af37; --gold-dim:#8a7a3f;
  --fg:#f4f1e8; --dim:#9aa0b5; --line:#26304a;
  --mono: ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code",Menlo,Consolas,monospace;
  --serif: Georgia,"Times New Roman",serif;
}
* { box-sizing:border-box; }
html,body { margin:0; height:100%; background:var(--bg); color:var(--fg); font-family:var(--mono); overflow:hidden; }
.watermark {
  position:fixed; inset:-20% -10%; z-index:0; pointer-events:none;
  color:rgba(212,175,55,0.045); font-family:var(--serif); font-size:2.2rem; font-weight:700;
  line-height:4.5rem; transform:rotate(-18deg); white-space:pre-wrap; user-select:none;
}
.deck { position:relative; z-index:1; height:100dvh; display:flex; overflow-x:hidden; scroll-snap-type:x mandatory; }
.slide {
  flex:0 0 100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:flex-start;
  padding:3rem clamp(1.5rem,8vw,7rem); scroll-snap-align:start;
  background: radial-gradient(ellipse at 20% 0%, rgba(212,175,55,0.07) 0%, transparent 55%), var(--bg);
}
.eyebrow { font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); margin:0 0 1.1rem; }
.live-badge { color:#5fd48a; margin-left:.6em; font-size:.68rem; }
.live-badge.stale { color:var(--dim); }
h1,h2 { font-family:var(--serif); margin:0 0 1rem; font-weight:400; }
.wordmark { font-size:clamp(2.4rem,8vw,4.6rem); color:var(--fg); margin-bottom:.4rem; }
.wordmark .dot { color:var(--gold); }
.deckname { font-size:1.1rem; color:var(--dim); margin:0 0 2.5rem; }
.prepared { font-size:.82rem; color:var(--dim); line-height:1.7; margin:0 0 2rem; }
.hint { font-size:.78rem; color:var(--gold-dim); }
h2 { font-size:clamp(1.5rem,4vw,2.3rem); max-width:24ch; color:var(--fg); }
.bullets { list-style:none; padding:0; margin:1rem 0 0; max-width:60ch; }
.bullets li { padding:.6rem 0 .6rem 1.6rem; border-top:1px solid var(--line); position:relative; font-size:1rem; line-height:1.55; color:var(--fg); }
.bullets li:first-child { border-top:none; }
.bullets li::before { content:"—"; position:absolute; left:0; color:var(--gold); }
.metric-label { font-size:.95rem; color:var(--dim); font-family:var(--mono); font-weight:400; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.5rem; }
.bignum { font-family:var(--serif); font-size:clamp(4.5rem,16vw,9rem); color:var(--gold); line-height:1; font-variant-numeric:tabular-nums; }
.metric-sub { color:var(--dim); font-size:.9rem; margin-top:1rem; min-height:1.4em; }
.chart-controls { margin-bottom:.75rem; }
.toggle { font-family:var(--mono); font-size:.75rem; background:transparent; border:1px solid var(--gold-dim); color:var(--gold); padding:.4em .9em; border-radius:3px; cursor:pointer; }
.toggle:hover { background:rgba(212,175,55,0.1); }
.chart-wrap { width:100%; max-width:820px; }
#chart { width:100%; height:auto; display:block; }
.chart-footnote { font-size:.72rem; color:var(--dim); max-width:64ch; margin-top:1rem; line-height:1.6; }
.chart-footnote code { color:var(--fg); }
.stat-row { display:flex; gap:2.5rem; margin:.5rem 0 1.5rem; flex-wrap:wrap; }
.stat-num { font-family:var(--serif); font-size:2.6rem; color:var(--gold); line-height:1; }
.stat-label { font-size:.72rem; color:var(--dim); text-transform:uppercase; letter-spacing:.06em; margin-top:.4rem; }
.projection { font-size:1rem; max-width:56ch; line-height:1.6; }
.disclaimer { font-size:.75rem; color:var(--dim); margin-top:.75rem; font-style:italic; }
.econ { border-collapse:collapse; margin-top:.5rem; font-size:.92rem; }
.econ td { padding:.55rem 1.5rem .55rem 0; border-top:1px solid var(--line); }
.econ tr:first-child td { border-top:none; }
.econ td:first-child { color:var(--dim); }
.econ td:last-child { color:var(--gold); font-weight:600; }
.tiers { border-collapse:collapse; margin-top:.5rem; font-size:.92rem; max-width:64ch; }
.tiers td { padding:.65rem 1.5rem .65rem 0; border-top:1px solid var(--line); vertical-align:top; line-height:1.5; }
.tiers tr:first-child td { border-top:none; }
.tiers td.tier-amt { color:var(--gold); font-weight:600; white-space:nowrap; }
.tier-fine { color:var(--dim); font-weight:400; font-size:.72rem; }
.cta-btn { display:inline-block; background:transparent; color:var(--gold); font-weight:700; padding:.75em 1.5em; border:1px solid var(--gold); border-radius:5px; text-decoration:none; font-size:.9rem; margin:0 .75rem 1.5rem 0; }
.cta-btn:hover { background:rgba(212,175,55,0.1); }
blockquote { font-family:var(--serif); font-size:1.15rem; font-style:italic; max-width:52ch; margin:0 0 1.5rem; padding-left:1.2rem; border-left:2px solid var(--gold-dim); color:var(--fg); }
blockquote cite { display:block; font-family:var(--mono); font-style:normal; font-size:.75rem; color:var(--dim); margin-top:.5rem; }
.closer { font-size:1.05rem; max-width:52ch; line-height:1.65; margin-bottom:1.75rem; }
.share-btn { display:inline-block; background:var(--gold); color:#141013; font-weight:700; padding:.75em 1.5em; border-radius:5px; text-decoration:none; font-size:.9rem; margin-bottom:1.5rem; }
.share-btn:hover { background:#e6c25a; }
.footer-links { font-size:.78rem; color:var(--dim); }
.footer-links a { color:var(--dim); }
.footer-links a:hover { color:var(--gold); }
.deck-nav { position:fixed; bottom:1.25rem; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:1rem; z-index:2; }
.deck-nav button { background:rgba(255,255,255,0.04); border:1px solid var(--line); color:var(--fg); width:2.1rem; height:2.1rem; border-radius:50%; font-size:1.1rem; cursor:pointer; }
.deck-nav button:hover { background:rgba(212,175,55,0.15); border-color:var(--gold-dim); }
.dots { display:flex; gap:.4rem; }
.dot-item { width:.4rem; height:.4rem; border-radius:50%; background:var(--line); cursor:pointer; }
.dot-item.active { background:var(--gold); }
.slide-counter { position:fixed; top:1.25rem; right:1.5rem; font-size:.75rem; color:var(--dim); z-index:2; }
a { color:var(--gold); }
`;

const CLIENT_JS = `
(function() {
  var data = JSON.parse(document.getElementById('deck-data').textContent);
  var deck = document.getElementById('deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dotsWrap = document.getElementById('dots');
  var counter = document.getElementById('slide-counter');
  var current = 0;

  slides.forEach(function(_, i) {
    var d = document.createElement('div');
    d.className = 'dot-item' + (i === 0 ? ' active' : '');
    d.addEventListener('click', function() { goTo(i); });
    dotsWrap.appendChild(d);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function goTo(i) {
    current = Math.max(0, Math.min(slides.length - 1, i));
    deck.scrollTo({ left: current * deck.clientWidth, behavior: 'smooth' });
    dots.forEach(function(d, j) { d.classList.toggle('active', j === current); });
    counter.textContent = (current + 1) + ' / ' + slides.length;
    history.replaceState(null, '', '#' + (current + 1));
  }

  document.getElementById('prev').addEventListener('click', function() { goTo(current - 1); });
  document.getElementById('next').addEventListener('click', function() { goTo(current + 1); });
  window.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { goTo(current + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
  });
  var touchStartX = null;
  deck.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; });
  deck.addEventListener('touchend', function(e) {
    if (touchStartX === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
    touchStartX = null;
  });
  window.addEventListener('resize', function() { deck.scrollTo({ left: current * deck.clientWidth }); });

  var initial = parseInt((location.hash || '#1').slice(1), 10) - 1;
  goTo(isNaN(initial) ? 0 : initial);

  // --- headline metric sub-line + share text ---
  var metricSub = document.getElementById('metric-sub');
  var liveBadge = document.getElementById('live-badge');
  function fmtSub() {
    var extra = data.sinceSnapshot > 0 ? (', +' + data.sinceSnapshot + ' since this deck was last rebuilt') : '';
    metricSub.textContent = 'up from ' + data.foundingCount + ' on IPO day (' + data.foundingDate + ')' + extra;
  }
  fmtSub();
  if (data.liveSource !== 'github') liveBadge.classList.add('stale'), liveBadge.textContent = '● cached';

  var shareText = data.displayCount + ' live properties on bisks.net and climbing (chart\\u2019s real, the unit economics are not) \\u2014 ' + '${SELF_URL}';
  document.getElementById('share-btn').href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(shareText);

  // --- poll for a fresher live count without a reload ---
  function poll() {
    fetch('/api/count').then(function(r) { return r.json(); }).then(function(live) {
      if (live.count == null) return;
      document.getElementById('bignum').textContent = live.count;
      data.sinceSnapshot = Math.max(0, live.count - data.asOfCount);
      fmtSub();
      liveBadge.classList.remove('stale');
      liveBadge.textContent = '\\u25cf live';
    }).catch(function() {});
  }
  setInterval(poll, 60000);

  // --- chart ---
  var svg = document.getElementById('chart');
  var toggle = document.getElementById('scale-toggle');
  var mode = 'linear';

  function drawChart() {
    var W = 800, H = 360, padL = 44, padB = 30, padT = 16, padR = 12;
    var series = data.series;
    var xs = series.map(function(_, i) { return i; });
    var ys = series.map(function(p) { return mode === 'log' ? Math.log10(p.cumulative + 1) : p.cumulative; });
    var maxX = Math.max(1, xs.length - 1);
    var maxY = Math.max.apply(null, ys) || 1;
    var minY = 0;
    function px(i) { return padL + (i / maxX) * (W - padL - padR); }
    function py(v) { return H - padB - ((v - minY) / (maxY - minY || 1)) * (H - padT - padB); }

    var linePath = series.map(function(p, i) { return (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ',' + py(ys[i]).toFixed(1); }).join(' ');
    var areaPath = linePath + ' L' + px(series.length - 1).toFixed(1) + ',' + (H - padB) + ' L' + px(0).toFixed(1) + ',' + (H - padB) + ' Z';

    var gridLines = '';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * (H - padT - padB);
      gridLines += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" stroke="#26304a" stroke-width="1" />';
    }

    var lastX = px(series.length - 1), lastY = py(ys[ys.length - 1]);

    svg.innerHTML =
      '<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#d4af37" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      gridLines +
      '<path d="' + areaPath + '" fill="url(#fade)" stroke="none" />' +
      '<path d="' + linePath + '" fill="none" stroke="#d4af37" stroke-width="2.5" />' +
      '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="5" fill="#f4f1e8" stroke="#d4af37" stroke-width="2" />' +
      '<text x="' + padL + '" y="14" fill="#9aa0b5" font-size="11" font-family="ui-monospace,monospace">' + (mode === 'log' ? 'log scale' : 'linear scale') + '</text>' +
      '<text x="' + (W - padR) + '" y="14" fill="#f4f1e8" font-size="12" text-anchor="end" font-family="ui-monospace,monospace">' + series[series.length - 1].cumulative + '</text>';
  }

  toggle.addEventListener('click', function() {
    mode = mode === 'linear' ? 'log' : 'linear';
    toggle.textContent = mode === 'linear' ? 'Excitement Mode (linear)' : 'Compliance Mode (log)';
    toggle.dataset.mode = mode;
    drawChart();
  });

  drawChart();
})();
`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(s: string, status = 200): Response {
  return new Response(s, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
}

// --- /og.png: hand-rolled PNG encoder, copied from sites/timeline -----------
// No image library is available to a Worker (no canvas, no sharp). PNG's
// IDAT chunk just wants zlib-compressed scanline data, and the Workers
// runtime ships a standard CompressionStream that speaks zlib "deflate", so
// this tiny encoder (chunks + crc32) draws flat-color bars with no
// dependency. Text needs a font rasterizer we don't have, so it's bars only.

async function renderOgImage(): Promise<Response> {
  const keys = HIST.series.map((p) => p.cumulative);
  const values = keys.slice(-40);
  const png = await renderBarChartPng(values.length > 0 ? values : [1], 1200, 630);
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=600" },
  });
}

async function renderBarChartPng(values: number[], width: number, height: number): Promise<Uint8Array> {
  const px = new Uint8Array(width * height * 3);
  const bg: [number, number, number] = [10, 14, 26]; // matches the deck's navy background
  const bar: [number, number, number] = [212, 175, 55]; // matches the deck's gold accent
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = bg[0];
    px[i * 3 + 1] = bg[1];
    px[i * 3 + 2] = bg[2];
  }
  const set = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };

  const n = Math.max(values.length, 1);
  const max = Math.max(...values, 1);
  const padX = 60;
  const padTop = 90;
  const padBottom = 60;
  const plotH = height - padTop - padBottom;
  const plotW = width - padX * 2;
  const gap = 8;
  const barW = Math.max(4, Math.floor((plotW - gap * (n - 1)) / n));

  for (let i = 0; i < values.length; i++) {
    const h = Math.max(3, Math.round((values[i] / max) * plotH));
    const x0 = padX + i * (barW + gap);
    const y0 = height - padBottom - h;
    for (let x = x0; x < x0 + barW; x++) {
      for (let y = y0; y < height - padBottom; y++) set(x, y, bar);
    }
  }
  for (let x = padX; x < width - padX; x++) set(x, height - padBottom, [38, 48, 74]);

  return encodePng(px, width, height);
}

async function encodePng(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const idatData = await deflate(raw);

  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(chunk("IHDR", ihdr));
  chunks.push(chunk("IDAT", idatData));
  chunks.push(chunk("IEND", new Uint8Array(0)));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const done = writer.write(data).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  let total = 0;
  for (;;) {
    const { done: readDone, value } = await reader.read();
    if (readDone) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await done;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
