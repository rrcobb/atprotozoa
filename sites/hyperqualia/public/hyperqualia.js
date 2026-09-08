// hyperqualia — a real hyperplane slice through a rotating tesseract.
//
// Geometry: 16 vertices at every (±1,±1,±1,±1) in (x,y,z,w), indexed by a
// 4-bit key (bit weights [8,4,2,1] for x,y,z,w). 32 edges connect vertices
// one bit-flip apart. 24 square faces are built by fixing two dimensions and
// letting the other two sweep their four sign-combinations in cyclic order.
// Each square face also remembers which two dimensions it fixed (and at
// which sign) so it can be grouped into the 8 cubic cells it belongs to
// (two cells share every square face, 24*2/6 = 8 — a tesseract's cell count).
//
// Every frame the 16 base vertices go through a genuine SO(4) rotation: all
// six coordinate-plane rotations (xy, xz, xw, yz, yw, zw) composed in
// sequence, each at its own frequency, rather than just the two axis-aligned
// planes a "double rotation" usually picks. Composing non-commuting plane
// rotations keeps changing which 2-planes are actually invariant from
// instant to instant, so the tumble never locks into an obviously periodic
// wobble the way a fixed double rotation does.
//
// The slice at w = c(t) is still assembled face-by-face: a convex quad face
// crossed by a plane contributes exactly one segment (its two edge
// crossings), and the union of those segments across all 24 faces is the
// exact 3D cross-section — no convex-hull step needed. New: those segments
// are then regrouped by cell, and each cell's segments — which are
// necessarily planar, since a plane through a cube always cuts a flat
// polygon — are walked into a closed loop and filled. The slice is no longer
// just a wireframe; it's the actual facets of the cross-section solid.

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

// FACES[fi] = { verts: [v0,v1,v2,v3], k, l, bk, bl } — (k,l) are the two
// dimensions this face holds fixed, at bit values (bk,bl).
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
      FACES.push({ verts, k, l, bk, bl });
    }
  }
}

// 8 cubic cells: cell (dim, bit) = every square face that holds `dim` fixed
// at `bit`. Each cell picks up exactly 6 of the 24 faces.
const CELLS = [];
for (let dim = 0; dim < 4; dim++) {
  for (const bit of [0, 1]) {
    const faceIds = [];
    FACES.forEach((f, idx) => {
      if ((f.k === dim && f.bk === bit) || (f.l === dim && f.bl === bit)) faceIds.push(idx);
    });
    CELLS.push({ id: dim * 2 + bit, faceIds });
  }
}

const CELL_COLORS = ["#ff5fd1", "#58e6d9", "#ffcf5c", "#7c6cff", "#ff8f5c", "#5cff9e", "#5c9eff", "#d15cff"];

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

// A full SO(4) tumble: all six coordinate-plane rotations, composed in
// sequence rather than the usual "pick two orthogonal invariant planes"
// double rotation. Manual drag input rides on top of the xw and yz terms
// (the two planes the readouts already track) so dragging reads as "steering"
// the same motion, not bolting on a separate control scheme.
const OMEGA_XY = 0.11, OMEGA_XZ = -0.17, OMEGA_XW = 0.23;
const OMEGA_YZ = 0.31, OMEGA_YW = -0.13, OMEGA_ZW = 0.19;
const ROT_PLANES = [
  { key: "xy", i: 0, j: 1, omega: OMEGA_XY },
  { key: "xz", i: 0, j: 2, omega: OMEGA_XZ },
  { key: "xw", i: 0, j: 3, omega: OMEGA_XW },
  { key: "yz", i: 1, j: 2, omega: OMEGA_YZ },
  { key: "yw", i: 1, j: 3, omega: OMEGA_YW },
  { key: "zw", i: 2, j: 3, omega: OMEGA_ZW },
];

let dragXW = 0;
let dragYZ = 0;

