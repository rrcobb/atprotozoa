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
//
// Membership checks are *reachability* checks, not membership dumps: a list
// is paged forward only until the one DID being asked about turns up (or the
// list runs out), so a click against a 2,000-member list that hits early
// costs one page, not twenty. segyges.bsky.social asked for exactly this
// after the first pass — checking a pair shouldn't require pulling the
// list's full membership either way. Pages already fetched stick around on
// the list's cache entry, so later checks against the same list (a
// different pair, or the "browse this list" drill-down below) resume from
// wherever the last check left off instead of starting over.

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

// listUri -> { name, members: Map<did, profile>, cursor, exhausted, pages, queue }
// `queue` serializes page-fetches for one list so two concurrent lookups
// against the same list (e.g. the two directions of one pair-check, or two
// different pairs that share a popular curated list) resume each other's
// progress instead of racing duplicate requests for the same page. Members
// are stored with the profile info getList already hands back, so the
// drill-down view never has to re-fetch a profile per member.
const listState = new Map();

function stateFor(listUri) {
  let s = listState.get(listUri);
  if (!s) {
    s = { name: "", members: new Map(), cursor: "", exhausted: false, pages: 0, queue: Promise.resolve() };
    listState.set(listUri, s);
  }
  return s;
}

// Advance a list's paging cursor until `stopWhen(state)` is true, or the
// list/page-cap is exhausted — whichever comes first. This is the one place
// that talks to app.bsky.graph.getList; both the reachability check and the
// full-membership drill-down below are just different `stopWhen`s over it.
function advance(listUri, stopWhen) {
  const s = stateFor(listUri);
  s.queue = s.queue.then(async () => {
    while (!s.exhausted && s.pages < MAX_LIST_MEMBER_PAGES && !stopWhen(s)) {
      const u = new URL(`${PUB}/app.bsky.graph.getList`);
      u.searchParams.set("list", listUri);
      u.searchParams.set("limit", "100");
      if (s.cursor) u.searchParams.set("cursor", s.cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        s.exhausted = true;
        break;
      }
      s.pages++;
      if (d.list && d.list.name) s.name = d.list.name;
      for (const item of d.items || []) {
        const subj = item.subject;
        if (subj && subj.did) {
          s.members.set(subj.did, {
            did: subj.did,
            handle: subj.handle || subj.did,
            displayName: subj.displayName || subj.handle || subj.did,
            avatar: subj.avatar || "",
          });
        }
      }
      s.cursor = d.cursor;
      if (!s.cursor || !(d.items || []).length) s.exhausted = true;
    }
    return s;
  });
  return s.queue;
}

// Reachability: is `did` a member of this list? Pages forward only until
// `did` turns up or the list is confirmed exhausted — never pulls the rest
// of the membership just to answer a yes/no about one DID.
async function listHasMember(listUri, did) {
  const s = await advance(listUri, (st) => st.members.has(did));
  return s.members.has(did);
}

// Drill-down: page the *rest* of one specific list in. Only called when the
// user explicitly asks to browse a list a check surfaced — never as part of
// the pair-check itself. Resumes from wherever `listHasMember` left off, and
// returns the profiles getList already gave us — no per-member fetch.
export async function getFullListMembers(listUri) {
  const s = await advance(listUri, () => false);
  return { name: s.name || "an unnamed list", members: Array.from(s.members.values()) };
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
      if (await listHasMember(uri, targetDid)) {
        return { listUri: uri, listName: stateFor(uri).name || "an unnamed list" };
      }
    }
    return null;
  }

  const [aBlocksB, bBlocksA] = await Promise.all([
    findBlockOf(bDid, aSubjects),
    findBlockOf(aDid, bSubjects),
  ]);

  return { aBlocksB, bBlocksA };
}
