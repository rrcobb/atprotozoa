// Top-down storyboard of hailey.at's waymo thread. World is 300x300; road runs
// vertically, cross street horizontally, intersection is x,y in 105..195.
const BEATS = [
  { cap: "Stuck in an intersection. The Waymo creeps toward the box.", wy: 225, light: 0 },
  { cap: "No protected turn phase: both directions go at once, and the Waymo won't do the 'go after the red' trick.", wy: 215, light: 0, path: "turn", oncoming: 1 },
  { cap: "It pulls into the intersection, then backs up when the light turns red.", wy: 185, osc: 40, light: 2 },
  { cap: "Eight green lights later…", wy: 185, osc: 40, light: 2, count: "8 greens" },
  { cap: "It could just go straight; there's a better light right ahead to turn at.", wy: 215, light: 0, path: "straight" },
  { cap: "13 iterations.", wy: 185, osc: 40, light: 2, count: "13 tries" },
  { cap: "The ETA screen has changed twice, to simply: \"Figuring this out\".", wy: 205, osc: 20, light: 2, screen: "ETA\nFiguring this out" },
  { cap: "The car behind is right on the bumper, but stubbornly won't push the Waymo into the intersection.", wy: 225, light: 1, gap: 1 },
  { cap: "Each backup shows the HD reverse camera. Close enough to see the driver's face. He is not amused.", wy: 225, light: 1, gap: 1, screen: "REAR CAM\n😐", face: 1 },
  { cap: "San Francisco traffic light patterns were not made with Waymos in mind.", wy: 185, osc: 40, light: 2, count: "SF ✕ Waymo" },
  { cap: "Nearly 20 iterations. This is absurd.", wy: 185, osc: 40, light: 2, count: "~20 tries" },
  { cap: "A new driver pushes forward. The other guy went around.", wy: 195, light: 0, around: 1, push: 1 },
  { cap: "We are so far into the intersection.", wy: 135, light: 0 },
  { cap: "SUCCESS. WE MADE IT.", wy: 40, light: 0, win: 1 },
];

const LEN = 36, WID = 20;

function car(c, x, y, color, opt = {}) {
  c.save(); c.translate(x, y); if (opt.rot) c.rotate(opt.rot);
  c.fillStyle = color; c.beginPath(); c.roundRect(-WID / 2, -LEN / 2, WID, LEN, 6); c.fill();
  c.fillStyle = "rgba(20,30,40,.75)"; c.fillRect(-WID / 2 + 3, -LEN / 2 + 7, WID - 6, 6);
  c.fillRect(-WID / 2 + 3, LEN / 2 - 10, WID - 6, 5);
  if (opt.waymo) {
    c.fillStyle = "#3a8d9c"; c.beginPath(); c.arc(0, 3, 4, 0, 7); c.fill();
    c.strokeStyle = "#3a8d9c"; c.lineWidth = 1.5; c.stroke();
  }
  c.restore();
}

function lerp(a, b, t) { return a + (b - a) * t; }
const smooth = (t) => t * t * (3 - 2 * t);

