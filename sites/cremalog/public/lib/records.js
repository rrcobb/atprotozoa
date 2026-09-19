// records.js — writes a review to the signed-in user's own PDS. One
// create-only, TID-keyed collection (see notes/50-oauth-scopes.md):
//
//   net.bisks.cremalog.review   one latte review (drink, rating, notes, when)
//
// Copy, don't abstract: same dpopFetch-based create pattern as every other
// OAuth site in this repo (see sites/tacocounter/public/lib/records.js).

import { dpopFetch } from "./oauth.js";

export const REVIEW_COLLECTION = "net.bisks.cremalog.review";

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

// Log one latte review. `rating` is a 0–10 float with one decimal place,
// stored ×10 as an integer per the lexicon (75 == 7.5/10).
export async function recordReview(session, { drink, shop = "", rating, notes = "" } = {}) {
  const trimmedDrink = String(drink || "").trim().slice(0, 100);
  if (!trimmedDrink) throw new Error("what did you drink?");
  const r = Math.max(0, Math.min(10, Number(rating)));
  if (!Number.isFinite(r)) throw new Error("rating has to be a number");

  const body = {
    drink: trimmedDrink,
    rating: Math.round(r * 10),
    reviewedAt: new Date().toISOString(),
  };
  const trimmedShop = String(shop || "").trim().slice(0, 100);
  if (trimmedShop) body.shop = trimmedShop;
  const trimmedNotes = String(notes || "").trim().slice(0, 300);
  if (trimmedNotes) body.notes = trimmedNotes;

  const { uri } = await createRecord(session, REVIEW_COLLECTION, body);
  return uri;
}
