// app.js — glue between the CSV upload screen, the Three.js room (scene.js),
// and Open Library covers (covers.js). No build step: this is a plain ES
// module loaded straight off the static site, imported by index.html.

import { parseCSV, mapHeaders, buildBooks } from "./csv.js";
import { initScene, proceduralCoverDataUrl } from "./scene.js";
import { fetchCoverThumb, fetchCoverLarge } from "./covers.js";

const el = (id) => document.getElementById(id);
const $upload = el("upload");
const $drop = el("drop");
const $csvfile = el("csvfile");
const $uploadError = el("uploadError");
const $preview = el("preview");
const $previewCount = el("previewCount");
const $previewFields = el("previewFields");
const $previewSkipped = el("previewSkipped");
const $buildBtn = el("buildBtn");
const $controls = el("controls");
const $search = el("search");
const $minStars = el("minStars");
const $arrange = el("arrange");
const $visibleCount = el("visibleCount");
const $resetBtn = el("resetBtn");
const $hint = el("hint");
const $detail = el("detail");
const $detailClose = el("detailClose");
const $detailCover = el("detailCover");
const $detailTitle = el("detailTitle");
const $detailAuthor = el("detailAuthor");
const $detailStars = el("detailStars");
const $detailMeta = el("detailMeta");
const $detailOL = el("detailOL");
const $shareBar = el("shareBar");
const $shareBtn = el("shareBtn");
const $shareBluesky = el("shareBluesky");
const $canvas = el("scene");

const FIELD_LABELS = {
  title: "Title", authors: "Authors", isbn: "ISBN/UID",
  dateRead: "Last Date Read", stars: "Stars", format: "Format",
};

let books = [];
let mapping = {};
let scene = null;
let roomDepth = 12;
let selectedId = null;

// ---------------- CSV upload ----------------------------------------------

function handleFile(file) {
  $uploadError.hidden = true;
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showError("couldn't read that file.");
  reader.onload = () => {
    try {
      const { headers, records } = parseCSV(String(reader.result));
      if (!headers.length) return showError("that doesn't look like a CSV — no header row found.");
      mapping = mapHeaders(headers);
      if (!mapping.title) return showError("couldn't find a Title column in " + headers.join(", "));
      const result = buildBooks(records, mapping);
      books = result.books;
      if (!books.length) return showError("found a Title column, but every row was empty.");
      showPreview(result.skipped);
    } catch (e) {
      showError("failed to parse: " + (e?.message || e));
    }
  };
  reader.readAsText(file);
}

function showError(msg) {
  $uploadError.textContent = msg;
  $uploadError.hidden = false;
  $preview.hidden = true;
}

function showPreview(skipped) {
  $previewCount.textContent = books.length;
  $previewFields.innerHTML = "";
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const li = document.createElement("li");
    if (mapping[key]) {
      li.innerHTML = `<b>${label}</b> ← "${mapping[key]}"`;
    } else {
      li.innerHTML = `<b>${label}</b> <span class="missing">not found — will be blank</span>`;
    }
    $previewFields.appendChild(li);
  }
  if (skipped > 0) {
    $previewSkipped.textContent = `(skipped ${skipped} row${skipped === 1 ? "" : "s"} with no title)`;
    $previewSkipped.hidden = false;
  } else {
    $previewSkipped.hidden = true;
  }
  $preview.hidden = false;
}

$drop.addEventListener("dragover", (e) => { e.preventDefault(); $drop.classList.add("dragover"); });
$drop.addEventListener("dragleave", () => $drop.classList.remove("dragover"));
$drop.addEventListener("drop", (e) => {
  e.preventDefault();
  $drop.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});
$csvfile.addEventListener("change", () => handleFile($csvfile.files?.[0]));

$buildBtn.addEventListener("click", buildShelf);

// ---------------- build the room -------------------------------------------

const COVER_CONCURRENCY = 6; // caps simultaneous in-flight fetches so a big
// library doesn't open hundreds of connections at once — a browser/network
// courtesy limit, not a cap on how many covers get fetched (every book with
// an ISBN eventually gets tried).

