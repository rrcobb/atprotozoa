// pixelcreep — two photos in, a slider out. 0% shows the current pfp with
// exactly one pixel of the new photo showing at a chosen seed point; 100%
// shows the new photo (cropped to a square) filling the whole frame. In
// between, a circle grows outward from the seed pixel. Everything is local
// canvas compositing — no upload, no server round-trip.

import { coverRect as coverRectOf, containRect as containRectOf, cropToNaturalRect as cropToNaturalRectOf, growRadius } from "./lib/geometry.js";

const OUT = 500; // output canvas size, px — also the frame used for downloads

const els = {
  fileA: document.getElementById("fileA"),
  fileB: document.getElementById("fileB"),
  boxA: document.getElementById("boxA"),
  boxB: document.getElementById("boxB"),
  thumbA: document.getElementById("thumbA"),
  thumbB: document.getElementById("thumbB"),
  stage2: document.getElementById("stage2"),
  seedCanvas: document.getElementById("seedCanvas"),
  cropCanvas: document.getElementById("cropCanvas"),
  cropSize: document.getElementById("cropSize"),
  outputCanvas: document.getElementById("outputCanvas"),
  growSlider: document.getElementById("growSlider"),
  pctVal: document.getElementById("pctVal"),
  downloadBtn: document.getElementById("downloadBtn"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  status: document.getElementById("status"),
};

const seedCtx = els.seedCanvas.getContext("2d");
const cropCtx = els.cropCanvas.getContext("2d");
const outCtx = els.outputCanvas.getContext("2d", { willReadFrequently: false });

const state = {
  imgA: null, // current pfp (HTMLImageElement)
  imgB: null, // new pfp
  seed: null, // { x, y } in seedCanvas pixel space (0..400)
  crop: { x: 0, y: 0, size: 0 }, // in cropCanvas pixel space
  cropDrag: null,
};

const SEED_SIZE = 400; // matches seedCanvas/cropCanvas width/height attrs

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function wireUpload(fileInput, box, thumb, onLoaded) {
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const img = await loadImageFile(file);
    thumb.src = img.src;
    thumb.style.display = "";
    box.classList.add("loaded");
    box.querySelector(".rechoose").style.display = "block";
    onLoaded(img);
  });
}

wireUpload(els.fileA, els.boxA, els.thumbA, (img) => {
  state.imgA = img;
  drawSeedCanvas();
  maybeReveal();
});
wireUpload(els.fileB, els.boxB, els.thumbB, (img) => {
  state.imgB = img;
  resetCrop();
  drawCropCanvas();
  maybeReveal();
});

function maybeReveal() {
  if (state.imgA && state.imgB) {
    els.stage2.classList.add("active");
    if (!state.seed) state.seed = { x: SEED_SIZE / 2, y: SEED_SIZE / 2 };
    render();
  }
}

// used for both the seed canvas and the output canvas background, so a
// click on one lines up with the other
function coverRect(img, size) {
  return coverRectOf(img.naturalWidth, img.naturalHeight, size);
}

function drawSeedCanvas() {
  seedCtx.clearRect(0, 0, SEED_SIZE, SEED_SIZE);
  const r = coverRect(state.imgA, SEED_SIZE);
  seedCtx.drawImage(state.imgA, r.x, r.y, r.w, r.h);
  if (state.seed) {
    seedCtx.save();
    seedCtx.strokeStyle = "#ffffff";
    seedCtx.lineWidth = 2;
    seedCtx.beginPath();
    seedCtx.arc(state.seed.x, state.seed.y, 8, 0, Math.PI * 2);
    seedCtx.stroke();
    seedCtx.strokeStyle = "#00000099";
    seedCtx.lineWidth = 1;
    seedCtx.beginPath();
    seedCtx.arc(state.seed.x, state.seed.y, 8, 0, Math.PI * 2);
    seedCtx.stroke();
    seedCtx.fillStyle = "#7ad3ff";
    seedCtx.beginPath();
    seedCtx.arc(state.seed.x, state.seed.y, 2.5, 0, Math.PI * 2);
    seedCtx.fill();
    seedCtx.restore();
  }
}

els.seedCanvas.addEventListener("pointerdown", (e) => {
  if (!state.imgA) return;
  const p = canvasPoint(els.seedCanvas, e);
  state.seed = p;
  drawSeedCanvas();
  render();
});

function canvasPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: Math.max(0, Math.min(canvas.width, x)),
    y: Math.max(0, Math.min(canvas.height, y)),
  };
}

// --- crop selection on image B ---

function resetCrop() {
  const r = containRect(state.imgB, SEED_SIZE);
  const size = Math.min(r.w, r.h);
  state.crop = { x: r.x + (r.w - size) / 2, y: r.y + (r.h - size) / 2, size };
  els.cropSize.value = "100";
}

function containRect(img, size) {
  return containRectOf(img.naturalWidth, img.naturalHeight, size);
}

// maps a crop-square (in cropCanvas display coordinates) to the matching
// rect in the image's own natural pixel coordinates, for drawImage's source
function cropToNaturalRect(img, crop) {
  return cropToNaturalRectOf(img.naturalWidth, img.naturalHeight, SEED_SIZE, crop);
}

