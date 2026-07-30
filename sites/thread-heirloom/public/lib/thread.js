// thread.js — resolve a pasted Bluesky post/thread URL to its root, fetch
// the whole reply tree from the PUBLIC AppView (anonymous, no auth), and
// flatten it into a numbered list the rest of the app can cite by index.
//
// getPostThread pattern (uri/depth/parentHeight) copied from
// trigrams/public/lib/post.js's resolvePostRef and purge/public/lib/quiet.js
// (copy, don't abstract) — thread-heirloom needs the full tree, not just one
// post's parent ref or one post's direct replies, so it does two passes:
// climb to the root, then re-fetch the root with real depth.

import { jget } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";

const MAX_DEPTH = 10; // getPostThread's descendant depth
const MAX_POSTS = 90; // hard cap so the AI payload + the final encoded card stay small

// Accepts a bsky.app URL, an at:// URI, or "handle/rkey" — returns at://did/collection/rkey.
export async function resolvePostUri(input) {
  let s = (input || "").trim();
  if (!s) throw new Error("paste a bsky.app thread link");

  if (s.startsWith("at://")) return s;

  const m = s.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/i);
  if (!m) throw new Error("that doesn't look like a Bluesky post URL");
  let actor = m[1];
  if (!actor.startsWith("did:")) {
    const r = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    actor = r.did;
  }
  return `at://${actor}/app.bsky.feed.post/${m[2]}`;
}

function permalinkFor(post) {
  const handle = post?.author?.handle || "handle.invalid";
  const rkey = (post?.uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// Climb thread.parent until there's no parent left (or it's blocked/missing) — that's the root.
async function findRootUri(uri) {
  const d = await jget(
    `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=1000`,
  );
  let node = d.thread;
  if (!node?.post) throw new Error("post not found (deleted, or the author blocks the bot)");
  let rootUri = node.post.uri;
  while (node?.parent?.post) {
    node = node.parent;
    rootUri = node.post.uri;
  }
  return rootUri;
}

// Flatten the reply tree, oldest-first within each branch, depth-first —
// reads like the thread does when you scroll it.
function flatten(node, posts, replyToIndex) {
  if (posts.length >= MAX_POSTS) return;
  const post = node?.post;
  if (!post) return;
  const i = posts.length;
  posts.push({
    i,
    replyTo: replyToIndex,
    did: post.author?.did || "",
    handle: post.author?.handle || "unknown.invalid",
    displayName: post.author?.displayName || "",
    text: (post.record?.text || "").trim(),
    createdAt: post.record?.createdAt || post.indexedAt || "",
    uri: post.uri,
    permalink: permalinkFor(post),
  });
  const replies = (node.replies || []).filter((r) => r?.post);
  for (const r of replies) {
    if (posts.length >= MAX_POSTS) break;
    flatten(r, posts, i);
  }
}

// Returns { posts, participantCount, truncated, rootPermalink }.
export async function loadThread(input) {
  const startUri = await resolvePostUri(input);
  const rootUri = await findRootUri(startUri);

  const d = await jget(
    `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(rootUri)}&depth=${MAX_DEPTH}&parentHeight=0`,
  );
  if (!d.thread?.post) throw new Error("thread not found");

  const posts = [];
  flatten(d.thread, posts, null);
  if (!posts.length) throw new Error("couldn't read any posts in that thread");

  const participants = new Set(posts.map((p) => p.did).filter(Boolean));

  return {
    posts,
    participantCount: participants.size,
    truncated: posts.length >= MAX_POSTS,
    rootPermalink: posts[0].permalink,
  };
}
