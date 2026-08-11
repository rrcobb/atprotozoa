// characters.js — display metadata for the eight-character roster the
// Worker's system prompt (src/index.ts) judges against. Purely cosmetic:
// an emoji stand-in (no likenesses — see notes on avoiding character art)
// and an accent color per verdict, used to theme the result card and the
// generated share image.

export const CHARACTERS = {
  "Jerry Seinfeld": { emoji: "🎙️", color: "#f2b134", blurb: "the wry observer" },
  "George Costanza": { emoji: "😰", color: "#6a4c93", blurb: "the self-sabotaging schemer" },
  "Elaine Benes": { emoji: "💥", color: "#e63946", blurb: "the blunt instrument" },
  "Cosmo Kramer": { emoji: "🌀", color: "#2a9d8f", blurb: "the chaotic wildcard" },
  Newman: { emoji: "😈", color: "#3d348b", blurb: "the petty rival" },
  "Frank Costanza": { emoji: "🌡️", color: "#d62828", blurb: "the volatile absolutist" },
  "J. Peterman": { emoji: "🖋️", color: "#8d5b4c", blurb: "the florid dramatist" },
  "David Puddy": { emoji: "🗿", color: "#495057", blurb: "the deadpan minimalist" },
};

export function charMeta(name) {
  return CHARACTERS[name] || { emoji: "❓", color: "#495057", blurb: "" };
}
