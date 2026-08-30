// Markdown quick-capture: turn freeform pasted/typed markdown into inbox
// cards, one per line. Deliberately tiny — this is a capture aid, not a
// markdown parser. Supported per-line syntax:
//
//   - [ ] buy paint @2026-09-05 #errands   -> task card, due 2026-09-05, tag "errands"
//   - [x] already done                     -> task card, marked done
//   - plain line of text                   -> plain card, no due date
//   # a heading                            -> ignored (not a card)
//
// A due date is "@YYYY-MM-DD" anywhere in the line; a "#tag" is any word
// prefixed with "#". Both are stripped from the card's display title but
// kept on the card so they survive a later edit.

const DUE_RE = /@(\d{4}-\d{2}-\d{2})\b/;
const TAG_RE = /#([\w-]+)/g;
const CHECKBOX_RE = /^-\s*\[([ xX])\]\s*/;
const HEADING_RE = /^#{1,6}\s/;

export function parseInboxText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const cards = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADING_RE.test(line)) continue;

    let rest = line;
    let isTask = false;
    let done = false;

    const cb = CHECKBOX_RE.exec(rest);
    if (cb) {
      isTask = true;
      done = cb[1].toLowerCase() === "x";
      rest = rest.slice(cb[0].length);
    } else if (rest.startsWith("- ")) {
      rest = rest.slice(2);
    }

    let due = null;
    const dueMatch = DUE_RE.exec(rest);
    if (dueMatch) {
      due = dueMatch[1];
      isTask = true;
      rest = rest.replace(DUE_RE, "").trim();
    }

    const tags = [];
    rest = rest.replace(TAG_RE, (_, tag) => {
      tags.push(tag);
      return "";
    }).trim();

    if (!rest) continue;

    cards.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: rest,
      done,
      due,
      isTask,
      tags,
      raw: line,
      createdAt: Date.now(),
    });
  }
  return cards;
}

// A very small inline-markdown-to-safe-HTML renderer, used for an item's
// free-text notes field. Escapes everything first, then re-introduces a
// handful of inline patterns — never trusts input as HTML.
export function renderInlineMarkdown(text) {
  const esc = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, "<br>");
}
