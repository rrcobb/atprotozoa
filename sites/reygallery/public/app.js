import { buildExhibit } from "./lib/gallery.js";

const statusEl = document.getElementById("status");
const onviewSection = document.getElementById("onview");
const onviewExhibit = document.getElementById("onviewExhibit");
const aboutSection = document.getElementById("about");
const aboutBio = document.getElementById("aboutBio");
const collectionSection = document.getElementById("collection");
const collectionGrid = document.getElementById("collectionGrid");
const modal = document.getElementById("modal");
const modalInner = document.getElementById("modalInner");
const modalClose = document.getElementById("modalClose");
const modalPrev = document.getElementById("modalPrev");
const modalNext = document.getElementById("modalNext");
const shareBluesky = document.getElementById("shareBluesky");

// Pieces the modal can step through, in the same order as the collection
// grid, plus the index currently open (-1 when the modal is closed).
let modalPieces = [];
let modalIndex = -1;

const SITE_URL = "https://reygallery.bisks.net/";

function el(tag, opts, ...children) {
  const node = document.createElement(tag);
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function frameForPiece(piece, { thumb } = {}) {
  const media =
    piece.kind === "video"
      ? el("img", { src: piece.image, alt: piece.alt || piece.title, loading: "lazy" })
      : el("img", { src: thumb && piece.thumb ? piece.thumb : piece.image, alt: piece.alt || piece.title, loading: "lazy" });
  const frame = el("div", { class: "frame" }, media);
  if (piece.kind === "video") frame.appendChild(el("span", { class: "badge-video", text: "video" }));
  return frame;
}

function plaqueFor(piece, { catalogLabel } = {}) {
  const plaque = el("div", { class: "plaque" });
  if (catalogLabel) plaque.appendChild(el("p", { class: "p-cat", text: catalogLabel }));
  plaque.appendChild(el("p", { class: "p-title", text: `“${piece.title}”` }));
  plaque.appendChild(el("p", { class: "p-meta", text: `${piece.artist}, ${piece.year}` }));
  plaque.appendChild(el("p", { class: "p-statement", text: piece.statement }));
  const linkP = el("p", { class: "p-link" });
  linkP.appendChild(el("a", { href: piece.link, target: "_blank", rel: "noopener", text: piece.linkLabel }));
  plaque.appendChild(linkP);
  const shareUrl =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`"${piece.title}" — ${piece.artist}, ${piece.year}. from the gallery: ${SITE_URL}`);
  plaque.appendChild(el("a", { class: "share-piece", href: shareUrl, target: "_blank", rel: "noopener", text: "share this piece ↗" }));
  return plaque;
}

function renderOnView(piece) {
  const col = el("div", { class: "frame-col spotlight" });
  col.appendChild(frameForPiece(piece));
  col.appendChild(plaqueFor(piece, { catalogLabel: piece.current ? "currently on view" : null }));
  onviewExhibit.appendChild(col);
  onviewSection.hidden = false;
}

function renderAbout(profile) {
  if (!profile.bio) return;
  const plaque = el("div", { class: "bio-plaque" });
  plaque.appendChild(el("p", { class: "p-cat", text: `${profile.displayName || profile.handle}, in their own words` }));
  plaque.appendChild(el("p", { class: "p-statement", text: profile.bio }));
  aboutBio.appendChild(plaque);
  aboutSection.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  modalInner.replaceChildren();
  modalIndex = -1;
}

function openModal(index) {
  const piece = modalPieces[index];
  if (!piece) return;
  modalIndex = index;
  modalInner.replaceChildren();
  const media =
    piece.kind === "video"
      ? (() => {
          const v = el("video", { controls: "", poster: piece.image });
          v.appendChild(el("source", { src: piece.playlist, type: "application/x-mpegURL" }));
          return v;
        })()
      : el("img", { src: piece.image, alt: piece.alt || piece.title });
  modalInner.appendChild(el("div", { class: "frame" }, media));
  modalInner.appendChild(plaqueFor(piece, { catalogLabel: `catalog no. ${piece.catNo}` }));
  modalPrev.hidden = modalPieces.length < 2 || index === 0;
  modalNext.hidden = modalPieces.length < 2 || index === modalPieces.length - 1;
  modal.hidden = false;
}

function renderCollection(pieces) {
  modalPieces = pieces;
  pieces.forEach((piece, i) => {
    piece.catNo = i + 1;
    const frame = frameForPiece(piece, { thumb: true });
    frame.addEventListener("click", () => openModal(i));
    const cap = el(
      "figcaption",
      null,
      el("span", { class: "g-title", text: `“${piece.title}”` }),
      el("span", { text: `${piece.artist}, ${piece.year}` }),
    );
    const figure = el("figure", { onclick: () => openModal(i) }, frame, cap);
    collectionGrid.appendChild(figure);
  });
  collectionSection.hidden = false;
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
modalPrev.addEventListener("click", () => {
  if (modalIndex > 0) openModal(modalIndex - 1);
});
modalNext.addEventListener("click", () => {
  if (modalIndex < modalPieces.length - 1) openModal(modalIndex + 1);
});
document.addEventListener("keydown", (e) => {
  if (modal.hidden) return;
  if (e.key === "Escape") closeModal();
  else if (e.key === "ArrowLeft" && modalIndex > 0) openModal(modalIndex - 1);
  else if (e.key === "ArrowRight" && modalIndex < modalPieces.length - 1) openModal(modalIndex + 1);
});

async function main() {
  shareBluesky.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`a little museum wing for @rey-notnecessarily.bsky.social's art — ${SITE_URL}`);

  try {
    const exhibit = await buildExhibit((step) => {
      statusEl.textContent = step;
    });

    if (!exhibit.selfPortrait && exhibit.pieces.length === 0) {
      statusEl.textContent = "the artist hasn't hung anything yet — check back after Rey posts something.";
      return;
    }

    statusEl.remove();
    if (exhibit.selfPortrait) renderOnView(exhibit.selfPortrait);
    renderAbout(exhibit.profile);
    if (exhibit.pieces.length) renderCollection(exhibit.pieces);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "couldn't load the gallery (" + (err && err.message ? err.message : "unknown error") + ") — reload to try again.";
    statusEl.classList.add("error");
  }
}

main();
