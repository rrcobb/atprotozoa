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
    text = `built it 🎉 — ${url}\n\n(give the deploy a minute to go live)`;
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
