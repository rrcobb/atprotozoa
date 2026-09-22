// Web Audio synthesis for the three lures. Needs a real AudioContext, so
// this only runs in the browser — the scheduling that decides *when* to
// call these lives in cycle.js, which is plain and unit-tested instead.

// One shared noise buffer for every click — cheap to build once, reused for
// the life of the page.
function makeNoiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createLureEngine(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  const noiseBuffer = makeNoiseBuffer(ctx);

  // A tongue-click / kiss-noise burst: a short blast of noise through a
  // narrow bandpass, the same frequency range (2.5-5kHz) as an actual
  // "pspsps" or lip-smack a cat's ear is tuned to notice.
  function click() {
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 3600 + Math.random() * 900;
    band.Q.value = 5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.9, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
    src.connect(band).connect(env).connect(master);
    src.start(t0);
    src.stop(t0 + 0.06);
  }

  // A rising-then-falling tweet, like a bird chirp — the frequency sweep is
  // what reads as "bird" rather than the raw tone.
  function chirp() {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const base = 2400 + Math.random() * 800;
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, t0 + 0.08);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.22);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.55, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  }

  // A short, sharp descending tone — a mouse squeak, quieter and higher
  // than the chirp so the three lures stay distinguishable layered together.
  function squeak() {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(5200, t0);
    osc.frequency.exponentialRampToValueAtTime(2600, t0 + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.4, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  }

  const players = { click, chirp, squeak };

  return {
    play(type) {
      const fn = players[type];
      if (fn) fn();
    },
    setVolume(v) {
      master.gain.value = Math.max(0, Math.min(1, v));
    },
  };
}
