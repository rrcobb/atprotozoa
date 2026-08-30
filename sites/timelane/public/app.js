import * as Model from "./lib/model.js";
import * as Storage from "./lib/storage.js";
import * as Dates from "./lib/dates.js";
import * as MD from "./lib/markdown.js";
import * as Share from "./lib/share.js";

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let store = Storage.loadStore();
let view = "board";
let zoom = 16; // px per day
let suppressClick = false;
let dragState = null;
let panState = null;
let overdueDismissedCount = -1;
let lastOverdueCount = 0;

const els = {
  boardSelect: document.getElementById("boardSelect"),
  newBoardBtn: document.getElementById("newBoardBtn"),
  renameBoardBtn: document.getElementById("renameBoardBtn"),
  deleteBoardBtn: document.getElementById("deleteBoardBtn"),
  views: document.querySelectorAll("nav.views button"),
  overdueBadge: document.getElementById("overdueBadge"),
  overdueAlert: document.getElementById("overdueAlert"),
  overdueAlertText: document.getElementById("overdueAlertText"),
  overdueAlertView: document.getElementById("overdueAlertView"),
  overdueAlertDismiss: document.getElementById("overdueAlertDismiss"),
  exportBoardBtn: document.getElementById("exportBoardBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  addLaneBtn: document.getElementById("addLaneBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomFitBtn: document.getElementById("zoomFitBtn"),
  inboxStrip: document.getElementById("inboxStrip"),
  timelineScroll: document.getElementById("timelineScroll"),
  timelineInner: document.getElementById("timelineInner"),
  outlineView: document.getElementById("outlineView"),
  inboxTextarea: document.getElementById("inboxTextarea"),
  captureBtn: document.getElementById("captureBtn"),
  inboxCount: document.getElementById("inboxCount"),
  inboxList: document.getElementById("inboxList"),
  tasksList: document.getElementById("tasksList"),
  modalRoot: document.getElementById("modalRoot"),
  shareAppLink: document.getElementById("shareAppLink"),
  themeToggle: document.getElementById("themeToggle"),
};

// ---------------------------------------------------------------------------
// light/dark theme (canvas apps get both; this one's local-only, so it's just
// a data-attribute + a localStorage key, no server round-trip)
// ---------------------------------------------------------------------------

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.textContent = theme === "light" ? "◑" : "◐";
  try {
    localStorage.setItem("timelane-theme", theme);
  } catch {
    // storage disabled — theme just won't persist across loads
  }
}
els.themeToggle.addEventListener("click", () => applyTheme(currentTheme() === "light" ? "dark" : "light"));
applyTheme(currentTheme());

function activeBoard() {
  return store.boards.find((b) => b.id === store.activeBoardId) || null;
}

function persist() {
  Storage.saveStore(store);
  renderOverdueBadge();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "untitled"
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadJSON(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
}

// ---------------------------------------------------------------------------
// starter data (first-ever load only)
// ---------------------------------------------------------------------------

function seedStarterBoard() {
  const board = Model.newBoard("launch plan");
  const today = Dates.todayISO();

  const design = Model.newSwimlane("design", "#2f8f7a");
  const build = Model.newSwimlane("build", "#e0a83e");
  const launch = Model.newSwimlane("launch", "#d9694f");

  const wireframes = Model.newItem({
    kind: "bar",
    title: "wireframes",
    start: Dates.addDays(today, -6),
    end: Dates.addDays(today, -1),
    color: "#2f8f7a",
  });
  wireframes.segments.push(
    Model.newSegment({ title: "sketches", start: Dates.addDays(today, -6), end: Dates.addDays(today, -4), color: "#1e6b59" }),
  );
  wireframes.segments.push(
    Model.newSegment({ title: "review", start: Dates.addDays(today, -3), end: Dates.addDays(today, -1), color: "#1e6b59" }),
  );
  design.items.push(wireframes);
  design.items.push(Model.newItem({ kind: "event", title: "design kickoff", start: Dates.addDays(today, -7), color: "#2f8f7a" }));

  const core = Model.newItem({
    kind: "bar",
    title: "core build",
    start: Dates.addDays(today, -2),
    end: Dates.addDays(today, 10),
    color: "#e0a83e",
  });
  core.markers.push(Model.newMarker({ title: "api freeze", at: Dates.addDays(today, 4), color: "#eef3f1" }));
  core.task = { done: false, due: Dates.addDays(today, -1) }; // deliberately overdue, so the alert shows on first load
  build.items.push(core);

  const ship = Model.newItem({
    kind: "bar",
    title: "ship it",
    start: Dates.addDays(today, 10),
    end: Dates.addDays(today, 12),
    color: "#d9694f",
  });
  ship.task = { done: false, due: Dates.addDays(today, 12) };
  launch.items.push(ship);

  board.swimlanes.push(design, build, launch);
  store.boards.push(board);
  store.activeBoardId = board.id;
}

if (store.boards.length === 0) {
  seedStarterBoard();
  persist();
}

// ---------------------------------------------------------------------------
// header / nav
// ---------------------------------------------------------------------------

function renderBoardSelect() {
  els.boardSelect.innerHTML = store.boards
    .map((b) => `<option value="${b.id}" ${b.id === store.activeBoardId ? "selected" : ""}>${escapeHtml(b.title)}</option>`)
    .join("");
}

function renderOverdueBadge() {
  const board = activeBoard();
  const count = board ? Model.allTasks(board).filter(({ item }) => Dates.isOverdue(item.task.due, item.task.done)).length : 0;
  lastOverdueCount = count;

  if (count > 0) {
    els.overdueBadge.textContent = String(count);
    els.overdueBadge.classList.remove("hidden");
  } else {
    els.overdueBadge.classList.add("hidden");
  }

  if (count > 0 && count !== overdueDismissedCount) {
    els.overdueAlertText.textContent = `${count} task${count === 1 ? "" : "s"} overdue on "${board.title}".`;
    els.overdueAlert.classList.remove("hidden");
  } else {
    els.overdueAlert.classList.add("hidden");
  }
}

function switchView(v) {
  view = v;
  els.views.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === v));
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
  renderCurrentView();
}

function renderCurrentView() {
  if (view === "board") renderBoardView();
  else if (view === "outline") renderOutlineView();
  else if (view === "inbox") renderInboxView();
  else if (view === "tasks") renderTasksView();
}

els.views.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

els.boardSelect.addEventListener("change", (e) => {
  store.activeBoardId = e.target.value;
  overdueDismissedCount = -1;
  persist();
  renderCurrentView();
});

