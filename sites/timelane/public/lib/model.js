// The data model. Everything is a plain JSON-serializable object so it can
// be persisted to localStorage, exported to a file, or dropped into a share
// link's URL fragment unchanged.
//
//   Board      > swimlanes: Swimlane[]
//   Swimlane   > items: Item[]                (bars/events)
//   Item       > segments: Segment[], markers: Marker[]
//
// A "task" is not a separate kind of thing — it's an optional `task` field
// on any Item (bar or event), so a timeline item can also carry a due date
// and be surfaced in the overdue list without duplicating it as a to-do.

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

export function newBoard(title) {
  const now = Date.now();
  return {
    id: uid(),
    title: title || "untitled board",
    createdAt: now,
    updatedAt: now,
    swimlanes: [],
  };
}

export function newSwimlane(title, color) {
  return {
    id: uid(),
    title: title || "new lane",
    color: color || pickColor(),
    collapsed: false,
    items: [],
  };
}

export function newItem({ kind = "bar", title = "new item", start, end, color, tags } = {}) {
  return {
    id: uid(),
    kind, // "bar" | "event"
    title,
    start: start || null,
    end: kind === "bar" ? end || start || null : null,
    color: color || null,
    task: null, // { done: bool, due: "YYYY-MM-DD"|null }
    notes: "",
    tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    segments: [],
    markers: [],
  };
}

export function newSegment({ title = "segment", start, end, color } = {}) {
  return { id: uid(), title, start: start || null, end: end || null, color: color || null };
}

export function newMarker({ title = "marker", at, color } = {}) {
  return { id: uid(), title, at: at || null, color: color || null };
}

export const PALETTE = [
  "#2f8f7a",
  "#e0a83e",
  "#d9694f",
  "#5b7fd9",
  "#9b6bd9",
  "#3fa8c9",
  "#c95b8f",
  "#6ea852",
  "#7d8ea3",
  "#b2503f",
];
let paletteIdx = 0;
export function pickColor() {
  const c = PALETTE[paletteIdx % PALETTE.length];
  paletteIdx++;
  return c;
}

// --- lookups / mutation helpers (all operate on a board in place) ---------

export function findSwimlane(board, laneId) {
  return board.swimlanes.find((l) => l.id === laneId) || null;
}

export function findItem(board, itemId) {
  for (const lane of board.swimlanes) {
    const item = lane.items.find((i) => i.id === itemId);
    if (item) return { lane, item };
  }
  return null;
}

export function allTasks(board) {
  const out = [];
  for (const lane of board.swimlanes) {
    for (const item of lane.items) {
      if (item.task) out.push({ lane, item });
    }
  }
  return out;
}

export function touch(board) {
  board.updatedAt = Date.now();
}

// --- outline tree: same hierarchy, flattened for the text/outline view ----

export function outlineLines(board) {
  const lines = [`# ${board.title}`];
  for (const lane of board.swimlanes) {
    lines.push(`- ${lane.title}`);
    for (const item of lane.items) {
      const bits = [item.title];
      if (item.start) bits.push(item.kind === "bar" && item.end ? `(${item.start} → ${item.end})` : `(${item.start})`);
      if (item.task) bits.push(item.task.done ? "[done]" : item.task.due ? `[due ${item.task.due}]` : "[task]");
      if (item.tags && item.tags.length) bits.push(item.tags.map((t) => `#${t}`).join(" "));
      lines.push(`  - ${bits.join(" ")}`);
      for (const seg of item.segments) {
        lines.push(`    - segment: ${seg.title}${seg.start ? ` (${seg.start} → ${seg.end || seg.start})` : ""}`);
      }
      for (const mk of item.markers) {
        lines.push(`    - marker: ${mk.title}${mk.at ? ` (${mk.at})` : ""}`);
      }
    }
  }
  return lines;
}
