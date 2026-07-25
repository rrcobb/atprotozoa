// Post the bot's in-thread reply after a build run. Invoked by the builder
// workflow's final step. Reads everything from env (no args), so a missing value
// fails loud rather than posting a malformed reply.
//
// Env in:
//   BOT_IDENTIFIER, BOT_APP_PASSWORD   -> bot login (createSession)
//   REPLY_ROOT_URI, REPLY_ROOT_CID     -> thread root strongRef
//   REPLY_PARENT_URI, REPLY_PARENT_CID -> the mention we're answering
//   BUILD_OK       -> "true" if the build succeeded
//   BUILD_RESULT   -> the built site name (or "<site>/<path>"), empty if nothing
//   BUILD_NOTE     -> optional: the agent's own short line about what it built,
//                     prepended to the SUCCESS reply and fit to 300 graphemes
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

const PDS = "https://bsky.social";

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main() {
  const ok = process.env.BUILD_OK === "true";
  const result = (process.env.BUILD_RESULT || "").trim();

  let text;
  let url = null; // the built-site URL, if any, so we can link-facet it
  if (ok && result) {
    url = result.includes("/")
      ? `https://${result.split("/")[0]}.bisks.net/${result.split("/").slice(1).join("/")}`
      : `https://${result}.bisks.net`;
    const template = `built it 🎉 — ${url}\n\n(give the deploy a minute to go live)`;
    // Optional: the agent's own short line about what it built (or its answer to
    // an "explain <site>" ask), in its voice. Prepended to the template. The
    // tagger is always one of Rob's mutuals, so we trust the phrasing — the only
    // mechanical constraint is Bluesky's 300-grapheme post limit, applied below.
    const note = (process.env.BUILD_NOTE || "").trim();
    text = note ? `${note}\n\n${template}` : template;
    text = fitToLimit(text, template, 300);
  } else if ((process.env.BUILD_ERROR || "").trim() === "usage_limit") {
    // Not "your idea flopped" — the bot is out of its monthly build budget. Say so
    // honestly instead of implying the request was the problem, so people know to
    // come back rather than keep retrying against a dead wall.
    text = `ah, i'm out of build budget for the month 😅 — this one's still in the queue and i'll get to it once i'm topped back up. thanks for the idea!`;
  } else if ((process.env.BUILD_NOTE || "").trim()) {
    // The agent deliberately didn't build (no BUILD_RESULT) but left a note — this
    // is the "no real site to build here" path: the tag was banter, a question, or
    // a post with nothing to make a site from, so the agent chose to just react in
    // its own voice instead of forcing a bad build. Send that note as the reply.
    text = graphemeSlice((process.env.BUILD_NOTE || "").trim(), 300);
  } else {
    text = `couldn't build that one, sorry! not every idea lands. try me again with something else?`;
  }

  const session = await login();
  await createReply(session, text, url);
  console.log(`replied: ${JSON.stringify(text)}`);

  // Report the outcome to the event log so logs.bisks.net can show it. Keyed by
  // the mention uri so it merges onto the record the watcher started. The reply
  // text posted above IS the replyText we log — same copy, one source of truth.
  await reportOutcome({ ok, result, url, text });
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

// Fit `text` (note + "\n\n" + template) into `limit` graphemes. The template is
// fixed and contains the built-site URL, so it's preserved whole; only the note
// is truncated (with an ellipsis) to make room. If the template alone already
// exceeds the limit, return it as-is — that shouldn't happen for our fixed
// template, and dropping the URL to fit would defeat the reply.
function fitToLimit(text, template, limit) {
  if (graphemeLen(text) <= limit) return text;
  const SEP = "\n\n";
  const tmplLen = graphemeLen(template);
  const sepLen = graphemeLen(SEP);
  const ELLIPSIS = "…";
  // Budget left for the note itself, after the separator, template, and ellipsis.
  const noteBudget = limit - tmplLen - sepLen - graphemeLen(ELLIPSIS);
  if (noteBudget <= 0) return template; // no room for any note — send template alone
  const note = text.slice(0, text.length - template.length - SEP.length);
  const truncated = graphemeSlice(note, noteBudget).trimEnd() + ELLIPSIS;
  return `${truncated}${SEP}${template}`;
}

// POST the build outcome to the buildthis worker's /outcome endpoint. No-op (with
// a log line) if the endpoint or secret isn't configured, so an unconfigured or
// briefly-down log sink never fails the build. Non-2xx and network errors are
// logged and swallowed for the same reason.
async function reportOutcome({ ok, result, url, text }) {
  const endpoint = process.env.OUTCOME_URL;
  const secret = process.env.OUTCOME_SECRET;
  const mentionUri = process.env.MENTION_URI;
  if (!endpoint || !secret || !mentionUri) {
    console.log("outcome POST skipped (OUTCOME_URL/OUTCOME_SECRET/MENTION_URI unset)");
    return;
  }
  const payload = {
    mentionUri,
    status: ok && result ? "success" : "failure",
    builtName: result || undefined,
    url: url || undefined,
    replyText: text,
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
    facets: linkFacets(text, url),
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
