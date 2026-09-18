// Acting on a user's own repo: find-or-create a list, add/remove members.
//
// Why lists and not labels. Labels are signed by one labeler DID. There is no
// such thing as a per-user label — if listbot issued them, every label would be
// listbot's assertion about someone, and "wrong" would be listbot's problem to
// adjudicate. A list is the opposite: app.bsky.graph.list lives in the user's
// OWN repo, signed by their own key, and means whatever they decide it means.
// That is exactly the tool layer Rob asked for — nobody has to be right,
// because nobody but the owner is asserting anything.
//
// It also happens to be immediately useful with no further work: Bluesky
// already consumes these as mute lists, block lists, and feed curation lists.

import { dpopFetch, type DpopKey } from "./oauth.js";

const LIST_NSID = "app.bsky.graph.list";
const LISTITEM_NSID = "app.bsky.graph.listitem";

// The two kinds of list, and what the difference actually buys.
//
// A `curatelist` feeds list-feeds, starter packs and interaction gating. A
// `modlist` is the one a mute or a block can point at — and note that mute and
// block are separate records in the SUBSCRIBER's repo (app.bsky.graph.muteActorList
// and app.bsky.graph.listblock), both pointing at the same list. So one person's
// blocklist is another person's mute list; the list itself doesn't say which.
// Mutes are private, blocks are public records.
//
// `purpose` gates which of those are available at all: a curatelist can't be
// muted or blocked. Curate stays the DEFAULT because it presumes least, but a
// tag that clearly asks for muting or blocking gets a modlist — otherwise the
// bot quietly makes something that can't do the thing that was asked for.
//
// Verified 2026-09-18: purpose can be changed in place with putRecord and the
// memberships survive, because listitems point at the list URI and the rkey
// doesn't change. So converting a list later is safe.
export type ListPurpose = "curatelist" | "modlist";
const PURPOSE_URI: Record<ListPurpose, string> = {
  curatelist: "app.bsky.graph.defs#curatelist",
  modlist: "app.bsky.graph.defs#modlist",
};
const CURATE_LIST_PURPOSE = PURPOSE_URI.curatelist;

export interface ActingSession {
  did: string;
  pdsUrl: string;
  accessToken: string;
  dpopKey: DpopKey;
  dpopNonce?: string;
}

interface RepoRecord<T> {
  uri: string;
  cid: string;
  value: T;
}

interface ListValue {
  $type?: string;
  name?: string;
  purpose?: string;
  createdAt?: string;
}

interface ListItemValue {
  $type?: string;
  subject?: string;
  list?: string;
  createdAt?: string;
}

// Result of one tag. `nonce` rides along so the caller can persist whatever the
// PDS last handed us instead of re-doing the nonce dance next tick.
export interface ActionResult {
  ok: boolean;
  created?: boolean;
  alreadyThere?: boolean;
  notThere?: boolean;
  listName?: string;
  listUri?: string;
  error?: string;
  nonce?: string;
}

async function xrpc<T>(
  session: ActingSession,
  method: "GET" | "POST",
  nsid: string,
  params: Record<string, string> | null,
  body: unknown | null,
  nonceRef: { nonce?: string },
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const base = session.pdsUrl.replace(/\/$/, "");
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const { res, nonce } = await dpopFetch(
    session.dpopKey,
    {
      method,
      url: `${base}/xrpc/${nsid}${qs}`,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    },
    { nonce: nonceRef.nonce, accessToken: session.accessToken },
  );
  nonceRef.nonce = nonce ?? nonceRef.nonce;
  if (!res.ok) {
    return { ok: false, status: res.status, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true, status: res.status, data: (await res.json()) as T };
}

// Page through one collection in the user's repo. Lists are small (a person has
// tens, not thousands), but listitems for a popular list are not, so this pages
// properly rather than reading one page and hoping.
async function listRecords<T>(
  session: ActingSession,
  collection: string,
  nonceRef: { nonce?: string },
  maxPages = 20,
): Promise<RepoRecord<T>[]> {
  const out: RepoRecord<T>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      repo: session.did,
      collection,
      limit: "100",
    };
    if (cursor) params.cursor = cursor;
    const r = await xrpc<{ records: RepoRecord<T>[]; cursor?: string }>(
      session,
      "GET",
      "com.atproto.repo.listRecords",
      params,
      null,
      nonceRef,
    );
    if (!r.ok || !r.data) break;
    out.push(...(r.data.records ?? []));
    cursor = r.data.cursor;
    if (!cursor || !(r.data.records ?? []).length) break;
  }
  return out;
}

