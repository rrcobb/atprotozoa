// single bullet — trajectory lab
//
// A simplified, illustrative geometry model, not a forensic reconstruction.
// Figures (window height, distances, rifle cycle time, seating offsets) are
// rounded approximations drawn from publicly reported Warren Commission /
// HSCA testimony, chosen to make a browser-slider toy behave sensibly, not
// to reproduce courtroom-grade measurements.

const FPS = 18.3; // Zapruder camera frame rate
const WINDOW_HEIGHT_M = 18.3; // ~60ft, depository 6th-floor sniper's-nest sill
const CAR_HEIGHT_M = 1.4; // approx seated-passenger height above street
const DROP_M = WINDOW_HEIGHT_M - CAR_HEIGHT_M;
const MIN_CYCLE_S = 2.3; // Warren Commission test-firers' fastest bolt-cycle time

// frame -> horizontal distance from window, meters. Approximate waypoints
// along the car's path down Houston then Elm; linearly interpolated.
const DIST_TABLE = [
  [150, 55], [166, 50], [190, 44], [210, 40],
  [224, 41], [250, 52], [280, 68], [313, 81],
];

function distanceAt(frame) {
  const t = DIST_TABLE;
  if (frame <= t[0][0]) return t[0][1];
  if (frame >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [f0, d0] = t[i], [f1, d1] = t[i + 1];
    if (frame >= f0 && frame <= f1) {
      const k = (frame - f0) / (f1 - f0);
      return d0 + k * (d1 - d0);
    }
  }
  return t[t.length - 1][1];
}

function downAngleRad(frame) {
  return Math.atan2(DROP_M, distanceAt(frame));
}
const toDeg = (r) => (r * 180) / Math.PI;