function rotate4d(v, clock) {
  const out = v.slice();
  for (const p of ROT_PLANES) {
    let theta = clock * p.omega;
    if (p.key === "xw") theta += dragXW;
    if (p.key === "yz") theta += dragYZ;
    const c = Math.cos(theta), s = Math.sin(theta);
    const a = out[p.i], b = out[p.j];
    out[p.i] = a * c - b * s;
    out[p.j] = a * s + b * c;
  }
  return out;
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
    const verts = FACES[fi].verts;
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

function closeEnough(p, q, eps = 1e-4) {
  return Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps && Math.abs(p[2] - q[2]) < eps;
}

// Walk a cell's segments (each an edge of that cube's slice) into a single
// closed polygon loop by chaining shared endpoints. Segments from the same
// face-crossing share exact endpoint coordinates (same edge, same
// arithmetic), so this is a plain adjacency walk, not a nearest-point hack.
function orderLoop(segs) {
  const remaining = segs.slice();
  const first = remaining.shift();
  const loop = [first.a];
  let currentPoint = first.b;
  while (remaining.length) {
    let idx = -1, reversed = false;
    for (let i = 0; i < remaining.length; i++) {
      if (closeEnough(remaining[i].a, currentPoint)) { idx = i; reversed = false; break; }
      if (closeEnough(remaining[i].b, currentPoint)) { idx = i; reversed = true; break; }
    }
    if (idx === -1) return null;
    const seg = remaining.splice(idx, 1)[0];
    loop.push(currentPoint);
    currentPoint = reversed ? seg.a : seg.b;
  }
  return loop;
}

function buildCellPolygons(segments) {
  const segByFace = new Map();
  segments.forEach((s) => segByFace.set(s.id, s));
  const polys = [];
  const usedFaceIds = new Set();
  for (const cell of CELLS) {
    const segs = cell.faceIds.map((fid) => segByFace.get(fid)).filter(Boolean);
    if (segs.length < 3) continue;
    const loop = orderLoop(segs);
    if (!loop) continue;
    segs.forEach((s) => usedFaceIds.add(s.id));
    polys.push({ cellId: cell.id, points: loop });
  }
  return { polys, usedFaceIds };
}

// --- animation state ---
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
let latestSlicePolys = [];
let latestC = 0;

const ambientSvg = d3.select("#ambientSvg");
const sliceSvg = d3.select("#sliceSvg");
const sliceFacesGroup = sliceSvg.select("#sliceFacesGroup");
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

  const c = SLICE_AMP * Math.sin(clock * SWEEP_BASE);
  latestC = c;

  const rotatedVerts = BASE_VERTS.map((v) => rotate4d(v, clock));
  const rotatedInducers = INDUCERS.map((ind) => rotate4d(ind.coord, clock));

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

  // --- slice panel: exact cross-section, faces filled where they close ---
  const segments = sliceFaces(rotatedVerts, c);
  latestSliceSegments = segments;
  const { polys, usedFaceIds } = buildCellPolygons(segments);

  const projectedPolys = polys.map((p) => {
    const pts2d = p.points.map((pt) => project3to2(pt, SLICE_SCALE));
    const avgZ = pts2d.reduce((s, pt) => s + pt.z, 0) / pts2d.length;
    return { cellId: p.cellId, pts2d, avgZ };
  }).sort((a, b) => a.avgZ - b.avgZ);
  latestSlicePolys = projectedPolys;

  sliceFacesGroup.selectAll("path.cellface")
    .data(projectedPolys, (d) => d.cellId)
    .join("path")
    .attr("class", "cellface")
    .attr("d", (d) => "M" + d.pts2d.map((pt) => `${CENTER + pt.x},${CENTER + pt.y}`).join("L") + "Z")
    .attr("fill", (d) => CELL_COLORS[d.cellId])
    .attr("fill-opacity", 0.3)
    .attr("stroke", (d) => CELL_COLORS[d.cellId])
    .attr("stroke-width", 1.3)
    .attr("stroke-opacity", 0.75)
    .call((sel) => sel.order());

  // Segments that couldn't close into a polygon this frame (a plane passing
  // exactly through a vertex, a cell mid-appear/disappear) still get drawn
  // as loose lines so nothing just vanishes.
  const looseSegs = segments.filter((s) => !usedFaceIds.has(s.id));
  const looseData = looseSegs.map((s) => {
    const pa = project3to2(s.a, SLICE_SCALE);
    const pb = project3to2(s.b, SLICE_SCALE);
    return { id: s.id, x1: CENTER + pa.x, y1: CENTER + pa.y, x2: CENTER + pb.x, y2: CENTER + pb.y };
  });
  sliceSvg.selectAll("line.seg")
    .data(looseData, (d) => d.id)
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
  thReadout.textContent = `${Math.round((((clock * OMEGA_XW + dragXW) * 180) / Math.PI) % 360)}°`;
  phReadout.textContent = `${Math.round((((clock * OMEGA_YZ + dragYZ) * 180) / Math.PI) % 360)}°`;
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

// --- drag-to-tumble: grab the ambient panel and steer the xw/yz rotation
// planes directly, on top of the automatic six-plane spin ---
const ambientNode = ambientSvg.node();
ambientNode.style.cursor = "grab";
ambientNode.style.touchAction = "none";
let dragging = false;
let lastPointer = null;
const DRAG_SENSITIVITY = 0.012;

function endDrag() {
  if (!dragging) return;
  dragging = false;
  ambientNode.style.cursor = "grab";
}

ambientSvg.on("pointerdown", (event) => {
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  ambientNode.style.cursor = "grabbing";
  ambientNode.setPointerCapture(event.pointerId);
});
ambientSvg.on("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  dragXW += dx * DRAG_SENSITIVITY;
  dragYZ += dy * DRAG_SENSITIVITY;
  lastPointer = { x: event.clientX, y: event.clientY };
});
ambientSvg.on("pointerup", endDrag);
ambientSvg.on("pointerleave", endDrag);
ambientSvg.on("pointercancel", endDrag);

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

  // render the current slice — filled cell facets, then any loose edges — into a card-sized sub-panel
  const ox = 700, oy = 210;
  ctx.save();
  ctx.translate(ox, oy);
  for (const poly of latestSlicePolys) {
    ctx.beginPath();
    poly.pts2d.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = CELL_COLORS[poly.cellId] + "4d";
    ctx.strokeStyle = CELL_COLORS[poly.cellId];
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = "#58e6d9";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const seg of latestSliceSegments) {
    const pa = project3to2(seg.a, SLICE_SCALE);
    const pb = project3to2(seg.b, SLICE_SCALE);
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
