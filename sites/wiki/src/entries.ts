// Hand-written "entrypoint" entries — the part of the brief that isn't
// automatic. Everything else on this wiki (any poster, any post) renders
// from live AppView data through a generic template; these few, keyed by
// DID / at-uri, get real prose instead of the auto-generated stub lead —
// same distinction Wikipedia draws between a written article and a bare
// stub, except here the "stub" is machine-written at request time.
//
// Adding another entrypoint later is just another object in these two maps.

export interface CustomEntry {
  /** HTML paragraphs (already-safe markup), replacing the auto stub lead. */
  lead: string[];
  categories: string[];
}

// keyed by DID
export const POSTER_ENTRIES: Record<string, CustomEntry> = {
  // @buildthis.bisks.net — the build agent itself.
  "did:plc:wlj4p2kazhifag6w4nanjnee": {
    lead: [
      `<b>Buildthis</b> is the build agent behind bisks.net's ever-expanding
      cluster of tiny atproto experiments. Summoned by an @-mention in a
      reply, it treats the tagged post as a commission: the post itself is
      the brief, the thread above it is context, and everything under
      <code>sites/</code> is fair game except the deploy workflow that runs
      it. Each successful build ends in a reply linking the new work — which
      makes every such reply, in effect, one of the "involved posters" this
      very wiki was proposed to document. Including, reflexively, itself.`,
      `This article is one reply's furthest extension yet: a page about the
      builder, built by the builder, at the request of the person the
      builder exists to serve. See <a href="${p("bisks.net")}">Poster:bisks.net</a>
      for that person, and <a href="${po("norvid-studies.bsky.social", "3mrumojbgak2x")}">the
      post</a> that started the idea.`,
    ],
    categories: ["Bots", "Build agents", "Entrypoints"],
  },
  // @norvid-studies.bsky.social — proposed the wiki idea.
  "did:plc:mssgex5rqek4wc66wgvzztbc": {
    lead: [
      `<b>norvid_studies</b> is one of Bluesky's more reliable generators of
      atproto feature concepts, firing a long-running stream of them at
      <a href="https://bsky.app/profile/gracekind.net">@gracekind.net</a>
      under the hashtag <b>#atproideasio</b> — see
      <a href="https://bisks.net/atproideasio">bisks.net/atproideasio</a>,
      an entire site built solely to turn the buildable ones into real
      things.`,
      `This article exists because of one such post: on 2026-07-30, norvid
      proposed "Wikipedia" style entries — explanations, backstory, and
      sidebar material — for every poster and every post on a given website,
      each cross-linked back to the poster's own profile. Satisfying that
      idea required first writing an entry about the person who proposed it,
      which is what you are reading now. See
      <a href="${po("norvid-studies.bsky.social", "3mrumojbgak2x")}">the founding post</a>
      itself, and <a href="${p("bisks.net")}">Poster:bisks.net</a> for the
      mutual who actually commissioned the build.`,
    ],
    categories: ["Ideas engines", "#atproideasio", "Entrypoints"],
  },
  // @bisks.net (Rob) — commissioned this build.
  "did:plc:f6n22z62adionrvb5s6n6vfk": {
    lead: [
      `<b>bisks.net</b> is the handle of Rob, the person behind the domain,
      the growing multiverse of Cloudflare Workers it hosts, and —
      transitively — Buildthis, the bot he built to keep building more of
      it. It is a "handle-as-domain" identity: the same string names a
      person, a Bluesky account, and a website all at once, the pattern this
      whole project borrows from accounts like @carbonadoks.com.`,
      `On 2026-07-30, Rob replied to
      <a href="${p("norvid-studies.bsky.social")}">norvid_studies'</a>
      wiki-entries idea by tagging Buildthis directly:
      <i>"take a crack under wiki.bisks.net."</i> This wiki — the one you are
      reading this sentence on — is the result. See
      <a href="${po("bisks.net", "3mrurojwykk2f")}">the
      request itself</a>.`,
    ],
    categories: ["Handle-as-domain", "Entrypoints"],
  },
};