els.newBoardBtn.addEventListener("click", () => {
  const title = prompt("board name?", "new board");
  if (title === null) return;
  const board = Model.newBoard(title.trim() || "untitled board");
  store.boards.push(board);
  store.activeBoardId = board.id;
  overdueDismissedCount = -1;
  persist();
  renderBoardSelect();
  renderCurrentView();
});

els.renameBoardBtn.addEventListener("click", () => {
  const board = activeBoard();
  if (!board) return;
  const title = prompt("rename board", board.title);
  if (title === null) return;
  board.title = title.trim() || board.title;
  Model.touch(board);
  persist();
  renderBoardSelect();
});

els.deleteBoardBtn.addEventListener("click", () => {
  const board = activeBoard();
  if (!board) return;
  if (!confirm(`delete board "${board.title}" and everything in it? this can't be undone here — export first if you want a copy.`)) return;
  store.boards = store.boards.filter((b) => b.id !== board.id);
  store.activeBoardId = store.boards[0] ? store.boards[0].id : null;
  overdueDismissedCount = -1;
  persist();
  renderBoardSelect();
  renderCurrentView();
});

els.overdueAlertView.addEventListener("click", () => switchView("tasks"));
els.overdueAlertDismiss.addEventListener("click", () => {
  overdueDismissedCount = lastOverdueCount;
  els.overdueAlert.classList.add("hidden");
});

els.exportBoardBtn.addEventListener("click", () => {
  const board = activeBoard();
  if (!board) return;
  downloadJSON(board, `timelane-${slug(board.title)}.json`);
});
els.exportAllBtn.addEventListener("click", () => {
  downloadJSON(store, `timelane-export-${Dates.todayISO()}.json`);
});
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    let landedBoard = null;
    try {
      const imported = Storage.parseImportedStore(text);
      for (const b of imported.boards) {
        if (!store.boards.some((existing) => existing.id === b.id)) store.boards.push(b);
      }
      for (const c of imported.inbox) store.inbox.push(c);
      landedBoard = imported.boards[0] || null;
    } catch {
      const board = Storage.parseImportedBoard(text);
      store.boards.push(board);
      landedBoard = board;
    }
    if (landedBoard) store.activeBoardId = landedBoard.id;
    overdueDismissedCount = -1;
    persist();
    renderBoardSelect();
    renderCurrentView();
  } catch (err) {
    alert("couldn't read that file: " + (err && err.message ? err.message : err));
  }
  els.importFile.value = "";
});

els.shareAppLink.addEventListener("click", (e) => {
  e.preventDefault();
  const text = "planning boards that never leave your browser — timelane.bisks.net";
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.modalRoot.innerHTML.trim()) closeModal();
});

// ---------------------------------------------------------------------------
// modal helper
// ---------------------------------------------------------------------------

function openModal(html) {
  els.modalRoot.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
}
function closeModal() {
  els.modalRoot.innerHTML = "";
}

// ---------------------------------------------------------------------------
// board (timeline) view
// ---------------------------------------------------------------------------

function computeRange(board) {
  const dates = [];
  for (const lane of board.swimlanes) {
    for (const item of lane.items) {
      if (item.start) dates.push(item.start);
      if (item.end) dates.push(item.end);
      for (const seg of item.segments) {
        if (seg.start) dates.push(seg.start);
        if (seg.end) dates.push(seg.end);
      }
      for (const mk of item.markers) {
        if (mk.at) dates.push(mk.at);
      }
    }
  }
  dates.push(Dates.todayISO());
  dates.sort();
  return { start: Dates.addDays(dates[0], -4), end: Dates.addDays(dates[dates.length - 1], 7) };
}

function buildWeekendBands(start, totalDays, pxPerDay) {
  if (pxPerDay < 6) return [];
  const bands = [];
  let bandStart = null;
  for (let i = 0; i <= totalDays; i++) {
    const d = Dates.parseISO(Dates.addDays(start, i));
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend && bandStart === null) bandStart = i;
    if (!isWeekend && bandStart !== null) {
      bands.push({ x: bandStart * pxPerDay, w: (i - bandStart) * pxPerDay });
      bandStart = null;
    }
  }
  if (bandStart !== null) bands.push({ x: bandStart * pxPerDay, w: (totalDays + 1 - bandStart) * pxPerDay });
  return bands;
}

function buildTicks(start, end, pxPerDay) {
  const ticks = [];
  const totalDays = Dates.dayDiff(start, end);
  if (pxPerDay < 10) {
    let d = Dates.parseISO(start);
    d = new Date(d.getFullYear(), d.getMonth(), 1);
    while (Dates.toISO(d) <= end) {
      const iso = Dates.toISO(d);
      if (iso >= start) {
        ticks.push({
          x: Dates.dayDiff(start, iso) * pxPerDay,
          label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
          major: true,
        });
      }
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const step = pxPerDay < 34 ? 7 : 1;
    for (let i = 0; i <= totalDays; i += step) {
      const iso = Dates.addDays(start, i);
      ticks.push({ x: i * pxPerDay, label: Dates.formatShort(iso), major: i % (step * 4) === 0 });
    }
  }
  return ticks;
}

function zoomToFit() {
  const board = activeBoard();
  if (!board) return;
  const { start, end } = computeRange(board);
  const days = Math.max(1, Dates.dayDiff(start, end));
  const available = els.timelineScroll.clientWidth - 180 - 24;
  zoom = Math.max(2, Math.min(60, Math.floor(available / days)));
  renderBoardView();
}
els.zoomOutBtn.addEventListener("click", () => {
  zoom = Math.max(2, Math.round(zoom / 1.4));
  renderBoardView();
});
els.zoomInBtn.addEventListener("click", () => {
  zoom = Math.min(80, Math.round(zoom * 1.4));
  renderBoardView();
});
els.zoomFitBtn.addEventListener("click", zoomToFit);
els.timelineScroll.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = els.timelineScroll.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const contentX = screenX + els.timelineScroll.scrollLeft;
    const oldZoom = zoom;
    zoom = e.deltaY < 0 ? Math.min(80, Math.round(zoom * 1.15)) : Math.max(2, Math.round(zoom / 1.15));
    renderBoardView();
    // keep the date under the cursor fixed in place, like a canvas zoom
    if (contentX > 180) {
      const dayOffset = (contentX - 180) / oldZoom;
      els.timelineScroll.scrollLeft = 180 + dayOffset * zoom - screenX;
    }
  },
  { passive: false },
);

