// Unit tests for public/lib/places.js — pure, no DOM/network, so exercised
// directly like voidlogic.mjs's tests. Covers the "Place search must
// surface real, non-curated Places" gap: a record can carry a place object
// outside the curated PLACES list and it must still be searchable, with its
// own real lat/lng, not silently dropped or collapsed to a single point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACES, placeById, searchPlaces, discoveredPlaces, project } from "../public/lib/places.js";

test("discoveredPlaces returns activity places absent from the curated list", () => {
  const curated = PLACES[0];
  const wild = { id: "atlantis", name: "Atlantis", emoji: "🔱", lat: 12.3, lng: 45.6 };
  const activity = new Map([
    [curated.id, { place: curated, count: 5 }],
    [wild.id, { place: wild, count: 2 }],
  ]);
  const out = discoveredPlaces(activity);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], wild);
});

test("discoveredPlaces sorts by activity count, most active first", () => {
  const a = { id: "a", name: "A", emoji: "🅰️", lat: 1, lng: 1 };
  const b = { id: "b", name: "B", emoji: "🅱️", lat: 2, lng: 2 };
  const activity = new Map([
    ["a", { place: a, count: 1 }],
    ["b", { place: b, count: 9 }],
  ]);
  const out = discoveredPlaces(activity);
  assert.deepEqual(out.map((p) => p.id), ["b", "a"]);
});

test("discoveredPlaces returns nothing when every active place is curated", () => {
  const activity = new Map(PLACES.slice(0, 2).map((p) => [p.id, { place: p, count: 1 }]));
  assert.deepEqual(discoveredPlaces(activity), []);
});

test("searchPlaces without extra behaves exactly as before (curated only)", () => {
  const results = searchPlaces("tokyo");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "tokyo");
});

test("searchPlaces with extra finds a discovered place by name/emoji/id", () => {
  const wild = { id: "atlantis", name: "Atlantis", emoji: "🔱", lat: 12.3, lng: 45.6 };
  assert.equal(searchPlaces("atlantis", [wild]).length, 1);
  assert.equal(searchPlaces("🔱", [wild]).length, 1);
  assert.equal(searchPlaces("nowhere", [wild]).length, 0);
});

test("searchPlaces with empty query returns curated + extra combined", () => {
  const wild = { id: "atlantis", name: "Atlantis", emoji: "🔱", lat: 12.3, lng: 45.6 };
  const results = searchPlaces("", [wild]);
  assert.equal(results.length, PLACES.length + 1);
  assert.ok(results.some((p) => p.id === "atlantis"));
});

test("placeById still only resolves curated places (unchanged contract)", () => {
  assert.equal(placeById("tokyo")?.id, "tokyo");
  assert.equal(placeById("atlantis"), null);
});

test("project keeps mapping every valid lat/lng — including a discovered place's — inside the 0-100% frame", () => {
  const { xPct, yPct } = project(12.3, 45.6);
  assert.ok(xPct >= 0 && xPct <= 100);
  assert.ok(yPct >= 0 && yPct <= 100);
});