const $ = (id) => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs) {
  const e = document.createElementNS(svgNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

// ---------- Exhibit A: scene ----------
const SCALE = 4.2; // px per meter, side-elevation view
const WIN_X = 90, WIN_Y = 40;

function renderScene() {
  const frame = Number($("sceneFrame").value);
  $("sceneFrameLabel").textContent = frame;

  const dist = distanceAt(frame);
  const angle = toDeg(downAngleRad(frame));
  $("sceneDist").textContent = dist.toFixed(0) + " m";
  $("sceneAngle").textContent = angle.toFixed(1) + "°";
  $("sceneTime").textContent = ((frame - 150) / FPS).toFixed(1) + " s";

  const svg = $("sceneSvg");
  clearSvg(svg);

  const carX = WIN_X + dist * SCALE;
  const carY = WIN_Y + DROP_M * SCALE;

  // ground / car-height reference line
  svg.appendChild(el("line", { x1: WIN_X, y1: carY, x2: 620, y2: carY, stroke: "#3a3426", "stroke-width": 1 }));
  svg.appendChild(el("text", { x: 620, y: carY - 8, fill: "#948a72", "font-size": 10, "text-anchor": "end" })).textContent = "Elm Street, car height";

  // depository window
  svg.appendChild(el("rect", { x: WIN_X - 20, y: WIN_Y - 20, width: 40, height: 40, fill: "#1d1a14", stroke: "#c98a2c", "stroke-width": 1.5 }));
  const wlabel = el("text", { x: WIN_X, y: WIN_Y - 28, fill: "#c98a2c", "font-size": 10, "text-anchor": "middle" });
  wlabel.textContent = "6th floor window";
  svg.appendChild(wlabel);

  // line of sight
  svg.appendChild(el("line", { x1: WIN_X, y1: WIN_Y, x2: carX, y2: carY, stroke: "#a33b2e", "stroke-width": 1.5, "stroke-dasharray": "5,4" }));

  // car
  svg.appendChild(el("circle", { cx: carX, cy: carY, r: 7, fill: "#c98a2c" }));
  const clabel = el("text", { x: carX, y: carY - 12, fill: "#d8cfb8", "font-size": 10, "text-anchor": "middle" });
  clabel.textContent = "frame " + frame;
  svg.appendChild(clabel);
}

// ---------- Exhibit B: timing ----------
function frameToX(f) { return 20 + ((f - 145) / (318 - 145)) * 600; }

function renderTiming() {
  const s1 = Number($("shot1").value);
  let s2 = Number($("shot2").value);
  let s3 = Number($("shot3").value);
  // keep monotonic ordering usable
  if (s2 <= s1) { s2 = s1 + 1; $("shot2").value = s2; }
  if (s3 <= s2) { s3 = s2 + 1; $("shot3").value = s3; }

  $("shot1Label").textContent = s1;
  $("shot2Label").textContent = s2;
  $("shot3Label").textContent = s3;

  const gap1 = (s2 - s1) / FPS;
  const gap2 = (s3 - s2) / FPS;
  const total = (s3 - s1) / FPS;

  $("gap1").textContent = gap1.toFixed(2) + " s";
  $("gap2").textContent = gap2.toFixed(2) + " s";
  $("totalWindow").textContent = total.toFixed(2) + " s";

  const feasible = gap1 >= MIN_CYCLE_S && gap2 >= MIN_CYCLE_S;
  const badge = $("timingBadge");
  badge.textContent = feasible ? "MECHANICALLY POSSIBLE" : "TOO FAST";
  badge.className = "badge " + (feasible ? "pass" : "fail");
  $("timingText").textContent = feasible
    ? "Both intervals clear the rifle's own fastest tested cycle time (" + MIN_CYCLE_S + "s). Doesn't mean it was easy — the Commission's testers still had to reacquire a moving target through the scope."
    : "At least one interval is faster than the Carcano's fastest measured bolt-cycle (" + MIN_CYCLE_S + "s) in Warren Commission test firing. Move the sliders further apart.";

  const svg = $("timingSvg");
  clearSvg(svg);
  svg.appendChild(el("line", { x1: 20, y1: 45, x2: 620, y2: 45, stroke: "#3a3426", "stroke-width": 1 }));

  const shots = [
    [s1, "shot 1", "#d8cfb8"],
    [s2, "shot 2 (single bullet)", "#c98a2c"],
    [s3, "shot 3 (fatal)", "#a33b2e"],
  ];
  shots.forEach(([f, label, color], i) => {
    const x = frameToX(f);
    svg.appendChild(el("line", { x1: x, y1: 30, x2: x, y2: 60, stroke: color, "stroke-width": 2 }));
    const t = el("text", { x, y: i % 2 === 0 ? 22 : 78, fill: color, "font-size": 9, "text-anchor": "middle" });
    t.textContent = label;
    svg.appendChild(t);
  });

  function gapLabel(fa, fb, seconds) {
    const xa = frameToX(fa), xb = frameToX(fb);
    const ok = seconds >= MIN_CYCLE_S;
    const t = el("text", { x: (xa + xb) / 2, y: 50, fill: ok ? "#6a8f4f" : "#a33b2e", "font-size": 9, "text-anchor": "middle" });
    t.textContent = seconds.toFixed(2) + "s";
    svg.appendChild(t);
  }
  gapLabel(s1, s2, gap1);
  gapLabel(s2, s3, gap2);

  return { feasible, gap1, gap2 };
}

// ---------- Exhibit C: geometry ----------
const GEO_SCALE = 500; // px per meter, geometry schematic
const J_X = 150, J_Y = 80;

function renderGeometry(shot2Frame) {
  const seatGapM = Number($("seatGap").value) / 100;
  const seatDropM = Number($("seatDrop").value) / 100;
  $("gapLabel").textContent = seatGapM.toFixed(2) + " m";
  $("dropLabel").textContent = seatDropM.toFixed(2) + " m";

  const angle = downAngleRad(shot2Frame);
  const predictedDropM = seatGapM * Math.tan(angle);
  $("predictedDrop").textContent = (predictedDropM * 100).toFixed(1) + " cm";
  $("actualDrop").textContent = (seatDropM * 100).toFixed(1) + " cm";

  const diff = Math.abs(predictedDropM - seatDropM);
  const tolerance = 0.12; // 12cm — generous, this is an illustrative model
  const matchPct = Math.max(0, Math.round((1 - diff / tolerance) * 100));
  $("geoScore").textContent = matchPct + "%";

  const svg = $("geoSvg");
  clearSvg(svg);

  const cX = J_X + seatGapM * GEO_SCALE;
  const actualY = J_Y + seatDropM * GEO_SCALE;
  const predictedY = J_Y + predictedDropM * GEO_SCALE;

  // trajectory line: window's downward angle at shot 2, projected through JFK
  const farX = cX + 20;
  const farY = J_Y + (farX - J_X) * Math.tan(angle);
  svg.appendChild(el("line", { x1: J_X - 40, y1: J_Y - 40 * Math.tan(angle), x2: farX, y2: farY, stroke: "#a33b2e", "stroke-width": 1.2, "stroke-dasharray": "4,4" }));

  // JFK
  svg.appendChild(el("circle", { cx: J_X, cy: J_Y, r: 16, fill: "#1d1a14", stroke: "#d8cfb8", "stroke-width": 1.5 }));
  svg.appendChild(el("text", { x: J_X, y: J_Y - 24, fill: "#d8cfb8", "font-size": 10, "text-anchor": "middle" })).textContent = "JFK — back/neck entry";

  // predicted point (where trajectory lands at seat gap)
  svg.appendChild(el("circle", { cx: cX, cy: predictedY, r: 3, fill: "#a33b2e" }));

  // Connally's actual reported wound position
  svg.appendChild(el("circle", { cx: cX, cy: actualY, r: 16, fill: "#1d1a14", stroke: "#c98a2c", "stroke-width": 1.5 }));
  svg.appendChild(el("text", { x: cX, y: actualY + 32, fill: "#c98a2c", "font-size": 10, "text-anchor": "middle" })).textContent = "Connally — back entry";

  // gap indicator between predicted and actual, if visible
  if (Math.abs(predictedY - actualY) > 2) {
    svg.appendChild(el("line", { x1: cX + 22, y1: predictedY, x2: cX + 22, y2: actualY, stroke: "#948a72", "stroke-width": 1 }));
  }

  return matchPct;
}

// ---------- verdict ----------
function updateVerdict() {
  renderScene();
  const timing = renderTiming();
  const shot2 = Number($("shot2").value);
  const geoScore = renderGeometry(shot2);

  const timingScore = timing.feasible ? 100 : 25;
  const final = Math.round(timingScore * 0.4 + geoScore * 0.6);

  $("finalScore").textContent = final;
  $("verdictText").textContent = final >= 70
    ? "Timing clears the rifle's own bolt-cycle, and the trajectory line lands close to Connally's reported wound. The lone-gunman geometry holds together, at this illustrative resolution."
    : final >= 40
    ? "It's close but not clean — either the shot schedule is tight against the bolt-cycle limit, or the trajectory misses the seat gap by more than this model's tolerance. Try nudging the sliders."
    : "At these settings the schedule or the trajectory doesn't add up. Widen the shot intervals, or adjust the seat gap toward the Commission's own reconstructed figures (~0.46m forward, ~0.11m lower).";

  const url = "https://singlebullet.bisks.net/";
  const shareText = `I ran the Dealey Plaza numbers myself: ${final}% consistent with a single shooter. Try the trajectory lab — ${url}`;
  $("shareBluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

function wireInputs() {
  ["sceneFrame", "shot1", "shot2", "shot3", "seatGap", "seatDrop"].forEach((id) => {
    $(id).addEventListener("input", updateVerdict);
  });
  $("resetBtn").addEventListener("click", () => {
    $("sceneFrame").value = 210;
    $("shot1").value = 160;
    $("shot2").value = 224;
    $("shot3").value = 313;
    $("seatGap").value = 46;
    $("seatDrop").value = 11;
    updateVerdict();
  });
}

wireInputs();
updateVerdict();
