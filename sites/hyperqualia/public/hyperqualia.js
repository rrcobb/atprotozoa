// hyperqualia — a real hyperplane slice through a rotating tesseract.
//
// Geometry: 16 vertices at every (±1,±1,±1,±1) in (x,y,z,w), indexed by a
// 4-bit key (bit weights [8,4,2,1] for x,y,z,w). 32 edges connect vertices
// one bit-flip apart. 24 square faces are built by fixing two dimensions and
// letting the other two sweep their four sign-combinations in cyclic order.
//
// Every frame the 16 base vertices are rotated in the x–w plane and the y–z
// plane (a genuine 4D double rotation, not a 3D one embedded in 4D). The
// slice at w = c(t) is assembled face-by-face: a convex quad face crossed by
// a plane contributes exactly one segment (its two edge crossings), and the
// union of those segments across all 24 faces is the exact 3D cross-section
// — no convex-hull step needed.

const SHIFT = [8, 4, 2, 1]; // x, y, z, w

function vertexCoord(i) {
  return [(i & 8) ? 1 : -1, (i & 4) ? 1 : -1, (i & 2) ? 1 : -1, (i & 1) ? 1 : -1];
}

function idxFromBits(bits) {
  let idx = 0;
  for (let d = 0; d < 4; d++) if (bits[d]) idx |= SHIFT[d];
  return idx;
}

const BASE_VERTS = Array.from({ length: 16 }, (_, i) => vertexCoord(i));

const EDGES = [];
for (let i = 0; i < 16; i++) {
  for (const bit of SHIFT) {
    const j = i ^ bit;
    if (i < j) EDGES.push([i, j]);
  }
}

const FACES = [];
const DIM_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const SEQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
for (const [i, j] of DIM_PAIRS) {
  const rest = [0, 1, 2, 3].filter((d) => d !== i && d !== j);
  const [k, l] = rest;
  for (const bk of [0, 1]) {
    for (const bl of [0, 1]) {
      const verts = SEQ.map(([bi, bj]) => {
        const bits = [0, 0, 0, 0];
        bits[i] = bi; bits[j] = bj; bits[k] = bk; bits[l] = bl;
        return idxFromBits(bits);
      });
      FACES.push(verts);
    }
  }
}

// Fixed points in the same 4D space. Magnitudes wander a little past the
// tesseract's own ±1 extent so each one drifts in and out of slicing range
// on its own schedule as the object tumbles.
const INDUCERS = [
  { name: "breathwork", coord: [0.9, 0.3, -0.6, 1.1] },
  { name: "ayahuasca", coord: [-0.7, 1.0, 0.4, -0.5] },
  { name: "5-MeO-DMT", coord: [0.2, -1.1, 0.8, 0.6] },
  { name: "endogenous DMT", coord: [1.2, 0.1, -0.2, -0.8] },
  { name: "psilocybin", coord: [-0.4, -0.9, -1.0, 0.3] },
  { name: "sufi turning", coord: [0.6, 0.8, 1.1, -0.1] },
  { name: "sun-staring", coord: [-1.1, 0.4, 0.2, 0.9] },
  { name: "long-form chant", coord: [0.1, 1.2, -0.5, -0.6] },
  { name: "glossolalia", coord: [-0.3, 0.6, -1.2, 0.4] },
  { name: "sleep paralysis", coord: [0.8, -0.6, 0.9, 1.0] },
  { name: "childbirth", coord: [-0.9, -0.2, 0.6, -1.1] },
  { name: "near-death", coord: [1.0, -0.8, -0.9, 0.2] },
  { name: "fasting", coord: [0.4, 0.9, -0.7, 0.7] },
  { name: "extreme cold", coord: [-0.6, -1.1, 0.3, -0.4] },
  { name: "rhythmic drumming", coord: [0.7, 0.2, 1.2, -0.9] },
  { name: "kundalini heat", coord: [-1.0, 0.7, -0.3, 0.5] },
  { name: "sensory deprivation", coord: [0.3, -0.4, -0.8, -1.2] },
  { name: "prayer", coord: [-0.2, 1.1, 0.7, 0.8] },
].map((d) => ({ ...d, active: false }));

