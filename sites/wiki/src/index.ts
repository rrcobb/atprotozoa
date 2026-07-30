// wiki Worker — bisks.net/wiki, "bisksipedia".
//
// norvid_studies proposed (2026-07-30, #atproideasio) "Wikipedia" style
// entries — explanations, backstory, sidebar material — for every poster and
// every post on a site, cross-linked to the poster's own profile. bisks.net
// (Rob) tagged @buildthis to take a first crack. This is that first crack:
// two "namespaces" so far — Poster: and Post: — each auto-rendered from
// Bluesky's public AppView by id (handle/DID for a poster, handle-or-did +
// rkey for a post), with a handful of hand-written entrypoint articles (see
// entries.ts) standing in for the auto-generated stub lead paragraph.
//
// No secrets, no writes — every fetch is anonymous, unauthenticated AppView
// reads (same as sites/didscope, sites/quotehof).

import { resolveActor, getProfile, getPost, getRecentPosts, parseAtUri, type Profile, type PostView } from "./appview";
import { lookupPoster, lookupPost, FEATURED_POSTERS, FEATURED_POSTS } from "./entries";
import { MOUNT, esc, fmtDate, fmtNum, infobox, categoriesBar, page, noArticlePage } from "./render";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function posterPath(actor: string): string {
  return `${MOUNT}/poster/${encodeURIComponent(actor)}`;
}
function postPath(actor: string, rkey: string): string {
  return `${MOUNT}/post/${encodeURIComponent(actor)}/${encodeURIComponent(rkey)}`;
}

function autoPosterLead(profile: Profile): string {
  const name = esc(profile.displayName || profile.handle);
  const bio = profile.description?.trim()
    ? `<blockquote>${esc(profile.description.trim())}</blockquote>`
    : "";
  return `
    <p><b>${name}</b> (<code>@${esc(profile.handle)}</code>) is a poster on
    Bluesky with ${fmtNum(profile.postsCount)} posts, ${fmtNum(profile.followersCount)}
    followers, and ${fmtNum(profile.followsCount)} follows, as read from the
    public AppView just now.</p>
    ${bio}
    <p class="dim">This is an automatically generated stub — nobody has
    written a custom entry for this poster yet.</p>`;
}

function autoPostLead(post: PostView): string {
  const authorLink = `<a href="${posterPath(post.author.handle || post.author.did)}">@${esc(post.author.handle)}</a>`;
  const text = post.text.trim()
    ? `<blockquote>${esc(post.text.trim())}</blockquote>`
    : `<p class="dim">(no text — image, video, or link-card only)</p>`;
  const replyNote = post.isReply
    ? `<p>This post is a reply within a larger thread.${
        post.replyParentUri
          ? (() => {
              const parent = parseAtUri(post.replyParentUri!);
              return parent
                ? ` See the <a href="${postPath(parent.did, parent.rkey)}">post it replies to</a>.`
                : "";
            })()
          : ""
      }</p>`
    : "";
  return `
    <p>A post by ${authorLink}, published ${fmtDate(post.createdAt)}.</p>
    ${text}
    <p>${fmtNum(post.likeCount)} likes, ${fmtNum(post.repostCount)} reposts,
    ${fmtNum(post.quoteCount)} quotes, and ${fmtNum(post.replyCount)} replies,
    as read from the public AppView just now.</p>
    ${replyNote}
    <p class="dim">This is an automatically generated stub — nobody has
    written a custom entry for this post yet.</p>`;
}

