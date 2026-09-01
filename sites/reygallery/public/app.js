import { buildExhibit } from "./lib/gallery.js";

const statusEl = document.getElementById("status");
const onviewSection = document.getElementById("onview");
const onviewExhibit = document.getElementById("onviewExhibit");
const collectionSection = document.getElementById("collection");
const collectionGrid = document.getElementById("collectionGrid");
const modal = document.getElementById("modal");
const modalInner = document.getElementById("modalInner");
const modalClose = document.getElementById("modalClose");
const shareBluesky = document.getElementById("shareBluesky");

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

function openModal(piece) {
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
  modal.hidden = false;
}

function renderCollection(pieces) {
  pieces.forEach((piece, i) => {
    piece.catNo = i + 1;
    const frame = frameForPiece(piece, { thumb: true });
    frame.addEventListener("click", () => openModal(piece));
    const cap = el(
      "figcaption",
      null,
      el("span", { class: "g-title", text: `“${piece.title}”` }),
      el("span", { text: `${piece.artist}, ${piece.year}` }),
    );
    const figure = el("figure", { onclick: () => openModal(piece) }, frame, cap);
    collectionGrid.appendChild(figure);
  });
  collectionSection.hidden = false;
}

modalClose.addEventListener("click", () => {
  modal.hidden = true;
  modalInner.replaceChildren();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.hidden = true;
    modalInner.replaceChildren();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) {
    modal.hidden = true;
    modalInner.replaceChildren();
  }
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
    if (exhibit.pieces.length) renderCollection(exhibit.pieces);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "couldn't load the gallery (" + (err && err.message ? err.message : "unknown error") + ") — reload to try again.";
    statusEl.classList.add("error");
  }
}

main();