const TEMPLATES = [
  (n) => `a flicker of ${n}`,
  (n) => `the slice touches ${n}`,
  (n) => `then, ${n}`,
  (n) => `${n} surfaces`,
  (n) => `briefly: ${n}`,
  (n) => `${n} comes through legible`,
];

function rotate(v, thXW, thYZ) {
  const [x, y, z, w] = v;
  const cx = Math.cos(thXW), sx = Math.sin(thXW);
  const nx = x * cx - w * sx, nw = x * sx + w * cx;
  const cy = Math.cos(thYZ), sy = Math.sin(thYZ);
  const ny = y * cy - z * sy, nz = y * sy + z * cy;
  return [nx, ny, nz, nw];
}

const W_DIST = 3;
function project4to3([x, y, z, w]) {
  const f = W_DIST / (W_DIST - w);
  return [x * f, y * f, z * f];
}

const Z_DIST = 4.2;
function project3to2([x, y, z], scale) {
  const f = Z_DIST / (Z_DIST - z);
  return { x: x * f * scale, y: y * f * scale, z };
}

function sliceFaces(rotatedVerts, c) {
  const segments = [];
  for (let fi = 0; fi < FACES.length; fi++) {
    const verts = FACES[fi];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const a = rotatedVerts[verts[e]];
      const b = rotatedVerts[verts[(e + 1) % 4]];
      const wa = a[3] - c, wb = b[3] - c;
      if (wa * wb < 0) {
        const tt = wa / (wa - wb);
        pts.push([
          a[0] + tt * (b[0] - a[0]),
          a[1] + tt * (b[1] - a[1]),
          a[2] + tt * (b[2] - a[2]),
        ]);
      }
    }
    if (pts.length === 2) segments.push({ id: fi, a: pts[0], b: pts[1] });
  }
  return segments;
}

// --- animation state ---
const OMEGA_XW = 0.23;
const OMEGA_YZ = 0.31;
const SWEEP_BASE = 0.15;
const SLICE_AMP = 1.35;
const EPS = 0.09;
const AMBIENT_SCALE = 62;
const SLICE_SCALE = 78;
const CENTER = 190;

let speedMult = 1;
let paused = false;
let clock = 0; // accumulated "time", advances only while unpaused
let lastFrameMs = null;
const narrativeLines = []; // {text, id}
let narrativeCounter = 0;
let latestSliceSegments = [];
let latestC = 0;

const ambientSvg = d3.select("#ambientSvg");
const sliceSvg = d3.select("#sliceSvg");
const narrativeEl = document.getElementById("narrative");
const legendEl = document.getElementById("legend");
const wReadout = document.getElementById("wReadout");
const thReadout = document.getElementById("thReadout");
const phReadout = document.getElementById("phReadout");

for (const ind of INDUCERS) {
  const span = document.createElement("span");
  span.textContent = ind.name;
  span.dataset.name = ind.name;
  legendEl.appendChild(span);
}

function pushNarrative(name) {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  narrativeLines.unshift({ id: narrativeCounter++, text: template(name) });
  if (narrativeLines.length > 10) narrativeLines.length = 10;
  renderNarrative();
}

