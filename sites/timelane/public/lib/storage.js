// All persistence. localStorage only — no cookies, no server, no account.
// This is the entire GDPR posture in code form: the app never makes a
// network request that carries your data anywhere, so there's nothing here
// to consent to or request deletion of beyond clearing your own browser.

const KEY = "timelane:store:v1";

function defaultStore() {
  return { version: 1, boards: [], inbox: [], activeBoardId: null };
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultStore();
    return {
      version: 1,
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
      activeBoardId: parsed.activeBoardId || null,
    };
  } catch {
    return defaultStore();
  }
}

export function saveStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

// --- whole-store import/export --------------------------------------------

export function exportStoreBlob(store) {
  return new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
}

export function parseImportedStore(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.boards)) throw new Error("not a timelane export");
  return {
    version: 1,
    boards: parsed.boards,
    inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
    activeBoardId: parsed.activeBoardId || (parsed.boards[0] && parsed.boards[0].id) || null,
  };
}

// --- single-board export (for "export this board" rather than everything) -

export function exportBoardBlob(board) {
  return new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
}

export function parseImportedBoard(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.swimlanes)) throw new Error("not a timelane board");
  return parsed;
}
