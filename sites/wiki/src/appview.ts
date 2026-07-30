// Thin fetch helpers over Bluesky's public, unauthenticated AppView — the
// same "getProfile/getPosts work anonymously, searchPosts doesn't" split
// documented in sites/quotehof and used by sites/didscope. Everything here
// is a read; nothing is ever posted.

const APPVIEW = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(APPVIEW + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 120 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

export interface Profile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  createdAt?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

export interface PostView {
  uri: string;
  cid: string;
  author: Profile;
  text: string;
  createdAt?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  embedImages?: string[];
  isReply: boolean;
  replyParentUri?: string;
}

export function parseAtUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  if (!m) return null;
  return { did: m[1], rkey: m[2] };
}

// Turns a raw path segment (`@norvid-studies.bsky.social`, a bare handle, a
// did:plc:..., or a pasted `https://bsky.app/profile/<actor>` URL) into a
// did:handle pair, resolving through the AppView when it isn't already a DID.
export async function resolveActor(raw: string): Promise<{ did: string; handle: string }> {
  let actor = decodeURIComponent(raw).trim().replace(/^@/, "");
  const m = actor.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) actor = m[1];
  if (!actor) throw new Error("empty actor");

  if (actor.startsWith("did:")) {
    const profile = await getProfile(actor);
    return { did: actor, handle: profile.handle };
  }
  const { did } = await xrpc("com.atproto.identity.resolveHandle", { handle: actor });
  return { did, handle: actor };
}

export async function getProfile(did: string): Promise<Profile> {
  const p = await xrpc("app.bsky.actor.getProfile", { actor: did });
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName,
    description: p.description,
    avatar: p.avatar,
    banner: p.banner,
    createdAt: p.createdAt,
    followersCount: p.followersCount,
    followsCount: p.followsCount,
    postsCount: p.postsCount,
  };
}

function toPostView(p: any): PostView {
  const images: string[] = [];
  const embed = p.embed;
  if (embed && embed.$type === "app.bsky.embed.images#view") {
    for (const img of embed.images || []) if (img.thumb) images.push(img.thumb);
  }
  const rec = p.record || {};
  return {
    uri: p.uri,
    cid: p.cid,
    author: {
      did: p.author?.did,
      handle: p.author?.handle,
      displayName: p.author?.displayName,
      avatar: p.author?.avatar,
    },
    text: typeof rec.text === "string" ? rec.text : "",
    createdAt: rec.createdAt,
    likeCount: p.likeCount || 0,
    repostCount: p.repostCount || 0,
    replyCount: p.replyCount || 0,
    quoteCount: p.quoteCount || 0,
    embedImages: images,
    isReply: !!rec.reply,
    replyParentUri: rec.reply?.parent?.uri,
  };
}

export async function getPost(did: string, rkey: string): Promise<PostView> {
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const data = await xrpc("app.bsky.feed.getPosts", { uris: uri });
  const post = (data.posts || [])[0];
  if (!post) throw new Error("post not found");
  return toPostView(post);
}

// A handful of recent, self-authored (non-reply) posts — used to fill out an
// auto-generated poster stub with "notable posts" the way a bare Wikipedia
// stub might list a person's known works.
export async function getRecentPosts(did: string, limit = 6): Promise<PostView[]> {
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor: did,
      limit: String(Math.max(limit * 3, 15)),
      filter: "posts_no_replies",
    });
    const posts: PostView[] = (feed.feed || [])
      .map((f: any) => toPostView(f.post))
      .filter((p: PostView) => p.text.trim().length > 0);
    return posts.slice(0, limit);
  } catch {
    return [];
  }
}
