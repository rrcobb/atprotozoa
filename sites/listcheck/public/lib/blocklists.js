// blocklists.js — check whether one account blocks another specifically
// *via a subscribed moderation list* (as opposed to a direct block record).
//
// There's no AppView endpoint that answers "who has this DID blocked" for an
// arbitrary actor — app.bsky.graph.getBlocks is viewer-scoped and needs auth
// as the account itself. What *is* public: an account's own
// app.bsky.graph.listblock records (which lists it subscribes to block) live
// in its repo, readable straight off its PDS with com.atproto.repo.listRecords
// (same trick as sites/metamoots and sites/beefcheck's identity.js), and a
// list's membership is public via app.bsky.graph.getList on the AppView.
//
// Deliberately pairwise: this module only ever answers "does A block B (or
// B block A) via a list" for two specific DIDs you already have. It does not
// expose a "sweep this whole list of people and tell me who's blocked"
// batch call — see sites/blockledger/RETIRED.md for why that shape of tool
// got pulled by its own requester, and public/index.html here for how the
// UI keeps every check a deliberate one-at-a-time click instead of an
// automatic bulk table.

import { jget, resolvePds } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";

// Cap how many listblock records / list pages we'll walk per lookup — plenty
// for a real account (subscribing to dozens of blocklists is already an
// outlier), and keeps a single click bounded.
const MAX_LISTBLOCK_PAGES = 5; // <= 500 subscribed lists
const MAX_LIST_MEMBER_PAGES = 20; // <= 2000 members per list

// The list URIs a `did` subscribes to as a blocklist (app.bsky.graph.listblock
// records in their own repo).
export async function getListBlockSubjects(did) {
  const pds = await resolvePds(did);
  if (!pds) return [];
  const out = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_LISTBLOCK_PAGES; pg++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.graph.listblock");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const rec of d.records || []) {
      const subject = rec.value && rec.value.subject;
      if (subject) out.push(subject);
    }
    cursor = d.cursor;
    if (!cursor || !(d.records || []).length) break;
  }
  return out; // array of list URIs (at://...)
}

const listMemberCache = new Map(); // listUri -> Promise<{ name, members: Set<did> }>

// Full membership of a list, cached — many accounts subscribe to the same
// popular curated blocklists, so this is worth sharing across lookups.
export function getListMembers(listUri) {
  if (listMemberCache.has(listUri)) return listMemberCache.get(listUri);
  const p = (async () => {
    const members = new Set();
    let name = "";
    let cursor = "";
    for (let pg = 0; pg < MAX_LIST_MEMBER_PAGES; pg++) {
      const u = new URL(`${PUB}/app.bsky.graph.getList`);
      u.searchParams.set("list", listUri);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        break;
      }
      if (d.list && d.list.name) name = d.list.name;
      for (const item of d.items || []) {
        if (item.subject && item.subject.did) members.add(item.subject.did);
      }
      cursor = d.cursor;
      if (!cursor || !(d.items || []).length) break;
    }
    return { name: name || "an unnamed list", members };
  })();
  listMemberCache.set(listUri, p);
  return p;
}

export function listWebUrl(listUri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(listUri || "");
  return m ? `https://bsky.app/profile/${m[1]}/lists/${m[2]}` : null;
}

// The one entry point the UI calls: does `aDid` block `bDid` via a list
// they subscribe to, and/or does `bDid` block `aDid` via a list *they*
// subscribe to? Checks both directions for exactly this one pair.
export async function checkBlockPair(aDid, bDid) {
  const [aSubjects, bSubjects] = await Promise.all([
    getListBlockSubjects(aDid),
    getListBlockSubjects(bDid),
  ]);

  async function findBlockOf(targetDid, subjectListUris) {
    for (const uri of subjectListUris) {
      const { name, members } = await getListMembers(uri);
      if (members.has(targetDid)) return { listUri: uri, listName: name };
    }
    return null;
  }

  const [aBlocksB, bBlocksA] = await Promise.all([
    findBlockOf(bDid, aSubjects),
    findBlockOf(aDid, bSubjects),
  ]);

  return { aBlocksB, bBlocksA };
}
