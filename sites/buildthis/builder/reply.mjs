// Post the bot's in-thread reply after a build run. Invoked by the builder
// workflow's final step. Reads everything from env (no args), so a missing value
// fails loud rather than posting a malformed reply.
//
// Env in:
//   BOT_IDENTIFIER, BOT_APP_PASSWORD   -> bot login (createSession)
//   REPLY_ROOT_URI, REPLY_ROOT_CID     -> thread root strongRef
//   REPLY_PARENT_URI, REPLY_PARENT_CID -> the mention we're answering
//   BUILD_OK       -> "true" if real work landed this run (box-build.sh's
//                     REAL_CHANGED — excludes the mandatory receipts-archive
//                     resync, which alone must never read as a build)
//   BUILD_RESULT   -> a site name (or "<site>/<path>") to link, empty if none.
//                     Set on a real build, AND on an explain-only ask (linking
//                     the site being explained) even when BUILD_OK is false.
//   BUILD_NOTE     -> optional: the agent's own short line — prepended to the
//                     "built it" reply on a real build, or IS the reply body
//                     (with BUILD_RESULT's url appended, if set) otherwise.
//                     Always fit to 300 graphemes, keeping the url whole and
//                     guaranteeing the note at least MIN_NOTE graphemes.
//   LIVE_STATUS    -> box-build.sh's post-deploy check: "verified" (the url serves
//                     and, for an edit, serves new bytes), "stale" (2xx but
//                     byte-identical to before the push — the deploy didn't land),
//                     or "dead" (never served). Picks the reply's caveat, so the
//                     bot stops saying "give the deploy a minute" when it knows
//                     better. Empty for non-shipping dispositions.
//   MENTION_URI    -> the tagging post's uri; keys the event-log outcome POST
//   OUTCOME_URL    -> buildthis worker's /outcome endpoint (optional)
//   OUTCOME_SECRET -> shared secret for the /outcome POST (optional)
//
// The reply text is derived from BUILD_OK/BUILD_RESULT here — NOT from the
// third-party brief — so the brief text can never become bot-authored post copy.
//
// Besides posting to Bluesky, this reports the outcome back to the buildthis
// worker's event log (POST /outcome), keyed by MENTION_URI, so the logs site
// (logs.bisks.net) shows built name / success|failure / reply text. That POST is
// best-effort: a failure logs and is swallowed, so it can never turn a successful
// build+reply into a red workflow.

import { readFileSync } from "node:fs";

// Graphemes of the agent's note we refuse to trade away for template boilerplate.
// About one sentence — enough to say what got built.
const MIN_NOTE = 80;

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// The path `site` is mounted at on the shared bisks.net zone, or null when the
// site is served at its own `<site>.bisks.net` hostname — which is the default
// again since the 2026-07-31 migration back to subdomains (see
// notes/20-deploy.md). Reads the site's own wrangler.toml rather than assuming
// a shape.
//
// Order matters here. Most sites carry BOTH a `<site>.bisks.net/*` hostname
// route and a legacy `bisks.net/<site>` path route kept alive for previously
// shared links. Checking the path first would make every reply link the old
// URL, so the hostname route wins whenever it's present.
//
// (The path-first behaviour was itself a fix: a flat-only check once mis-linked
// every clustered games/* site to a never-provisioned subdomain — caught
// 2026-07-27 via a desertbus report. Both shapes are handled now.)
function mountPath(site) {
  try {
    const toml = readFileSync(`sites/${site}/wrangler.toml`, "utf8");

    // Own hostname? Then there's no mount path — it's served at the root.
    const hostRoute = new RegExp(`pattern\\s*=\\s*"${site}\\.bisks\\.net`);
    if (hostRoute.test(toml)) return null;

    const patterns = [...toml.matchAll(/pattern\s*=\s*"bisks\.net(\/[^"]+)"/g)].map((m) => m[1]);
    // Prefer the base route (no trailing "/*" wildcard) over the wildcard
    // sibling every mounted site's routes list also carries.
    return patterns.find((p) => !p.endsWith("/*")) || patterns[0] || null;
  } catch {
    return null;
  }
}

