// memex Worker — memex.bisks.net.
//
// The idea: a thread by @tk0l.bsky.social collected "stock phrases that can
// be quoted and re-quoted to link related posts" — a memex without the
// microfilm. This site is that phrasebook made durable: the canon phrases
// from the original thread (public/canon.js), plus a place for anyone to
// keep their own personal set as records on their own PDS
// (net.bisks.memex.phrase — see lexicons/), so a phrase survives independent
// of any one thread.
//
// One server route remains at the domain root:
//   /p/<id>       shareable per-phrase page for the canon set: same static
//                 shell, server-stamped og:title/description/url so sharing
//                 a specific phrase unfurls that phrase, not the generic
//                 card (same fix as sites/didscope, sites/steamtags).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Canon phrases mirror public/canon.js — kept here too (id/text/note only,
// no need for source/addedBy) purely so a share link can be resolved
// server-side without a round trip. Keep the two lists in sync by hand; it's
// nine short entries, not worth a build step.
const CANON: Record<string, { text: string; note: string }> = {
  "ok-wow": { text: "Ok wow", note: "the opener. low commitment, keeps the thread moving." },
  hmm: { text: "Hmm", note: "buys time. works on almost anything." },
  "hell-yeah": { text: "Hell yeah", note: "enthusiastic agreement, no elaboration required." },
  "thank-you": { text: "Thank you!", note: "closes a loop." },
  aardvark: {
    text: "aardvark",
    note:
      "the deepest cut in the set. Alphabetically first, so it's what tk0l actually searches to find this whole thread again — an homage to Xavier: Renegade Angel's aardvark bit.",
  },
  "shapes-dont-fit-words": {
    text: "I have a lot of thoughts about this topic but unfortunately none of the shapes fit into words",
    note: "for when there's too much to say and no way to say it.",
  },
  "do-that-now": { text: "ok please do that now", note: "a nudge toward action." },
  "much-to-consider": { text: "much to consider here", note: "the polite pause." },
  "rubes-marks": {
    text: "you rubes, you fucking marks",
    note:
      "added to the canon by @antiali.as, who tagged the bot to build this site. Originally posted by @jane.inurhead.lol.",
  },
};

const GENERIC_TITLE = "memex — stock phrases that link your posts";
const GENERIC_DESC =
  "A phrasebook of quotable, re-quotable stock phrases — the same wording links otherwise-unrelated posts together, memex-style. Seeded from @tk0l.bsky.social's original thread. Sign in to add your own, kept as records on your own PDS.";
const GENERIC_OG_URL = "https://memex.bisks.net/";
const GENERIC_OG_IMAGE = "https://memex.bisks.net/og.png";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const phrase = CANON[id];
  if (!phrase) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const title = `"${phrase.text}" — memex`;
  const desc = `A stock phrase from memex, the quotable-phrase memex seeded from @tk0l.bsky.social's thread: ${phrase.note}`;
  const ogUrl = `https://memex.bisks.net/p/${id}`;

  // GENERIC_OG_IMAGE must be replaced before GENERIC_OG_URL — the image
  // string starts with the URL string ("https://memex.bisks.net/" is a
  // prefix of ".../og.png"), so replacing the shorter one first would eat
  // the front of the image string too and leave "og.png" dangling.
  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc.slice(0, 300)))
    .split(GENERIC_OG_IMAGE).join(GENERIC_OG_IMAGE)
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const shareMatch = path.match(/^\/p\/([a-z0-9-]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