// two-finger pinch-to-zoom, the touch equivalent of the ctrl+wheel handler
// above — one-finger pan is left to native scrolling (see touch-action in
// style.css), this only steps in once a second finger joins.
let pinchState = null;
function touchMid(t0, t1) {
  return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
}
function touchDist(t0, t1) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
}
els.timelineScroll.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length !== 2) {
      pinchState = null;
      return;
    }
    const rect = els.timelineScroll.getBoundingClientRect();
    const mid = touchMid(e.touches[0], e.touches[1]);
    const screenX = mid.x - rect.left;
    pinchState = {
      dist: touchDist(e.touches[0], e.touches[1]),
      zoom,
      contentX: screenX + els.timelineScroll.scrollLeft,
      screenX,
    };
  },
  { passive: true },
);
els.timelineScroll.addEventListener(
  "touchmove",
  (e) => {
    if (!pinchState || e.touches.length !== 2) return;
    e.preventDefault();
    const dist = touchDist(e.touches[0], e.touches[1]);
    const newZoom = Math.max(2, Math.min(80, Math.round(pinchState.zoom * (dist / pinchState.dist))));
    if (newZoom === zoom) return;
    zoom = newZoom;
    renderBoardView();
    if (pinchState.contentX > 180) {
      const dayOffset = (pinchState.contentX - 180) / pinchState.zoom;
      els.timelineScroll.scrollLeft = 180 + dayOffset * zoom - pinchState.screenX;
    }
  },
  { passive: false },
);
els.timelineScroll.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) pinchState = null;
});
els.timelineScroll.addEventListener("touchcancel", () => {
  pinchState = null;
});

els.addLaneBtn.addEventListener("click", () => {
  const board = activeBoard();
  if (!board) return;
  const lane = Model.newSwimlane("new lane", Model.pickColor());
  board.swimlanes.push(lane);
  Model.touch(board);
  persist();
  renderBoardView();
});

function renderItem(item, lane, rangeStart) {
  const color = item.color || lane.color;
  const overdue = item.task && Dates.isOverdue(item.task.due, item.task.done);
  const taskGlyph = item.task ? (item.task.done ? " ✓" : overdue ? " ⚠" : " ◷") : "";
  const tagText = item.tags && item.tags.length ? ` (${item.tags.map((t) => `#${t}`).join(" ")})` : "";
  const fullTitle = escapeHtml(item.title + tagText);
  let html = "";

  if (item.kind === "bar" && item.start && item.end) {
    const x = Dates.dayDiff(rangeStart, item.start) * zoom;
    const w = Math.max(zoom * Dates.dayDiff(item.start, item.end), 18);
    html += `<div class="item-bar${overdue ? " overdue" : ""}" style="left:${x}px;width:${w}px;background:${color}" data-item-id="${item.id}" data-action="open-item" title="${fullTitle}">
      <div class="handle left" data-item-id="${item.id}"></div>${escapeHtml(item.title)}${taskGlyph}<div class="handle right" data-item-id="${item.id}"></div>
    </div>`;
    for (const seg of item.segments) {
      if (!seg.start) continue;
      const sx = Dates.dayDiff(rangeStart, seg.start) * zoom;
      const sw = Math.max(zoom * Dates.dayDiff(seg.start, seg.end || seg.start), 6);
      html += `<div class="segment-strip" style="left:${sx}px;width:${sw}px;background:${seg.color || color}" title="${escapeHtml(seg.title)}"></div>`;
    }
    for (const mk of item.markers) {
      if (!mk.at) continue;
      const mx = Dates.dayDiff(rangeStart, mk.at) * zoom;
      html += `<div class="marker-tick" style="left:${mx}px;background:${mk.color || "#eef3f1"}" title="${escapeHtml(mk.title)}"></div>`;
    }
  } else if (item.start) {
    const x = Dates.dayDiff(rangeStart, item.start) * zoom;
    html += `<div class="item-event${overdue ? " overdue" : ""}" style="left:${x}px;background:${color}" data-item-id="${item.id}" data-action="open-item" title="${fullTitle}"></div>`;
    html += `<div class="item-label-out" style="left:${x}px">${escapeHtml(item.title)}${taskGlyph}</div>`;
    for (const mk of item.markers) {
      if (!mk.at) continue;
      const mx = Dates.dayDiff(rangeStart, mk.at) * zoom;
      html += `<div class="marker-tick" style="left:${mx}px;background:${mk.color || "#eef3f1"}" title="${escapeHtml(mk.title)}"></div>`;
    }
  } else {
    html += `<div class="item-bar" style="left:6px;top:10px;width:auto;background:${color}" data-item-id="${item.id}" data-action="open-item">${escapeHtml(item.title)} (no date set)</div>`;
  }
  return html;
}

function renderLaneRow(lane, rangeStart) {
  const itemsHtml = lane.items.map((item) => renderItem(item, lane, rangeStart)).join("");
  return `<div class="lane-row" data-lane-id="${lane.id}">
    <div class="lane-header" draggable="true" data-lane-id="${lane.id}" style="border-left-color:${lane.color}">
      <span class="dot" style="background:${lane.color}"></span>
      <span class="title">${escapeHtml(lane.title)}</span>
      <button class="ghost menu-btn" data-action="lane-menu" data-lane-id="${lane.id}" title="lane settings">⋯</button>
    </div>
    <div class="lane-body${lane.collapsed ? " collapsed" : ""}" data-lane-id="${lane.id}">${itemsHtml}</div>
  </div>`;
}

function renderBoardView() {
  renderInboxStrip();
  const board = activeBoard();
  if (!board) {
    els.timelineInner.style.width = "";
    els.timelineInner.innerHTML = `<p style="padding:16px;color:var(--dim)">no board yet — click "+ board" up top.</p>`;
    return;
  }

  const { start, end } = computeRange(board);
  const totalDays = Dates.dayDiff(start, end);
  const totalWidth = 180 + totalDays * zoom;
  els.timelineInner.style.width = `${totalWidth}px`;

  const ticks = buildTicks(start, end, zoom);
  const todayX = 180 + Dates.dayDiff(start, Dates.todayISO()) * zoom;

  let html = `<div class="ruler">
    <div class="ruler-spacer"></div>
    <div class="ruler-ticks">${ticks.map((t) => `<div class="tick${t.major ? " major" : ""}" style="left:${t.x}px">${escapeHtml(t.label)}</div>`).join("")}</div>
  </div>`;
  html += `<div class="today-line" style="left:${todayX}px"></div>`;
  const bands = buildWeekendBands(start, totalDays, zoom);
  html += `<div class="canvas-grid">
    ${bands.map((b) => `<div class="weekend-band" style="left:${b.x}px;width:${b.w}px"></div>`).join("")}
    ${ticks.map((t) => `<div class="grid-line${t.major ? " major" : ""}" style="left:${t.x}px"></div>`).join("")}
  </div>`;
  html += board.swimlanes.map((lane) => renderLaneRow(lane, start)).join("");
  if (board.swimlanes.length === 0) {
    html += `<p style="padding:16px;color:var(--dim)">no swimlanes yet — "+ swimlane" up top, or drag something in from the inbox.</p>`;
  }

  els.timelineInner.innerHTML = html;
}