// Turn a BUILD_RESULT name ("<site>" or "<site>/<path>") into the site's live URL.
// Special case: "apex" IS bisks.net itself (the root domain, no subdomain — see
// notes/00-vision.md / notes/30-identity-and-did.md). Every other site gets the
// mechanical <name>.bisks.net; apex would otherwise produce "apex.bisks.net", a
// hostname that was never provisioned and never resolves (caught 2026-07-26 after
// a reply linked exactly that dead URL). Returns null for an empty result.
function siteUrl(result) {
  if (!result) return null;
  if (result === "apex" || result.startsWith("apex/")) {
    const rest = result.slice("apex".length);
    return `https://bisks.net${rest}`;
  }
  const site = result.split("/")[0];
  const rest = result.slice(site.length); // "" or "/sub/path..."
  const mount = mountPath(site);
  return mount
    ? `https://bisks.net${mount}${rest}`
    : `https://${site}.bisks.net${rest}`;
}

async function main() {
  const ok = process.env.BUILD_OK === "true";
  const result = (process.env.BUILD_RESULT || "").trim();
  const note = (process.env.BUILD_NOTE || "").trim();
  const partial = (process.env.BUILD_ERROR || "").trim() === "partial";
  const liveStatus = (process.env.LIVE_STATUS || "").trim();

  let text;
  const url = siteUrl(result); // the built-site URL, if any, so we can link-facet it
  if (ok && result) {
    // Two shipped-and-live shapes: a finished build ("built it 🎉") and a PARTIAL —
    // a build that got a real first pass live but ran out of turns before finishing.
    // The partial's whole point is that the work is preserved and CONTINUABLE: the
    // template invites a re-tag on this thread to keep building it (which runs as a
    // normal edit against the now-live site — no special resume machinery).
    // The tail is honest about whether the URL actually serves the new build.
    // box-build.sh polls for ~90s and reports LIVE_STATUS: "verified" (serving,
    // and for an edit serving genuinely new bytes), "stale" (2xx but byte-identical
    // to before the push — the deploy didn't land), or "dead" (never served).
    // Previously every one of these got "(give the deploy a minute to go live)",
    // which reads as reassurance and was wrong exactly when the user most needed
    // the truth: 90 of 361 successes in the 30-day log were never verified live.
    //
    // Neither caveat tells the user to just wait. A failed deploy on this repo is
    // SILENT AND PERMANENT — there is no retry, the site goes on serving its last
    // good build indefinitely, and the only signal is a red Actions run (found by
    // the 2026-09-17 Cloudflare audit). So "give it a few minutes" would be false
    // comfort for the case that needs action: the fix is another push, which for
    // a user means re-tagging.
    // Joined to the headline with a SINGLE newline, so it stays inside the tail's
    // protected first paragraph rather than becoming a sheddable one of its own.
    const caveat =
      liveStatus === "verified"
        ? ""
        : liveStatus === "stale"
          ? `\nheads up: the deploy didn't land — that link is still the old version. tag me and i'll push it again.`
          : `\nheads up: i couldn't get that url to load after building it. tag me and i'll take another run at it.`;
    // "built it 🎉" next to "the deploy didn't land" reads as the bot not knowing
    // what happened. When the url isn't confirmed, state what was done without the
    // celebration and let the caveat carry the news.
    // fitToLimit sheds tail paragraphs from the END to keep the note whole, and
    // never sheds the first. So the url line and the caveat are JOINED into that
    // protected first paragraph: the caveat is news the user acts on (the link
    // doesn't work), and losing it would leave a broken link presented as a
    // finished build — worse than the truncation this whole change is fixing.
    // "not fully done; tag me here" is predictable boilerplate and sits in the
    // second paragraph, which is what gets dropped under pressure.
    const shipped = liveStatus === "verified";
    const headline = partial
      ? `got a first pass up${shipped ? " 🚧" : ""} — ${url}`
      : `built it${shipped ? " 🎉" : ""} — ${url}`;
    const template = shipped
      ? partial
        ? `${headline}\n\nnot fully done; tag me here to keep building it.`
        : `${headline}\n\n(it's live)`
      // Unverified: caveat rides in the protected paragraph. On a partial it also
      // carries the "tag me" ask, so the invitation would only repeat it.
      : `${headline}${caveat}`;
    // Optional: the agent's own short line about what it built, in its voice.
    // Prepended to the template. The tagger is always one of Rob's mutuals, so we
    // trust the phrasing — the only mechanical constraint is Bluesky's 300-grapheme
    // post limit, applied below.
    // MIN_NOTE: the note is the only part that says what was built, so guarantee
    // it at least a sentence's worth even if that costs the template's caveat.
    text = fitToLimit(note, template, 300, MIN_NOTE);
  } else if ((process.env.BUILD_ERROR || "").trim() === "usage_limit") {
    // Not "your idea flopped" — the bot is out of its monthly build budget. Say so
    // honestly instead of implying the request was the problem, so people know to
    // come back rather than keep retrying against a dead wall.
    text = `ah, i'm out of build budget for the month 😅 — this one's still in the queue and i'll get to it once i'm topped back up. thanks for the idea!`;
  } else if ((process.env.BUILD_ERROR || "").trim() === "too_big") {
    // The ask overran the build's turn budget — too ambitious to finish in one pass.
    // Honest + actionable (and not "it flopped"): the idea was good, just big. Nudge
    // toward a smaller first slice, which the bot CAN land, rather than a dead retry.
    text = `oof, that one's a big one — i ran out of runway before i could finish it in one pass 😅 got a smaller first slice in mind? i can build that and we grow it from there.`;
  } else if (note) {
    // ok is false (or result is empty) but the agent left a note — this covers TWO
    // cases, and they must not read the same:
    //   - pure banter/no-build: no BUILD_RESULT, the note is a small reaction.
    //   - explain-only: BUILD_RESULT IS set (per BUILD_PROMPT.md, "the note IS the
    //     deliverable... set BUILD_RESULT to that site's name so the reply links
    //     it"), but nothing was actually (re)built this run, so ok is deliberately
    //     false — see box-build.sh's REAL_CHANGED. Getting here with `result` set
    //     used to silently drop the link the agent asked for and fall back to a
    //     raw character slice with no ellipsis; both are fixed by reusing
    //     fitToLimit, which preserves the url whole and only trims the note.
    text = fitToLimit(note, url || "", 300, MIN_NOTE);
  } else {
    text = `couldn't build that one, sorry! not every idea lands. try me again with something else?`;
  }

  // REPLY_SKIP=1 means "report the outcome, but don't post to the thread." Set by
  // box-build.sh when the build is being silently requeued (usage_limit, or an
  // incomplete build with retries left): a retry isn't a user-facing event, and
  // posting "trying again" under every slow build would be thread noise. We still
  // report so the queue can requeue and the timeline reflects the attempt.
  const skipReply = process.env.REPLY_SKIP === "1";
  if (skipReply) {
    console.log(`reply skipped (requeue); would have said: ${JSON.stringify(text)}`);
  } else {
    const session = await login();
    await createReply(session, text, url);
    console.log(`replied: ${JSON.stringify(text)}`);
  }

  // Report the outcome to the event log so logs.bisks.net can show it. Keyed by
  // the mention uri so it merges onto the record the watcher started. The reply
  // text posted above IS the replyText we log — same copy, one source of truth.
  // `requeue` tells the worker to put the job back on the queue instead of retiring
  // it (see REQUEUE in box-build.sh); `posted` records whether we actually replied.
  const requeue = process.env.REQUEUE === "true";
  // Whether box-build.sh confirmed the site actually served after deploy. Logged on
  // the outcome so /health and the timeline can flag a build that pushed but never
  // came up (a broken deploy) vs. one verified live.
  const liveVerified = process.env.LIVE_VERIFIED === "true";
  await reportOutcome({ ok, result, url, text, requeue, posted: !skipReply, liveVerified, liveStatus, partial });
}

