// Parsing a tag into an action.
//
// The grammar is deliberately tiny, because it's typed on a phone into a reply
// box:
//
//   @listbot.bisks.net bots            -> add the parent post's author to "bots"
//   @listbot.bisks.net remove bots     -> take them off "bots"
//   @listbot.bisks.net add cool people -> multi-word names work; "add" optional
//   @listbot.bisks.net lists           -> reply with the user's listbot lists
//
// Everything after the verb is the list name, verbatim. No quoting, no flags —
// a list called "remove" is a casualty we accept, and it's why `remove` is only
// treated as a verb in first position.

// Plain .mjs rather than .ts so the test suite can import it directly, the way
// sites/voidshout's pure logic modules do — this is the one piece of listbot
// with enough branching to be worth unit tests, and it needs no Worker globals.
//
// @typedef {{kind:"add",listName:string}
//          |{kind:"remove",listName:string}
//          |{kind:"lists"}|{kind:"help"}|{kind:"none"}} Command

const REMOVE_VERBS = new Set(["remove", "rm", "delete", "del", "unadd", "-"]);
const ADD_VERBS = new Set(["add", "+"]);
const LIST_VERBS = new Set(["lists", "list", "mylists"]);
const HELP_VERBS = new Set(["help", "?", "halp"]);

// Longest list name we'll accept. app.bsky.graph.list caps `name` at 64
// graphemes; anything longer is a mis-parse (someone wrote a sentence), and
// creating a list from it would be worse than saying we didn't understand.
// Kept for the UI and for anything that wants a sanity bound on a NAME. It is
// deliberately NOT applied to tag text any more: this parser's job is to tell a
// command from a non-command, and the agent decides the actual list name.
//
// It used to reject a tag longer than this as {kind:"none"} — silently, with no
// reply. That was defensible when the parser WAS the product and a long string
// probably wasn't a list name. It became wrong the moment the agent arrived,
// because a tag written in English is exactly what the agent is for, and this
// threw those away before the agent ever saw them. First real tag anyone sent
// hit it: "@listbot can you make me a list to track people who share or comment
// on ai news? 'ai new knowers'" — a perfectly clear instruction, ~100 chars,
// dropped in silence.
export const MAX_LIST_NAME = 64;

/**
 * @param {string} text
 * @param {string[]} botHandles
 * @returns {Command}
 */
export function parseCommand(text, botHandles) {
  let rest = text;

  // Strip every mention of the bot, wherever it sits — people write
  // "@listbot.bisks.net bots" but also "bots @listbot.bisks.net".
  for (const handle of botHandles) {
    rest = rest.replace(new RegExp(`@${handle.replace(/\./g, "\\.")}`, "gi"), " ");
  }

  // Drop other @mentions too: a tag like "@listbot bots @someone" is about the
  // post's author, not the people named in it. Being explicit about this
  // matters — silently folding a mentioned handle into the subject would make
  // the bot add the wrong person.
  rest = rest.replace(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, " ");

  const words = rest.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { kind: "help" };

  const first = words[0].toLowerCase();

  if (HELP_VERBS.has(first) && words.length === 1) return { kind: "help" };
  if (LIST_VERBS.has(first) && words.length === 1) return { kind: "lists" };

  if (REMOVE_VERBS.has(first)) {
    const name = words.slice(1).join(" ");
    if (!name) return { kind: "help" };
    return { kind: "remove", listName: name };
  }

  const withoutAdd = ADD_VERBS.has(first) ? words.slice(1) : words;
  const name = withoutAdd.join(" ");
  if (!name) return { kind: "help" };
  return { kind: "add", listName: name };
}
