import { SHADERS } from "./lib/shaders.js";
import { makeRunner } from "./lib/gl.js";

const $ = (id) => document.getElementById(id);
const view = $("view"), codeEl = $("code"), errEl = $("err"), shelf = $("shelf");
const SITE = "https://shaderbox.bisks.net/";

const runner = makeRunner(view, { preserve: true });
let current = SHADERS[0], custom = false;
let t0 = performance.now(), paused = false, pausedAt = 0;
const mouse = [0, 0, 0];

// Share links: built-ins by id, edited code as base64 of the utf-8 source in the hash.
const enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

function shareUrl() {
  return SITE + "#" + (custom ? "c=" + encodeURIComponent(enc(codeEl.value)) : current.id);
}

function updateChrome() {
  $("title").innerHTML = "";
  $("title").append(custom ? "your edit" : current.name);
  const small = document.createElement("small");
  small.textContent = custom ? "custom code" : current.note;
  $("title").append(small);
  const text = custom ? "a shader I tweaked on shaderbox" : `${current.name} — a shader on shaderbox`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\n" + shareUrl());
  for (const el of shelf.children) el.classList.toggle("on", !custom && el.dataset.id === current.id);
}

function compile(code) {
  if (!runner) return;
  const log = runner.setCode(code);
  errEl.textContent = log; // on error the previous program keeps running
  return !log;
}

function pick(s) {
  current = s; custom = false;
  codeEl.value = s.code.trim() + "\n";
  compile(codeEl.value);
  restart();
  history.replaceState(null, "", "#" + s.id);
  updateChrome();
}

function restart() { t0 = performance.now(); pausedAt = 0; }
const now = () => ((paused ? pausedAt : performance.now() - t0)) / 1000;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(view.clientWidth * dpr)), h = Math.max(2, Math.round(view.clientHeight * dpr));
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
}

function frame() {
  resize();
  runner.draw(now(), mouse);
  requestAnimationFrame(frame);
}

function setMouse(e, down) {
  const r = view.getBoundingClientRect();
  mouse[0] = (e.clientX - r.left) / r.width * view.width;
  mouse[1] = (1 - (e.clientY - r.top) / r.height) * view.height;
  if (down !== undefined) mouse[2] = down ? 1 : 0;
}

function thumbs() {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  const r = makeRunner(c, { preserve: true });
  for (const s of SHADERS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card"; b.dataset.id = s.id;
    const img = document.createElement("img");
    img.alt = ""; 
    if (r && !r.setCode(s.code)) { r.draw(4, [0, 0, 0]); img.src = c.toDataURL("image/jpeg", 0.8); }
    const label = document.createElement("span");
    label.textContent = s.name;
    b.append(img, label);
    b.addEventListener("click", () => { pick(s); window.scrollTo({ top: 0, behavior: "smooth" }); });
    shelf.append(b);
  }
}

if (!runner) {
  $("nogl").hidden = false; view.hidden = true;
} else {
  thumbs();
  let started = false;
  const h = location.hash.slice(1);
  if (h.startsWith("c=")) {
    try {
      custom = true; codeEl.value = dec(decodeURIComponent(h.slice(2)));
      if (compile(codeEl.value)) started = true; else { custom = false; }
    } catch { custom = false; }
  }
  if (!started) pick(SHADERS.find((s) => s.id === h) || SHADERS[0]);
  updateChrome();

  let timer;
  codeEl.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (compile(codeEl.value)) { custom = true; updateChrome(); } }, 350);
  });
  view.addEventListener("pointerdown", (e) => { view.setPointerCapture(e.pointerId); setMouse(e, true); });
  view.addEventListener("pointermove", (e) => { if (mouse[2]) setMouse(e); });
  view.addEventListener("pointerup", (e) => setMouse(e, false));
  $("pause").addEventListener("click", () => {
    if (!paused) { pausedAt = performance.now() - t0; paused = true; }
    else { t0 = performance.now() - pausedAt; paused = false; }
    $("pause").textContent = paused ? "play" : "pause";
  });
  $("restart").addEventListener("click", restart);
  $("full").addEventListener("click", () => view.requestFullscreen?.());
  $("shot").addEventListener("click", () => {
    runner.draw(now(), mouse);
    const a = document.createElement("a");
    a.href = view.toDataURL("image/png"); a.download = "shaderbox.png"; a.click();
  });
  $("copylink").addEventListener("click", async () => {
    custom = true; updateChrome();
    history.replaceState(null, "", "#c=" + encodeURIComponent(enc(codeEl.value)));
    try { await navigator.clipboard.writeText(shareUrl()); $("copylink").textContent = "copied"; }
    catch { $("copylink").textContent = "link is in the address bar"; }
    setTimeout(() => ($("copylink").textContent = "copy link to this code"), 1800);
  });
  requestAnimationFrame(frame);
}