// Count graphemes, not UTF-16 code units — Bluesky's 300 limit is graphemes, so
// an emoji or combined character counts once, not two-or-more. .length would
// over-count and truncate too aggressively.
function graphemeLen(s) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let n = 0;
  for (const _ of seg.segment(s)) n++;
  return n;
}

// Take the first `n` graphemes of `s` (grapheme-safe slice — never splits an
// emoji or combining sequence mid-character).
function graphemeSlice(s, n) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let out = "";
  let i = 0;
  for (const { segment } of seg.segment(s)) {
    if (i >= n) break;
    out += segment;
    i++;
  }
  return out;
}

// Fit `head` (arbitrary-length, e.g. the agent's own note) plus `tail` (fixed —
// a template or a bare url, joined with a blank line when both are non-empty)
// into `limit` graphemes. `tail`'s FIRST paragraph is preserved whole — dropping a
// url to make room would defeat the point of linking it — and `head` is truncated
// with an ellipsis to fit. `tail` may be "" (a plain note with nothing fixed to keep),
// in which case `head` alone is trimmed to the limit. If `tail` alone doesn't
// fit `limit`, `head` is dropped entirely and `tail` is returned as-is — that
// shouldn't happen for our short fixed templates/urls, and truncating the url
// itself would just produce a dead link.
//
// The tail used to be sacrosanct and the note got whatever was left, which
// inverted the priorities: the tail's later paragraphs are boilerplate the reader
// can predict, while the note is the only sentence that says WHAT was built. That
// left 37 of 49 partials in the 30-day log as bare boilerplate, and truncated 90
// of 450 replies overall mid-sentence — always in the note, never in the template.
//
// So the tail is treated as paragraphs in priority order: the FIRST one (the url
// line) is never dropped, and each later one is shed, last first, for as long as
// that helps the note fit whole. `minHead` is the floor below which we stop
// bothering — if even the bare url line can't leave the note that much, the note
// gets truncated with an ellipsis as before.
function fitToLimit(head, tail, limit, minHead = 0) {
  const SEP = head && tail ? "\n\n" : "";
  const full = `${head}${SEP}${tail}`;
  if (graphemeLen(full) <= limit) return full;
  const ELLIPSIS = "…";

  let useTail = tail;
  if (head) {
    const fits = (t) => graphemeLen(head) + (t ? 2 : 0) + graphemeLen(t) <= limit;
    const paras = tail.split("\n\n");
    // Shed trailing paragraphs, last first, stopping as soon as the note fits
    // whole or only the url line is left.
    for (let keep = paras.length; keep >= 1 && !fits(useTail); keep--) {
      useTail = paras.slice(0, keep).join("\n\n");
    }
    // Nothing we can shed makes the note fit: keep only as much tail as still
    // leaves the note its floor, so the ellipsis costs boilerplate first.
    if (!fits(useTail) && minHead > 0) {
      const roomFor = (t) =>
        limit - graphemeLen(t) - (t ? 2 : 0) - graphemeLen(ELLIPSIS);
      if (roomFor(useTail) < minHead) {
        const firstPara = paras[0];
        if (roomFor(firstPara) >= minHead) useTail = firstPara;
      }
    }
  }

  // Trimming the tail may have freed enough room for the head to fit whole — in
  // which case send it whole, with no ellipsis promising a continuation that
  // isn't there.
  const trimmedSep = head && useTail ? "\n\n" : "";
  if (graphemeLen(`${head}${trimmedSep}${useTail}`) <= limit) {
    return `${head}${trimmedSep}${useTail}`;
  }

  const tailLen = graphemeLen(useTail);
  const sepLen = graphemeLen(trimmedSep);
  // Budget left for head itself, after the separator, tail, and ellipsis.
  const headBudget = limit - tailLen - sepLen - graphemeLen(ELLIPSIS);
  if (headBudget <= 0) return useTail; // no room for any head — send tail alone
  const truncated = graphemeSlice(head, headBudget).trimEnd() + ELLIPSIS;
  return `${truncated}${trimmedSep}${useTail}`;
}

