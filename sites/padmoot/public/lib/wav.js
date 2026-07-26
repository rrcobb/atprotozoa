// wav.js — "save to disk" as actual audio: render a pattern through an
// OfflineAudioContext (same playVoice() calls as live playback, just not
// realtime) and hand-encode the result as a 16-bit PCM WAV Blob. No deps —
// WAV is simple enough to write by hand.

import { playVoice } from "./audio.js";
import { STEPS, stepDurationSeconds } from "./sequencer.js";

export async function renderPatternToWavBlob(pattern, loops = 1) {
  const sampleRate = 44100;
  let barSeconds = 0;
  for (let s = 0; s < STEPS; s++) barSeconds += stepDurationSeconds(pattern, s);
  const tailSeconds = 1.5; // let long decays (crash, open hat) ring out
  const totalSeconds = barSeconds * loops + tailSeconds;

  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
  const master = offlineCtx.createGain();
  master.gain.value = 0.85;
  master.connect(offlineCtx.destination);

  let time = 0.02;
  for (let loop = 0; loop < loops; loop++) {
    for (let s = 0; s < STEPS; s++) {
      for (const track of pattern.tracks) {
        if (track.steps[s]) {
          playVoice(offlineCtx, master, track.voice, time, { volume: track.volume, tone: track.tone });
        }
      }
      time += stepDurationSeconds(pattern, s);
    }
  }

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
