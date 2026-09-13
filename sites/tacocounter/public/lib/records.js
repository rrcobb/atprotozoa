// records.js — writes to the signed-in user's own PDS. Three collections,
// all create-only TID-keyed records (see notes/50-oauth-scopes.md — scope is
// create-only for all three, so no putRecord/update path here):
//
//   net.bisks.tacocounter.log        one taco-eating event (count + when)
//   net.bisks.tacocounter.board      a leaderboard you created
//   net.bisks.tacocounter.membership you joining someone's board
//
// Copy, don't abstract: same dpopFetch-based create pattern as every other
// OAuth site in this repo (see sites/shelfguessr/public/lib/records.js).

import { dpopFetch } from "./oauth.js";

export const LOG_COLLECTION = "net.bisks.tacocounter.log";
export const BOARD_COLLECTION = "net.bisks.tacocounter.board";
export const MEMBERSHIP_COLLECTION = "net.bisks.tacocounter.membership";

async function createRecord(session, collection, record) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection,
      record: { $type: collection, ...record },
    }),
  });
  if (!res.ok) {
    throw new Error(`${collection} create failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json(); // { uri, cid }
}

// Log eating `count` tacos (default 1), with an optional short note.
export async function recordTacoLog(session, { count = 1, note = "" } = {}) {
  const n = Math.max(1, Math.min(100, Math.round(count)));
  const body = { count: n, eatenAt: new Date().toISOString() };
  const trimmed = String(note || "").trim().slice(0, 140);
  if (trimmed) body.note = trimmed;
  const { uri } = await createRecord(session, LOG_COLLECTION, body);
  return uri;
}

// Create a new leaderboard ("board"). Returns { uri, rkey }.
export async function createBoard(session, { name }) {
  const trimmed = String(name || "").trim().slice(0, 80) || "untitled board";
  const { uri } = await createRecord(session, BOARD_COLLECTION, {
    name: trimmed,
    createdAt: new Date().toISOString(),
  });
  return { uri, rkey: uri.split("/").pop() };
}

// Join a board — writes a membership record whose `.board` field points at
// the board's at-uri. Constellation indexes this link, which is how
// board.html finds every member without a global scan (see lib/constellation.js).
export async function joinBoard(session, boardUri) {
  const { uri } = await createRecord(session, MEMBERSHIP_COLLECTION, {
    board: boardUri,
    joinedAt: new Date().toISOString(),
  });
  return uri;
}
