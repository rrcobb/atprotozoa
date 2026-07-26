// hashdo — a todo list where every item earns a small, optimistic hash the
// instant it's created, so it can be referenced from other items without
// ever colliding. @jazzkid.xyz's idea: "a todo list where items can be
// referred to by small, optimistic hashes, thus preventing collisions when
// making references. Enables easy parent:[hash] specification for subtasks."
//
// The "optimistic" part: we start greedy — try a 2-hex-char id first, on
// the bet that two chars (256 slots) is plenty for a todo list. We only
// grow the id a character at a time if that bet turns out wrong and the
// short id already belongs to something else. Ids never shrink or change
// once assigned, so a hash you've copied into a `parent:[hash]` reference
// stays valid for the life of the item.

const STORAGE_KEY = "hashdo.items.v1";
const HEX = "0123456789abcdef";
const PARENT_RE = /parent:\[?([0-9a-f]{2,})\]?/i;

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Optimistic hash: grab random hex, start at 2 chars, grow only on an actual
// collision against the ids already in use.
export function nextHash(existingIds) {
  const taken = new Set(existingIds);
  let len = 2;
  for (let attempt = 0; attempt < 64; attempt++) {
    const id = randomHex(len);
    if (!taken.has(id)) return id;
    // Collided — the 2-char bet didn't pay off this time; widen the id by
    // one character and try again, rather than assuming a fixed-width hash.
    if (attempt >= 4) len++;
  }
  // Astronomically unlikely fallback: a full timestamp-seeded id.
  return randomHex(12);
}

function randomHex(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += HEX[b % 16];
  return out;
}

// Pulls a `parent:hash` or `parent:[hash]` token out of raw input text.
// Returns { text, parent } — text has the token removed and is trimmed.
export function parseParent(raw) {
  const m = raw.match(PARENT_RE);
  if (!m) return { text: raw.trim(), parent: null };
  const text = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { text, parent: m[1].toLowerCase() };
}

// Groups a flat item list into a tree: { roots, byParent, orphans }.
// `orphans` holds items whose declared parent hash doesn't exist (typo'd
// or since-deleted) so the UI can still show them instead of losing them.
export function buildTree(items) {
  const ids = new Set(items.map((i) => i.hash));
  const byParent = new Map();
  const roots = [];
  const orphans = [];
  for (const item of items) {
    if (item.parent && ids.has(item.parent)) {
      if (!byParent.has(item.parent)) byParent.set(item.parent, []);
      byParent.get(item.parent).push(item);
    } else if (item.parent) {
      orphans.push(item);
    } else {
      roots.push(item);
    }
  }
  return { roots, byParent, orphans };
}