// List names are matched case-insensitively on trimmed whitespace, so "Bots",
// "bots", and " bots " are one list. People tag from a phone; exact-match would
// quietly create near-duplicate lists and they'd never know why.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findList(
  session: ActingSession,
  name: string,
  nonceRef: { nonce?: string },
): Promise<RepoRecord<ListValue> | null> {
  const wanted = normalizeName(name);
  const records = await listRecords<ListValue>(session, LIST_NSID, nonceRef);
  return records.find((r) => normalizeName(r.value?.name ?? "") === wanted) ?? null;
}

async function createList(
  session: ActingSession,
  name: string,
  nonceRef: { nonce?: string },
  purpose: ListPurpose = "curatelist",
): Promise<RepoRecord<ListValue> | null> {
  const record = {
    $type: LIST_NSID,
    name: name.trim(),
    purpose: PURPOSE_URI[purpose],
    description: "maintained by tagging @listbot.bisks.net",
    createdAt: new Date().toISOString(),
  };
  const r = await xrpc<{ uri: string; cid: string }>(
    session,
    "POST",
    "com.atproto.repo.createRecord",
    null,
    { repo: session.did, collection: LIST_NSID, record },
    nonceRef,
  );
  if (!r.ok || !r.data) return null;
  return { uri: r.data.uri, cid: r.data.cid, value: record };
}

export async function addToList(
  session: ActingSession,
  listName: string,
  subjectDid: string,
  purpose: ListPurpose = "curatelist",
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  try {
    let list = await findList(session, listName, nonceRef);
    let created = false;
    if (!list) {
      list = await createList(session, listName, nonceRef, purpose);
      created = true;
    }
    if (!list) {
      return { ok: false, error: "couldn't find or create that list", nonce: nonceRef.nonce };
    }

    // Don't double-add. A second tag of the same person on the same list is a
    // no-op with a distinct reply, not a duplicate listitem.
    const items = await listRecords<ListItemValue>(session, LISTITEM_NSID, nonceRef);
    const existing = items.find(
      (i) => i.value?.list === list!.uri && i.value?.subject === subjectDid,
    );
    if (existing) {
      return {
        ok: true,
        alreadyThere: true,
        listName: list.value?.name ?? listName,
        listUri: list.uri,
        nonce: nonceRef.nonce,
      };
    }

    const r = await xrpc<{ uri: string }>(
      session,
      "POST",
      "com.atproto.repo.createRecord",
      null,
      {
        repo: session.did,
        collection: LISTITEM_NSID,
        record: {
          $type: LISTITEM_NSID,
          subject: subjectDid,
          list: list.uri,
          createdAt: new Date().toISOString(),
        },
      },
      nonceRef,
    );
    if (!r.ok) return { ok: false, error: r.error, nonce: nonceRef.nonce };

    return {
      ok: true,
      created,
      listName: list.value?.name ?? listName,
      listUri: list.uri,
      nonce: nonceRef.nonce,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), nonce: nonceRef.nonce };
  }
}

export async function removeFromList(
  session: ActingSession,
  listName: string,
  subjectDid: string,
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  try {
    const list = await findList(session, listName, nonceRef);
    if (!list) {
      // Removing from a list that doesn't exist is not an error worth alarming
      // about, but it IS worth saying — it usually means a typo'd name.
      return { ok: true, notThere: true, listName, nonce: nonceRef.nonce };
    }

    const items = await listRecords<ListItemValue>(session, LISTITEM_NSID, nonceRef);
    const matches = items.filter(
      (i) => i.value?.list === list.uri && i.value?.subject === subjectDid,
    );
    if (!matches.length) {
      return {
        ok: true,
        notThere: true,
        listName: list.value?.name ?? listName,
        listUri: list.uri,
        nonce: nonceRef.nonce,
      };
    }

    // Delete every match, not just the first. Duplicates shouldn't exist (see
    // addToList), but a list built before listbot, or by another tool, can have
    // them — and a "remove" that leaves one behind reads as broken.
    for (const m of matches) {
      const rkey = m.uri.split("/").pop()!;
      const r = await xrpc(
        session,
        "POST",
        "com.atproto.repo.deleteRecord",
        null,
        { repo: session.did, collection: LISTITEM_NSID, rkey },
        nonceRef,
      );
      if (!r.ok) return { ok: false, error: r.error, nonce: nonceRef.nonce };
    }

    return {
      ok: true,
      listName: list.value?.name ?? listName,
      listUri: list.uri,
      nonce: nonceRef.nonce,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), nonce: nonceRef.nonce };
  }
}

