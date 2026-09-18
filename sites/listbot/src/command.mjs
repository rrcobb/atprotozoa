// Does this tag need the agent?
//
// Almost always yes. One case doesn't: a tag with no text, or one that's only
// asking what this is. Everything else — a bare list name, a sentence,
// anything — goes to the agent, which reads the thread and the user's lists
// and decides what was meant.
//
// This used to be a grammar: add/remove verbs, multi-word list names, a length
// cap. All of it computed a listName that nothing read, because the agent
// decides the list. The verbs are gone rather than kept "just in case" — two
// things deciding what a tag means is how they drift apart.
//
// Plain .mjs rather than .ts so the tests can import it directly, the way
// sites/voidshout's pure logic modules do.
//
// @typedef {{kind:"help"}|{kind:"agent",text:string}} Command

const HELP_VERBS = new Set(["help", "?", "halp"]);

// app.bsky.graph.list caps `name` at 64 graphemes. The UI wants the bound; tag
// text is NOT measured against it — a tag written in English is exactly what
// the agent is for, and capping here once dropped the first real tag anyone
// sent, silently and with no reply.
export const MAX_LIST_NAME = 64;

/**
 * @param {string} text
 * @param {string[]} botHandles
 * @returns {Command}
 */
export function parseCommand(text, botHandles) {
  // Strip mentions of the BOT, wherever they sit — people write
  // "@listbot.bisks.net bots" but also "bots @listbot.bisks.net". Other
  // people's handles stay: a handle the tagger typed is them saying who they
  // mean, and the agent should see it. (What stops a STRANGER's text from
  // choosing a subject is the candidate list the Worker builds, not this.)
  let rest = text;
  for (const handle of botHandles) {
    rest = rest.replace(new RegExp(`@${handle.replace(/\./g, "\\.")}`, "gi"), " ");
  }

  const trimmed = rest.trim().replace(/\s+/g, " ");
  if (!trimmed) return { kind: "help" };

  // Only when it's the whole tag. "help me build a list" is an ask, not a
  // command. "lists" used to be reserved here too, which made a plausible list
  // name into a command — the same mistake as the add/remove verbs, smaller.
  if (HELP_VERBS.has(trimmed.toLowerCase())) return { kind: "help" };

  return { kind: "agent", text: trimmed };
}
