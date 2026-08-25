// status.js — classify one DID's account status the same way the protocol
// itself does, not by guessing from a missing avatar.
//
// Two independent signals, both public, no auth:
//   1. Does the DID document still resolve at all (plc.directory / did:web
//      well-known, via identity.js's resolveDidDoc)? A did:plc DID that
//      stops resolving has been tombstoned — atproto's term for a fully
//      deleted/retired account — so a 404 here is conclusive on its own.
//   2. For a DID that still resolves, com.atproto.sync.getRepoStatus (the
//      lexicon's own account-hosting-status endpoint — see
//      lexicons/com/atproto/sync/getRepoStatus.json) reports the exact
//      thing this tool wants: `active` plus, when inactive, a `status` of
//      "takendown" | "suspended" | "deactivated" | "deleted" | ... . It's
//      "Expected to be implemented by PDS and Relay" — queried here against
//      the main relay (bsky.network) rather than each member's own PDS, so
//      one well-known CORS-friendly host answers for every DID regardless
//      of who hosts them.

import { jget, resolveDidDoc } from "./identity.js";

const RELAY = "https://bsky.network/xrpc";

const LABELS = {
  live: "live",
  removed: "removed",
  suspended: "suspended",
  takendown: "taken down",
  deactivated: "deactivated",
  unindexed: "unindexed",
  unclear: "unclear",
};

export function statusLabel(status) {
  return LABELS[status] || status;
}

// Returns { did, status, handle, pds, detail }. `status` is always one of
// LABELS' keys. `handle` is the DID document's own alsoKnownAs claim when
// the DID resolves (this is the "looked up through the did:plc or
// equivalent" name), null otherwise.
export async function resolveAccountStatus(did) {
  const docInfo = await resolveDidDoc(did);
  if (!docInfo.resolved) {
    if (docInfo.unsupportedMethod) {
      return {
        did,
        status: "unclear",
        handle: null,
        pds: null,
        detail: `rollcall only resolves did:plc and did:web (atproto's two supported DID methods)`,
      };
    }
    return {
      did,
      status: "removed",
      handle: null,
      pds: null,
      detail: `DID no longer resolves (${docInfo.reason || "not found"}) — deleted or retired`,
    };
  }

  let repoStatus;
  try {
    repoStatus = await jget(`${RELAY}/com.atproto.sync.getRepoStatus?did=${encodeURIComponent(did)}`);
  } catch (err) {
    if (err.status === 404 && err.body && err.body.error === "RepoNotFound") {
      return {
        did,
        status: "unindexed",
        handle: docInfo.handle,
        pds: docInfo.pds,
        detail: "DID document resolves, but the main relay has no crawl record for it (often a self-hosted PDS the relay hasn't indexed)",
      };
    }
    return {
      did,
      status: "unclear",
      handle: docInfo.handle,
      pds: docInfo.pds,
      detail: `couldn't reach the relay's status check (${err.message})`,
    };
  }

  if (repoStatus.active) {
    return { did, status: "live", handle: docInfo.handle, pds: docInfo.pds, detail: "" };
  }

  const s = repoStatus.status;
  if (s === "takendown") return { did, status: "takendown", handle: docInfo.handle, pds: docInfo.pds, detail: "" };
  if (s === "suspended") return { did, status: "suspended", handle: docInfo.handle, pds: docInfo.pds, detail: "" };
  if (s === "deactivated") return { did, status: "deactivated", handle: docInfo.handle, pds: docInfo.pds, detail: "" };
  if (s === "deleted") return { did, status: "removed", handle: docInfo.handle, pds: docInfo.pds, detail: "" };
  return {
    did,
    status: "unclear",
    handle: docInfo.handle,
    pds: docInfo.pds,
    detail: s ? `relay reports inactive: ${s}` : "relay reports inactive, no reason given",
  };
}