async function fetchAllCovers(list) {
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const book = list[i++];
      if (!book.isbn || book._coverImage || book._coverTried) continue;
      book._coverTried = true;
      const result = await fetchCoverThumb(book.isbn);
      if (result) scene.applyCover(book.id, result.img, result.dominantColor);
    }
  }
  await Promise.all(Array.from({ length: COVER_CONCURRENCY }, worker));
}

function buildShelf() {
  $upload.hidden = true;
  $controls.hidden = false;
  $hint.hidden = false;
  $shareBar.hidden = false;

  scene = initScene($canvas);
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const layout = scene.setBooks(sortedFor(currentArrange()), { leanFeatured: currentArrange() === "rating" });
  roomDepth = layout.roomDepth;
  scene.roomOverview(roomDepth);
  updateVisibleCount();

  fetchAllCovers(books);
  wireSceneInput();
  $shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function resizeCanvas() {
  if (!scene) return;
  scene.resize(window.innerWidth, window.innerHeight);
}

// ---------------- arrange / search / filter --------------------------------

function currentArrange() { return $arrange.value; }

function sortedFor(mode) {
  const copy = books.slice();
  if (mode === "year") {
    copy.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  } else if (mode === "rating") {
    copy.sort((a, b) => (b.stars || 0) - (a.stars || 0) || a.title.localeCompare(b.title));
  } else if (mode === "author") {
    copy.sort((a, b) => a.authors.localeCompare(b.authors) || a.title.localeCompare(b.title));
  } else if (mode === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (mode === "format") {
    copy.sort((a, b) => (a.format || "unlabeled").localeCompare(b.format || "unlabeled") || a.title.localeCompare(b.title));
  }
  return copy;
}

function currentPredicate() {
  const term = $search.value.trim().toLowerCase();
  const minStars = parseFloat($minStars.value) || 0;
  if (!term && minStars <= 0) return null;
  return (book) => {
    if (term && !(book.title.toLowerCase().includes(term) || book.authors.toLowerCase().includes(term))) return false;
    if (minStars > 0 && !(book.stars >= minStars)) return false;
    return true;
  };
}

function updateVisibleCount() {
  const pred = currentPredicate();
  const n = pred ? books.filter(pred).length : books.length;
  $visibleCount.textContent = pred ? `${n} / ${books.length} shown` : `${books.length} books`;
}

function applyFilters({ moveCamera } = {}) {
  const pred = currentPredicate();
  scene.applyFilter(pred);
  updateVisibleCount();
  const term = $search.value.trim();
  if (moveCamera) {
    if (term && pred) {
      const first = books.find(pred);
      if (first) scene.focusOn(first.id, { zoom: false });
      else scene.roomOverview(roomDepth);
    } else if (!term) {
      scene.roomOverview(roomDepth);
    }
  }
}

let searchDebounce = null;
$search.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => applyFilters({ moveCamera: true }), 220);
});
$minStars.addEventListener("change", () => applyFilters({ moveCamera: false }));
$arrange.addEventListener("change", () => {
  closeDetail();
  const layout = scene.setBooks(sortedFor(currentArrange()), { leanFeatured: currentArrange() === "rating" });
  roomDepth = layout.roomDepth;
  scene.roomOverview(roomDepth);
  applyFilters({ moveCamera: false });
});

$resetBtn.addEventListener("click", () => window.location.reload());

// ---------------- pointer / keyboard controls -------------------------------