function renderInboxStrip() {
  if (store.inbox.length === 0) {
    els.inboxStrip.innerHTML = `<span class="hint">inbox is empty — capture something in the <button class="ghost" data-action="goto-inbox" style="padding:1px 6px;">inbox tab</button>.</span>`;
    return;
  }
  els.inboxStrip.innerHTML =
    `<span class="hint">drag into a lane below to place it →</span>` +
    store.inbox
      .map(
        (c) =>
          `<div class="inbox-chip${c.isTask ? " task" : ""}" draggable="true" data-card-id="${c.id}">${escapeHtml(c.title)}${c.due ? ` <span style="color:var(--amber)">@${escapeHtml(c.due)}</span>` : ""}${(c.tags || []).map((t) => ` <span class="tag-chip">#${escapeHtml(t)}</span>`).join("")}</div>`,
      )
      .join("");
}

els.inboxStrip.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="goto-inbox"]')) switchView("inbox");
});
els.inboxStrip.addEventListener("dragstart", (e) => {
  const chip = e.target.closest(".inbox-chip");
  if (chip) e.dataTransfer.setData("text/plain", "inbox:" + chip.dataset.cardId);
});

function addInboxCardToLane(cardId, laneId) {
  const board = activeBoard();
  if (!board) return;
  const idx = store.inbox.findIndex((c) => c.id === cardId);
  if (idx === -1) return;
  const card = store.inbox[idx];
  const lane = Model.findSwimlane(board, laneId);
  if (!lane) return;
  const item = Model.newItem({ kind: "event", title: card.title, start: card.due || Dates.todayISO(), color: lane.color, tags: card.tags });
  if (card.isTask) item.task = { done: !!card.done, due: card.due || null };
  lane.items.push(item);
  store.inbox.splice(idx, 1);
  Model.touch(board);
  persist();
  renderBoardView();
  if (view === "inbox") renderInboxView();
}

// --- lane reorder + inbox drop (native HTML5 drag/drop) ---

els.timelineInner.addEventListener("dragover", (e) => {
  const row = e.target.closest(".lane-row");
  if (!row) return;
  e.preventDefault();
  row.classList.add("drag-over");
});
els.timelineInner.addEventListener("dragleave", (e) => {
  const row = e.target.closest(".lane-row");
  if (row) row.classList.remove("drag-over");
});
els.timelineInner.addEventListener("drop", (e) => {
  const row = e.target.closest(".lane-row");
  if (!row) return;
  e.preventDefault();
  row.classList.remove("drag-over");
  const data = e.dataTransfer.getData("text/plain");
  const board = activeBoard();
  if (!board || !data) return;

  if (data.startsWith("lane:")) {
    const srcId = data.slice(5);
    const targetId = row.dataset.laneId;
    if (srcId === targetId) return;
    const srcIdx = board.swimlanes.findIndex((l) => l.id === srcId);
    if (srcIdx === -1) return;
    const [lane] = board.swimlanes.splice(srcIdx, 1);
    const targetIdx = board.swimlanes.findIndex((l) => l.id === targetId);
    board.swimlanes.splice(targetIdx === -1 ? board.swimlanes.length : targetIdx, 0, lane);
    Model.touch(board);
    persist();
    renderBoardView();
  } else if (data.startsWith("inbox:")) {
    addInboxCardToLane(data.slice(6), row.dataset.laneId);
  }
});

// --- click delegation: open item editor / lane settings ---

els.timelineInner.addEventListener("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const menuBtn = e.target.closest('[data-action="lane-menu"]');
  if (menuBtn) {
    openLaneModal(menuBtn.dataset.laneId);
    return;
  }
  const itemEl = e.target.closest('[data-action="open-item"]');
  if (itemEl) {
    openItemModal(itemEl.dataset.itemId);
  }
});

// --- pointer-based drag: move/resize bars and events ------------------------
// (lane reorder above uses native HTML5 drag/drop instead — different
// elements, so the two don't conflict.)

function onPointerDown(e) {
  if (e.button === 1) {
    // middle-mouse-button canvas pan, like the drawing-app timelines this was modeled on
    panState = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: els.timelineScroll.scrollLeft,
      scrollTop: els.timelineScroll.scrollTop,
    };
    els.timelineScroll.classList.add("panning");
    e.preventDefault();
    return;
  }
  const handleLeft = e.target.closest(".handle.left");
  const handleRight = e.target.closest(".handle.right");
  const barEl = e.target.closest(".item-bar");
  const eventEl = !barEl ? e.target.closest(".item-event") : null;
  const board = activeBoard();
  if (!board) return;

  if ((handleLeft || handleRight) && barEl) {
    const found = Model.findItem(board, barEl.dataset.itemId);
    if (!found || !found.item.start || !found.item.end) return;
    dragState = {
      type: handleLeft ? "resize-left" : "resize-right",
      itemId: barEl.dataset.itemId,
      startX: e.clientX,
      baseLeft: parseFloat(barEl.style.left) || 0,
      baseWidth: parseFloat(barEl.style.width) || 0,
      el: barEl,
      origStart: found.item.start,
      origEnd: found.item.end,
      moved: false,
      lastDeltaDays: 0,
    };
    e.preventDefault();
    return;
  }
  if (barEl) {
    const found = Model.findItem(board, barEl.dataset.itemId);
    if (!found || !found.item.start) return;
    dragState = {
      type: "move-bar",
      itemId: barEl.dataset.itemId,
      startX: e.clientX,
      baseLeft: parseFloat(barEl.style.left) || 0,
      el: barEl,
      origStart: found.item.start,
      origEnd: found.item.end,
      moved: false,
      lastDeltaDays: 0,
    };
    return;
  }
  if (eventEl) {
    const found = Model.findItem(board, eventEl.dataset.itemId);
    if (!found || !found.item.start) return;
    dragState = {
      type: "move-event",
      itemId: eventEl.dataset.itemId,
      startX: e.clientX,
      baseLeft: parseFloat(eventEl.style.left) || 0,
      el: eventEl,
      origStart: found.item.start,
      moved: false,
      lastDeltaDays: 0,
    };
  }
}

