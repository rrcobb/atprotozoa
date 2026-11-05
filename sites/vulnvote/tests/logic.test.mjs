import test from "node:test";
import assert from "node:assert/strict";
import { normaliseId, pickCanonical, groupVotes, ageWeight, vouchWeights, calibrationWeights, voterWeights, scoreGroup, fromOsv, DAY } from "../public/lib/logic.js";

const v = (did, subject, dir, severity = null, aliases = [], at = 1) => ({ did, subject, aliases, dir, severity, title: "", official: "", at });

test("ids normalise and prefer CVE", () => {
  assert.equal(normaliseId(" cve-2024-3094 "), "CVE-2024-3094");
  assert.equal(normaliseId("GHSA-ABCD-EFGH-1234"), "GHSA-abcd-efgh-1234");
  assert.equal(pickCanonical(["GHSA-abcd-efgh-1234", "cve-2024-1"]), "CVE-2024-1".replace("1", "1"));
});

test("aliases merge groups and a voter counts once", () => {
  const groups = groupVotes([
    v("a", "GHSA-aaaa-bbbb-cccc", 1, 8, ["CVE-2024-0001"], 1),
    v("b", "CVE-2024-0001", -1, 3, [], 2),
    v("a", "CVE-2024-0001", -1, 2, [], 5), // a changes their mind via the other alias
    v("c", "CVE-2024-0002", 1),
  ]);
  assert.equal(groups.length, 2);
  const g = groups.find((x) => x.id === "CVE-2024-0001");
  assert.equal(g.votes.length, 2);
  assert.equal(g.votes.find((x) => x.did === "a").dir, -1);
});

test("age weight rises with account age", () => {
  const now = 400 * DAY;
  assert.ok(ageWeight(now - DAY, now) < 0.2);
  assert.equal(ageWeight(0, now), 0.5);
  assert.equal(ageWeight(now - 400 * DAY + 1, now) > 0.99, true);
});

test("sock vouches add little, old vouches add more", () => {
  const now = 1000 * DAY;
  const ages = new Map([["old", 0], ["sock", now - DAY]]);
  const fromOld = vouchWeights([{ from: "old", to: "x" }], ages, now).get("x");
  const fromSock = vouchWeights([{ from: "sock", to: "x" }, { from: "x", to: "x" }], ages, now).get("x");
  assert.ok(fromOld > fromSock);
  assert.ok(fromSock < 1.1);
});

test("calibration rewards agreement with the others", () => {
  const votes = (sevs) => ({ votes: sevs.map(([did, s]) => v(did, "X", 1, s)) });
  const groups = [1, 2, 3].map(() => votes([["a", 8], ["b", 8], ["c", 7], ["wild", 1]]));
  const w = calibrationWeights(groups);
  assert.ok(w.get("a") >= 1 && w.get("a") > w.get("wild"));
  assert.equal(w.get("wild"), 0.5);
});

test("scoring weights the votes", () => {
  const g = { id: "X", ids: ["X"], votes: [v("old", "X", 1, 9), v("new1", "X", -1, 1), v("new2", "X", -1, 1)] };
  const now = 1000 * DAY;
  const ages = new Map([["old", 0], ["new1", now], ["new2", now]]);
  const s = scoreGroup(g, voterWeights([g], [], ages, now));
  assert.ok(s.net > 0, "one veteran outweighs two brand-new accounts");
  assert.equal(s.voters, 3);
  assert.ok(s.severity > 5);
});

test("osv documents map to ids", () => {
  const r = fromOsv({ id: "GHSA-abcd-efgh-1234", aliases: ["CVE-2023-9"], summary: "bad\nthing", database_specific: { severity: "HIGH" } });
  assert.equal(r.id, "CVE-2023-9");
  assert.equal(r.title, "bad");
  assert.equal(r.official, "HIGH");
});
