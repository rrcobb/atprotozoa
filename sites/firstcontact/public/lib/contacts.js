// contacts.js — for one account, download its ENTIRE repo in one shot
// (com.atproto.sync.getRepo, see lib/car.js) and walk EVERY collection in it
// (not just app.bsky.feed.*) to find every other account it ever reached out
// to — a like, a reply, a quote post, a repost, a follow, a mention, or
// whatever a third-party lexicon's own record shape turns out to reference —
// then keep only the earliest interaction per account: the moment "first
// contact" was made. @psingletary.com asked for this after downloading their
// own .car and wanting the chronological list built for them instead of by
// hand.
//
// Unlike sites/backscroll (which only ever wants app.bsky.feed.post), this
// can't filter the CAR walk down to a fixed list of $type strings — the whole
// point is to also catch collections this repo has never hardcoded, like a
// streamplace chat message or a semble card link. So car.js here is patched
// to accept `types: null` and hand back every record in the repo, and
// extractTargets() below has three tiers: explicit handling for the
// app.bsky.* shapes we know (subject.uri, reply.parent, embed.record,
// mention facets, a bare-DID subject); explicit handling for a couple of
// named third-party lexicons the original brief called out by name
// (place.stream.chat.message's `streamer`, network.cosmik's card/connection/
// follow — Streamplace and Semble, per their public lexicon schemas); and a
// generic recursive scan for everything else — any string field that turns
// out to be an at:// URI or a bare DID naming another account. The generic
// tier is honest about what it found: it labels the interaction after the
// field name it found the reference in, and shows the record's own
// collection NSID as the "application" rather than guessing a product name
// for lexicons this repo has never seen before.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

// ---- friendly names for the collection an interaction came from ----------
//
// Keyed on the collection NSID's first two dot-segments (e.g.
// "app.bsky.feed.like" -> "app.bsky"). Anything not in this list still shows
// up in the table — just under its raw two-segment namespace instead of a
// made-up product name, which is the honest thing to do for a lexicon this
// list doesn't know about yet (streamplace, semble, or whatever's next).
const KNOWN_APPS = {
  "app.bsky": "Bluesky",
  "chat.bsky": "Bluesky Chat",
  "com.atproto": "AT Protocol",
  "pub.leaflet": "Leaflet",
  "com.whtwnd": "WhiteWind",
  "events.smokesignal": "Smoke Signal",
  "fyi.unravel": "Unravel",
  "xyz.statusphere": "Statusphere",
  "com.shinolabs.pinksea": "PinkSea",
  "app.dropanchor": "Anchor",
  "blue.zio": "atFile",
  "space.tangled": "Tangled",
  "social.grain": "Grain",
  "fm.teal": "Teal",
  "computer.mackerel": "Mackerel",
  "place.stream": "Streamplace",
  "network.cosmik": "Semble",
};

function applicationLabel(collection) {
  const parts = (collection || "").split(".");
  const prefix = parts.slice(0, 2).join(".");
  return KNOWN_APPS[prefix] || prefix || collection || "unknown";
}

// ---- pulling a target account out of one record ---------------------------

const AT_URI_DID_RE = /^at:\/\/(did:[a-zA-Z0-9._:%-]+)\//;
const BARE_DID_RE = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;

function didFromAtUri(uri) {
  if (typeof uri !== "string") return null;
  const m = uri.match(AT_URI_DID_RE);
  return m ? m[1] : null;
}
function asDid(v) {
  return typeof v === "string" && BARE_DID_RE.test(v) ? v : null;
}

// Turns a dotted field path ("reply.parent.uri", "recipientDid") into a
// readable label ("parent", "recipient") for the generic fallback below —
// best-effort, not a claim about what the third-party app actually calls it.
function labelForPath(path) {
  const last = (path.split(".").pop() || "").replace(/(uri|did|ref|cid)$/i, "") || "linked";
  const words = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words || "linked";
}

const GENERIC_SKIP_KEYS = new Set(["$type", "createdAt", "text", "langs", "tags", "labels", "facets"]);

// Recursively hunts an unrecognized record for anything shaped like a
// reference to another account: a bare DID string, or an at:// URI whose
// authority is a DID. Depth- and size-capped as a genuine safety backstop
// (some records embed large blobs of unrelated nested data) rather than a
// caution cap — five levels deep and 50 array entries covers any reasonable
// lexicon shape.
function genericScan(node, out, ownDid, path = "", depth = 0) {
  if (depth > 5 || node == null) return;
  if (typeof node === "string") {
    const did = asDid(node) || didFromAtUri(node);
    if (did && did !== ownDid) out.push({ targetDid: did, type: labelForPath(path) });
    return;
  }
  if (Array.isArray(node)) {
    if (node.length > 50) return;
    for (const v of node) genericScan(v, out, ownDid, path, depth + 1);
    return;
  }
  if (typeof node === "object" && !(node instanceof Uint8Array)) {
    for (const [k, v] of Object.entries(node)) {
      if (GENERIC_SKIP_KEYS.has(k)) continue;
      genericScan(v, out, ownDid, path ? `${path}.${k}` : k, depth + 1);
    }
  }
}