function onPointerMove(e) {
  if (panState) {
    els.timelineScroll.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX);
    els.timelineScroll.scrollTop = panState.scrollTop - (e.clientY - panState.startY);
    return;
  }
  if (!dragState) return;
  const deltaPx = e.clientX - dragState.startX;
  let deltaDays = Math.round(deltaPx / zoom);

  if (dragState.type === "resize-left") {
    const maxDelta = Dates.dayDiff(dragState.origStart, dragState.origEnd) - 1;
    deltaDays = Math.min(deltaDays, maxDelta);
  } else if (dragState.type === "resize-right") {
    const minDelta = -(Dates.dayDiff(dragState.origStart, dragState.origEnd) - 1);
    deltaDays = Math.max(deltaDays, minDelta);
  }

  if (deltaDays === dragState.lastDeltaDays) return;
  dragState.lastDeltaDays = deltaDays;
  if (deltaDays !== 0) {
    dragState.moved = true;
    suppressClick = true;
  }

  if (dragState.type === "move-bar" || dragState.type === "move-event") {
    dragState.el.style.left = `${dragState.baseLeft + deltaDays * zoom}px`;
  } else if (dragState.type === "resize-left") {
    dragState.el.style.left = `${dragState.baseLeft + deltaDays * zoom}px`;
    dragState.el.style.width = `${dragState.baseWidth - deltaDays * zoom}px`;
  } else if (dragState.type === "resize-right") {
    dragState.el.style.width = `${dragState.baseWidth + deltaDays * zoom}px`;
  }
}

function onPointerUp() {
  if (panState) {
    panState = null;
    els.timelineScroll.classList.remove("panning");
    return;
  }
  if (!dragState) return;
  const board = activeBoard();
  const found = board && Model.findItem(board, dragState.itemId);
  if (found && dragState.moved) {
    const deltaDays = dragState.lastDeltaDays || 0;
    const item = found.item;
    if (dragState.type === "move-bar") {
      item.start = Dates.addDays(dragState.origStart, deltaDays);
      item.end = Dates.addDays(dragState.origEnd, deltaDays);
    } else if (dragState.type === "move-event") {
      item.start = Dates.addDays(dragState.origStart, deltaDays);
    } else if (dragState.type === "resize-left") {
      item.start = Dates.addDays(dragState.origStart, deltaDays);
    } else if (dragState.type === "resize-right") {
      item.end = Dates.addDays(dragState.origEnd, deltaDays);
    }
    Model.touch(board);
    persist();
    renderBoardView();
  }
  dragState = null;
}

// attached to the scroll container, not timelineInner: timelineInner is only as
// tall as its content, so a middle-click below the last lane would miss it there
els.timelineScroll.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);

els.timelineInner.addEventListener("dragstart", (e) => {
  const header = e.target.closest(".lane-header");
  if (header) e.dataTransfer.setData("text/plain", "lane:" + header.dataset.laneId);
});

// ---------------------------------------------------------------------------
// item editor modal
// ---------------------------------------------------------------------------

function openItemModal(itemId) {
  const board = activeBoard();
  const found = board && Model.findItem(board, itemId);
  if (!found) return;
  renderItemModal(found.lane, found.item);
}

function renderItemModal(lane, item) {
  const isBar = item.kind === "bar";
  openModal(`
    <h2>edit item</h2>
    <div class="row">
      <div class="field">
        <label>title</label>
        <input type="text" id="mTitle" value="${escapeHtml(item.title)}">
      </div>
      <div class="field" style="max-width:120px;">
        <label>kind</label>
        <select id="mKind">
          <option value="bar" ${isBar ? "selected" : ""}>bar</option>
          <option value="event" ${!isBar ? "selected" : ""}>event</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>start</label>
        <input type="date" id="mStart" value="${item.start || ""}">
      </div>
      <div class="field" id="mEndField" style="${isBar ? "" : "display:none"}">
        <label>end</label>
        <input type="date" id="mEnd" value="${item.end || ""}">
      </div>
    </div>
    <div class="row">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="mTaskToggle" ${item.task ? "checked" : ""}> also a task
      </label>
      <div class="field" id="mDueField" style="${item.task ? "" : "display:none"}">
        <label>due date</label>
        <input type="date" id="mDue" value="${(item.task && item.task.due) || ""}">
      </div>
      <label id="mDoneField" style="display:${item.task ? "flex" : "none"};align-items:center;gap:6px;">
        <input type="checkbox" id="mDone" ${item.task && item.task.done ? "checked" : ""}> done
      </label>
    </div>
    <div class="row">
      <div class="field">
        <label>tags (comma separated)</label>
        <input type="text" id="mTags" value="${escapeHtml((item.tags || []).join(", "))}" placeholder="admin, launch">
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>color</label>
        <div class="swatch-row" id="mColorSwatches"></div>
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>notes (markdown)</label>
        <textarea id="mNotes">${escapeHtml(item.notes || "")}</textarea>
      </div>
    </div>
    <div class="row" id="mNotesPreviewRow" style="${item.notes ? "" : "display:none"}">
      <div class="field notes-preview" id="mNotesPreview">${MD.renderInlineMarkdown(item.notes || "")}</div>
    </div>
    <hr>
    <div id="mSegmentsWrap" style="${isBar ? "" : "display:none"}">
      <label>segments</label>
      <div id="mSegments"></div>
      <button class="ghost" id="mAddSegment" type="button">+ segment</button>
    </div>
    <hr>
    <label>markers</label>
    <div id="mMarkers"></div>
    <button class="ghost" id="mAddMarker" type="button">+ marker</button>
    <hr>
    <div class="actions">
      <button class="danger" id="mDelete" type="button">delete item</button>
      <div class="right"><button id="mClose" type="button">close</button></div>
    </div>
  `);

  const $ = (id) => document.getElementById(id);

  function commit(rerenderBoard) {
    const board = activeBoard();
    Model.touch(board);
    persist();
    if (rerenderBoard && view === "board") renderBoardView();
  }

  $("mTitle").addEventListener("input", (e) => {
    item.title = e.target.value;
    commit(true);
  });
  $("mKind").addEventListener("change", (e) => {
    item.kind = e.target.value;
    if (item.kind === "event") item.end = null;
    else if (!item.end) item.end = item.start;
    commit(true);
    renderItemModal(lane, item);
  });
  $("mStart").addEventListener("change", (e) => {
    item.start = e.target.value || null;
    commit(true);
  });
  if (isBar) {
    $("mEnd").addEventListener("change", (e) => {
      item.end = e.target.value || null;
      commit(true);
    });
  }

  $("mTaskToggle").addEventListener("change", (e) => {
    item.task = e.target.checked ? { done: false, due: null } : null;
    commit(true);
    renderItemModal(lane, item);
  });
  if (item.task) {
    $("mDue").addEventListener("change", (e) => {
      item.task.due = e.target.value || null;
      commit(true);
    });
    $("mDone").addEventListener("change", (e) => {
      item.task.done = e.target.checked;
      commit(true);
    });
  }
  $("mTags").addEventListener("change", (e) => {
    item.tags = e.target.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    commit(true);
  });
  $("mNotes").addEventListener("input", (e) => {
    item.notes = e.target.value;
    $("mNotesPreviewRow").style.display = item.notes ? "" : "none";
    $("mNotesPreview").innerHTML = MD.renderInlineMarkdown(item.notes);
    commit(false);
  });

  $("mAddSegment").addEventListener("click", () => {
    item.segments.push(Model.newSegment({ title: "segment", start: item.start, end: item.end }));
    commit(true);
    renderItemModal(lane, item);
  });
  $("mAddMarker").addEventListener("click", () => {
    item.markers.push(Model.newMarker({ title: "marker", at: item.start }));
    commit(true);
    renderItemModal(lane, item);
  });

  $("mDelete").addEventListener("click", () => {
    if (!confirm(`delete "${item.title}"?`)) return;
    lane.items = lane.items.filter((i) => i.id !== item.id);
    commit(false);
    closeModal();
    renderCurrentView();
  });
  $("mClose").addEventListener("click", () => {
    closeModal();
    renderCurrentView();
  });

  renderColorSwatches(item, lane, commit);
  renderSegmentsList(item, commit);
  renderMarkersList(item, commit);
}

