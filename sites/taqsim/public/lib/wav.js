// Minimal PCM16 WAV encoder — turns the tail of the clip ring buffer into a
// downloadable file without pulling in a dependency. Returns an ArrayBuffer
// (not a Blob) so this stays testable under node; the caller wraps it in a
// Blob in the browser.
export function encodeWav(samples, sampleRate, numChannels = 1) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// Reads a chronologically-ordered tail out of a circular Float32Array ring
// buffer. `writeIndex` is where the *next* write will land; `written` is the
// total number of samples ever written (may exceed the buffer length once
// it's wrapped). Returns at most `count` of the most recent samples.
export function readRingTail(ring, writeIndex, written, count) {
  const len = ring.length;
  const n = Math.min(count, Math.min(written, len));
  const out = new Float32Array(n);
  const start = (writeIndex - n + len) % len;
  for (let i = 0; i < n; i++) out[i] = ring[(start + i) % len];
  return out;
}