function extractTargets(rec, ownDid) {
  const type = rec.$type;
  const out = [];
  const add = (targetDid, label) => {
    if (targetDid && targetDid !== ownDid) out.push({ targetDid, type: label });
  };

  if (type === "app.bsky.feed.like") {
    add(didFromAtUri(rec.subject && rec.subject.uri), "like");
  } else if (type === "app.bsky.feed.repost") {
    add(didFromAtUri(rec.subject && rec.subject.uri), "repost");
  } else if (type === "app.bsky.graph.follow") {
    add(asDid(rec.subject), "follow");
  } else if (type === "app.bsky.graph.block") {
    add(asDid(rec.subject), "block");
  } else if (type === "app.bsky.graph.listitem") {
    add(asDid(rec.subject), "list add");
  } else if (type === "app.bsky.feed.post") {
    if (rec.reply && rec.reply.parent && rec.reply.parent.uri) {
      add(didFromAtUri(rec.reply.parent.uri), "reply");
    }
    const embed = rec.embed;
    let quoteUri = null;
    if (embed && embed.$type === "app.bsky.embed.record" && embed.record) quoteUri = embed.record.uri;
    else if (embed && embed.$type === "app.bsky.embed.recordWithMedia" && embed.record && embed.record.record) {
      quoteUri = embed.record.record.uri;
    }
    if (quoteUri) add(didFromAtUri(quoteUri), "quote post");
    for (const facet of rec.facets || []) {
      for (const feature of facet.features || []) {
        if (feature && feature.$type === "app.bsky.richtext.facet#mention" && typeof feature.did === "string") {
          add(feature.did, "mention");
        }
      }
    }
  } else if (type === "place.stream.chat.message") {
    // place.stream.chat.message (Streamplace): the streamer whose chat this
    // message was posted into — named explicitly by @psingletary.com's brief.
    add(asDid(rec.streamer), "chat message");
  } else if (type === "network.cosmik.card") {
    // network.cosmik.card (Semble): parentCard/originalCard are strongRefs
    // (at:// URI + cid) to another account's card when this one replies to
    // or reposts it — "linking semble card" from the brief.
    if (rec.parentCard && rec.parentCard.uri) add(didFromAtUri(rec.parentCard.uri), "card reply");
    if (rec.originalCard && rec.originalCard.uri) add(didFromAtUri(rec.originalCard.uri), "card repost");
  } else if (type === "network.cosmik.connection") {
    // network.cosmik.connection (Semble): source/target are each either a
    // plain URL or an at:// URI — only the latter names another account.
    add(didFromAtUri(rec.source), "card link");
    add(didFromAtUri(rec.target), "card link");
  } else if (type === "network.cosmik.follow") {
    add(asDid(rec.subject), "follow");
  } else {
    const found = [];
    genericScan(rec, found, ownDid);
    const seen = new Set();
    for (const f of found) {
      if (seen.has(f.targetDid)) continue;
      seen.add(f.targetDid);
      out.push(f);
    }
  }
  return out;
}

// ---- dating a record, even one from a lexicon with no createdAt ----------
//
// TID rkeys (the atproto default) encode their own creation timestamp: a
// 13-character base32-sortable string is a 64-bit int of [0][53-bit
// microseconds since epoch][10-bit clock id]. Falling back to decoding the
// key itself means a record from some third-party app that skipped
// `createdAt` can still be placed in time, instead of being dropped from the
// chronological list entirely.
const TID_CHARS = "234567abcdefghijklmnopqrstuvwxyz";
function decodeTid(rkey) {
  if (typeof rkey !== "string" || rkey.length !== 13) return null;
  let v = 0n;
  for (let i = 0; i < 13; i++) {
    const idx = TID_CHARS.indexOf(rkey[i]);
    if (idx === -1) return null;
    v = (v << 5n) + BigInt(idx);
  }
  const micros = (v >> 10n) & ((1n << 53n) - 1n);
  const ms = Number(micros / 1000n);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  if (year < 2022 || year > 2100) return null; // atproto predates 2022 — guards against a garbage decode
  return d.toISOString();
}

