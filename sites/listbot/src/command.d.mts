// Types for command.mjs. It's plain .mjs so tests/command.test.mjs can import
// it directly (the repo's test convention — see audit/run-tests.mjs), and this
// keeps `pnpm check:types` honest about the Worker's use of it.
export type Command =
  | { kind: "add"; listName: string }
  | { kind: "remove"; listName: string }
  | { kind: "lists" }
  | { kind: "help" }
  | { kind: "none" };

export function parseCommand(text: string, botHandles: string[]): Command;