function renderNarrative() {
  if (narrativeLines.length === 0) {
    narrativeEl.innerHTML = '<div class="empty">(the slice hasn\'t found anything yet)</div>';
    return;
  }
  narrativeEl.innerHTML = "";
  narrativeLines.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "line";
    div.style.opacity = String(Math.max(0.18, 1 - i * 0.09));
    div.textContent = line.text;
    narrativeEl.appendChild(div);
  });
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  if (lastFrameMs === null) lastFrameMs = nowMs;
  const dt = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;
  if (!paused) clock += dt * speedMult;

  const thXW = clock * OMEGA_XW;
  const thYZ = clock * OMEGA_YZ;
  const c = SLICE_AMP * Math.sin(clock * SWEEP_BASE);
  latestC = c;

  const rotatedVerts = BASE_VERTS.map((v) => rotate(v, thXW, thYZ));
  const rotatedInducers = INDUCERS.map((ind) => rotate(ind.coord, thXW, thYZ));

  // --- ambient panel: all 32 edges, highlighted where the plane cuts them ---
  const edgeData = EDGES.map(([i, j], id) => {
    const a = rotatedVerts[i], b = rotatedVerts[j];
    const pa = project3to2(project4to3(a), AMBIENT_SCALE);
    const pb = project3to2(project4to3(b), AMBIENT_SCALE);
    const crossed = (a[3] - c) * (b[3] - c) < 0;
    const depth = (pa.z + pb.z) / 2;
    return { id, x1: CENTER + pa.x, y1: CENTER + pa.y, x2: CENTER + pb.x, y2: CENTER + pb.y, crossed, depth };
  });

  ambientSvg.selectAll("line.edge")
    .data(edgeData, (d) => d.id)
    .join("line")
    .attr("class", "edge")
    .attr("x1", (d) => d.x1).attr("y1", (d) => d.y1)
    .attr("x2", (d) => d.x2).attr("y2", (d) => d.y2)
    .attr("stroke", (d) => (d.crossed ? "#ff5fd1" : "#8a78b8"))
    .attr("stroke-width", (d) => (d.crossed ? 2.4 : 1))
    .attr("stroke-opacity", (d) => (d.crossed ? 0.95 : 0.28 + 0.2 * (d.depth / 6 + 0.5)));

  const ambientDots = rotatedInducers.map((v, i) => {
    const p = project3to2(project4to3(v), AMBIENT_SCALE);
    return { i, x: CENTER + p.x, y: CENTER + p.y, active: INDUCERS[i].active };
  });
  ambientSvg.selectAll("circle.ind")
    .data(ambientDots, (d) => d.i)
    .join("circle")
    .attr("class", "ind")
    .attr("cx", (d) => d.x).attr("cy", (d) => d.y)
    .attr("r", (d) => (d.active ? 4.5 : 2))
    .attr("fill", (d) => (d.active ? "#ffcf5c" : "#6e5f8c"))
    .attr("fill-opacity", (d) => (d.active ? 1 : 0.6));

  // --- slice panel: exact cross-section, plus any inducer currently in range ---
  const segments = sliceFaces(rotatedVerts, c);
  latestSliceSegments = segments;
  const segData = segments.map((s) => {
    const pa = project3to2(s.a, SLICE_SCALE);
    const pb = project3to2(s.b, SLICE_SCALE);
    return { id: s.id, x1: CENTER + pa.x, y1: CENTER + pa.y, x2: CENTER + pb.x, y2: CENTER + pb.y };
  });
  sliceSvg.selectAll("line.seg")
    .data(segData, (d) => d.id)
    .join("line")
    .attr("class", "seg")
    .attr("x1", (d) => d.x1).attr("y1", (d) => d.y1)
    .attr("x2", (d) => d.x2).attr("y2", (d) => d.y2)
    .attr("stroke", "#58e6d9")
    .attr("stroke-width", 2.2)
    .attr("stroke-linecap", "round")
    .attr("stroke-opacity", 0.9);

  const activeInducers = [];
  INDUCERS.forEach((ind, i) => {
    const w = rotatedInducers[i][3];
    const wasActive = ind.active;
    const isActive = Math.abs(w - c) < EPS;
    ind.active = isActive;
    if (isActive && !wasActive) pushNarrative(ind.name);
    if (isActive) {
      const p = project3to2(rotatedInducers[i].slice(0, 3), SLICE_SCALE);
      activeInducers.push({ i, x: CENTER + p.x, y: CENTER + p.y, name: ind.name });
    }
  });

  sliceSvg.selectAll("g.indg")
    .data(activeInducers, (d) => d.i)
    .join(
      (enter) => {
        const g = enter.append("g").attr("class", "indg");
        g.append("circle");
        g.append("text");
        return g;
      }
    )
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .call((g) => {
      g.select("circle")
        .attr("r", 5)
        .attr("fill", "#ffcf5c")
        .attr("stroke", "#08040f")
        .attr("stroke-width", 1);
      g.select("text")
        .attr("x", 8).attr("y", 3)
        .attr("fill", "#ffcf5c")
        .attr("font-size", "9px")
        .attr("font-family", "JetBrains Mono, monospace")
        .text((d) => d.name);
    });

  legendEl.querySelectorAll("span").forEach((span) => {
    const ind = INDUCERS.find((x) => x.name === span.dataset.name);
    span.classList.toggle("active", !!ind && ind.active);
  });

  wReadout.textContent = c.toFixed(2);
  thReadout.textContent = `${Math.round(((thXW * 180) / Math.PI) % 360)}°`;
  phReadout.textContent = `${Math.round(((thYZ * 180) / Math.PI) % 360)}°`;
}