function wireSceneInput() {
  let dragging = false, moved = false, lastX = 0, lastY = 0;
  const ROT_SPEED = 0.006;

  $canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    $canvas.setPointerCapture(e.pointerId);
  });
  $canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    scene.orbit(dx * ROT_SPEED, dy * ROT_SPEED);
    lastX = e.clientX; lastY = e.clientY;
  });
  $canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!moved) handlePick(e.clientX, e.clientY);
  });
  $canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    scene.zoom(e.deltaY * 0.0012);
  }, { passive: false });

  const pressed = new Set();
  window.addEventListener("keydown", (e) => {
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
      pressed.add(e.key.toLowerCase());
    }
  });
  window.addEventListener("keyup", (e) => pressed.delete(e.key.toLowerCase()));

  let lastT = performance.now();
  function walkTick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    let dx = 0, dz = 0;
    const speed = 2.6 * dt;
    if (pressed.has("w") || pressed.has("arrowup")) dz -= speed;
    if (pressed.has("s") || pressed.has("arrowdown")) dz += speed;
    if (pressed.has("a") || pressed.has("arrowleft")) dx -= speed;
    if (pressed.has("d") || pressed.has("arrowright")) dx += speed;
    if (dx || dz) scene.walk(dx, dz);
    requestAnimationFrame(walkTick);
  }
  requestAnimationFrame(walkTick);
}

function handlePick(clientX, clientY) {
  const rect = $canvas.getBoundingClientRect();
  const id = scene.pick(clientX, clientY, rect);
  if (!id) { closeDetail(); return; }
  if (id === selectedId) return;
  openDetail(id);
}

// ---------------- detail panel -----------------------------------------

function openDetail(id) {
  const book = scene.selectBook(id);
  if (!book) return;
  selectedId = id;
  scene.focusOn(id, { zoom: true });

  $detailTitle.textContent = book.title;
  $detailAuthor.textContent = book.authors;
  $detailStars.textContent = book.stars ? "★".repeat(Math.round(book.stars)) + "☆".repeat(5 - Math.round(book.stars)) : "unrated";

  $detailMeta.innerHTML = "";
  const rows = [
    ["Last read", book.dateRead || "—"],
    ["Format", book.format || "—"],
    ["ISBN", book.isbn || "—"],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    $detailMeta.appendChild(dt); $detailMeta.appendChild(dd);
  }

  $detailOL.href = book.isbn
    ? `https://openlibrary.org/isbn/${book.isbn}`
    : `https://openlibrary.org/search?q=${encodeURIComponent(book.title + " " + book.authors)}`;

  $detailCover.innerHTML = "";
  const placeholder = document.createElement("img");
  placeholder.alt = book.title;
  // Show something immediately — the cached spine thumb if a cover already
  // resolved, otherwise the same procedural art the 3D cover face uses —
  // then upgrade to a full -L cover below once/if it loads.
  placeholder.src = book._coverImage ? book._coverImage.src : proceduralCoverDataUrl(book);
  $detailCover.appendChild(placeholder);
  if (book.isbn) {
    fetchCoverLarge(book.isbn).then((img) => {
      if (selectedId !== id || !img) return;
      const large = document.createElement("img");
      large.src = img.src;
      large.alt = book.title;
      $detailCover.innerHTML = "";
      $detailCover.appendChild(large);
    });
  }

  $detail.hidden = false;
}

function closeDetail() {
  if (selectedId) scene.clearSelection();
  selectedId = null;
  $detail.hidden = true;
}
$detailClose.addEventListener("click", closeDetail);

// ---------------- sharing ------------------------------------------------

function shareText() {
  const n = books.length;
  const rated = books.filter((b) => b.stars >= 4.5);
  const pick = rated.length ? rated[Math.floor(Math.random() * rated.length)] : books[0];
  const title = pick ? pick.title.slice(0, 50) : "";
  const line = title ? ` Featuring "${title}."` : "";
  // Budgeted against Bluesky's 300-grapheme cap: base text + url is ~110
  // chars, leaving plenty of room even for the longest truncated title.
  return `I turned my reading log into a walkable 3D library — ${n} books shelved.${line} Built with shelfspace: https://shelfspace.bisks.net/`;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch { return false; }
}

$shareBtn.addEventListener("click", async () => {
  const dataUrl = $canvas.toDataURL("image/png");
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], "shelfspace.png", { type: "image/png" });
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], text: shareText(), title: "shelfspace" });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return; // user backed out of the share sheet — don't also force a download
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "shelfspace.png";
  a.click();
  URL.revokeObjectURL(a.href);
});
