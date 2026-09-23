// thread.js — resolve whatever a visitor pastes (a bsky.app link, an at://
// URI, or a share intent's t= form) into a full thread from its true root,
// and list every distinct participant. Public AppView only, no auth needed
// — this never writes anything.

const APPVIEW = "https://public.api.bsky.app/xrpc";

// Accepts:
//   https://bsky.app/profile/<handle-or-did>/post/<rkey>
//   at://<did>/app.bsky.feed.post/<rkey>
export function parsePostRef(input) {
  const s = String(input || "").trim();
  const bskyMatch = s.match(/bsky\.app\/profile\/([^/\s]+)\/post\/([a-zA-Z0-9]+)/i);
  if (bskyMatch) return { actor: bskyMatch[1], rkey: bskyMatch[2] };
  const atMatch = s.match(/^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/i);
  if (atMatch) return { actor: atMatch[1], rkey: atMatch[2] };
  return null;
}

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${APPVIEW}/${method}${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// Walks a getPostThread node up to its topmost ancestor.
function climbToRoot(node) {
  let top = node;
  while (top?.parent?.post) top = top.parent;
  return top;
}

function collect(node, byDid) {
  if (!node || node.notFound || node.blocked) return;
  const author = node.post?.author;
  if (author?.did) {
    byDid.set(author.did, {
      did: author.did,
      handle: author.handle,
      displayName: author.displayName || author.handle,
      avatar: author.avatar || "",
    });
  }
  for (const reply of node.replies || []) collect(reply, byDid);
}

// Resolves a pasted post reference to its full thread and every distinct
// participant (root author + every replier, at any depth). depth/
// parentHeight are requested at the AppView's own maximum (1000) — there is
// no smaller number that's "the right one" for an arbitrary discussion, per
// the no-arbitrary-caps rule; the ceiling is the API's, not ours.
export async function resolveThread(input) {
  const ref = parsePostRef(input);
  if (!ref) throw new Error("paste a bsky.app post link or an at:// URI");
  const uri = ref.actor.startsWith("did:")
    ? `at://${ref.actor}/app.bsky.feed.post/${ref.rkey}`
    : `at://${ref.actor}/app.bsky.feed.post/${ref.rkey}`;
  const data = await xrpc("app.bsky.feed.getPostThread", { uri, depth: 1000, parentHeight: 1000 });
  const root = climbToRoot(data.thread);
  if (root?.notFound) throw new Error("that post couldn't be found");
  if (root?.blocked) throw new Error("that thread is blocked and can't be read");
  const rootUri = root?.post?.uri;
  if (!rootUri) throw new Error("that post couldn't be found");
  const byDid = new Map();
  collect(root, byDid);
  return { rootUri, participants: Array.from(byDid.values()) };
}