// state for beat i at time t (seconds): numeric fields blend from prev beat
function draw(c, i, t, k = 1) {
  const b = BEATS[i], p = BEATS[Math.max(0, i - 1)];
  const sk = smooth(Math.min(1, k));
  const base = lerp(p.wy, b.wy, sk);
  let wy = base, light = b.light;
  if (b.osc) {
    // cycle: pull in (green), light flips red, back up. Light is red while retreating.
    const ph = (t * 0.5) % 1;
    const f = ph < 0.5 ? smooth(ph / 0.5) : 1 - smooth((ph - 0.5) / 0.5);
    wy = 225 - b.osc * f;
    light = ph < 0.5 ? 0 : 1;
  }
  const red = light >= 1;
  c.clearRect(0, 0, 300, 300);
  c.fillStyle = "#2b2f36"; c.fillRect(0, 0, 300, 300);
  c.fillStyle = "#3b4048"; c.fillRect(105, 0, 90, 300); c.fillRect(0, 105, 300, 90);
  c.fillStyle = "#4a505a"; c.fillRect(105, 105, 90, 90);
  // lane lines + stop line
  c.strokeStyle = "#d9c45a"; c.lineWidth = 2; c.setLineDash([]);
  c.beginPath(); c.moveTo(150, 0); c.lineTo(150, 105); c.moveTo(150, 195); c.lineTo(150, 300);
  c.moveTo(0, 150); c.lineTo(105, 150); c.moveTo(195, 150); c.lineTo(300, 150); c.stroke();
  c.strokeStyle = "#ddd"; c.lineWidth = 3; c.beginPath(); c.moveTo(152, 200); c.lineTo(195, 200); c.stroke();
  // signal
  c.fillStyle = "#111"; c.fillRect(200, 205, 14, 30);
  c.fillStyle = red ? "#e5483f" : "#222"; c.beginPath(); c.arc(207, 213, 4.5, 0, 7); c.fill();
  c.fillStyle = red ? "#222" : "#4cd964"; c.beginPath(); c.arc(207, 227, 4.5, 0, 7); c.fill();
  // cross traffic when we're red
  if (red) {
    const x = ((t * 70) % 420) - 60;
    car(c, x, 128, "#d98a3d", { rot: Math.PI / 2 });
    car(c, 300 - x, 172, "#8a6fd0", { rot: -Math.PI / 2 });
  }
  if (b.oncoming) {
    car(c, 128, 40 + ((t * 40) % 60), "#c75a7a", { rot: Math.PI });
    car(c, 128, 150 + ((t * 40) % 40), "#5a8ac7", { rot: Math.PI });
  }
  // intended path
  if (b.path) {
    c.strokeStyle = "#7cc4d4"; c.lineWidth = 2.5; c.setLineDash([6, 5]);
    c.beginPath(); c.moveTo(165, 205);
    if (b.path === "turn") { c.lineTo(165, 160); c.quadraticCurveTo(165, 150, 150, 150); c.lineTo(20, 150); }
    else c.lineTo(165, 10);
    c.stroke(); c.setLineDash([]);
  }
  // car behind
  const behind = 266;
  car(c, 165, behind + (b.push ? -50 * sk : 0), "#6b7a8a");
  if (b.around) car(c, lerp(165, 135, sk), lerp(255, 60, sk), "#d9534f");
  if (b.count) { c.fillStyle = "#e8e6df"; c.font = "bold 15px system-ui"; c.textAlign = "left"; c.fillText(b.count, 12, 24); }
  if (b.win) {
    c.fillStyle = "#4cd964"; c.font = "bold 22px system-ui"; c.textAlign = "center"; c.fillText("✓ MADE IT", 150, 280);
  }
  car(c, 165, b.push ? wy - 5 : wy, "#f4f4f2", { waymo: true });
  if (b.win) car(c, 165, behind - 60 + 0 * t, "#6b7a8a");
}

const stage = document.getElementById("stage"), sc = stage.getContext("2d");
sc.scale(480 / 300, 480 / 300);
const strip = document.getElementById("strip"), thumbs = [];
BEATS.forEach((b, i) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 160; cv.title = b.cap;
  cv.addEventListener("click", () => { playing = false; go(i); });
  const cx = cv.getContext("2d"); cx.scale(160 / 300, 160 / 300);
  draw(cx, i, 0.2);
  strip.appendChild(cv); thumbs.push(cv);
});

let cur = 0, t0 = performance.now(), playing = false, enter = performance.now(), nextAt = 0;
const $ = (id) => document.getElementById(id);
function go(i) {
  cur = (i + BEATS.length) % BEATS.length; enter = performance.now(); nextAt = enter + 4500;
  const b = BEATS[cur];
  $("num").textContent = `${cur + 1}/${BEATS.length}`; $("cap").textContent = b.cap;
  const s = $("screen"); s.hidden = !b.screen; if (b.screen) s.textContent = b.screen;
  thumbs.forEach((c, j) => c.classList.toggle("on", j === cur));
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`${b.cap}\n\nwaymo vs. the intersection, a storyboard: https://waymo-storyboard.bisks.net/`);
}
function frame(now) {
  if (playing && now > nextAt) { if (cur === BEATS.length - 1) { playing = false; $("play").textContent = "▶ play"; } else go(cur + 1); }
  draw(sc, cur, (now - t0) / 1000, (now - enter) / 700);
  requestAnimationFrame(frame);
}
$("prev").onclick = () => { playing = false; $("play").textContent = "▶ play"; go(cur - 1); };
$("next").onclick = () => { playing = false; $("play").textContent = "▶ play"; go(cur + 1); };
$("play").onclick = () => { playing = !playing; $("play").textContent = playing ? "❚❚ pause" : "▶ play"; if (playing && cur === BEATS.length - 1) go(0); else nextAt = performance.now() + 4500; };
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") $("next").click(); else if (e.key === "ArrowLeft") $("prev").click();
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
});
go(0); requestAnimationFrame(frame);
