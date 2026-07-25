// recorder.js — grab a fixed-length clip of the board: the visualizer canvas as
// video, the master bus as audio, muxed live by MediaRecorder. No transcoding
// on our end — Bluesky's video pipeline takes it from here.

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "video/webm";
}

export function canRecord() {
  return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
}

// `canvas` — the live visualizer canvas. `audioStream` — a MediaStream carrying
// the master bus (see synth.js's tapForRecording). Resolves to a Blob once the
// clip is done.
export function recordClip({ canvas, audioStream, seconds = 14, fps = 30 }) {
  return new Promise((resolve, reject) => {
    if (!canRecord()) {
      reject(new Error("this browser can't record canvas+audio"));
      return;
    }
    const videoStream = canvas.captureStream(fps);
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);
    const mimeType = pickMimeType();
    let rec;
    try {
      rec = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_000_000 });
    } catch (e) {
      reject(e);
      return;
    }
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onerror = (e) => reject(e.error || new Error("recorder error"));
    rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    rec.start();
    setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, seconds * 1000);
  });
}