async function renderPoster(rawActor: string): Promise<Response> {
  let did: string, handle: string;
  try {
    ({ did, handle } = await resolveActor(rawActor));
  } catch {
    return noArticlePage("Poster", rawActor, `Couldn't resolve "${rawActor}" to a Bluesky account.`);
  }

  let profile: Profile;
  try {
    profile = await getProfile(did);
  } catch {
    return noArticlePage("Poster", handle, `"${handle}" resolved to a DID, but the public AppView has no profile for it.`);
  }

  const custom = lookupPoster(did);
  const lead = custom ? custom.lead.join("\n") : autoPosterLead(profile);
  const categories = custom?.categories?.length ? custom.categories : ["Posters", "Unwritten stubs"];

  const rows = [
    { label: "Handle", html: `<code>@${esc(profile.handle)}</code>` },
    { label: "DID", html: `<code class="did">${esc(profile.did)}</code>` },
    { label: "Joined", html: fmtDate(profile.createdAt) },
    { label: "Followers", html: fmtNum(profile.followersCount) },
    { label: "Following", html: fmtNum(profile.followsCount) },
    { label: "Posts", html: fmtNum(profile.postsCount) },
    { label: "Profile", html: `<a href="https://bsky.app/profile/${esc(profile.handle)}" target="_blank" rel="noopener">bsky.app/profile/${esc(profile.handle)}</a>` },
  ];

  const recent = await getRecentPosts(did, 6);
  const notable = recent.length
    ? `<h2>Notable posts</h2><ul class="post-list">${recent
        .map((r) => {
          const rkey = r.uri.split("/").pop();
          const t = r.text.trim().length > 140 ? r.text.trim().slice(0, 137) + "…" : r.text.trim();
          return `<li><a href="${postPath(handle, rkey || "")}">${esc(t || "(untitled post)")}</a> <span class="dim">${fmtDate(r.createdAt)}</span></li>`;
        })
        .join("")}</ul>`
    : "";

  const body = `
    ${infobox({
      title: profile.displayName || profile.handle,
      image: profile.avatar,
      imageAlt: profile.handle,
      rows,
    })}
    ${lead}
    ${notable}
    <div style="clear:both"></div>
    ${categoriesBar(categories)}`;

  return new Response(
    page({
      title: profile.handle,
      namespace: "Poster",
      description: custom
        ? custom.lead[0].replace(/<[^>]+>/g, "").slice(0, 260)
        : `${profile.displayName || profile.handle} — ${fmtNum(profile.postsCount)} posts, ${fmtNum(profile.followersCount)} followers.`,
      canonicalPath: `/poster/${encodeURIComponent(handle)}`,
      bodyHtml: body,
      ogImage: profile.avatar,
    }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" } },
  );
}

async function renderPost(rawActor: string, rkey: string): Promise<Response> {
  let did: string, handle: string;
  try {
    ({ did, handle } = await resolveActor(rawActor));
  } catch {
    return noArticlePage("Post", `${rawActor}/${rkey}`, `Couldn't resolve "${rawActor}" to a Bluesky account.`);
  }

  let post: PostView;
  try {
    post = await getPost(did, rkey);
  } catch {
    return noArticlePage("Post", `${handle}/${rkey}`, `No post with that id was found (deleted, or never existed).`);
  }

  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const custom = lookupPost(uri);
  const lead = custom ? custom.lead.join("\n") : autoPostLead(post);
  const categories = custom?.categories?.length ? custom.categories : ["Posts", "Unwritten stubs"];

  const rows = [
    { label: "Author", html: `<a href="${posterPath(post.author.handle || did)}">@${esc(post.author.handle)}</a>` },
    { label: "Published", html: fmtDate(post.createdAt) },
    { label: "Likes", html: fmtNum(post.likeCount) },
    { label: "Reposts", html: fmtNum(post.repostCount) },
    { label: "Quotes", html: fmtNum(post.quoteCount) },
    { label: "Replies", html: fmtNum(post.replyCount) },
    { label: "URI", html: `<code class="did">${esc(uri)}</code>` },
    { label: "View live", html: `<a href="https://bsky.app/profile/${esc(post.author.handle)}/post/${esc(rkey)}" target="_blank" rel="noopener">bsky.app</a>` },
  ];

  const body = `
    ${infobox({
      title: `Post by @${post.author.handle}`,
      image: post.embedImages?.[0] || post.author.avatar,
      imageAlt: post.author.handle,
      rows,
    })}
    ${lead}
    <div style="clear:both"></div>
    ${categoriesBar(categories)}`;

  const plainLead = (custom ? custom.lead[0] : post.text).replace(/<[^>]+>/g, "").slice(0, 260);

  return new Response(
    page({
      title: `${handle}/${rkey}`,
      namespace: "Post",
      description: plainLead || `A post by @${post.author.handle}.`,
      canonicalPath: `/post/${encodeURIComponent(handle)}/${encodeURIComponent(rkey)}`,
      bodyHtml: body,
      ogImage: post.embedImages?.[0] || post.author.avatar,
    }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" } },
  );
}

// Loose "go to whatever this is" resolver behind the home page's search box:
// accepts a raw handle/DID, an at:// uri, or a pasted bsky.app URL, and
// redirects to the matching article path. Never 400s — worst case it
// redirects to a Poster: page that then 404s with an honest reason.
function resolveGoTarget(raw: string): string {
  const q = raw.trim();
  const atUri = parseAtUri(q);
  if (atUri) return postPath(atUri.did, atUri.rkey);

  const bskyPost = q.match(/bsky\.app\/profile\/([^/\s?#]+)\/post\/([^/\s?#]+)/i);
  if (bskyPost) return postPath(bskyPost[1], bskyPost[2]);

  const bskyProfile = q.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (bskyProfile) return posterPath(bskyProfile[1]);

  return posterPath(q);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const PREFIX = "/wiki";

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    if (!url.pathname.startsWith(PREFIX + "/")) {
      return env.ASSETS.fetch(request);
    }
    const path = url.pathname.slice(PREFIX.length) || "/";

    const posterMatch = path.match(/^\/poster\/([^/]+)\/?$/);
    if (posterMatch) return renderPoster(posterMatch[1]);

    const postMatch = path.match(/^\/post\/([^/]+)\/([^/]+)\/?$/);
    if (postMatch) return renderPost(postMatch[1], postMatch[2]);

    if (path === "/go") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) return Response.redirect(new URL(MOUNT + "/", url).toString(), 302);
      return Response.redirect(new URL(resolveGoTarget(q), url.origin).toString(), 302);
    }

    if (path === "/random") {
      const pool = [
        ...FEATURED_POSTERS.map((a) => posterPath(a)),
        ...FEATURED_POSTS.map((p) => postPath(p.actor, p.rkey)),
      ];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return Response.redirect(new URL(pick, url.origin).toString(), 302);
    }

    url.pathname = path;
    return env.ASSETS.fetch(new Request(url, request));
  },
};
