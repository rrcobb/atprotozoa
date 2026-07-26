// Magnetostatics solver UI. The actual field solve happens in Rust, compiled
// to wasm32-unknown-unknown (see ../../rust/magnetostatics) -- this file's
// job is: build the material/current grids for whichever preset is selected,
// write them into the wasm module's linear memory, kick off the SOR
// relaxation, and draw the result. No physics math is reimplemented here
// except the field-line contour trace, which is pure geometry (marching
// squares over the potential the solver already computed).
(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Grid / physical constants
  // ---------------------------------------------------------------------
  const NX = 144, NY = 144;
  const LX = 0.144; // 14.4cm square domain
  const DX = LX / NX;
  const MU0 = 4 * Math.PI * 1e-7;
  const cm = (v) => v / 100;

  // ---------------------------------------------------------------------
  // Material library. mu_r values are representative linear approximations
  // (no saturation modeled) -- illustrative, not datasheet-exact for any one
  // grade. Br is remanence for hard (permanent-magnet) materials.
  // ---------------------------------------------------------------------
  const MATERIALS = {
    air:        { label: "Air",                    category: "core",   mu_r: 1,     note: "background / reference" },
    copper:     { label: "Copper",                 category: "core",   mu_r: 1,     note: "non-magnetic conductor" },
    aluminum:   { label: "Aluminum",                category: "core",   mu_r: 1,     note: "non-magnetic, mildly diamagnetic" },
    softIron:   { label: "Soft iron",               category: "core",   mu_r: 4000,  note: "relay armatures, cheap cores" },
    steel:      { label: "Silicon steel",           category: "core",   mu_r: 5000,  note: "transformer & motor laminations" },
    mnznFerrite:{ label: "Mn-Zn ferrite (soft)",    category: "core",   mu_r: 2000,  note: "inductor cores, low loss at high freq" },
    neodymium:  { label: "Neodymium (N42)",         category: "magnet", mu_r: 1.05,  Br: 1.30, note: "strongest common permanent magnet" },
    samarium:   { label: "Samarium cobalt",         category: "magnet", mu_r: 1.05,  Br: 1.05, note: "holds strength at high temperature" },
    alnico:     { label: "Alnico 5",                category: "magnet", mu_r: 1.0,   Br: 1.25, note: "high remanence, easily demagnetized" },
    ceramic:    { label: "Ceramic (hard ferrite)",  category: "magnet", mu_r: 1.1,   Br: 0.40, note: "cheap, e.g. fridge magnets" },
  };
  const coreOptions = Object.entries(MATERIALS).filter(([, m]) => m.category === "core").map(([k, m]) => ({ value: k, label: m.label }));
  const magnetOptions = Object.entries(MATERIALS).filter(([, m]) => m.category === "magnet").map(([k, m]) => ({ value: k, label: m.label }));

  // ---------------------------------------------------------------------
  // Wasm module
  // ---------------------------------------------------------------------
  let wasm, muArr, jzArr, aArr, magArr;

  async function loadWasm() {
    const resp = await fetch(new URL("./pkg/magnetostatics.wasm", location.href));
    const bytes = await resp.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    wasm = instance.exports;
    const n = NX * NY;
    const buf = wasm.memory.buffer;
    muArr = new Float32Array(buf, wasm.mu_ptr(), n);
    jzArr = new Float32Array(buf, wasm.jz_ptr(), n);
    aArr = new Float32Array(buf, wasm.a_ptr(), n);
    magArr = new Float32Array(buf, wasm.mag_ptr(), n);
  }

  // ---------------------------------------------------------------------
  // Grid geometry builders (physical coords in meters, origin at domain center)
  // ---------------------------------------------------------------------
  const gx = (xm) => Math.max(0, Math.min(NX - 1, Math.round(xm / DX + NX / 2)));
  const gy = (ym) => Math.max(0, Math.min(NY - 1, Math.round(ym / DX + NY / 2)));

  function clearGrid() {
    muArr.fill(1);
    jzArr.fill(0);
  }

  function fillRect(x0, y0, x1, y1, opts) {
    const i0 = gx(Math.min(x0, x1)), i1 = gx(Math.max(x0, x1));
    const j0 = gy(Math.min(y0, y1)), j1 = gy(Math.max(y0, y1));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * NX + i;
        if (opts.mu !== undefined) muArr[idx] = opts.mu;
        if (opts.j !== undefined) jzArr[idx] = opts.j;
      }
    }
  }

  function fillCircle(cx, cy, r, opts) {
    const r2 = r * r;
    const i0 = gx(cx - r), i1 = gx(cx + r), j0 = gy(cy - r), j1 = gy(cy + r);
    for (let j = j0; j <= j1; j++) {
      const ym = (j - NY / 2) * DX;
      for (let i = i0; i <= i1; i++) {
        const xm = (i - NX / 2) * DX;
        if ((xm - cx) ** 2 + (ym - cy) ** 2 <= r2) {
          const idx = j * NX + i;
          if (opts.mu !== undefined) muArr[idx] = opts.mu;
          if (opts.j !== undefined) jzArr[idx] = opts.j;
        }
      }
    }
  }

  // Places a bound/free surface current sheet, given as an areal current
  // density K (A/m), on the two edges of a rect parallel to `axis`:
  //   axis 'y' -> vertical sheets on the left (x0) and right (x1) edges
  //   axis 'x' -> horizontal sheets on the bottom (y0) and top (y1) edges
  // This single primitive is what a solenoid's turns, a horseshoe's coil, and
  // a permanent magnet's bound current all reduce to -- only K's source differs.
  function addSurfaceCurrent(x0, y0, x1, y1, axis, K) {
    const J = K / DX;
    if (axis === "y") {
      const iA = gx(x0), iB = gx(x1), jA = gy(y0), jB = gy(y1);
      for (let j = Math.min(jA, jB); j <= Math.max(jA, jB); j++) {
        jzArr[j * NX + iA] += -J;
        jzArr[j * NX + iB] += J;
      }
    } else {
      const jA = gy(y0), jB = gy(y1), iA = gx(x0), iB = gx(x1);
      for (let i = Math.min(iA, iB); i <= Math.max(iA, iB); i++) {
        jzArr[jA * NX + i] += J;
        jzArr[jB * NX + i] += -J;
      }
    }
  }

  // A coil driven by `ampereTurns` total (N * I), spread as a uniform sheet
  // over the rect's length along `axis`.
  function addCoil(x0, y0, x1, y1, axis, ampereTurns) {
    const length = axis === "y" ? Math.abs(y1 - y0) : Math.abs(x1 - x0);
    addSurfaceCurrent(x0, y0, x1, y1, axis, ampereTurns / length);
  }

  // A uniformly magnetized block: fills its own permeability, and lays the
  // Amperian bound current (K = M = Br/mu0) on the two faces parallel to the
  // magnetization axis -- the faces perpendicular to it (the poles) carry no
  // bound current, which is exactly why flux exits/enters there.
  function addMagnetBlock(x0, y0, x1, y1, axis, material, flip) {
    fillRect(x0, y0, x1, y1, { mu: material.mu_r });
    const M = material.Br / MU0;
    addSurfaceCurrent(x0, y0, x1, y1, axis, flip ? -M : M);
  }

  // ---------------------------------------------------------------------
  // Preset problems
  // ---------------------------------------------------------------------
  const PRESETS = [
    {
      id: "wire",
      label: "single wire",
      blurb: "One current-carrying wire, seen end-on.",
      detail: "Current flows out of the page through the wire. Field circles it, strongest close in and falling off with distance — the textbook first example, and the building block for everything else here.",
      params: [
        { key: "current", label: "current", type: "range", min: 100, max: 2000, step: 50, def: 800, unit: "A" },
      ],
      build(p) {
        clearGrid();
        const r = cm(0.5);
        fillCircle(0, 0, r, { j: p.current / (Math.PI * r * r) });
      },
    },
    {
      id: "wires",
      label: "two wires",
      blurb: "Two parallel wires, current same way or opposite.",
      detail: "Same-direction currents pull the field into a shared loop around both wires (they attract). Opposite currents crowd the lines into the gap between them and push it apart (they repel).",
      params: [
        { key: "current", label: "current", type: "range", min: 100, max: 2000, step: 50, def: 800, unit: "A" },
        { key: "direction", label: "direction", type: "toggle", def: "same", options: [
          { value: "same", label: "same direction" },
          { value: "opposite", label: "opposite" },
        ] },
      ],
      build(p) {
        clearGrid();
        const r = cm(0.5);
        const J = p.current / (Math.PI * r * r);
        fillCircle(-cm(2), 0, r, { j: J });
        fillCircle(cm(2), 0, r, { j: p.direction === "same" ? J : -J });
      },
    },
    {
      id: "solenoid",
      label: "solenoid",
      blurb: "End-on cross-section of a wound coil.",
      detail: "Current comes out of the page along the top row of turns and back in along the bottom row, so the field runs straight and dense inside the coil. Swap in an iron or steel core to see it concentrate further.",
      params: [
        { key: "current", label: "coil drive", type: "range", min: 200, max: 4000, step: 100, def: 1500, unit: "A·turns" },
        { key: "core", label: "core material", type: "select", def: "air", options: coreOptions },
      ],
      build(p) {
        clearGrid();
        const x0 = -cm(6), x1 = cm(6), y0 = -cm(1), y1 = cm(1);
        fillRect(x0, y0, x1, y1, { mu: MATERIALS[p.core].mu_r });
        addCoil(x0, y0, x1, y1, "x", p.current);
      },
    },
    {
      id: "horseshoe",
      label: "horseshoe electromagnet",
      blurb: "C-shaped iron core, coil on the back leg.",
      detail: "Flux threads around the core and concentrates in the narrow gap between the pole tips — the actual mechanism behind electromagnets, relays, and lifting magnets.",
      params: [
        { key: "current", label: "coil drive", type: "range", min: 200, max: 4000, step: 100, def: 2200, unit: "A·turns" },
        { key: "core", label: "core material", type: "select", def: "softIron", options: coreOptions },
      ],
      build(p) {
        clearGrid();
        const mu = MATERIALS[p.core].mu_r;
        const spine = [-cm(6), -cm(6), -cm(4.5), cm(6)];
        const topArm = [-cm(6), cm(4.5), cm(3), cm(6)];
        const botArm = [-cm(6), -cm(6), cm(3), -cm(4.5)];
        const topPole = [cm(2), cm(1), cm(3.5), cm(4.5)];
        const botPole = [cm(2), -cm(4.5), cm(3.5), -cm(1)];
        for (const [a, b, c, d] of [spine, topArm, botArm, topPole, botPole]) fillRect(a, b, c, d, { mu });
        addCoil(spine[0], spine[1], spine[2], spine[3], "y", p.current);
      },
    },
    {
      id: "bar-magnet",
      label: "bar magnet",
      blurb: "One permanent magnet block.",
      detail: "Modeled as the equivalent bound surface currents of a uniformly magnetized block — the same current sheets a solenoid reduces to in this limit. Produces the familiar dipole loop, arcing out of the north face and back into the south.",
      params: [
        { key: "material", label: "magnet material", type: "select", def: "neodymium", options: magnetOptions },
        { key: "orientation", label: "orientation", type: "toggle", def: "vertical", options: [
          { value: "vertical", label: "↕ vertical" },
          { value: "horizontal", label: "↔ horizontal" },
        ] },
      ],
      build(p) {
        clearGrid();
        const mat = MATERIALS[p.material];
        const vertical = p.orientation === "vertical";
        const halfW = vertical ? cm(1.5) : cm(3);
        const halfH = vertical ? cm(3) : cm(1.5);
        addMagnetBlock(-halfW, -halfH, halfW, halfH, vertical ? "y" : "x", mat, false);
      },
    },
    {
      id: "two-magnets",
      label: "two bar magnets",
      blurb: "Two permanent magnets, side by side.",
      detail: "Flip one and watch the field switch from bulging apart in the gap (repelling) to joining across it (attracting) — a direct consequence of the same bound-current picture as the single magnet above: two parallel dipoles side by side repel, antiparallel ones attract.",
      params: [
        { key: "material", label: "magnet material", type: "select", def: "neodymium", options: magnetOptions },
        { key: "alignment", label: "alignment", type: "toggle", def: "same", options: [
          { value: "same", label: "same way (repel)" },
          { value: "flipped", label: "flipped (attract)" },
        ] },
      ],
      build(p) {
        clearGrid();
        const mat = MATERIALS[p.material];
        const halfH = cm(2.5);
        addMagnetBlock(-cm(3.5), -halfH, -cm(1.5), halfH, "y", mat, false);
        addMagnetBlock(cm(1.5), -halfH, cm(3.5), halfH, "y", mat, p.alignment === "flipped");
      },
    },
  ];

  // ---------------------------------------------------------------------
  // Marching squares: extract contour polylines of A at a given level.
  // Field lines *are* contours of A in a planar magnetostatic problem, so
  // this is an exact rendering of the field, not a streamline approximation.
  // ---------------------------------------------------------------------
  function traceContours(field, nx, ny, level) {
    const segs = [];
    const val = (i, j) => field[j * nx + i];
    const lerp = (a, b, va, vb) => a + ((level - va) / (vb - va)) * (b - a);
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v00 = val(i, j), v10 = val(i + 1, j), v11 = val(i + 1, j + 1), v01 = val(i, j + 1);
        let c = 0;
        if (v00 > level) c |= 1;
        if (v10 > level) c |= 2;
        if (v11 > level) c |= 4;
        if (v01 > level) c |= 8;
        if (c === 0 || c === 15) continue;
        const pts = {};
        if ((c & 1) !== (c & 2) >> 1) pts.top = [i + lerp(0, 1, v00, v10), j];
        if (((c & 2) >> 1) !== (c & 4) >> 2) pts.right = [i + 1, j + lerp(0, 1, v10, v11)];
        if (((c & 4) >> 2) !== (c & 8) >> 3) pts.bottom = [i + lerp(0, 1, v01, v11), j + 1];
        if (((c & 8) >> 3) !== (c & 1)) pts.left = [i, j + lerp(0, 1, v00, v01)];
        const edges = [];
        if (pts.top) edges.push(pts.top);
        if (pts.right) edges.push(pts.right);
        if (pts.bottom) edges.push(pts.bottom);
        if (pts.left) edges.push(pts.left);
        if (edges.length === 2) segs.push(edges);
        else if (edges.length === 4) {
          // ambiguous saddle case: pair top-left & right-bottom (consistent, if imperfect, choice)
          segs.push([pts.top, pts.left]);
          segs.push([pts.right, pts.bottom]);
        }
      }
    }
    return segs;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("canvas");
  const ctx2d = canvas.getContext("2d");
  const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
  const rampRgb = RAMP.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);

  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    const f = t * (rampRgb.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, rampRgb.length - 1);
    const frac = f - i0;
    const a = rampRgb[i0], b = rampRgb[i1];
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
  }

  function percentileMax(arr, p, stride) {
    const samples = [];
    for (let j = 2; j < NY - 2; j += stride) {
      for (let i = 2; i < NX - 2; i += stride) samples.push(arr[j * NX + i]);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.min(Math.floor(samples.length * p), samples.length - 1)] || 1e-9;
  }

  const off = document.createElement("canvas");
  off.width = NX;
  off.height = NY;
  const offCtx = off.getContext("2d");
  let lastScaleMax = 1e-6;

  function drawFrame(showHeat, showLines) {
    const img = offCtx.createImageData(NX, NY);
    if (showHeat) {
      const scaleMax = percentileMax(magArr, 0.98, 2) * 1.15 || 1e-9;
      lastScaleMax = scaleMax;
      for (let j = 0; j < NY; j++) {
        for (let i = 0; i < NX; i++) {
          const idx = j * NX + i;
          const v = Math.sqrt(Math.max(0, Math.min(1, magArr[idx] / scaleMax)));
          const [r, g, b] = rampColor(v);
          const p = (j * NX + i) * 4;
          img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
        }
      }
    } else {
      for (let k = 0; k < NX * NY; k++) {
        const p = k * 4;
        img.data[p] = 252; img.data[p + 1] = 252; img.data[p + 2] = 251; img.data[p + 3] = 255;
      }
    }
    // material-boundary hairlines: subtle dark outline wherever permeability jumps
    for (let j = 1; j < NY - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const idx = j * NX + i;
        const m = muArr[idx];
        if (Math.abs(muArr[idx + 1] / m - 1) > 0.02 || Math.abs(muArr[idx + NX] / m - 1) > 0.02) {
          const p = idx * 4;
          img.data[p] *= 0.55; img.data[p + 1] *= 0.55; img.data[p + 2] *= 0.55;
        }
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(off, 0, 0, canvas.width, canvas.height);

    if (showLines) {
      let amin = Infinity, amax = -Infinity;
      for (let j = 2; j < NY - 2; j++) {
        for (let i = 2; i < NX - 2; i++) {
          const v = aArr[j * NX + i];
          if (v < amin) amin = v;
          if (v > amax) amax = v;
        }
      }
      if (amax > amin) {
        const scaleX = canvas.width / NX, scaleY = canvas.height / NY;
        const levels = 22;
        ctx2d.lineJoin = "round";
        for (let k = 1; k < levels; k++) {
          const level = amin + ((amax - amin) * k) / levels;
          const segs = traceContours(aArr, NX, NY, level);
          if (!segs.length) continue;
          ctx2d.beginPath();
          for (const [[x0, y0], [x1, y1]] of segs) {
            ctx2d.moveTo(x0 * scaleX, y0 * scaleY);
            ctx2d.lineTo(x1 * scaleX, y1 * scaleY);
          }
          ctx2d.strokeStyle = "rgba(11,11,11,0.35)";
          ctx2d.lineWidth = 2.4;
          ctx2d.stroke();
          ctx2d.strokeStyle = "#eb6834";
          ctx2d.lineWidth = 1.1;
          ctx2d.stroke();
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Solve loop
  // ---------------------------------------------------------------------
  const TOTAL_SWEEPS = 1800, CHUNK = 60, OMEGA = 1.85;
  let solving = false;

  const statusEl = document.getElementById("status");
  const solveBtn = document.getElementById("solveBtn");
  const showHeatEl = document.getElementById("showHeat");
  const showLinesEl = document.getElementById("showLines");
  const legendMaxEl = document.getElementById("legendMax");

  function runSolve() {
    if (solving) return;
    solving = true;
    solveBtn.disabled = true;
    wasm.reset(NX, NY);
    let done = 0;
    function frame() {
      const delta = wasm.relax(NX, NY, DX, CHUNK, OMEGA);
      done += CHUNK;
      wasm.compute_b(NX, NY, DX);
      drawFrame(showHeatEl.checked, showLinesEl.checked);
      statusEl.textContent = `solving… sweep ${Math.min(done, TOTAL_SWEEPS)}/${TOTAL_SWEEPS} · Δ ${delta.toExponential(2)}`;
      if (done < TOTAL_SWEEPS) {
        requestAnimationFrame(frame);
      } else {
        statusEl.textContent = `done · ${TOTAL_SWEEPS} sweeps`;
        legendMaxEl.textContent = `${lastScaleMax.toExponential(2)} T (scaled)`;
        solveBtn.disabled = false;
        solving = false;
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------
  const presetSel = document.getElementById("preset");
  const presetParamsEl = document.getElementById("presetParams");
  const presetBlurbEl = document.getElementById("presetBlurb");
  const detailBlurbEl = document.getElementById("detailBlurb");
  const matListEl = document.getElementById("matList");

  let current = null; // { preset, values }

  function renderMaterialLibrary() {
    matListEl.innerHTML = Object.values(MATERIALS).map((m) => `
      <div class="mat-row">
        <span class="mname">${m.label}</span> —
        <span class="mval">μᵣ ${m.mu_r}</span>${m.Br ? ` <span class="mval">Bᵣ ${m.Br}T</span>` : ""}
        <span class="mnote">${m.note}</span>
      </div>
    `).join("");
  }

  function renderParams(preset) {
    presetParamsEl.innerHTML = "";
    const values = {};
    for (const param of preset.params) {
      values[param.key] = param.def;
      const wrap = document.createElement("label");
      wrap.className = "field";
      if (param.type === "range") {
        wrap.innerHTML = `<span>${param.label}: <span class="rangeval">${param.def} ${param.unit}</span></span>`;
        const input = document.createElement("input");
        input.type = "range";
        input.min = param.min; input.max = param.max; input.step = param.step; input.value = param.def;
        input.addEventListener("input", () => {
          values[param.key] = Number(input.value);
          wrap.querySelector(".rangeval").textContent = `${input.value} ${param.unit}`;
          rebuildAndSolve();
        });
        wrap.appendChild(input);
      } else if (param.type === "select") {
        wrap.innerHTML = `<span>${param.label}</span>`;
        const select = document.createElement("select");
        for (const opt of param.options) {
          const o = document.createElement("option");
          o.value = opt.value; o.textContent = opt.label;
          if (opt.value === param.def) o.selected = true;
          select.appendChild(o);
        }
        select.addEventListener("change", () => {
          values[param.key] = select.value;
          rebuildAndSolve();
        });
        wrap.appendChild(select);
      } else if (param.type === "toggle") {
        wrap.innerHTML = `<span>${param.label}</span>`;
        const row = document.createElement("div");
        row.className = "toggle-row";
        for (const opt of param.options) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = opt.label;
          if (opt.value === param.def) btn.classList.add("active");
          btn.addEventListener("click", () => {
            values[param.key] = opt.value;
            row.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            rebuildAndSolve();
          });
          row.appendChild(btn);
        }
        wrap.appendChild(row);
      }
      presetParamsEl.appendChild(wrap);
    }
    return values;
  }

  function rebuildAndSolve() {
    current.preset.build(current.values);
    runSolve();
  }

  function selectPreset(id) {
    const preset = PRESETS.find((p) => p.id === id) || PRESETS[0];
    presetSel.value = preset.id;
    presetBlurbEl.textContent = preset.blurb;
    detailBlurbEl.innerHTML = `<strong>${preset.label}.</strong> ${preset.detail}`;
    const values = renderParams(preset);
    current = { preset, values };
    rebuildAndSolve();
    const url = new URL(location.href);
    url.searchParams.set("preset", preset.id);
    history.replaceState(null, "", url);
  }

  function buildShareText() {
    const url = `https://solvers.bisks.net/magnetostatics?preset=${current.preset.id}`;
    return `${current.preset.label} on the magnetostatics solver — a Rust/wasm field solver with real preset problems and a material library. ${url}`;
  }

  function wireSharing() {
    const shareBluesky = document.getElementById("shareBluesky");
    const shareDownload = document.getElementById("shareDownload");
    shareBluesky.addEventListener("click", (e) => {
      e.preventDefault();
      shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
      window.open(shareBluesky.href, "_blank", "noopener");
    });
    shareDownload.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `magnetostatics-${current.preset.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }

  async function main() {
    presetSel.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
    renderMaterialLibrary();
    wireSharing();
    presetSel.addEventListener("change", () => selectPreset(presetSel.value));
    showHeatEl.addEventListener("change", () => drawFrame(showHeatEl.checked, showLinesEl.checked));
    showLinesEl.addEventListener("change", () => drawFrame(showHeatEl.checked, showLinesEl.checked));

    statusEl.textContent = "loading solver…";
    solveBtn.disabled = true;
    await loadWasm();
    solveBtn.disabled = false;
    solveBtn.addEventListener("click", rebuildAndSolve);

    const params = new URLSearchParams(location.search);
    selectPreset(params.get("preset") || PRESETS[0].id);
  }

  main();
})();
