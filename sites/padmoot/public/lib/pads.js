// pads.js — the three "selectable controller" renderers. All three views
// operate on the exact same pattern data (bpm/swing/tracks[].steps), they
// just present and interact with it differently — like unplugging one MIDI
// controller and plugging in another over the same DAW project.
//
//   - MPC:       4x4 finger-drumming pad grid (Akai MPC). Tap = play a
//                one-shot; while the transport is running and record is
//                armed, a tap also punches that hit into the pattern at the
//                current step (quantized to the 16th-note grid).
//   - Launchpad: 8-wide "session" grid (Novation Launchpad). Rows = tracks,
//                columns = steps, paged in banks of 8 since a pattern has 16
//                steps but the grid is square.
//   - TR909:     one long lit strip per track (Roland TR-909), all 16 steps
//                visible at once, with per-track tune/decay + volume knobs.

import { VOICE_LABELS, STAB_NOTE_NAMES, stabNoteIndex } from "./audio.js";
import { STEPS } from "./sequencer.js";

export function padLabel(pad) {
  if (pad.voice === "stab") return STAB_NOTE_NAMES[stabNoteIndex(pad.tone ?? 0.5)];
  return VOICE_LABELS[pad.voice] || pad.voice;
}

// Finds (or creates) the track index a given MPC pad should record into, so
// every pad — including voices with no default track (tomHigh/clave/crash/
// the stab notes) — has somewhere in the pattern to land.
export function ensureTrackForPad(tracks, pad) {
  const wantStab = pad.voice === "stab";
  const wantIdx = wantStab ? stabNoteIndex(pad.tone ?? 0.5) : -1;
  const found = tracks.findIndex((t) => {
    if (t.voice !== pad.voice) return false;
    if (!wantStab) return true;
    return stabNoteIndex(t.tone ?? 0.5) === wantIdx;
  });
  if (found >= 0) return found;
  tracks.push({
    voice: pad.voice,
    steps: new Array(STEPS).fill(false),
    volume: 0.85,
    tone: pad.tone ?? 0.5,
  });
  return tracks.length - 1;
}

// --- MPC: 4x4 finger-drumming grid ------------------------------------------

export function renderMpc(container, pads, { onTap } = {}) {
  container.innerHTML = "";
  container.className = "pad-surface layout-mpc";
  pads.forEach((pad, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mpc-pad";
    btn.dataset.index = String(i);
    btn.innerHTML = `<span class="mpc-pad-label">${padLabel(pad)}</span>`;
    btn.addEventListener("pointerdown", () => {
      btn.classList.add("hit");
      setTimeout(() => btn.classList.remove("hit"), 120);
      onTap?.(pad, i);
    });
    container.appendChild(btn);
  });
}

// Briefly lights up the MPC pad matching a track that the sequencer itself
// just triggered — so the pattern still visibly "plays" while you're on the
// MPC view instead of the step grid.
export function flashMpcPadForTrack(container, pads, track) {
  const idx = pads.findIndex((p) => {
    if (p.voice !== track.voice) return false;
    if (p.voice !== "stab") return true;
    return stabNoteIndex(p.tone ?? 0.5) === stabNoteIndex(track.tone ?? 0.5);
  });
  if (idx < 0) return;
  const btn = container.querySelector(`.mpc-pad[data-index="${idx}"]`);
  if (!btn) return;
  btn.classList.add("hit");
  setTimeout(() => btn.classList.remove("hit"), 120);
}

// --- Launchpad: 8x8 session grid, paged in banks of 8 steps -----------------