function renderColorSwatches(item, lane, commit) {
  const wrap = document.getElementById("mColorSwatches");
  if (!wrap) return;
  const selected = item.color || null;
  const matchBtn = `<button type="button" class="swatch match${selected === null ? " selected" : ""}" data-color="" title="match lane color">auto</button>`;
  const swatchBtns = Model.PALETTE.map(
    (hex) => `<button type="button" class="swatch${selected === hex ? " selected" : ""}" data-color="${hex}" style="background:${hex}" title="${hex}"></button>`,
  ).join("");
  wrap.innerHTML = matchBtn + swatchBtns;
  wrap.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      item.color = btn.dataset.color || null;
      commit(true);
      renderColorSwatches(item, lane, commit);
    });
  });
}

function renderSegmentsList(item, commit) {
  const wrap = document.getElementById("mSegments");
  if (!wrap) return;
  wrap.innerHTML = item.segments
    .map(
      (seg) => `
    <div class="sub-list-item" data-seg-id="${seg.id}">
      <input type="text" class="seg-title" value="${escapeHtml(seg.title)}" placeholder="title">
      <input type="date" class="seg-start" value="${seg.start || ""}">
      <input type="date" class="seg-end" value="${seg.end || ""}">
      <button class="ghost danger seg-remove" type="button">×</button>
    </div>`,
    )
    .join("");
  wrap.querySelectorAll(".sub-list-item").forEach((row) => {
    const seg = item.segments.find((s) => s.id === row.dataset.segId);
    if (!seg) return;
    row.querySelector(".seg-title").addEventListener("input", (e) => {
      seg.title = e.target.value;
      commit(true);
    });
    row.querySelector(".seg-start").addEventListener("change", (e) => {
      seg.start = e.target.value || null;
      commit(true);
    });
    row.querySelector(".seg-end").addEventListener("change", (e) => {
      seg.end = e.target.value || null;
      commit(true);
    });
    row.querySelector(".seg-remove").addEventListener("click", () => {
      item.segments = item.segments.filter((s) => s.id !== seg.id);
      commit(true);
      renderSegmentsList(item, commit);
    });
  });
}

function renderMarkersList(item, commit) {
  const wrap = document.getElementById("mMarkers");
  if (!wrap) return;
  wrap.innerHTML = item.markers
    .map(
      (mk) => `
    <div class="sub-list-item" data-mk-id="${mk.id}">
      <input type="text" class="mk-title" value="${escapeHtml(mk.title)}" placeholder="title">
      <input type="date" class="mk-at" value="${mk.at || ""}">
      <button class="ghost danger mk-remove" type="button">×</button>
    </div>`,
    )
    .join("");
  wrap.querySelectorAll(".sub-list-item").forEach((row) => {
    const mk = item.markers.find((m) => m.id === row.dataset.mkId);
    if (!mk) return;
    row.querySelector(".mk-title").addEventListener("input", (e) => {
      mk.title = e.target.value;
      commit(true);
    });
    row.querySelector(".mk-at").addEventListener("change", (e) => {
      mk.at = e.target.value || null;
      commit(true);
    });
    row.querySelector(".mk-remove").addEventListener("click", () => {
      item.markers = item.markers.filter((m) => m.id !== mk.id);
      commit(true);
      renderMarkersList(item, commit);
    });
  });
}

// ---------------------------------------------------------------------------
// lane settings modal (rename, color, collapse, add item, share, export, delete)
// ---------------------------------------------------------------------------

function openLaneModal(laneId) {
  const board = activeBoard();
  const lane = board && Model.findSwimlane(board, laneId);
  if (!lane) return;
  renderLaneModal(lane);
}

