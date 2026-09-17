#!/usr/bin/env node
//
// Publish (or update) the app.bsky.labeler.service record that declares the
// built-by-bot labeler. Until this record exists in the labeler account's repo,
// the service is invisible: Bluesky has nothing to show on a profile and no way
// for anyone to subscribe, even though queryLabels is already answering.
//
// The record is rkey "self" (the lexicon pins it: "key": "literal:self"), so
// putRecord is an idempotent upsert — running this twice updates in place
// rather than creating a second declaration.
//
// Env in:
//   LABELER_IDENTIFIER   -> the labeler account's handle or DID (createSession)
//   LABELER_APP_PASSWORD -> that account's app password
//
// Credentials come from the environment and are never read from the repo, same
// shape as sites/buildthis/builder/reply.mjs. Run it like:
//
//   LABELER_IDENTIFIER=builtbybot.bisks.net \
//   LABELER_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx' \
//   node audit/labeler-publish.mjs
//
//   --dry-run   print the record and exit without writing anything
//
// See notes/87-labeler.md for where this sits in the provisioning sequence.

const PDS = "https://bsky.social";
const DRY = process.argv.includes("--dry-run");

// One label value, defined here rather than left to the global vocabulary —
// `built-by-bot` isn't a global label, so without a definition a subscriber
// sees a bare unexplained string in their settings.
//
// severity "inform" + blurs "none" + defaultSetting "ignore" is the deliberate
// combination: this is a descriptive badge, and subscribing to it must never
// hide anyone's content. A label that hid posts would be a moderation tool,
// which this explicitly is not (see the site's /policy).
const RECORD = {
  $type: "app.bsky.labeler.service",
  createdAt: new Date().toISOString(),
  policies: {
    labelValues: ["built-by-bot"],
    labelValueDefinitions: [
      {
        identifier: "built-by-bot",
        severity: "inform",
        blurs: "none",
        defaultSetting: "ignore",
        adultOnly: false,
        locales: [
          {
            lang: "en",
            name: "Built by a bot",
            description:
              "A bot made this. Applied by builtbybot.bisks.net to the @buildthis.bisks.net account and to the posts that asked for sites it went on to build. " +
              "It is descriptive, not a judgment, and it hides nothing. " +
              "This labeler only marks its own project's output — it never assesses whether anyone else is automated. " +
              "Full policy and limits: https://builtbybot.bisks.net/policy",
          },
        ],
      },
    ],
  },
  // Empty arrays, not omitted: per the lexicon, "if not defined (distinct from
  // empty array), all reason types are allowed". This service reviews nothing
  // and accepts no reports, so it must say so explicitly rather than silently
  // advertise itself as accepting every kind of moderation report.
  reasonTypes: [],
  subjectTypes: [],
};

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

if (DRY) {
  console.log(JSON.stringify(RECORD, null, 2));
  console.log("\n(dry run — nothing written)");
  process.exit(0);
}

const identifier = reqEnv("LABELER_IDENTIFIER");
const password = reqEnv("LABELER_APP_PASSWORD");

const sessionRes = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier, password }),
});
if (!sessionRes.ok) {
  console.error(`login failed: ${sessionRes.status} ${await sessionRes.text()}`);
  process.exit(1);
}
const session = await sessionRes.json();
console.log(`logged in as ${session.handle} (${session.did})`);

const putRes = await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${session.accessJwt}`,
  },
  body: JSON.stringify({
    repo: session.did,
    collection: "app.bsky.labeler.service",
    rkey: "self",
    record: RECORD,
  }),
});
if (!putRes.ok) {
  console.error(`putRecord failed: ${putRes.status} ${await putRes.text()}`);
  process.exit(1);
}
const out = await putRes.json();

console.log(`
published: ${out.uri}

Set this DID as LABELER_DID in sites/builtbybot/wrangler.toml:

  ${session.did}

The account will now show a "Labels" tab on its Bluesky profile. Note that
Bluesky only treats an account as a labeler once its DID document carries an
#atproto_label key — see notes/87-labeler.md if the tab doesn't appear.
`);