function drawCropCanvas() {
  cropCtx.clearRect(0, 0, SEED_SIZE, SEED_SIZE);
  const r = containRect(state.imgB, SEED_SIZE);
  cropCtx.drawImage(state.imgB, r.x, r.y, r.w, r.h);

  // dim everything outside the crop square
  const c = state.crop;
  const src = cropToNaturalRect(state.imgB, c);
  cropCtx.save();
  cropCtx.fillStyle = "rgba(0,0,0,0.55)";
  cropCtx.fillRect(0, 0, SEED_SIZE, SEED_SIZE);
  cropCtx.clearRect(c.x, c.y, c.size, c.size);
  cropCtx.drawImage(
    state.imgB,
    src.sx, src.sy, src.ssize, src.ssize,
    c.x, c.y, c.size, c.size
  );
  cropCtx.restore();

  cropCtx.strokeStyle = "#7ad3ff";
  cropCtx.lineWidth = 2;
  cropCtx.strokeRect(c.x, c.y, c.size, c.size);
}

function clampCrop() {
  const r = containRect(state.imgB, SEED_SIZE);
  const c = state.crop;
  c.size = Math.max(8, Math.min(c.size, Math.min(r.w, r.h)));
  c.x = Math.max(r.x, Math.min(c.x, r.x + r.w - c.size));
  c.y = Math.max(r.y, Math.min(c.y, r.y + r.h - c.size));
}

els.cropCanvas.addEventListener("pointerdown", (e) => {
  if (!state.imgB) return;
  const p = canvasPoint(els.cropCanvas, e);
  const c = state.crop;
  // dragging always moves the box, even from just outside its edge, so a
  // slightly-off click still grabs it instead of doing nothing
  state.cropDrag = { startX: p.x, startY: p.y, origX: c.x, origY: c.y };
  els.cropCanvas.setPointerCapture(e.pointerId);
});
els.cropCanvas.addEventListener("pointermove", (e) => {
  if (!state.cropDrag) return;
  const p = canvasPoint(els.cropCanvas, e);
  const dx = p.x - state.cropDrag.startX;
  const dy = p.y - state.cropDrag.startY;
  state.crop.x = state.cropDrag.origX + dx;
  state.crop.y = state.cropDrag.origY + dy;
  clampCrop();
  drawCropCanvas();
  render();
});
function endCropDrag() { state.cropDrag = null; }
els.cropCanvas.addEventListener("pointerup", endCropDrag);
els.cropCanvas.addEventListener("pointercancel", endCropDrag);

els.cropSize.addEventListener("input", () => {
  if (!state.imgB) return;
  const r = containRect(state.imgB, SEED_SIZE);
  const maxSize = Math.min(r.w, r.h);
  const cx = state.crop.x + state.crop.size / 2;
  const cy = state.crop.y + state.crop.size / 2;
  const size = (els.cropSize.value / 100) * maxSize;
  state.crop.size = size;
  state.crop.x = cx - size / 2;
  state.crop.y = cy - size / 2;
  clampCrop();
  drawCropCanvas();
  render();
});

// --- the actual grow effect ---

function render() {
  if (!state.imgA || !state.imgB || !state.seed) return;

  // background: image A, "cover" fit, scaled up from the 400px picker to
  // the OUT-sized output canvas (same coordinate frame, just bigger)
  const scaleOut = OUT / SEED_SIZE;
  const bgRect = coverRect(state.imgA, OUT);
  outCtx.clearRect(0, 0, OUT, OUT);
  outCtx.drawImage(state.imgA, bgRect.x, bgRect.y, bgRect.w, bgRect.h);

  const seedX = state.seed.x * scaleOut;
  const seedY = state.seed.y * scaleOut;
  const t = Number(els.growSlider.value) / 100;
  const radius = growRadius(seedX, seedY, OUT, t);

  const b = state.imgB;
  const src = cropToNaturalRect(b, state.crop);
  outCtx.save();
  outCtx.beginPath();
  outCtx.arc(seedX, seedY, radius, 0, Math.PI * 2);
  outCtx.clip();
  outCtx.drawImage(
    b,
    src.sx, src.sy, src.ssize, src.ssize,
    0, 0, OUT, OUT
  );
  outCtx.restore();

  els.pctVal.textContent = Math.round(t * 100) + "%";
}

els.growSlider.addEventListener("input", render);

// --- save / share the current frame ---

function frameFilename() {
  return "pixelcreep-" + Math.round(Number(els.growSlider.value)) + "pct.png";
}

const shareText = "grew my pfp from a single pixel with pixelcreep 🌱 https://pixelcreep.bisks.net/";

els.downloadBtn.addEventListener("click", () => {
  els.outputCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = frameFilename();
    a.click();
    URL.revokeObjectURL(a.href);
    els.status.textContent = "saved " + frameFilename();
    els.status.classList.add("ready");
  }, "image/png");
});

els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.outputCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], frameFilename(), { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "pixelcreep" });
      } catch (_) {
        // user cancelled the share sheet — no-op
      }
    }, "image/png");
  });
}