function isParsableDate(v) {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function recordDate(rec, rkey) {
  for (const key of ["createdAt", "sentAt", "indexedAt", "timestamp", "time", "date"]) {
    const v = rec && rec[key];
    if (isParsableDate(v)) return { iso: new Date(v).toISOString(), estimated: false };
  }
  const tid = decodeTid(rkey);
  if (tid) return { iso: tid, estimated: true };
  return { iso: null, estimated: false };
}

// ---- the actual "first contact per account" reduction ---------------------

export function computeFirstContacts(did, records) {
  const events = [];
  for (const { uri, value: rec } of records) {
    if (!rec || typeof rec.$type !== "string") continue;
    const parts = uri.split("/");
    const collection = parts[3];
    const rkey = parts[4];
    const { iso: date, estimated } = recordDate(rec, rkey);
    for (const t of extractTargets(rec, did)) {
      if (!t.targetDid || t.targetDid === did) continue;
      events.push({
        targetDid: t.targetDid,
        type: t.type,
        collection,
        application: applicationLabel(collection),
        date,
        estimated,
        uri,
      });
    }
  }

  const firstByDid = new Map();
  for (const e of events) {
    const cur = firstByDid.get(e.targetDid);
    if (!cur) { firstByDid.set(e.targetDid, e); continue; }
    if (e.date && (!cur.date || e.date < cur.date)) firstByDid.set(e.targetDid, e);
  }

  const list = [...firstByDid.values()];
  list.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });

  return { list, totalEvents: events.length };
}

// ---- fallback: a repo download failed, so walk every collection by hand --
//
// com.atproto.repo.describeRepo names every collection actually present in
// the repo (this is what makes the fallback generic too, not just a
// bsky-only consolation prize) and com.atproto.repo.listRecords paginates
// each one. 400 pages/collection mirrors kevinmoot's FOLLOWERS_PAGES
// backstop (notes/40-new-site-playbook.md's "question every cap" order) —
// the walk still has to paginate here because the bulk path already failed,
// but the page count itself is a generosity knob, not a safety limit.
const FALLBACK_PAGE_CAP = 400;

export async function fetchAllCollectionsPaginated(pds, did, onProgress) {
  const base = pds.replace(/\/$/, "");
  const desc = await jget(`${base}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`);
  const collections = desc.collections || [];
  const out = [];
  for (const collection of collections) {
    let cursor = "";
    for (let p = 0; p < FALLBACK_PAGE_CAP; p++) {
      const u = new URL(`${base}/xrpc/com.atproto.repo.listRecords`);
      u.searchParams.set("repo", did);
      u.searchParams.set("collection", collection);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        break;
      }
      for (const rec of d.records || []) out.push({ uri: rec.uri, value: rec.value });
      if (onProgress) onProgress(`paginating ${collection}... ${out.length} records so far`);
      cursor = d.cursor;
      if (!cursor) break;
    }
  }
  return out;
}

// ---- resolving DIDs to handles/avatars for the table -----------------------
//
// app.bsky.actor.getProfiles takes at most 25 actors per call — this isn't a
// self-imposed cap, it's the endpoint's own limit, so every distinct account
// still gets resolved, just in batches of 25 rather than one request.
export async function resolveProfiles(dids) {
  const uniq = [...new Set(dids)];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += 25) {
    const chunk = uniq.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const data = await jget(u.toString());
      for (const p of data.profiles || []) {
        out.set(p.did, { handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" });
      }
    } catch (_) {
      // that batch failed to resolve — those DIDs just render un-handled in the table
    }
  }
  return out;
}

// ---- the whole run ----------------------------------------------------------

export async function traceContacts(rawHandle, { onProgress } = {}) {
  const step = (s) => { if (onProgress) onProgress(s); };

  step("resolving handle…");
  const did = await resolveDid(rawHandle);
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => null);
  const handle = (profile && profile.handle) || rawHandle.replace(/^@/, "");

  step("finding your PDS…");
  const pds = await resolvePds(did);
  if (!pds) throw new Error(`couldn't find a PDS for ${handle}`);

  let records = [];
  let fetchMethod = "repo";
  try {
    step(`downloading repo CAR from ${pds} …`);
    const { records: recs } = await fetchRepoRecordsWithKeys(pds, did, null, step);
    records = recs;
  } catch (_) {
    fetchMethod = "paginated";
    step("repo CAR download failed — falling back to a per-collection paginated walk…");
    records = await fetchAllCollectionsPaginated(pds, did, step);
  }
  if (!records.length) throw new Error("found no records in that repo");

  step(`found ${records.length.toLocaleString()} records across every collection — extracting contacts…`);
  const { list, totalEvents } = computeFirstContacts(did, records);
  if (!list.length) throw new Error("no outward-facing records found — nothing to trace first contact from");

  step("resolving account names…");
  const profiles = await resolveProfiles(list.map((e) => e.targetDid));

  return {
    did,
    handle,
    displayName: (profile && profile.displayName) || handle,
    avatar: (profile && profile.avatar) || "",
    fetchMethod,
    totalRecords: records.length,
    totalEvents,
    contacts: list.map((e) => ({ ...e, profile: profiles.get(e.targetDid) || null })),
  };
}