function renderLaneModal(lane) {
  openModal(`
    <h2>swimlane settings</h2>
    <div class="row">
      <div class="field">
        <label>title</label>
        <input type="text" id="lTitle" value="${escapeHtml(lane.title)}">
      </div>
      <div class="field" style="max-width:70px;">
        <label>color</label>
        <input type="color" id="lColor" value="${lane.color}">
      </div>
    </div>
    <div class="row">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="lCollapsed" ${lane.collapsed ? "checked" : ""}> collapsed
      </label>
    </div>
    <hr>
    <div class="row">
      <button id="lAddItemBar" type="button">+ bar</button>
      <button id="lAddItemEvent" type="button">+ event</button>
    </div>
    <hr>
    <h3 style="font-size:13px;margin-bottom:6px;">share this lane</h3>
    <p style="color:var(--dim);font-size:12px;margin-top:0;">the link carries the lane's data itself — nothing is uploaded anywhere.</p>
    <div class="row">
      <select id="lShareRole" style="max-width:200px;">
        <option value="viewer">viewer (read-only preview)</option>
        <option value="editor">editor (can import a copy)</option>
      </select>
      <button id="lShareGen" type="button">generate link</button>
    </div>
    <div class="row" id="lShareLinkRow" style="display:none;">
      <input type="text" id="lShareLinkOut" readonly>
      <button id="lShareCopy" type="button">copy</button>
    </div>
    <hr>
    <div class="row"><button id="lExport" type="button">export lane (.json)</button></div>
    <div class="actions">
      <button class="danger" id="lDelete" type="button">delete lane</button>
      <div class="right"><button id="lClose" type="button">close</button></div>
    </div>
  `);

  const $ = (id) => document.getElementById(id);

  function commit() {
    const board = activeBoard();
    Model.touch(board);
    persist();
    if (view === "board") renderBoardView();
  }

  $("lTitle").addEventListener("input", (e) => {
    lane.title = e.target.value;
    commit();
  });
  $("lColor").addEventListener("input", (e) => {
    lane.color = e.target.value;
    commit();
  });
  $("lCollapsed").addEventListener("change", (e) => {
    lane.collapsed = e.target.checked;
    commit();
  });

  $("lAddItemBar").addEventListener("click", () => {
    const today = Dates.todayISO();
    const item = Model.newItem({ kind: "bar", title: "new bar", start: today, end: Dates.addDays(today, 3), color: lane.color });
    lane.items.push(item);
    commit();
    closeModal();
    openItemModal(item.id);
  });
  $("lAddItemEvent").addEventListener("click", () => {
    const item = Model.newItem({ kind: "event", title: "new event", start: Dates.todayISO(), color: lane.color });
    lane.items.push(item);
    commit();
    closeModal();
    openItemModal(item.id);
  });

  $("lShareGen").addEventListener("click", () => {
    const board = activeBoard();
    const link = Share.buildLaneShareLink(lane, $("lShareRole").value, board ? board.title : "");
    $("lShareLinkOut").value = link;
    $("lShareLinkRow").style.display = "flex";
  });
  $("lShareCopy").addEventListener("click", async () => {
    const val = $("lShareLinkOut").value;
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      $("lShareLinkOut").select();
      document.execCommand("copy");
    }
    const btn = $("lShareCopy");
    btn.textContent = "copied!";
    setTimeout(() => (btn.textContent = "copy"), 1500);
  });

  $("lExport").addEventListener("click", () => downloadJSON(lane, `timelane-lane-${slug(lane.title)}.json`));

  $("lDelete").addEventListener("click", () => {
    if (!confirm(`delete swimlane "${lane.title}" and all its items?`)) return;
    const board = activeBoard();
    board.swimlanes = board.swimlanes.filter((l) => l.id !== lane.id);
    commit();
    closeModal();
    renderCurrentView();
  });
  $("lClose").addEventListener("click", () => {
    closeModal();
    if (view === "board") renderBoardView();
  });
}

// ---------------------------------------------------------------------------
// incoming share link
// ---------------------------------------------------------------------------

function cloneLaneWithNewIds(lane) {
  const fresh = Model.newSwimlane(lane.title, lane.color);
  fresh.collapsed = !!lane.collapsed;
  for (const item of lane.items || []) {
    const newItem = Model.newItem({ kind: item.kind, title: item.title, start: item.start, end: item.end, color: item.color, tags: item.tags });
    newItem.task = item.task ? { done: !!item.task.done, due: item.task.due || null } : null;
    newItem.notes = item.notes || "";
    for (const seg of item.segments || []) newItem.segments.push(Model.newSegment({ title: seg.title, start: seg.start, end: seg.end, color: seg.color }));
    for (const mk of item.markers || []) newItem.markers.push(Model.newMarker({ title: mk.title, at: mk.at, color: mk.color }));
    fresh.items.push(newItem);
  }
  return fresh;
}

function renderShareReceivedModal(payload) {
  const lane = payload.lane;
  const roleLabel = payload.role === "editor" ? "editor — can import a copy" : "viewer — read-only";
  const itemsPreview = (lane.items || [])
    .map((i) => `<li>${escapeHtml(i.title)}${i.start ? ` — ${escapeHtml(i.start)}${i.end ? ` → ${escapeHtml(i.end)}` : ""}` : ""}</li>`)
    .join("");
  const boardOptions = store.boards.map((b) => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join("");

  openModal(`
    <h2>shared swimlane</h2>
    <p style="color:var(--dim);font-size:13px;">
      someone sent you the lane "<strong>${escapeHtml(lane.title)}</strong>"${payload.boardTitle ? ` from their board "${escapeHtml(payload.boardTitle)}"` : ""} —
      shared as <strong>${roleLabel}</strong>. this arrived entirely inside the link; nothing was fetched from any server.
    </p>
    <ul>${itemsPreview || "<li>(no items)</li>"}</ul>
    ${
      payload.role === "editor"
        ? `<hr><div class="row">
        <select id="sTargetBoard">${boardOptions}<option value="__new__">+ new board</option></select>
        <button id="sImport" class="primary" type="button">import as a new lane</button>
      </div>`
        : ""
    }
    <div class="actions"><div class="right"><button id="sClose" type="button">close</button></div></div>
  `);

  const importBtn = document.getElementById("sImport");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const sel = document.getElementById("sTargetBoard").value;
      let board;
      if (sel === "__new__") {
        board = Model.newBoard(payload.boardTitle ? `${payload.boardTitle} (shared)` : "shared board");
        store.boards.push(board);
      } else {
        board = store.boards.find((b) => b.id === sel);
      }
      if (!board) return;
      board.swimlanes.push(cloneLaneWithNewIds(lane));
      store.activeBoardId = board.id;
      overdueDismissedCount = -1;
      Model.touch(board);
      persist();
      renderBoardSelect();
      closeModal();
      switchView("board");
    });
  }
  document.getElementById("sClose").addEventListener("click", closeModal);
}

function handleIncomingShare() {
  const payload = Share.readShareFromLocation();
  if (!payload) return;
  Share.clearShareFromLocation();
  renderShareReceivedModal(payload);
}

// ---------------------------------------------------------------------------
// outline view
// ---------------------------------------------------------------------------

