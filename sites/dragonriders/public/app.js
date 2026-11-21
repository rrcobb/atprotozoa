import { dragonSVG } from "./dragon.js";

// The deck stays on the author's own site; we only render it. atilloy.com
// answers with access-control-allow-origin: *, so pdf.js can fetch it directly.
const PDF_URL = "https://atilloy.com/files/2026/slides_ihp_2026.pdf";

const $ = (id) => document.getElementById(id);
const slideEl = $("slide"), dragonEl = $("dragon"), msg = $("msg"), thumbs = $("thumbs"), count = $("count");

let pdf = null, pages = 0, cur = 1, token = 0;
let total = 0; // pdf pages + the bonus dragon slide

const showMsg = (t) => { msg.hidden = !t; msg.textContent = t || ""; };

async function renderPdfPage(n, canvas, maxW, maxH) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxW / base.width, maxH / base.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.aspectRatio = `${base.width} / ${base.height}`;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
}

async function show(n) {
  cur = Math.max(1, Math.min(total, n));
  const my = ++token;
  count.textContent = `${cur} / ${total}`;
  history.replaceState(null, "", `#${cur}`);
  for (const b of thumbs.children) b.classList.toggle("on", Number(b.dataset.n) === cur);
  thumbs.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  if (cur === total) { // the dragon
    slideEl.hidden = true; dragonEl.hidden = false; dragonEl.innerHTML = dragonSVG; showMsg("");
    return;
  }
  dragonEl.hidden = true;
  try {
    const r = $("stage").getBoundingClientRect();
    const tmp = document.createElement("canvas");
    await renderPdfPage(cur, tmp, r.width - 24, r.height - 24);
    if (my !== token) return; // user moved on while this rendered
    slideEl.width = tmp.width; slideEl.height = tmp.height;
    slideEl.style.aspectRatio = tmp.style.aspectRatio;
    slideEl.getContext("2d").drawImage(tmp, 0, 0);
    // size the canvas box to the stage via CSS max-* with intrinsic ratio
    slideEl.style.width = `${tmp.width / Math.min(window.devicePixelRatio || 1, 2)}px`;
    slideEl.hidden = false; showMsg("");
  } catch (e) {
    showMsg("couldn't render that slide: " + e.message);
  }
}

async function buildThumbs() {
  for (let n = 1; n <= total; n++) {
    const b = document.createElement("button");
    b.dataset.n = n; b.setAttribute("aria-label", `slide ${n}`);
    b.addEventListener("click", () => show(n));
    const tag = document.createElement("span"); tag.className = "n"; tag.textContent = n;
    if (n === total) {
      b.insertAdjacentHTML("afterbegin", dragonSVG.replace(/id="(sky|belly)"/g, 'id="t$1"').replace(/url\(#(sky|belly)\)/g, "url(#t$1)"));
    } else {
      b.appendChild(document.createElement("canvas"));
    }
    b.appendChild(tag);
    thumbs.appendChild(b);
  }
  // render pdf thumbs lazily, in order, without blocking navigation
  for (let n = 1; n < total; n++) {
    const c = thumbs.children[n - 1].querySelector("canvas");
    try { await renderPdfPage(n, c, 140, 140); } catch { /* thumbnail stays blank */ }
  }
}

function go(d) { show(cur + d); }

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea")) return;
  if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1); }
  else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); }
  else if (e.key === "Home") show(1);
  else if (e.key === "End") show(total);
  else if (e.key === "f") toggleFs();
  else if (e.key === "t") thumbs.hidden = !thumbs.hidden;
  else if (e.key === "Escape" && document.body.classList.contains("full")) toggleFs();
});
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
$("tgl").addEventListener("click", () => { thumbs.hidden = !thumbs.hidden; show(cur); });
$("stage").addEventListener("click", (e) => { if (e.target !== msg) go(e.clientX < innerWidth / 3 ? -1 : 1); });

function toggleFs() {
  const on = document.body.classList.toggle("full");
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen();
  setTimeout(() => show(cur), 100);
}
$("fs").addEventListener("click", toggleFs);
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && document.body.classList.contains("full")) { document.body.classList.remove("full"); show(cur); }
});

$("share").addEventListener("click", () => {
  const text = "a little viewer for Antoine Tilloy's \"short age of dragon riders\" slides (with a bonus dragon at the end)";
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://dragonriders.bisks.net/"), "_blank", "noopener");
});

let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => show(cur), 200); });

(async () => {
  try {
    const lib = await import("./lib/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = new URL("./lib/pdf.worker.min.mjs", import.meta.url).href;
    pdf = await lib.getDocument({ url: PDF_URL }).promise;
    pages = pdf.numPages; total = pages + 1;
    const start = parseInt(location.hash.slice(1), 10);
    await show(Number.isFinite(start) ? start : 1);
    buildThumbs();
  } catch (e) {
    // Still give them the dragon if the deck can't be reached.
    pages = 0; total = 1; showMsg("");
    count.textContent = "1 / 1";
    dragonEl.hidden = false; dragonEl.innerHTML = dragonSVG;
    msg.hidden = false; msg.style.cssText = "top:auto;padding:8px";
    msg.textContent = "couldn't load the slides from atilloy.com (" + e.message + ") — here's the dragon anyway.";
  }
})();