// A web link to a list, for the reply. Bluesky renders a list at
// /profile/<did>/lists/<rkey>.
export function listWebUrl(did: string, listUri: string): string {
  return `https://bsky.app/profile/${did}/lists/${listUri.split("/").pop()}`;
}

// --- reading, for the web UI -------------------------------------------------

export interface ListMember {
  // The listitem's rkey, which is what a delete needs.
  rkey: string;
  subjectDid: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export interface ListSummary {
  uri: string;
  rkey: string;
  name: string;
  purpose: ListPurpose;
  // From the AppView, which already counts these. Null when it hasn't indexed
  // the list yet — a list listbot made seconds ago renders with no count rather
  // than a wrong one.
  memberCount: number | null;
}

// Every list in the user's repo: names, kinds, counts. NO members.
//
// This is the whole of what /lists needs, and keeping members out of it is the
// point. The old version read every listitem in the repo to render a list of
// lists — two round trips for 150 members, far worse for someone with
// thousands, and all of it thrown away except the counts.
//
// Lists come from the user's OWN repo so a list shows up the moment listbot
// writes it. Counts come from the AppView, which has already done the counting;
// they lag by a few seconds on a brand-new list, which is worth it to avoid
// paging every listitem on every page load.
export async function readListSummaries(
  session: ActingSession,
  appview: string,
): Promise<{ lists: ListSummary[]; nonce?: string }> {
  const nonceRef = { nonce: session.dpopNonce };
  const records = await listRecords<ListValue>(session, LIST_NSID, nonceRef);

  const lists: ListSummary[] = records.map((r) => ({
    uri: r.uri,
    rkey: r.uri.split("/").pop()!,
    name: r.value?.name ?? "(unnamed)",
    purpose: r.value?.purpose === PURPOSE_URI.modlist ? "modlist" : "curatelist",
    memberCount: null,
  }));

  // One AppView call for all of them. Best-effort: counts are a nicety, and a
  // failure here should leave the page working without them.
  try {
    const u = new URL(`${appview}/xrpc/app.bsky.graph.getLists`);
    u.searchParams.set("actor", session.did);
    u.searchParams.set("limit", "100");
    const res = await fetch(u.toString());
    if (res.ok) {
      const j = (await res.json()) as {
        lists?: { uri: string; listItemCount?: number }[];
      };
      const counts = new Map((j.lists ?? []).map((l) => [l.uri, l.listItemCount ?? 0]));
      for (const l of lists) {
        const n = counts.get(l.uri);
        if (n !== undefined) l.memberCount = n;
      }
    }
  } catch {}

  lists.sort((a, b) => a.name.localeCompare(b.name));
  return { lists, nonce: nonceRef.nonce };
}

// One list, and one page of its members. For /lists/<rkey>.
//
// Members come from the AppView's getList, which pages properly and hydrates
// handles and avatars in the same call — rather than reading every listitem in
// the repo and then looking up profiles separately, which is what the old
// all-in-one read did.
//
// The catch: a listitem the AppView hasn't indexed yet won't appear. That's a
// few seconds on a fresh add, and the alternative costs a full repo scan on
// every page view.
export interface ListPage {
  uri: string;
  rkey: string;
  name: string;
  purpose: ListPurpose;
  members: ListMember[];
  cursor?: string;
  memberCount: number | null;
}

export async function readListPage(
  session: ActingSession,
  rkey: string,
  appview: string,
  cursor?: string,
  limit = 50,
): Promise<{ page: ListPage | null; nonce?: string }> {
  const nonceRef = { nonce: session.dpopNonce };
  const uri = `at://${session.did}/${LIST_NSID}/${rkey}`;

  // The list record itself from the user's own repo, so a list listbot just
  // made is viewable immediately even before the AppView indexes it.
  const got = await xrpc<{ uri: string; value: ListValue }>(
    session,
    "GET",
    "com.atproto.repo.getRecord",
    { repo: session.did, collection: LIST_NSID, rkey },
    null,
    nonceRef,
  );
  if (!got.ok || !got.data) return { page: null, nonce: nonceRef.nonce };

  const page: ListPage = {
    uri,
    rkey,
    name: got.data.value?.name ?? "(unnamed)",
    purpose: got.data.value?.purpose === PURPOSE_URI.modlist ? "modlist" : "curatelist",
    members: [],
    memberCount: null,
  };

  // Members, hydrated, from the AppView.
  try {
    const u = new URL(`${appview}/xrpc/app.bsky.graph.getList`);
    u.searchParams.set("list", uri);
    u.searchParams.set("limit", String(limit));
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u.toString());
    if (res.ok) {
      const j = (await res.json()) as {
        list?: { listItemCount?: number };
        items?: {
          uri: string;
          subject: { did: string; handle?: string; displayName?: string; avatar?: string };
        }[];
        cursor?: string;
      };
      page.memberCount = j.list?.listItemCount ?? null;
      page.cursor = j.cursor;
      page.members = (j.items ?? []).map((it) => ({
        // The listitem's own rkey — what a remove needs. getList returns the
        // listitem URI here, not the subject's.
        rkey: it.uri.split("/").pop()!,
        subjectDid: it.subject.did,
        handle: it.subject.handle,
        displayName: it.subject.displayName,
        avatar: it.subject.avatar,
      }));
    }
  } catch {}

