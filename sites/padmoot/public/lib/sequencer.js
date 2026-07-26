// sequencer.js — the pattern data model + a lookahead scheduler.
//
// Scheduling follows the standard Web Audio "lookahead" technique (schedule
// notes slightly ahead of real time against ctx.currentTime, not against
// setInterval's own jitter) so playback stays tight even though JS timers
// aren't. See https://web.dev/articles/audio-scheduling for the canonical
// writeup — this is a small, self-contained version of it.

export const STEPS = 16;

export const DEFAULT_TRACK_VOICES = [
  "kick", "snare", "hatClosed", "hatOpen", "clap", "tomLow", "rim", "cowbell",
];

export function createDefaultTracks() {
  return DEFAULT_TRACK_VOICES.map((voice) => ({
    voice,
    steps: new Array(STEPS).fill(false),
    volume: 0.85,
    tone: 0.5,
  }));
}

export function createEmptyPattern() {
  return {
    title: "untitled beat",
    bpm: 120,
    swing: 0,
    layout: "mpc",
    tracks: createDefaultTracks(),
  };
}

// 16 pads for the MPC-style finger-drumming layout: the 11 fixed drum voices
// plus 5 "stab" pads spread across the mini scale, filling a 4x4 grid.
export const MPC_PADS = [
  { voice: "kick" }, { voice: "snare" }, { voice: "hatClosed" }, { voice: "hatOpen" },
  { voice: "clap" }, { voice: "tomLow" }, { voice: "tomHigh" }, { voice: "rim" },
  { voice: "cowbell" }, { voice: "clave" }, { voice: "crash" }, { voice: "stab", tone: 0.0 },
  { voice: "stab", tone: 0.15 }, { voice: "stab", tone: 0.3 }, { voice: "stab", tone: 0.45 }, { voice: "stab", tone: 0.6 },
];

// Shared by the live scheduler and the offline WAV renderer, so exported
// playback and on-screen playback always compute identical timing.
export function stepDurationSeconds(pattern, stepIndex) {
  const secondsPer16th = 60 / pattern.bpm / 4;
  const swing = Math.max(0, Math.min(0.75, pattern.swing || 0));
  return stepIndex % 2 === 0 ? secondsPer16th * (1 + swing) : secondsPer16th * (1 - swing);
}

export class Sequencer {
  constructor({ getPattern, onScheduleStep, onVisualStep }) {
    this.getPattern = getPattern;
    this.onScheduleStep = onScheduleStep; // (track, trackIndex, time, stepIndex) => void
    this.onVisualStep = onVisualStep; // (stepIndex) => void, called ~on time
    this.ctx = null;
    this.playing = false;
    this.current16 = 0;
    this.nextNoteTime = 0;
    this.lookaheadMs = 25;
    this.scheduleAheadSec = 0.12;
    this.timerId = null;
    this.notesInQueue = [];
    this.rafId = null;
  }

  start(ctx) {
    if (this.playing) return;
    this.ctx = ctx;
    this.playing = true;
    this.current16 = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.notesInQueue = [];
    this._scheduler();
    this._visualLoop();
  }

  stop() {
    this.playing = false;
    if (this.timerId) clearTimeout(this.timerId);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.timerId = null;
    this.rafId = null;
  }

  _scheduler() {
    if (!this.playing) return;
    const pattern = this.getPattern();
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadSec) {
      const step = this.current16;
      pattern.tracks.forEach((track, i) => {
        if (track.steps[step]) this.onScheduleStep(track, i, this.nextNoteTime, step);
      });
      this.notesInQueue.push({ step, time: this.nextNoteTime });
      this.nextNoteTime += stepDurationSeconds(pattern, step);
      this.current16 = (this.current16 + 1) % STEPS;
    }
    this.timerId = setTimeout(() => this._scheduler(), this.lookaheadMs);
  }

  _visualLoop() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    while (this.notesInQueue.length && this.notesInQueue[0].time <= now) {
      const note = this.notesInQueue.shift();
      this.onVisualStep(note.step);
    }
    this.rafId = requestAnimationFrame(() => this._visualLoop());
  }
}
