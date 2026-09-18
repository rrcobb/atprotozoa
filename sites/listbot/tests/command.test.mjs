// Unit tests for the tag parser — the one piece of listbot with enough
// branching to be worth testing, and pure enough to test directly.
//
// What these are really guarding: a mis-parse writes a record into somebody
// else's repo. "@listbot bots" must never resolve to anything but "add to the
// list called bots", and a tag naming other people must never turn those people
// into subjects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/command.mjs";

const HANDLES = ["listbot.bisks.net", "listbot"];
const parse = (text) => parseCommand(text, HANDLES);

test("a bare list name is an add", () => {
  assert.deepEqual(parse("@listbot.bisks.net bots"), { kind: "add", listName: "bots" });
});

test("an explicit add verb is stripped", () => {
  assert.deepEqual(parse("@listbot.bisks.net add bots"), { kind: "add", listName: "bots" });
});

test("multi-word list names survive intact", () => {
  assert.deepEqual(parse("@listbot.bisks.net cool people i like"), {
    kind: "add",
    listName: "cool people i like",
  });
});

test("remove and its synonyms all parse as remove", () => {
  for (const verb of ["remove", "rm", "delete", "del", "unadd", "-"]) {
    assert.deepEqual(
      parse(`@listbot.bisks.net ${verb} bots`),
      { kind: "remove", listName: "bots" },
      `"${verb}" should remove`,
    );
  }
});

test("remove is only a verb in first position, so a list can be called remove", () => {
  assert.deepEqual(parse("@listbot.bisks.net add remove"), { kind: "add", listName: "remove" });
});

test("the mention can come after the list name", () => {
  assert.deepEqual(parse("bots @listbot.bisks.net"), { kind: "add", listName: "bots" });
});

test("the short handle form is stripped too", () => {
  assert.deepEqual(parse("@listbot bots"), { kind: "add", listName: "bots" });
});

test("mentions are matched case-insensitively", () => {
  assert.deepEqual(parse("@LISTBOT.BISKS.NET bots"), { kind: "add", listName: "bots" });
});

// The important one. A tag that names other people is still about the post's
// author — folding a mentioned handle into the list name (or worse, treating it
// as the subject) would put the wrong person on a list.
test("other people's handles never become part of the list name", () => {
  assert.deepEqual(parse("@listbot.bisks.net bots @someone.bsky.social"), {
    kind: "add",
    listName: "bots",
  });
  assert.deepEqual(parse("@listbot.bisks.net remove bots @a.bsky.social @b.bsky.social"), {
    kind: "remove",
    listName: "bots",
  });
});

test("a mention with nothing else is help, not a list called empty", () => {
  assert.deepEqual(parse("@listbot.bisks.net"), { kind: "help" });
  assert.deepEqual(parse("@listbot.bisks.net    "), { kind: "help" });
});

test("explicit help and lists verbs", () => {
  for (const word of ["help", "?", "halp"]) {
    assert.deepEqual(parse(`@listbot.bisks.net ${word}`), { kind: "help" }, word);
  }
  for (const word of ["lists", "list", "mylists"]) {
    assert.deepEqual(parse(`@listbot.bisks.net ${word}`), { kind: "lists" }, word);
  }
});

test("help and lists are only verbs when alone, so they can name a list", () => {
  assert.deepEqual(parse("@listbot.bisks.net list of cool people"), {
    kind: "add",
    listName: "list of cool people",
  });
  assert.deepEqual(parse("@listbot.bisks.net help me"), { kind: "add", listName: "help me" });
});

test("a remove verb with no list name asks for help rather than guessing", () => {
  assert.deepEqual(parse("@listbot.bisks.net remove"), { kind: "help" });
});

// A long tag reaches the agent rather than being dropped.
//
// This parser used to cap the name at 64 chars and return {kind:"none"} for
// anything longer — silently, with no reply. That was defensible when the
// parser WAS the product: a sentence was a mis-parse, and making a list out of
// it was worse than admitting we hadn't understood.
//
// The agent changed what this function is for. Its job now is only to tell a
// command from a non-command; the agent reads the text and decides the actual
// name. A tag written in English is exactly what the agent exists for, so
// dropping it here threw away the good case before anyone could see it.
//
// Found the hard way: the first real tag anyone sent was
// "@listbot can you make me a list to track people who share or comment on ai
// news? 'ai new knowers'" — perfectly clear, ~100 chars, silently ignored.
test("a long, sentence-shaped tag reaches the agent instead of being dropped", () => {
  const real =
    "@listbot.bisks.net can you make me a list to track people who share or comment on ai news? 'ai new knowers'";
  const out = parse(real);
  assert.equal(out.kind, "add");
  assert.ok(out.listName.length > 64, "the whole sentence is passed along");
  assert.match(out.listName, /ai new knowers/);
});

test("a long remove still parses as a remove", () => {
  const long = "x".repeat(120);
  assert.deepEqual(parse(`@listbot.bisks.net remove ${long}`), {
    kind: "remove",
    listName: long,
  });
});

test("the parser passes text through, it doesn't adjudicate names", () => {
  // Whatever arrives, the parser's answer is a KIND. Judging the name is the
  // agent's job, and a silent "none" is the one thing this must not do to a
  // tag that's plainly asking for something.
  for (const text of [
    "@listbot.bisks.net x".repeat(1),
    `@listbot.bisks.net ${"y".repeat(500)}`,
    "@listbot.bisks.net make me a list of people who post about trains please",
  ]) {
    assert.notEqual(parse(text).kind, "none", `should not silently drop: ${text.slice(0, 40)}`);
  }
});

test("whitespace and line breaks collapse", () => {
  assert.deepEqual(parse("@listbot.bisks.net\n  bots  "), { kind: "add", listName: "bots" });
});

// The account is created on listbot.bsky.social and switches to
// listbot.bisks.net later. Both have to strip cleanly: whichever handle a tag
// uses, the list name is what's left over. Missing one would turn
// "@listbot.bsky.social bots" into a list literally named
// "@listbot.bsky.social bots".
test("either handle strips, across the handle switch", () => {
  const both = ["listbot.bsky.social", "listbot.bisks.net", "listbot"];
  for (const handle of both) {
    assert.deepEqual(
      parseCommand(`@${handle} bots`, both),
      { kind: "add", listName: "bots" },
      `@${handle} should strip`,
    );
    assert.deepEqual(
      parseCommand(`@${handle} remove bots`, both),
      { kind: "remove", listName: "bots" },
      `@${handle} remove should strip`,
    );
  }
});

test("a tag naming both handles still yields just the list name", () => {
  const both = ["listbot.bsky.social", "listbot.bisks.net", "listbot"];
  assert.deepEqual(parseCommand("@listbot.bsky.social @listbot.bisks.net bots", both), {
    kind: "add",
    listName: "bots",
  });
});
