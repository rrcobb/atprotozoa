// trades.js — two-party pelor trades, per @antiali.as's verse: "Δύο φίλοι
// θέλοντες ἀλλάσσειν θῆρας, ἄμφω σφραγίζουσι δέλτον κοινήν· οὐδεὶς γὰρ μόνος
// κλέπτει, ἀλλ' ἡ συμφωνία δεσμεῖ ἀμφοτέρους. οὕτω πιστὸν τὸ δῶρον, ὡς ὅρκος
// θεῶν." (Two friends wishing to exchange beasts both seal a joint tablet; no
// one steals alone, agreement binds both — the gift is trustworthy as an oath
// of the gods.)
//
// Neither client can ever write to the other player's repo — OAuth only
// grants each signed-in player create/update on their *own*
// net.bisks.kolpelor.trade collection (see oauth.js's SCOPE). So a trade is
// two independent writes to two different repos, matched by a shared rkey
// (the tradeId): the proposer's record names what they offer and want; the
// recipient's own record, if they agree, mirrors it back. isSealed() below is
// the only thing that decides a trade is real — both records must exist and
// agree — and every client (proposer's and recipient's) checks it
// independently before touching its own local bestiary. See
// public/lexicons/net.bisks.kolpelor.trade.json for the record shape and
// public/app.js's Trading counter panel for the UI this powers.

import { dpopFetch, resolvePds } from "./oauth.js";

export const TRADE_COLLECTION = "net.bisks.kolpelor.trade";

function genTradeId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function putOwnTrade(session, tradeId, record) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: TRADE_COLLECTION,
      rkey: tradeId,
      record: { $type: TRADE_COLLECTION, ...record },
    }),
  });
  if (!res.ok) {
    throw new Error(`trade write failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()).uri;
}

// Proposer's opening move: write "I offer X, I want Y from you" to my own repo.
export async function proposeTrade(session, { withDid, offer, want, note }) {
  const tradeId = genTradeId();
  const record = {
    with: withDid,
    status: "proposed",
    offer,
    want,
    note: note || undefined,
    createdAt: new Date().toISOString(),
  };
  const uri = await putOwnTrade(session, tradeId, record);
  return { tradeId, uri, record };
}

// Recipient's move, if they agree: write my own mirrored record at the SAME
// rkey — my offer is their want, my want is their offer. This is the second
// seal; once it exists, isSealed() is true for anyone reading both repos.
export async function acceptTrade(session, { tradeId, proposerDid, myOffer, myWant }) {
  const record = {
    with: proposerDid,
    status: "accepted",
    offer: myOffer,
    want: myWant,
    createdAt: new Date().toISOString(),
  };
  const uri = await putOwnTrade(session, tradeId, record);
  return { tradeId, uri, record };
}

// Proposer, once they've observed the seal and applied the swap locally,
// updates their own record to "accepted" too — cosmetic (the trade is already
// real per isSealed()) but leaves both tablets in the same final state,
// "ἄμφω σφραγίζουσι."
export async function markTradeAccepted(session, tradeId, existingRecord) {
  return putOwnTrade(session, tradeId, { ...existingRecord, status: "accepted" });
}

export async function cancelTrade(session, tradeId, existingRecord) {
  return putOwnTrade(session, tradeId, { ...existingRecord, status: "cancelled" });
}

// Public, unauthenticated read of one trade record off a specific repo — used
// both to check a moot's response to a trade I proposed, and (via listTrades)
// to scan for offers addressed to me.
export async function getTradeRecord(did, tradeId) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return null;
    const params = new URLSearchParams({ repo: did, collection: TRADE_COLLECTION, rkey: tradeId });
    const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) return null;
    return (await res.json()).value || null;
  } catch {
    return null;
  }
}

// All trade records in one repo — public, unauthenticated. Used to scan a
// moot's repo for a proposal addressed `with` me.
export async function listTrades(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return [];
    const params = new URLSearchParams({ repo: did, collection: TRADE_COLLECTION, limit: "50" });
    const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) return [];
    const j = await res.json();
    return (j.records || [])
      .filter((r) => r && r.value)
      .map((r) => ({ uri: r.uri, rkey: String(r.uri).split("/").pop(), value: r.value }));
  } catch {
    return [];
  }
}

// A trade is sealed once both sides' tablets exist and name each other's
// pelor correctly — the only definition of "completed" this feature has.
// `mine` and `theirs` are the two records at the same rkey, one per repo.
export function isSealed(mine, theirs) {
  if (!mine || !theirs) return false;
  if (theirs.status !== "accepted") return false;
  return mine.offer?.did === theirs.want?.did && mine.want?.did === theirs.offer?.did;
}

// ---------- local bookkeeping (browser-scoped, per player) ----------
// Which trades this browser has sent (so it knows what to poll for
// acceptance) and which incoming offers it's already responded to or
// dismissed (so a re-scan doesn't surface them again as "pending").

const sentKey = (did) => `kolpelor:trade:sent:${did}`;
const handledKey = (did) => `kolpelor:trade:handled:${did}`; // incoming offers already accepted/declined

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch {
    return fallback;
  }
}

export function getSentTrades(playerDid) {
  return readJson(sentKey(playerDid), []);
}

export function addSentTrade(playerDid, trade) {
  const sent = getSentTrades(playerDid);
  sent.push(trade);
  localStorage.setItem(sentKey(playerDid), JSON.stringify(sent));
  return sent;
}

export function markSentTradeApplied(playerDid, tradeId) {
  const sent = getSentTrades(playerDid).map((t) => (t.tradeId === tradeId ? { ...t, applied: true } : t));
  localStorage.setItem(sentKey(playerDid), JSON.stringify(sent));
}

function incomingKey(authorDid, tradeId) {
  return `${authorDid}:${tradeId}`;
}

export function isIncomingHandled(playerDid, authorDid, tradeId) {
  return readJson(handledKey(playerDid), []).includes(incomingKey(authorDid, tradeId));
}

export function markIncomingHandled(playerDid, authorDid, tradeId) {
  const set = new Set(readJson(handledKey(playerDid), []));
  set.add(incomingKey(authorDid, tradeId));
  localStorage.setItem(handledKey(playerDid), JSON.stringify([...set]));
}