// POST the build outcome to the buildthis worker's /outcome endpoint. No-op (with
// a log line) if the endpoint or secret isn't configured, so an unconfigured or
// briefly-down log sink never fails the build. Non-2xx and network errors are
// logged and swallowed for the same reason.
async function reportOutcome({ ok, result, url, text, requeue = false, posted = true, liveVerified = false, liveStatus = "", partial = false }) {
  const endpoint = process.env.OUTCOME_URL;
  const secret = process.env.OUTCOME_SECRET;
  const mentionUri = process.env.MENTION_URI;
  if (!endpoint || !secret || !mentionUri) {
    console.log("outcome POST skipped (OUTCOME_URL/OUTCOME_SECRET/MENTION_URI unset)");
    return;
  }
  const payload = {
    mentionUri,
    // A partial IS a shipped, live outcome (status success), tagged `partial:true`
    // so the timeline/directory can show it as a work-in-progress rather than done.
    status: ok && result ? "success" : "failure",
    // The harness's own classification, verbatim: success | partial | usage_limit |
    // too_big | no_build | incomplete. `status` is a two-way collapse of this and
    // can't distinguish an overrun that shipped work (success) from a deliberate
    // "nothing to build here" (failure) — so anything counting outcomes should read
    // THIS, not status. See notes/90-infra-and-budget.md.
    disposition: process.env.DISPOSITION || undefined,
    builtName: result || undefined,
    url: url || undefined,
    // Don't overwrite the event's replyText with copy we never posted — on a
    // silent requeue there's no reply to record, so omit it and keep any prior one.
    replyText: posted ? text : undefined,
    // Ask the worker to requeue this job (bump attempts, back to queued) rather
    // than retire it. The worker enforces the attempt ceiling; this is the request.
    requeue: requeue || undefined,
    // Post-deploy liveness result (success builds only). false here on a success
    // means "pushed but the URL didn't serve in time" — a signal worth surfacing.
    liveVerified: ok && result ? liveVerified : undefined,
    // Why the liveness check came out that way: "verified" | "stale" | "dead".
    // liveVerified collapses stale and dead into one false, but they mean very
    // different things — a stale edit deployed nothing, a dead url never came up.
    liveStatus: liveStatus || undefined,
    // Unfinished-but-live: a first pass shipped, continuable by re-tagging.
    partial: partial || undefined,
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`outcome POST ${res.status}: ${await res.text()}`);
    } else {
      console.log(`outcome reported: ${payload.status}`);
    }
  } catch (err) {
    console.error(`outcome POST failed: ${err}`);
  }
}

