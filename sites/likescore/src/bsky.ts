// Public AppView client helpers — no auth, no PDS access, no repo/CAR
// downloads. Every call here is a read against public.api.bsky.app, which is
// what keeps likescore's storage to "public records and aggregates" (see
// notes/00-vision.md's atproto building-blocks section) rather than an
// archive of anything.
import { CONSTANTS, isValidCursor } from "./formulas";

const APPVIEW = "https://public.api.bsky.app";

export class AppViewError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryable = false
  ) {
    super(message);
  }
}

async function fetchRetried(url: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= CONSTANTS.MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("retry-after")) || 0;
        const wait = Math.max(
          retryAfter * 1000,
          CONSTANTS.RETRY_BASE_MS * 2 ** attempt
        );
        if (attempt === CONSTANTS.MAX_RETRIES) {
          throw new AppViewError("rate limited by appview", 429, true);
        }
        await sleep(wait);
        continue;
      }
      if (resp.status >= 500) {
        if (attempt === CONSTANTS.MAX_RETRIES) {
          throw new AppViewError(`appview ${resp.status}`, resp.status, true);
        }
        await sleep(CONSTANTS.RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      if (!resp.ok) {
        // 4xx other than 429: not retryable (bad input, not found, blocked,
        // deactivated actor, etc.) — the caller decides what to do.
        let body: any = null;
        try {
          body = await resp.json();
        } catch {
          /* not json */
        }
        throw new AppViewError(
          body?.message || `appview ${resp.status}`,
          resp.status,
          false
        );
      }
      return await resp.json();
    } catch (err) {
      lastErr = err;
      if (err instanceof AppViewError && !err.retryable) throw err;
      if (attempt === CONSTANTS.MAX_RETRIES) break;
      await sleep(CONSTANTS.RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new AppViewError("appview request failed after retries", undefined, true);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ResolvedHandle {
  did: string;
}
export async function resolveHandle(handle: string): Promise<string> {
  const data = await fetchRetried(
    `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
      handle
    )}`
  );
  return data.did as string;
}

export interface Profile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  deactivated: boolean;
}
export async function getProfile(actor: string): Promise<Profile> {
  try {
    const data = await fetchRetried(
      `${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(
        actor
      )}`
    );
    return {
      did: data.did,
      handle: data.handle,
      displayName: data.displayName,
      avatar: data.avatar,
      deactivated: false,
    };
  } catch (err) {
    if (
      err instanceof AppViewError &&
      /deactivat/i.test(err.message)
    ) {
      return { did: actor, handle: actor, deactivated: true };
    }
    throw err;
  }
}

export interface FeedPost {
  uri: string;
  cid: string;
  createdAt: string;
}
// Cursor-paginated, capped at MAX_POST_PAGES pages of POST_PAGE_LIMIT each —
// bounds a single scan to a fixed number of AppView requests regardless of
// how prolific the account is.
export async function getRecentPosts(
  did: string,
  onPage?: (pageIdx: number, count: number) => void
): Promise<{ posts: FeedPost[]; truncated: boolean }> {
  const posts: FeedPost[] = [];
  let cursor: string | undefined;
  let page = 0;
  let truncated = false;
  do {
    const qs = new URLSearchParams({
      actor: did,
      limit: String(CONSTANTS.POST_PAGE_LIMIT),
      filter: "posts_no_replies",
    });
    if (cursor) qs.set("cursor", cursor);
    const data = await fetchRetried(
      `${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?${qs.toString()}`
    );
    const feed = Array.isArray(data.feed) ? data.feed : [];
    for (const item of feed) {
      const post = item?.post;
      if (!post?.uri || !post?.cid) continue;
      posts.push({
        uri: post.uri,
        cid: post.cid,
        createdAt: post.record?.createdAt || post.indexedAt,
      });
    }
    page++;
    onPage?.(page, posts.length);
    cursor = isValidCursor(data.cursor) ? data.cursor : undefined;
    if (page >= CONSTANTS.MAX_POST_PAGES && cursor) truncated = true;
  } while (cursor && page < CONSTANTS.MAX_POST_PAGES);
  return { posts, truncated };
}

export interface Liker {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
}
// Cursor-paginated, capped at MAX_LIKE_PAGES_PER_POST pages per post — a
// single viral post can't blow the scan's request budget.
export async function getLikers(
  uri: string,
  cid: string
): Promise<{ likers: Liker[]; truncated: boolean }> {
  const likers: Liker[] = [];
  let cursor: string | undefined;
  let page = 0;
  let truncated = false;
  do {
    const qs = new URLSearchParams({
      uri,
      cid,
      limit: String(CONSTANTS.LIKES_PAGE_LIMIT),
    });
    if (cursor) qs.set("cursor", cursor);
    const data = await fetchRetried(
      `${APPVIEW}/xrpc/app.bsky.feed.getLikes?${qs.toString()}`
    );
    const list = Array.isArray(data.likes) ? data.likes : [];
    for (const like of list) {
      const actor = like?.actor;
      if (!actor?.did) continue;
      likers.push({
        did: actor.did,
        handle: actor.handle,
        displayName: actor.displayName,
        avatar: actor.avatar,
        createdAt: like.createdAt || like.indexedAt,
      });
    }
    page++;
    cursor = isValidCursor(data.cursor) ? data.cursor : undefined;
    if (page >= CONSTANTS.MAX_LIKE_PAGES_PER_POST && cursor) truncated = true;
  } while (cursor && page < CONSTANTS.MAX_LIKE_PAGES_PER_POST);
  return { likers, truncated };
}

// Bounded-concurrency map — never more than `limit` in-flight promises at
// once, so a scan can't hammer the AppView with hundreds of simultaneous
// getLikes calls. Each task result is reported as it lands (not batched) so
// a caller can stream progress incrementally.
export async function boundedMap<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, item: T, index: number, done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function runOne(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      const r = await worker(items[i], i);
      results[i] = r;
      done++;
      onResult?.(r, items[i], i, done, items.length);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runOne()
  );
  await Promise.all(workers);
  return results;
}