function renderOutlineView() {
  const board = activeBoard();
  if (!board) {
    els.outlineView.innerHTML = `<p style="color:var(--dim)">no board yet.</p>`;
    return;
  }
  let html = `<div class="row" style="margin-bottom:12px;">
    <button id="oCopy" class="ghost" type="button">copy as text</button>
    <button id="oDownload" class="ghost" type="button">download .txt</button>
  </div><ul>`;
  for (const lane of board.swimlanes) {
    html += `<li class="lane-line">${escapeHtml(lane.title)}<ul>`;
    for (const item of lane.items) {
      const overdue = item.task && Dates.isOverdue(item.task.due, item.task.done);
      const dateStr = item.start ? (item.kind === "bar" && item.end ? `${item.start} → ${item.end}` : item.start) : "no date";
      const tagsStr = item.tags && item.tags.length ? ` ${item.tags.map((t) => `#${t}`).join(" ")}` : "";
      html += `<li>${item.task ? `<input type="checkbox" class="oTaskToggle" data-item-id="${item.id}" ${item.task.done ? "checked" : ""}>` : ""}<span class="item-line" data-action="open-item" data-item-id="${item.id}">${escapeHtml(item.title)}</span><span class="meta">${escapeHtml(dateStr)}${item.task && item.task.due ? ` · due ${item.task.due}` : ""}${overdue ? " · overdue" : ""}${escapeHtml(tagsStr)}</span>`;
      if (item.segments.length || item.markers.length) {
        html += `<ul>`;
        for (const seg of item.segments) html += `<li class="meta">segment: ${escapeHtml(seg.title)}${seg.start ? ` (${seg.start} → ${seg.end || seg.start})` : ""}</li>`;
        for (const mk of item.markers) html += `<li class="meta">marker: ${escapeHtml(mk.title)}${mk.at ? ` (${mk.at})` : ""}</li>`;
        html += `</ul>`;
      }
      html += `</li>`;
    }
    html += `</ul></li>`;
  }
  html += `</ul>`;
  if (board.swimlanes.length === 0) html += `<p style="color:var(--dim)">no swimlanes yet.</p>`;
  els.outlineView.innerHTML = html;

  document.getElementById("oCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(Model.outlineLines(board).join("\n"));
    } catch {
      // clipboard permission denied — nothing more we can do without a server
    }
  });
  document.getElementById("oDownload").addEventListener("click", () => {
    downloadBlob(new Blob([Model.outlineLines(board).join("\n")], { type: "text/plain" }), `timelane-${slug(board.title)}.txt`);
  });
  els.outlineView.querySelectorAll(".oTaskToggle").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const found = Model.findItem(board, e.target.dataset.itemId);
      if (!found) return;
      found.item.task.done = e.target.checked;
      Model.touch(board);
      persist();
      renderOutlineView();
    });
  });
  els.outlineView.querySelectorAll('[data-action="open-item"]').forEach((el) => {
    el.addEventListener("click", () => openItemModal(el.dataset.itemId));
  });
}

// ---------------------------------------------------------------------------
// inbox view
// ---------------------------------------------------------------------------

els.captureBtn.addEventListener("click", () => {
  const cards = MD.parseInboxText(els.inboxTextarea.value);
  if (cards.length === 0) return;
  store.inbox.push(...cards);
  els.inboxTextarea.value = "";
  persist();
  renderInboxView();
  if (view === "board") renderBoardView();
});

function renderInboxView() {
  els.inboxCount.textContent = String(store.inbox.length);
  const board = activeBoard();
  const laneOptions = board ? board.swimlanes.map((l) => `<option value="${l.id}">${escapeHtml(l.title)}</option>`).join("") : "";

  els.inboxList.innerHTML =
    store.inbox.length === 0
      ? `<p style="color:var(--dim);">nothing captured yet.</p>`
      : store.inbox
          .map(
            (c) => `
      <div class="inbox-card" data-card-id="${c.id}">
        <span class="title">${escapeHtml(c.title)}${c.done ? " ✓" : ""}</span>
        ${c.due ? `<span class="due">@${escapeHtml(c.due)}</span>` : ""}
        ${(c.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("")}
        <select class="assign-select" ${!board || board.swimlanes.length === 0 ? "disabled" : ""}>
          <option value="">assign to lane…</option>
          ${laneOptions}
        </select>
        <button class="ghost danger remove-card" type="button" title="discard">×</button>
      </div>`,
          )
          .join("");

  els.inboxList.querySelectorAll(".assign-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const cardId = e.target.closest(".inbox-card").dataset.cardId;
      if (e.target.value) addInboxCardToLane(cardId, e.target.value);
    });
  });
  els.inboxList.querySelectorAll(".remove-card").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const cardId = e.target.closest(".inbox-card").dataset.cardId;
      store.inbox = store.inbox.filter((c) => c.id !== cardId);
      persist();
      renderInboxView();
    });
  });
}

// ---------------------------------------------------------------------------
// tasks view
// ---------------------------------------------------------------------------

function renderTasksView() {
  const board = activeBoard();
  if (!board) {
    els.tasksList.innerHTML = `<p style="color:var(--dim);">no board yet.</p>`;
    return;
  }
  const tasks = Model.allTasks(board);
  tasks.sort((a, b) => {
    const da = a.item.task.due || "9999-99-99";
    const db = b.item.task.due || "9999-99-99";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  if (tasks.length === 0) {
    els.tasksList.innerHTML = `<p style="color:var(--dim);">no tasks yet — flag an item as a task from its editor, or capture one in the inbox with <code>- [ ]</code>.</p>`;
    return;
  }

  els.tasksList.innerHTML = tasks
    .map(({ lane, item }) => {
      const overdue = Dates.isOverdue(item.task.due, item.task.done);
      const soon = !overdue && Dates.isDueSoon(item.task.due, item.task.done);
      const cls = [item.task.done ? "done" : "", overdue ? "overdue" : "", soon ? "soon" : ""].filter(Boolean).join(" ");
      const dueText = item.task.due ? `${overdue ? "overdue · " : ""}${Dates.formatShort(item.task.due)}` : "no due date";
      return `<div class="task-row ${cls}" data-item-id="${item.id}">
        <input type="checkbox" class="tDone" ${item.task.done ? "checked" : ""}>
        <span class="lane-tag">${escapeHtml(lane.title)}</span>
        <span class="title">${escapeHtml(item.title)}</span>
        ${(item.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("")}
        <span class="due">${dueText}</span>
      </div>`;
    })
    .join("");

  els.tasksList.querySelectorAll(".task-row").forEach((row) => {
    const cb = row.querySelector(".tDone");
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", (e) => {
      const found = Model.findItem(board, row.dataset.itemId);
      if (!found) return;
      found.item.task.done = e.target.checked;
      Model.touch(board);
      persist();
      renderTasksView();
    });
    row.addEventListener("click", () => openItemModal(row.dataset.itemId));
  });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

renderBoardSelect();
handleIncomingShare();
switchView("board");
zoomToFit();
renderOverdueBadge();
setInterval(renderOverdueBadge, 60 * 60 * 1000);
