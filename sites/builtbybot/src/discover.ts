// Finding posts that carry a gift link.
//
// WHY THIS ISN'T A JETSTREAM SUBSCRIPTION, which is what the brief asked for
// and what sites/giftlinks does in the browser:
//
// A Jetstream subscription is a standing websocket. This repo has no Durable
// Objects (notes/11), and a Worker request is too short-lived to hold one, so
// there is nowhere in a labeler to put one. giftlinks gets away with it by
// running the socket in each visitor's browser — fine for a page that shows
// you what's live while you're looking at it, useless for a labeler, which has
// to have already seen a post by the time someone queries it.
//
// So discovery is a cron sweep over app.bsky.feed.searchPosts, which is the
// same shape buildthis's watcher uses for mention discovery. searchPosts is
// queryable where a stream is not, and it takes a `domain:` filter, so "posts
// linking to nytimes.com" is one request per publisher rather than a full-
// firehose scan we'd have to do ourselves.
//
// The tradeoffs, stated because they're real and /policy repeats them:
//
//   - Coverage is best-effort. Search indexing lags and drops things, so this
//     finds most gift links, not all of them. An unlabeled post means "not
//     seen", never "checked and found no token".
//   - Detection still runs on the record itself (giftdetect.ts), not on the
//     search query. `domain:nytimes.com` only narrows the candidate set; the
//     claim is only ever made after reading the URL.

import { detectInPost, GIFT_SOURCES, type GiftSource } from "./giftdetect";

const PUBLIC_APPVIEW = "https://public.api.bsky.app/xrpc";

// The distinct hosts worth querying. Derived from GIFT_SOURCES rather than
// listed twice, so adding a publisher to the detection list also adds it to
// the sweep.
export function searchDomains(): string[] {
  return [...new Set(GIFT_SOURCES.flatMap((s) => s.domains))];
}

export interface FoundPost {
  uri: string;
  cid: string;
  sourceKey: string;
  indexedAt: string;
}

interface SearchPost {
  uri: string;
  cid: string;
  record?: unknown;
  indexedAt?: string;
}

// One publisher's worth of recent posts. Unauthenticated public AppView: this
// reads public posts and needs no session, unlike buildthis's sweep, which
// searches its own mentions.
async function searchDomain(domain: string, limit: number): Promise<SearchPost[]> {
  const u = new URL(`${PUBLIC_APPVIEW}/app.bsky.feed.searchPosts`);
  // `domain:` is searchPosts' own link filter — it matches posts linking to
  // the host, which is exactly the candidate set, without a text match that
  // would also catch people merely talking about the paper.
  u.searchParams.set("q", `domain:${domain}`);
  u.searchParams.set("sort", "latest");
  u.searchParams.set("limit", String(limit));
  const res = await fetch(u.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`searchPosts(${domain}) failed: ${res.status}`);
  const body = (await res.json()) as { posts?: SearchPost[] };
  return Array.isArray(body.posts) ? body.posts : [];
}

// Sweep every publisher, keep only the posts whose links actually carry a
// token. Errors are per-domain: one publisher's search failing shouldn't cost
// us the other ten, and a sweep that returns fewer posts is a missed label,
// not a wrong one.
export async function sweep(limitPerDomain: number): Promise<{ found: FoundPost[]; errors: number }> {
  const found: FoundPost[] = [];
  const seen = new Set<string>();
  let errors = 0;

  const results = await Promise.all(
    searchDomains().map(async (domain) => {
      try {
        return await searchDomain(domain, limitPerDomain);
      } catch (err) {
        console.error(`sweep: ${err}`);
        return null;
      }
    }),
  );

  for (const posts of results) {
    if (posts === null) {
      errors++;
      continue;
    }
    for (const post of posts) {
      if (!post?.uri || !post.cid || seen.has(post.uri)) continue;
      const source: GiftSource | null = detectInPost(post.record);
      if (!source) continue;
      seen.add(post.uri);
      found.push({
        uri: post.uri,
        cid: post.cid,
        sourceKey: source.key,
        indexedAt: post.indexedAt || new Date().toISOString(),
      });
    }
  }
  return { found, errors };
}