// keyed by at:// uri
export const POST_ENTRIES: Record<string, CustomEntry> = {
  "at://did:plc:mssgex5rqek4wc66wgvzztbc/app.bsky.feed.post/3mrumojbgak2x": {
    lead: [
      `This post by <a href="${p("norvid-studies.bsky.social")}">norvid_studies</a>,
      filed under the <b>#atproideasio</b> tag, proposed writing
      Wikipedia-style entries — explanations, backstory, and sidebar
      material — for every poster and every post involved on a given
      website, each cross-linked to the poster's own profile.`,
      `It is the founding document of this wiki: everything on
      <b>wiki.bisks.net</b>, including this sentence, exists because of this
      one post. See <a href="${p("norvid-studies.bsky.social")}">Poster:norvid-studies.bsky.social</a>
      and <a href="${p("bisks.net")}">Poster:bisks.net</a>, the mutual who
      turned the idea into a build request.`,
    ],
    categories: ["Founding documents", "#atproideasio", "Entrypoints"],
  },
  "at://did:plc:f6n22z62adionrvb5s6n6vfk/app.bsky.feed.post/3mrurojwykk2f": {
    lead: [
      `In this reply to norvid_studies's founding post,
      <a href="${p("bisks.net")}">bisks.net</a> tagged
      <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a>
      directly, asking it to prototype the very wiki norvid had proposed —
      starting small (a few posters and posts), auto-rendering by id, and
      hand-writing a handful of entrypoints.`,
      `This page is one of those hand-written entrypoints: an article about
      the post that commissioned it. See
      <a href="${po("norvid-studies.bsky.social", "3mrumojbgak2x")}">the
      idea it's answering</a>, and
      <a href="${p("buildthis.bisks.net")}">Poster:buildthis.bisks.net</a>
      for the thing it built.`,
    ],
    categories: ["Build requests", "#atproideasio", "Entrypoints"],
  },
};

// small local helpers so the prose above can link without hardcoding the
// mount path everywhere — kept private to this file, not exported, since
// MOUNT itself lives in render.ts.
function p(actor: string): string {
  return `/poster/${encodeURIComponent(actor)}`;
}
function po(actor: string, rkey: string): string {
  return `/post/${encodeURIComponent(actor)}/${encodeURIComponent(rkey)}`;
}

export function lookupPoster(did: string): CustomEntry | undefined {
  return POSTER_ENTRIES[did];
}
export function lookupPost(uri: string): CustomEntry | undefined {
  return POST_ENTRIES[uri];
}

// The home page's "Featured entrypoints" list — handle/rkey pairs, not DIDs,
// since those are what a visitor actually clicks (and what /poster, /post
// resolve through the same live lookup either way).
export const FEATURED_POSTERS = [
  "buildthis.bisks.net",
  "norvid-studies.bsky.social",
  "bisks.net",
];
export const FEATURED_POSTS: Array<{ actor: string; rkey: string; label: string }> = [
  {
    actor: "norvid-studies.bsky.social",
    rkey: "3mrumojbgak2x",
    label: `"Wikipedia" style entries (the founding post)`,
  },
  {
    actor: "bisks.net",
    rkey: "3mrurojwykk2f",
    label: `"take a crack under wiki.bisks.net" (the build request)`,
  },
];

// Feed: is a different kind of lexicon object than Poster: or Post: — a
// named, curated algorithm someone published (app.bsky.feed.generator),
// not a person or a single skeet. bsky.app's own "Discover" feed is a
// stable, always-live example to seed the namespace with.
export const FEATURED_FEEDS: Array<{ actor: string; rkey: string; label: string }> = [
  {
    actor: "bsky.app",
    rkey: "whats-hot",
    label: `Discover (Bluesky's own trending feed)`,
  },
];
