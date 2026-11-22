import { KINDS, makeBus, render, renderToWav } from "./laugh.js";

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const statusEl = $("status");
let ctx = null;
let bus = null;
let busKey = "";
let liveUntil = 0;

const settings = () => ({ crowd: +$("crowd").value, room: +$("room").value, vol: +$("vol").value });

function say(msg) { statusEl.textContent = msg; }

// Browsers keep an AudioContext suspended until a user gesture, so it is
// created on the first press, not at load.
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { say("this browser has no WebAudio, sorry."); return null; }
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// The room reverb is a convolver with a generated impulse response; rebuild
// the bus only when the room or volume knob moved, not on every press.
function liveBus() {
  const s = settings();
  const key = s.room + "|" + s.vol;
  if (!bus || key !== busKey) {
    bus = makeBus(ctx, { room: s.room, volume: s.vol });
    busKey = key;
  }
  return bus;
}

function play(kind) {
  if (!audio()) return;
  const b = liveBus();
  const len = render(ctx, b, kind, ctx.currentTime + 0.03, settings().crowd);
  const card = document.querySelector(`[data-kind="${kind}"] .meter i`);
  if (card) {
    card.style.transition = "none";
    card.style.width = "0";
    void card.offsetWidth;
    card.style.transition = `width ${len}s linear`;
    card.style.width = "100%";
    setTimeout(() => { card.style.transition = "none"; card.style.width = "0"; }, len * 1000);
  }
  liveUntil = Math.max(liveUntil, performance.now() + len * 1000);
  $("onair").classList.add("live");
  setTimeout(() => { if (performance.now() >= liveUntil) $("onair").classList.remove("live"); }, len * 1000 + 50);
}

async function download(kind, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "rendering…";
  try {
    const s = settings();
    const blob = await renderToWav(kind, { crowd: s.crowd, room: s.room });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laughbox-${kind}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    say(`laughbox-${kind}.wav (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) {
    say("couldn't render that one: " + (e && e.message ? e.message : e));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

for (const [kind, k] of Object.entries(KINDS)) {
  const card = document.createElement("div");
  card.className = "card" + (kind.startsWith("groan") ? " groan" : "");
  card.dataset.kind = kind;
  card.innerHTML = `<button class="play" type="button"><span></span><kbd></kbd></button>
    <div class="meter"><i></i></div><div class="blurb"></div>
    <button class="dl" type="button">download WAV</button>`;
  card.querySelector(".play span").textContent = k.label;
  card.querySelector("kbd").textContent = k.key;
  card.querySelector(".blurb").textContent = k.blurb;
  card.querySelector(".play").addEventListener("click", () => play(kind));
  card.querySelector(".dl").addEventListener("click", (e) => download(kind, e.currentTarget));
  grid.appendChild(card);
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const hit = Object.entries(KINDS).find(([, k]) => k.key === e.key);
  if (hit) play(hit[0]);
});

$("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
  "laughbox: a synthesized studio audience with four laugh levels, a groan for puns, and WAV downloads for your soundboard\nhttps://laughbox.bisks.net/");
