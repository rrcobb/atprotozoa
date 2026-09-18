// Does a tag need the agent?
//
// The parser used to be a grammar and these tests checked the list names it
// produced. Nothing read those names — the agent decides the list — so both the
// grammar and the tests for it are gone. What's left is the routing decision
// and one property that matters: a tag is never silently dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/command.mjs";

const HANDLES = ["listbot.bisks.net", "listbot"];
const parse = (text) => parseCommand(text, HANDLES);

test("an ordinary tag goes to the agent, text intact", () => {
  assert.deepEqual(parse("@listbot.bisks.net bots"), { kind: "agent", text: "bots" });
  assert.deepEqual(parse("@listbot.bisks.net add them to my 'cool posters' list"), {
    kind: "agent",
    text: "add them to my 'cool posters' list",
  });
});

test("the bot's handle is stripped wherever it sits", () => {
  assert.deepEqual(parse("bots @listbot.bisks.net"), { kind: "agent", text: "bots" });
  assert.deepEqual(parse("@listbot bots"), { kind: "agent", text: "bots" });
  assert.deepEqual(parse("@LISTBOT.BISKS.NET bots"), { kind: "agent", text: "bots" });
});

// The change that made "add @someone to ceramics" possible. The parser used to
// strip every other @handle, so a handle the TAGGER typed never reached the
// agent. A stranger's text is a different problem, handled by building the
// subject candidates from the tag's facets rather than from any text.
test("other people's handles reach the agent", () => {
  assert.deepEqual(parse("@listbot.bisks.net add @potterymouth.plate to ceramics"), {
    kind: "agent",
    text: "add @potterymouth.plate to ceramics",
  });
});

test("a tag with nothing in it asks for help", () => {
  assert.deepEqual(parse("@listbot.bisks.net"), { kind: "help" });
  assert.deepEqual(parse("@listbot.bisks.net    "), { kind: "help" });
});

test("help and lists are commands only when they're the whole tag", () => {
  for (const word of ["help", "?", "halp"]) {
    assert.deepEqual(parse(`@listbot.bisks.net ${word}`), { kind: "help" }, word);
  }
  for (const word of ["lists", "mylists"]) {
    assert.deepEqual(parse(`@listbot.bisks.net ${word}`), { kind: "lists" }, word);
  }
  // Anything longer is an ask, not a command.
  assert.equal(parse("@listbot.bisks.net help me build a list").kind, "agent");
  assert.equal(parse("@listbot.bisks.net lists of painters").kind, "agent");
});

// The load-bearing property. A tag that's plainly asking for something must
// always reach the agent — this parser once capped names at 64 chars and
// returned a silent no-op for anything longer, which swallowed the first real
// tag anyone sent: "@listbot can you make me a list to track people who share
// or comment on ai news? 'ai new knowers'".
test("no tag is silently dropped", () => {
  for (const text of [
    "@listbot.bisks.net can you make me a list to track people who share or comment on ai news? 'ai new knowers'",
    `@listbot.bisks.net ${"y".repeat(500)}`,
    "@listbot.bisks.net make me a list of people who post about trains please",
    "@listbot.bisks.net remove them from bots",
  ]) {
    assert.equal(parse(text).kind, "agent", `should reach the agent: ${text.slice(0, 48)}`);
  }
});

test("whitespace and line breaks collapse", () => {
  assert.deepEqual(parse("@listbot.bisks.net\n  bots  "), { kind: "agent", text: "bots" });
});

// The account is created on listbot.bsky.social and switches to
// listbot.bisks.net later. Both have to strip cleanly, or the old handle sits
// in the text the agent reads.
test("either handle strips, across the handle switch", () => {
  const both = ["listbot.bsky.social", "listbot.bisks.net", "listbot"];
  for (const handle of both) {
    assert.deepEqual(
      parseCommand(`@${handle} bots`, both),
      { kind: "agent", text: "bots" },
      `@${handle} should strip`,
    );
  }
  assert.deepEqual(parseCommand("@listbot.bsky.social @listbot.bisks.net bots", both), {
    kind: "agent",
    text: "bots",
  });
});
