// junipereth wallet engine — junipereth.bisks.net
//
// There's no faucet, no server balance, no KV counter. The "wallet" is
// derived live, in the browser, from one account's own public posts: every
// quote-repost Juniper (juniperbevensee.bsky.social) has ever posted whose
// own commentary text contains the magic phrase counts as a deposit. Nobody
// else's account is ever scanned — there's no handle input on this site —
// so nobody else can mint jETH here no matter what they post. All reads go
// through public.api.bsky.app (CORS *, no auth needed).

(function (global) {
  const PUB = "https://public.api.bsky.app/xrpc";
  const HANDLE = "juniperbevensee.bsky.social";
  // The exact phrase to quote-repost with, to mint jETH. A mutation of her
  // own line in the thread this site was built from ("IP is fake but
  // relationships and trust and encryption and social norms are real.").
  const MAGIC_PHRASE = "ip is fake but my eth is real";
  // "I really think the bid should start at 2" — so does every mint.
  const PER_MATCH = 2;
  const FEED_PAGES = 30; // paired with MAX_POSTS as a safety valve, not a "recent only" cutoff
  const MAX_POSTS = 3000;

  async function jget(url) {
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  async function xrpc(method, params) {
    const u = new URL(`${PUB}/${method}`);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    return jget(u.toString());
  }

  function normalize(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isQualifyingQuote(post) {
    const rec = post && post.record;
    if (!rec || typeof rec.text !== "string") return false;
    const type = rec.embed && rec.embed.$type;
    const isQuote = type === "app.bsky.embed.record" || type === "app.bsky.embed.recordWithMedia";
    if (!isQuote) return false;
    return normalize(rec.text).includes(MAGIC_PHRASE);
  }

  async function resolveJuniper() {
    return xrpc("app.bsky.actor.getProfile", { actor: HANDLE });
  }

  async function fetchDeposits(did, handle) {
    const deposits = [];
    let cursor;
    let scanned = 0;
    for (let page = 0; page < FEED_PAGES; page++) {
      const params = { actor: did, limit: "100" };
      if (cursor) params.cursor = cursor;
      const feed = await xrpc("app.bsky.feed.getAuthorFeed", params);
      for (const item of feed.feed || []) {
        if (item.reason) continue; // a plain repost isn't a quote-repost — no commentary, no phrase
        const post = item.post;
        scanned++;
        if (post && post.author && post.author.did === did && isQualifyingQuote(post)) {
          deposits.push({
            uri: post.uri,
            text: post.record.text,
            createdAt: post.record.createdAt || post.indexedAt,
            url: `https://bsky.app/profile/${handle}/post/${post.uri.split("/").pop()}`,
          });
        }
      }
      cursor = feed.cursor;
      if (!cursor || !(feed.feed || []).length || scanned >= MAX_POSTS) break;
    }
    deposits.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let balance = 0;
    for (const d of deposits) {
      balance += PER_MATCH;
      d.balanceAfter = balance;
    }
    return { deposits, scanned, balance };
  }

  async function loadWallet() {
    const profile = await resolveJuniper();
    const { deposits, scanned, balance } = await fetchDeposits(profile.did, profile.handle || HANDLE);
    return {
      profile,
      deposits: deposits.slice().reverse(), // newest first for the ledger
      balance,
      scanned,
      perMatch: PER_MATCH,
      magicPhrase: MAGIC_PHRASE,
      handle: profile.handle || HANDLE,
    };
  }

  global.JuniperEth = { loadWallet, MAGIC_PHRASE, PER_MATCH, HANDLE };
})(window);
