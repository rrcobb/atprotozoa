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

// `curatelist` rather than `modlist`: a curation list is the neutral kind. The
// user can point a mute or block at it in the app, but creating it as a modlist
// would presume the purpose. See notes/88-listbot.md.
const CURATE_LIST_PURPOSE = "app.bsky.graph.defs#curatelist";

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
): Promise<RepoRecord<ListValue> | null> {
  const record = {
    $type: LIST_NSID,
    name: name.trim(),
    purpose: CURATE_LIST_PURPOSE,
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
): Promise<ActionResult> {
  const nonceRef = { nonce: session.dpopNonce };
  try {
    let list = await findList(session, listName, nonceRef);
    let created = false;
    if (!list) {
      list = await createList(session, listName, nonceRef);
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

export interface ListWithMembers {
  uri: string;
  rkey: string;
  name: string;
  purpose?: string;
  members: ListMember[];
}

// Every list in the user's repo with its members, for the signed-in page.
//
// Read from the user's OWN repo (listRecords) rather than the AppView, so a
// list shows up here the moment listbot writes it instead of whenever the
// AppView catches up. Handles are hydrated separately and are cosmetic — a
// member with no handle still renders, by DID, and still removes.
export async function readLists(session: ActingSession): Promise<{
  lists: ListWithMembers[];
  nonce?: string;
}> {
  const nonceRef = { nonce: session.dpopNonce };
  const listRecs = await listRecords<ListValue>(session, LIST_NSID, nonceRef);
  const itemRecs = await listRecords<ListItemValue>(session, LISTITEM_NSID, nonceRef);

  const byList = new Map<string, ListMember[]>();
  for (const item of itemRecs) {
    const listUri = item.value?.list;
    const subject = item.value?.subject;
    if (!listUri || !subject) continue;
    const members = byList.get(listUri) ?? [];
    members.push({ rkey: item.uri.split("/").pop()!, subjectDid: subject });
    byList.set(listUri, members);
  }

  const lists: ListWithMembers[] = listRecs.map((r) => ({
    uri: r.uri,
    rkey: r.uri.split("/").pop()!,
    name: r.value?.name ?? "(unnamed)",
    purpose: r.value?.purpose,
    members: byList.get(r.uri) ?? [],
  }));
  lists.sort((a, b) => a.name.localeCompare(b.name));

  return { lists, nonce: nonceRef.nonce };
}

// Fill in handles/avatars for the DIDs on those lists. Public AppView data, so
// no auth — and best-effort: a failure here leaves bare DIDs on the page rather
// than failing the whole render.
export async function hydrateMembers(
  lists: ListWithMembers[],
  appview: string,
): Promise<void> {
  const dids = [...new Set(lists.flatMap((l) => l.members.map((m) => m.subjectDid)))];
  if (!dids.length) return;

  const profiles = new Map<string, { handle?: string; displayName?: string; avatar?: string }>();
  // getProfiles caps at 25 actors per call.
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${appview}/xrpc/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const res = await fetch(u.toString());
      if (!res.ok) continue;
      const j = (await res.json()) as {
        profiles?: { did: string; handle?: string; displayName?: string; avatar?: string }[];
      };
      for (const p of j.profiles ?? []) {
        profiles.set(p.did, { handle: p.handle, displayName: p.displayName, avatar: p.avatar });
      }
    } catch {}
  }

  for (const l of lists) {
    for (const m of l.members) {
      const p = profiles.get(m.subjectDid);
      if (p) Object.assign(m, p);
    }
  }
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