export function renderLaunchpad(container, tracks, bank, { onToggleStep, onBankChange } = {}) {
  container.innerHTML = "";
  container.className = "pad-surface layout-launchpad";

  const bankBar = document.createElement("div");
  bankBar.className = "launchpad-bankbar";
  bankBar.innerHTML = `
    <button type="button" class="ghost tiny" data-bank="0">steps 1-8</button>
    <button type="button" class="ghost tiny" data-bank="1">steps 9-16</button>
  `;
  bankBar.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.bank) === bank);
    b.addEventListener("click", () => onBankChange?.(Number(b.dataset.bank)));
  });
  container.appendChild(bankBar);

  const grid = document.createElement("div");
  grid.className = "launchpad-grid";
  tracks.forEach((track, ti) => {
    const row = document.createElement("div");
    row.className = "launchpad-row";
    const label = document.createElement("span");
    label.className = "launchpad-row-label";
    label.textContent = VOICE_LABELS[track.voice] || track.voice;
    row.appendChild(label);
    for (let col = 0; col < 8; col++) {
      const step = bank * 8 + col;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "launchpad-cell";
      btn.dataset.step = String(step);
      btn.dataset.track = String(ti);
      btn.classList.toggle("on", !!track.steps[step]);
      if (step % 4 === 0) btn.classList.add("beat");
      btn.addEventListener("click", () => onToggleStep?.(ti, step));
      row.appendChild(btn);
    }
    grid.appendChild(row);
  });
  container.appendChild(grid);
}

// --- TR909: one full-width lit strip per track ------------------------------

export function renderTr909(container, tracks, VOICES, { onToggleStep, onVoiceChange, onVolumeChange, onToneChange, onClearTrack, onAddTrack } = {}) {
  container.innerHTML = "";
  container.className = "pad-surface layout-tr909";

  tracks.forEach((track, ti) => {
    const row = document.createElement("div");
    row.className = "tr909-row";

    const head = document.createElement("div");
    head.className = "tr909-head";
    const sel = document.createElement("select");
    sel.className = "tr909-voice";
    VOICES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = VOICE_LABELS[v] || v;
      if (v === track.voice) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => onVoiceChange?.(ti, sel.value));
    head.appendChild(sel);

    const vol = document.createElement("input");
    vol.type = "range"; vol.min = "0"; vol.max = "1"; vol.step = "0.01";
    vol.value = String(track.volume);
    vol.title = "volume";
    vol.className = "tr909-knob";
    vol.addEventListener("input", () => onVolumeChange?.(ti, Number(vol.value)));
    head.appendChild(vol);

    const tone = document.createElement("input");
    tone.type = "range"; tone.min = "0"; tone.max = "1"; tone.step = "0.01";
    tone.value = String(track.tone);
    tone.title = "tune / decay";
    tone.className = "tr909-knob";
    tone.addEventListener("input", () => onToneChange?.(ti, Number(tone.value)));
    head.appendChild(tone);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "ghost tiny";
    clear.textContent = "clear";
    clear.addEventListener("click", () => onClearTrack?.(ti));
    head.appendChild(clear);

    row.appendChild(head);

    const strip = document.createElement("div");
    strip.className = "tr909-strip";
    for (let step = 0; step < STEPS; step++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tr909-cell";
      btn.dataset.step = String(step);
      btn.dataset.track = String(ti);
      btn.classList.toggle("on", !!track.steps[step]);
      if (step % 4 === 0) btn.classList.add("beat");
      btn.addEventListener("click", () => onToggleStep?.(ti, step));
      strip.appendChild(btn);
    }
    row.appendChild(strip);
    container.appendChild(row);
  });

  const addRow = document.createElement("button");
  addRow.type = "button";
  addRow.className = "ghost tiny tr909-add";
  addRow.textContent = "+ add track";
  addRow.addEventListener("click", () => onAddTrack?.());
  container.appendChild(addRow);
}

// Highlights the current playhead column — works for both the Launchpad
// (only the visible bank's cells match) and the TR909 (full strip).
export function highlightStep(container, step) {
  container.querySelectorAll(".launchpad-cell, .tr909-cell").forEach((el) => {
    el.classList.toggle("playhead", Number(el.dataset.step) === step);
  });
}
