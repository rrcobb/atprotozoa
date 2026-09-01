// Served at the root of lesslong.bisks.net. Static assets pass straight
// through to the ASSETS binding; /api/recent is the one dynamic route, a
// thin proxy in front of LessWrong's GraphQL API so the browser can ask for
// "posts above karma X from the last few days" without hitting CORS (the
// upstream API doesn't send Access-Control-Allow-Origin) and without this
// Worker storing anything itself — every request re-fetches live.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// The three tiers @robmurrish.bsky.social asked for: 500 = very selective,
// 100 = a nice stand-alone feed, 10 = the firehose. Lookback widens as the
// threshold rises so each tier actually returns a handful of posts instead
// of an empty page — a 500-karma post is rare enough that 3 days of them is
// usually nothing.
const TIERS: Record<string, number> = { "10": 2, "100": 10, "500": 45 };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/recent") {
      return handleRecent(url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleRecent(url: URL): Promise<Response> {
  const requested = url.searchParams.get("karma") ?? "100";
  const days = TIERS[requested];
  if (!days) {
    return json({ error: "karma must be 10, 100, or 500" }, 400);
  }
  const karma = Number(requested);
  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // limit: 150 isn't a safety cap, just a ceiling comfortably above what any
  // tier should plausibly return in its lookback window (the karma-10
  // firehose tier came closest to 40 in testing, hence the headroom) — the
  // browser renders the list as a plain scrollable <ul>, so there's no real
  // upper bound worth enforcing here.
  const query = `query RecentPosts($after: Date, $karma: Int) {
    posts(input: { terms: { view: "top", karmaThreshold: $karma, after: $after, limit: 150 } }) {
      results { _id title baseScore postedAt pageUrl user { displayName } }
    }
  }`;

  let upstream: Response;
  try {
    upstream = await fetch("https://www.lesswrong.com/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { after, karma } }),
    });
  } catch {
    return json({ error: "lesswrong.com unreachable" }, 502);
  }
  if (!upstream.ok) {
    return json({ error: "lesswrong.com returned an error" }, 502);
  }

  const data: any = await upstream.json();
  const results = data?.data?.posts?.results;
  if (!Array.isArray(results)) {
    return json({ error: "unexpected response from lesswrong.com" }, 502);
  }

  const posts = results.map((p: any) => ({
    id: p._id,
    title: p.title,
    url: p.pageUrl,
    author: p.user?.displayName ?? "unknown",
    karma: p.baseScore,
    postedAt: p.postedAt,
  }));

  return json({ karma, days, posts });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
}