  return { page, nonce: nonceRef.nonce };
}

// Delete one listitem by rkey. The UI's undo button: the page already showed
// the user this exact member, so it passes the rkey straight back.
export async function deleteListItem(
  session: ActingSession,
  rkey: string,
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  const r = await xrpc(
    session,
    "POST",
    "com.atproto.repo.deleteRecord",
    null,
    { repo: session.did, collection: LISTITEM_NSID, rkey },
    nonceRef,
  );
  return r.ok
    ? { ok: true, nonce: nonceRef.nonce }
    : { ok: false, error: r.error, nonce: nonceRef.nonce };
}

// Delete a whole list, and every membership in it. Two steps on purpose: a
// deleted list record with its listitems left behind leaves orphans in the
// repo that nothing will ever clean up.
export async function deleteList(
  session: ActingSession,
  rkey: string,
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  const listUri = `at://${session.did}/${LIST_NSID}/${rkey}`;
  try {
    const items = await listRecords<ListItemValue>(session, LISTITEM_NSID, nonceRef);
    for (const item of items) {
      if (item.value?.list !== listUri) continue;
      await xrpc(
        session,
        "POST",
        "com.atproto.repo.deleteRecord",
        null,
        { repo: session.did, collection: LISTITEM_NSID, rkey: item.uri.split("/").pop()! },
        nonceRef,
      );
    }
    const r = await xrpc(
      session,
      "POST",
      "com.atproto.repo.deleteRecord",
      null,
      { repo: session.did, collection: LIST_NSID, rkey },
      nonceRef,
    );
    return r.ok
      ? { ok: true, nonce: nonceRef.nonce }
      : { ok: false, error: r.error, nonce: nonceRef.nonce };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), nonce: nonceRef.nonce };
  }
}

// Find-or-create a list, adding nobody. For a tag that asks for a list without
// naming anyone to put on it — "make me a list for X" — which has no subject
// because there's no post being replied to.
export async function ensureList(
  session: ActingSession,
  name: string,
  purpose: ListPurpose = "curatelist",
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  try {
    const existing = await findList(session, name, nonceRef);
    if (existing) {
      return {
        ok: true,
        alreadyThere: true,
        listName: existing.value?.name ?? name,
        listUri: existing.uri,
        nonce: nonceRef.nonce,
      };
    }
    const made = await createList(session, name, nonceRef, purpose);
    if (!made) {
      return { ok: false, error: "couldn't create that list", nonce: nonceRef.nonce };
    }
    return {
      ok: true,
      created: true,
      listName: made.value?.name ?? name,
      listUri: made.uri,
      nonce: nonceRef.nonce,
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), nonce: nonceRef.nonce };
  }
}

// Change a list's purpose in place. Verified safe: putRecord keeps the rkey, so
// the list URI is unchanged and every listitem pointing at it survives.
export async function setListPurpose(
  session: ActingSession,
  rkey: string,
  purpose: ListPurpose,
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  try {
    const listUri = `at://${session.did}/${LIST_NSID}/${rkey}`;
    const records = await listRecords<ListValue>(session, LIST_NSID, nonceRef);
    const current = records.find((r) => r.uri === listUri);
    if (!current) return { ok: false, error: "no such list", nonce: nonceRef.nonce };

    const r = await xrpc(
      session,
      "POST",
      "com.atproto.repo.putRecord",
      null,
      {
        repo: session.did,
        collection: LIST_NSID,
        rkey,
        // Whole record: putRecord replaces rather than merges, so anything left
        // out (description, avatar) would be dropped.
        record: { ...current.value, $type: LIST_NSID, purpose: PURPOSE_URI[purpose] },
      },
      nonceRef,
    );
    return r.ok
      ? { ok: true, listName: current.value?.name, listUri, nonce: nonceRef.nonce }
      : { ok: false, error: r.error, nonce: nonceRef.nonce };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), nonce: nonceRef.nonce };
  }
}