// Build a link facet for `url` where it appears in `text`, so it renders as a
// clickable link instead of plain text. atproto facets use UTF-8 BYTE offsets,
// not JS string indices — so measure the byte length of the slice before the URL
// for byteStart, and the byte length of the URL itself for the span. Returns []
// if the url isn't present (shouldn't happen, but fail safe rather than post a
// broken facet).
function linkFacets(text, url) {
  if (!url) return [];
  const at = text.indexOf(url);
  if (at < 0) return [];
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, at)).length;
  const byteEnd = byteStart + enc.encode(url).length;
  return [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    },
  ];
}

// Resolve @handle mentions in `text` into rich-text mention facets. Bluesky
// does not auto-link @handles in raw text records (dave.9000ish.uk flagged
// this after "found a real line to @minomobi.com" — from BUILD_NOTE — posted
// as inert plain text): the record needs a byte-indexed facet pointing at the
// handle's DID. `src/index.ts`'s watcher already does this for its own fixed
// replies via a caller-supplied handle->DID map; this note's handles aren't
// known in advance, so we resolve each one against the public AppView instead.
// Best-effort per handle: one that fails to resolve just renders as plain
// text, same as an @-mention Bluesky itself can't resolve.
const MENTION_RE = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

async function resolveHandle(handle) {
  try {
    const res = await fetch(
      `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    );
    if (!res.ok) return null;
    const j = await res.json();
    return j.did || null;
  } catch {
    return null;
  }
}

async function mentionFacets(text) {
  const handles = [...new Set([...text.matchAll(MENTION_RE)].map((m) => m[1]))];
  if (handles.length === 0) return [];
  const dids = new Map(
    await Promise.all(handles.map(async (h) => [h, await resolveHandle(h)])),
  );
  const enc = new TextEncoder();
  const facets = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const did = dids.get(match[1]);
    if (!did) continue;
    const byteStart = enc.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + enc.encode(match[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
  }
  return facets;
}

async function login() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: reqEnv("BOT_IDENTIFIER"),
      password: reqEnv("BOT_APP_PASSWORD"),
    }),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { accessJwt: j.accessJwt, did: j.did };
}

async function createReply(session, text, url) {
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: reqEnv("REPLY_ROOT_URI"), cid: reqEnv("REPLY_ROOT_CID") },
      parent: { uri: reqEnv("REPLY_PARENT_URI"), cid: reqEnv("REPLY_PARENT_CID") },
    },
    facets: [...linkFacets(text, url), ...(await mentionFacets(text))],
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) throw new Error(`createRecord ${res.status}: ${await res.text()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
