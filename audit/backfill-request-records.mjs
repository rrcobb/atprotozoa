// Backfill net.bisks.buildthis.request records from the .buildthis.json build
// stamps already sitting in the tree.
//
// Every build that changed a site's own directory left a stamp there
// (box-build.sh's write_provenance), and a stamp carries most of what the record
// wants: who asked, the tagging post, the brief, the builder's note, the site,
// and when. Everything else is recoverable from git — the commit a stamp landed
// in is the commit that build pushed, and whether the site existed before that
// commit is what makes it an edit rather than a new build.
//
// What a stamp CAN'T tell us, and what this therefore leaves off:
//   - partial vs. finished. A stamp is written on any run that touched the
//     site's dir and says nothing about how the run ended, so these all record
//     disposition "success" and leave `partial` unset. Better an absent field
//     than a guessed one — "which requests are still partial" has to stay
//     answerable, and filling it in with noise here would break exactly that.
//   - anything about a request that built NOTHING. No site dir changed, so no
//     stamp exists. Those are only in the KV event log, which expires; they are
//     simply not recoverable and the backfill doesn't pretend otherwise.
//   - liveStatus. Not a thing at stamp-writing time for most of this history.
//
// Theme-box builds (the bot self-dispatching against a theme someone typed) come
// out with the BOT's own DID as the requester, because the tagging post really
// was the bot's own announcement — there's no other identity to attribute them
// to. That's correct rather than a gap: "what has this person asked for" filtered
// to the bot's DID is the theme box's own history, which is a real answer.
//
// Records are written with source:"backfill" so a reader can tell a
// reconstructed account from one the build itself wrote, and keyed by the
// tagging post's rkey — the same key the live path uses. So a re-run overwrites
// rather than duplicating, and a live record for the same post replaces a
// backfilled one the next time that thread gets re-tagged.
//
// Usage:
//   node audit/backfill-request-records.mjs            # dry run: what it would write
//   node audit/backfill-request-records.mjs --apply    # write them
//
// Needs the bot's credentials to write (same pair box-build.sh uses):
//   BOT_IDENTIFIER=buildthis.bisks.net BOT_APP_PASSWORD=… node audit/… --apply
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  buildRequestRecord,
  putRequestRecord,
  rkeyForPost,
  requesterIdentity,
  COLLECTION,
} from "../sites/buildthis/builder/request-record.mjs";

const APPLY = process.argv.includes("--apply");
const PDS = "https://bsky.social";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// The commit that last wrote this stamp file IS the commit that build pushed:
// write_provenance runs in the build, and the push block commits the stamp along
// with the build's own work. A stamp edited later by hand (the two
// rebuiltByHand ones) would report that later commit, which is still the commit
// that most recently changed the site — close enough for a backfill, and flagged
// in the stamp itself either way.
function commitForStamp(path) {
  return git("log", "-1", "--format=%H", "--", path);
}

// Did sites/<name>/ exist BEFORE the commit that stamped it? That's the
// new-site/edit distinction, asked the same way box-build.sh asks it on a live
// build — against the parent commit rather than the working tree.
function wasEdit(commit, site) {
  if (!commit || !site) return undefined;
  const parent = git("rev-parse", `${commit}^`);
  if (!parent) return false; // stamped in the root commit: nothing existed before
  try {
    execFileSync("git", ["cat-file", "-e", `${parent}:sites/${site}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function siteUrlFor(site) {
  if (!site) return undefined;
  const host = site.split("/")[0];
  const rest = site.slice(host.length);
  return host === "apex" ? `https://bisks.net${rest}` : `https://${host}.bisks.net${rest}`;
}

async function login() {
  const identifier = process.env.BOT_IDENTIFIER;
  const password = process.env.BOT_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error("set BOT_IDENTIFIER and BOT_APP_PASSWORD to write records");
  }
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { accessJwt: j.accessJwt, did: j.did };
}

// Records already in the repo, so a re-run can skip what's there instead of
// rewriting all 600-odd every time. Only backfilled ones are skippable — a
// record the live build path wrote is the better account and must not be
// overwritten by a reconstruction, so those are skipped too, and loudly.
async function existingKeys(did) {
  const keys = new Map();
  let cursor;
  for (let page = 0; page < 40; page++) {
    const qs = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.listRecords?${qs}`);
    if (!res.ok) throw new Error(`listRecords ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (const r of j.records || []) {
      keys.set(r.uri.split("/").pop(), r.value?.source || "build");
    }
    cursor = j.cursor;
    if (!cursor || !(j.records || []).length) break;
  }
  return keys;
}

const stamps = [];
for (const name of readdirSync("sites").sort()) {
  const path = `sites/${name}/.buildthis.json`;
  if (!existsSync(path)) continue;
  try {
    stamps.push({ path, site: name, stamp: JSON.parse(readFileSync(path, "utf8")) });
  } catch (err) {
    console.error(`skipping ${path}: unreadable (${err.message})`);
  }
}
console.log(`found ${stamps.length} build stamp(s)`);

let session = null;
let existing = new Map();
if (APPLY) {
  session = await login();
  existing = await existingKeys(session.did);
  console.log(`${existing.size} record(s) already in ${COLLECTION}`);
}

let written = 0;
let skipped = 0;
let unkeyable = 0;
for (const [i, { path, site, stamp }] of stamps.entries()) {
  if (i % 50 === 0) console.log(`  … ${i}/${stamps.length} (written ${written}, skipped ${skipped})`);

  const postUri = stamp.mentionUri;
  if (!postUri) {
    // No tagging post means no stable key and no requester DID — the two things
    // the record is for. Counted, not invented.
    unkeyable++;
    continue;
  }
  const rkey = rkeyForPost(postUri);
  if (existing.has(rkey)) {
    if (existing.get(rkey) === "build") {
      console.log(`  keeping live record for ${site} (${rkey}) — not overwriting with a backfill`);
    }
    skipped++;
    continue;
  }

  const requester = await requesterIdentity(postUri, (stamp.requestedBy || "").replace(/^@/, ""));
  if (!requester) {
    unkeyable++;
    continue;
  }

  const builtName = stamp.builtName || site;
  const commit = commitForStamp(path);
  const record = buildRequestRecord({
    requester,
    postUri,
    brief: stamp.brief || "",
    note: stamp.note || undefined,
    // A stamp only exists because the site's own directory changed, so real work
    // landed. Whether the run then ran out of runway is not recorded anywhere
    // that survived; see the header.
    disposition: "success",
    site: builtName,
    siteUrl: siteUrlFor(builtName),
    edit: wasEdit(commit, builtName.split("/")[0]),
    commit: commit || undefined,
    builtAt: stamp.builtAt || undefined,
    source: "backfill",
  });

  if (!APPLY) {
    if (written < 3) console.log(JSON.stringify({ rkey, ...record }, null, 2));
    written++;
    continue;
  }
  try {
    await putRequestRecord(session, record, rkey);
    written++;
  } catch (err) {
    console.error(`  ${site} (${rkey}) failed: ${err.message}`);
  }
}

console.log(
  `${APPLY ? "wrote" : "would write"} ${written}, skipped ${skipped} already present, ${unkeyable} unkeyable`,
);
if (!APPLY) console.log("dry run — pass --apply to write");