requestAnimationFrame(frame);
renderNarrative();

// --- controls ---
document.getElementById("pauseBtn").addEventListener("click", (e) => {
  paused = !paused;
  e.target.textContent = paused ? "resume" : "pause";
});
document.getElementById("speedSlider").addEventListener("input", (e) => {
  speedMult = Number(e.target.value);
});

// --- sharing ---
function currentShareText() {
  const latest = narrativeLines[0];
  const base = latest ? latest.text : "the slice hasn't found anything yet";
  const full = `${base} — a live hyperplane slice through a rotating tesseract. hyperqualia.bisks.net`;
  return full.length <= 300 ? full : `${full.slice(0, 297)}...`;
}

document.getElementById("shareBluesky").addEventListener("click", () => {
  const text = currentShareText();
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});

function drawShareCard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, "#08040f");
  grad.addColorStop(1, "#1a0d30");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.fillStyle = "#ff5fd1";
  ctx.font = "800 64px 'JetBrains Mono', monospace";
  ctx.fillText("hyperqualia", 60, 110);

  ctx.fillStyle = "#9a8ab8";
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText("a live hyperplane slice through a rotating tesseract", 60, 150);

  // render the current slice segments into a card-sized sub-panel
  const ox = 700, oy = 210, s = 2.6;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = "#58e6d9";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const seg of latestSliceSegments) {
    const pa = project3to2(seg.a, SLICE_SCALE * s / 2.6 * 1);
    const pb = project3to2(seg.b, SLICE_SCALE * s / 2.6 * 1);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffcf5c";
  INDUCERS.filter((i) => i.active).forEach((ind, idx) => {
    ctx.beginPath();
    ctx.arc(-120 + idx * 40, 160, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.fillStyle = "#f1eaff";
  ctx.font = "700 26px 'JetBrains Mono', monospace";
  const line = narrativeLines[0] ? narrativeLines[0].text : "the slice hasn't found anything yet";
  wrapText(ctx, line, 60, 260, 560, 34);

  ctx.fillStyle = "#6e5f8c";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText(`w = ${latestC.toFixed(2)}`, 60, 560);

  ctx.fillStyle = "#58e6d9";
  ctx.font = "700 24px 'JetBrains Mono', monospace";
  ctx.fillText("hyperqualia.bisks.net", 60, 600);

  return canvas;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word + " ";
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

document.getElementById("shareCard").addEventListener("click", async () => {
  const canvas = drawShareCard();
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      const file = new File([blob], "hyperqualia.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: currentShareText(), title: "hyperqualia" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hyperqualia.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});
