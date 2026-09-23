// badapple — turns a webcam feed or any dropped-in video file into a live
// monochrome-silhouette ASCII animation, in the spirit of the "does it run
// Bad Apple?" meme. All sampling happens on a tiny offscreen canvas (one
// pixel per character cell), so it's cheap even at high column counts.

const els = {
  panel: document.getElementById("source-panel"),
  btnWebcam: document.getElementById("btn-webcam"),
  btnFile: document.getElementById("btn-file"),
  fileInput: document.getElementById("file-input"),
  status: document.getElementById("status"),
  video: document.getElementById("video"),
  out: document.getElementById("ascii-out"),
  controls: document.getElementById("controls"),
  cols: document.getElementById("cols"),
  colsVal: document.getElementById("cols-val"),
  mode: document.getElementById("mode"),
  threshRow: document.getElementById("thresh-row"),
  threshold: document.getElementById("threshold"),
  thresholdVal: document.getElementById("threshold-val"),
  invert: document.getElementById("invert"),
  btnPlay: document.getElementById("btn-play"),
  btnSave: document.getElementById("btn-save"),
  shareBluesky: document.getElementById("share-bluesky"),
  sampleCanvas: document.getElementById("sample-canvas"),
  exportCanvas: document.getElementById("export-canvas"),
};

// Dense-to-sparse ramp for the grayscale mode; the silhouette mode just
// picks between two characters either side of the threshold.
const RAMP = " .:-=+*#%@";
const SILHOUETTE_ON = "█";
const SILHOUETTE_OFF = " ";
// Character cells read roughly 2x taller than wide, so we sample about half
// as many rows as the aspect ratio alone would suggest.
const CHAR_ASPECT = 0.5;

let stream = null;
let rafId = null;
let sourceReady = false;

function setStatus(text, isErr) {
  els.status.textContent = text;
  els.status.classList.toggle("err", !!isErr);
}

function stopStream() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}

function showControls() {
  els.controls.hidden = false;
  syncThresholdVisibility();
}

async function startWebcam() {
  stopStream();
  els.video.srcObject = null;
  els.video.src = "";
  setStatus("requesting webcam…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    els.video.srcObject = stream;
    await els.video.play();
    sourceReady = true;
    setStatus("webcam live");
    showControls();
    els.btnPlay.textContent = "⏸ pause";
    startLoop();
  } catch (err) {
    setStatus(
      err && err.name === "NotAllowedError"
        ? "webcam access denied — allow camera access and try again."
        : "could not start webcam: " + (err && err.message ? err.message : err),
      true,
    );
  }
}

function loadFile(file) {
  if (!file) return;
  stopStream();
  els.video.srcObject = null;
  const url = URL.createObjectURL(file);
  els.video.src = url;
  els.video.loop = true;
  setStatus("loading " + file.name + "…");
  els.video
    .play()
    .then(() => {
      sourceReady = true;
      setStatus("playing " + file.name);
      showControls();
      els.btnPlay.textContent = "⏸ pause";
      startLoop();
    })
    .catch((err) => {
      setStatus("could not play that file: " + (err && err.message ? err.message : err), true);
    });
}

els.btnWebcam.addEventListener("click", startWebcam);
els.btnFile.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => loadFile(els.fileInput.files && els.fileInput.files[0]));

["dragenter", "dragover"].forEach((evt) =>
  document.addEventListener(evt, (e) => {
    e.preventDefault();
    els.panel.classList.add("drag-over");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  document.addEventListener(evt, () => els.panel.classList.remove("drag-over")),
);
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith("video/")) loadFile(file);
});

// ---- rendering --------------------------------------------------------

function syncThresholdVisibility() {
  const isSilhouette = els.mode.value === "silhouette";
  els.threshRow.style.display = isSilhouette ? "" : "none";
}

els.mode.addEventListener("change", syncThresholdVisibility);
els.cols.addEventListener("input", () => (els.colsVal.textContent = els.cols.value));
els.threshold.addEventListener("input", () => (els.thresholdVal.textContent = els.threshold.value));

function currentDims() {
  const cols = parseInt(els.cols.value, 10);
  const vw = els.video.videoWidth || 4;
  const vh = els.video.videoHeight || 3;
  const rows = Math.max(1, Math.round(cols * (vh / vw) * CHAR_ASPECT));
  return { cols, rows };
}

function renderFrame() {
  if (!sourceReady || !els.video.videoWidth) return;
  const { cols, rows } = currentDims();
  const canvas = els.sampleCanvas;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(els.video, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);

  const mode = els.mode.value;
  const threshold = parseInt(els.threshold.value, 10);
  const invert = els.invert.checked;

  let text = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (mode === "silhouette") {
        const on = invert ? lum >= threshold : lum < threshold;
        text += on ? SILHOUETTE_ON : SILHOUETTE_OFF;
      } else {
        let t = lum / 255;
        if (invert) t = 1 - t;
        const idx = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
        text += RAMP[idx];
      }
    }
    text += "\n";
  }
  els.out.textContent = text;
}

function startLoop() {
  if (rafId) return;
  const tick = () => {
    renderFrame();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// ---- play/pause ---------------------------------------------------------

els.btnPlay.addEventListener("click", () => {
  if (!sourceReady) return;
  if (els.video.paused) {
    els.video.play();
    els.btnPlay.textContent = "⏸ pause";
  } else {
    els.video.pause();
    els.btnPlay.textContent = "▶ play";
  }
});

// ---- save / share the current frame -------------------------------------

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function exportFramePng() {
  const pre = els.out;
  const text = pre.textContent || "";
  const lines = text.split("\n");
  const cellW = 7;
  const cellH = 8;
  const canvas = els.exportCanvas;
  canvas.width = Math.max(1, ...lines.map((l) => l.length)) * cellW;
  canvas.height = Math.max(1, lines.length) * cellH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${cellH}px monospace`;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, 0, i * cellH));
  return canvas;
}

els.btnSave.addEventListener("click", async () => {
  if (!sourceReady) return;
  const canvas = exportFramePng();
  const shareText =
    "does it run Bad Apple? mine does — badapple.bisks.net turns a webcam or video into a live silhouette animation. https://badapple.bisks.net/";
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      const file = new File([blob], "badapple-frame.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "badapple" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "badapple-frame.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

els.shareBluesky.href =
  "https://bsky.app/intent/compose?text=" +
  encodeURIComponent(
    "does it run Bad Apple? mine does — badapple.bisks.net turns a webcam or video into a live silhouette animation, the meme as a browser tool. https://badapple.bisks.net/",
  );

syncThresholdVisibility();
