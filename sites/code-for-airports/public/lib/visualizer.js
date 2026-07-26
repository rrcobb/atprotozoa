// visualizer.js — draws the current ensemble as a small constellation: one
// glowing node per voice, arranged on a circle, pulsing with that voice's own
// live level (read off the per-voice analyser in synth.js, tapped after its
// mute gain, so a muted/soloed-out voice naturally goes dark). Lines between
// nodes brighten when both ends are audible — the drift between loop lengths,
// made visible.
//
// The same canvas doubles as the video source when a clip gets recorded, so
// whatever's drawn here is exactly what ends up in the recording.

const COLORS = {
  pad: "#7fb8ff",
  horn: "#ffb37f",
  vox: "#ff7fd1",
  bell: "#ffe27f",
  chime: "#c9ff7f",
  hum: "#8a8f99",
  drumkit: "#ff8b7f",
};

export function instrumentColor(key) {
  return COLORS[key] || "#8a8f99";
}

export function createVisualizer(canvas) {
  const g = canvas.getContext("2d");
  let tracks = []; // [{ label, color, analyser }]
  let raf = null;
  const buf = new Uint8Array(256);

  function level(analyser) {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2); // RMS, boosted for legibility
  }

  function draw() {
    const w = canvas.width,
      h = canvas.height;
    g.fillStyle = "#0c0e12";
    g.fillRect(0, 0, w, h);

    const n = tracks.length;
    if (!n) {
      g.fillStyle = "#3a3f4a";
      g.font = "13px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillText("press play to hear it breathe", w / 2, h / 2);
      raf = requestAnimationFrame(draw);
      return;
    }

    const cx = w / 2,
      cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    const levels = tracks.map((t) => level(t.analyser));
    const pos = tracks.map((_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });

    g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const glow = (levels[i] + levels[j]) / 2;
        g.strokeStyle = `rgba(127,184,255,${(0.04 + glow * 0.35).toFixed(3)})`;
        g.beginPath();
        g.moveTo(pos[i][0], pos[i][1]);
        g.lineTo(pos[j][0], pos[j][1]);
        g.stroke();
      }
    }

    tracks.forEach((t, i) => {
      const [x, y] = pos[i];
      const lvl = levels[i];
      const radius = 5 + lvl * 22;

      const grad = g.createRadialGradient(x, y, 0, x, y, radius * 2.2);
      grad.addColorStop(0, t.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, radius * 2.2, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = t.color;
      g.beginPath();
      g.arc(x, y, 4 + lvl * 8, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = "#e7e8ea";
      g.font = "12px ui-monospace, monospace";
      g.textAlign = "center";
      const above = Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) < 0;
      g.fillText(t.label, x, above ? y - 14 : y + 22);
    });

    raf = requestAnimationFrame(draw);
  }

  return {
    setTracks(list) {
      tracks = list;
    },
    start() {
      if (!raf) draw();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}
