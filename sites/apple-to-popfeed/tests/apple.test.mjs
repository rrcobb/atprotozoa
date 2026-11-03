import test from "node:test";
import assert from "node:assert";
import { parseCSV, playsFromCSV, toRecord, withKeys } from "../public/lib/apple.js";

const daily = `Country,Track Identifier,Media type,Date Played,Hours,Play Duration Milliseconds,End Reason Type,Source Type,Play Count,Skip Count,Ignore For Recommendations,Track Description
US,123,AUDIO,20240102,"9,14",600000,NATURAL_END_OF_TRACK,IPHONE,3,0,false,"Daft Punk - One More Time"
US,124,AUDIO,20240102,,0,,,0,1,false,Skipped - Nope
`;

test("csv quotes", () => {
  assert.deepEqual(parseCSV('a,b\n"x,1","y""z"\r\n'), [["a", "b"], ["x,1", 'y"z']]);
});
test("daily tracks expand play counts across hours", () => {
  const { kind, plays } = playsFromCSV(daily, 0);
  assert.equal(kind, "daily");
  assert.equal(plays.length, 3);
  assert.equal(plays[0].artist, "Daft Punk");
  assert.equal(plays[0].playedTime, "2024-01-02T09:00:00.000Z");
  assert.equal(plays[1].playedTime, "2024-01-02T14:00:00.000Z");
  assert.equal(plays[2].playedTime, "2024-01-02T09:01:00.000Z");
});
test("offset shifts to utc", () => {
  const { plays } = playsFromCSV(daily, -300); // UTC-5
  assert.equal(plays[0].playedTime, "2024-01-02T14:00:00.000Z");
});
test("record + unique keys", () => {
  const { plays } = playsFromCSV(daily, 0);
  const r = toRecord(plays[0]);
  assert.equal(r.$type, "fm.teal.alpha.feed.play");
  assert.equal(r.artists[0].artistName, "Daft Punk");
  const keys = withKeys([plays[0], plays[0]]).map((p) => p.rkey);
  assert.notEqual(keys[0], keys[1]);
  assert.match(keys[0], /^[2-7a-z]{13}$/);
});
test("activity csv", () => {
  const { kind, plays } = playsFromCSV("Song Name,Artist Name,Album Name,Event Start Timestamp,Play Duration Milliseconds\nA,B,C,2023-05-01T10:00:00.000Z,1000\nX,Y,Z,2023-05-01T10:05:00.000Z,0\n");
  assert.equal(kind, "activity");
  assert.equal(plays.length, 1);
});
