// corecore.js — the classroom's procedural soundtrack: no samples, an
// evolving Web Audio graph built to sound like the room itself: a warped
// pad drone, a bed of tape/vinyl crackle, and the occasional pitch-bent
// chime — corecore's whole vibe is "nostalgic media through a bad dub."
// Structurally the same shape as sites/mootdrone's synth.js (LFO-modulated
// voices into a shared reverb bus), trimmed to one always-on ensemble
// instead of one voice per account.
//
// Nothing makes sound until start() is called — browsers block audio before
// a user gesture, so the caller wires that to the first "sit down" click.

function impulseResponse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

// A slightly-detuned pentatonic-ish chord pool — always lands somewhere
// consonant no matter which root plays, which is what keeps a randomly
// drifting pad from ever sounding "wrong."
const CHORDS = [
  [130.81, 155.56, 196.0], // Cm
  [174.61, 207.65, 261.63], // Fm
  [196.0, 233.08, 293.66], // Gm
  [146.83, 174.61, 220.0], // Dm
];

export function createCorecoreEngine(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, 2.6, 2.1);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3.2;

  master.connect(dry);
  master.connect(convolver);
  convolver.connect(wet);
  dry.connect(comp);
  wet.connect(comp);
  comp.connect(ctx.destination);

  // ---- pad: 3 detuned voices through a slow-sweeping lowpass -----------
  const padGain = ctx.createGain();
  padGain.gain.value = 0.5;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.6;
  padGain.connect(padFilter);
  padFilter.connect(master);

  const padLfo = ctx.createOscillator();
  padLfo.type = "sine";
  padLfo.frequency.value = 0.05;
  const padLfoGain = ctx.createGain();
  padLfoGain.gain.value = 260;
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padFilter.frequency);
  padLfo.start();

  const voices = [0, 1, 2].map((i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 1 ? "triangle" : "sine";
    osc.detune.value = (i - 1) * 7;
    osc.frequency.value = CHORDS[0][i];
    osc.connect(padGain);
    osc.start();
    return osc;
  });
  let chordIdx = 0;
  function stepChord() {
    chordIdx = (chordIdx + 1) % CHORDS.length;
    const chord = CHORDS[chordIdx];
    const now = ctx.currentTime;
    voices.forEach((osc, i) => {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(osc.frequency.value, now);
      osc.frequency.linearRampToValueAtTime(chord[i], now + 4);
    });
  }
  let chordTimer = setInterval(stepChord, 16000);

  // ---- tape/vinyl crackle bed --------------------------------------------
  const crackleBufSize = Math.floor(ctx.sampleRate * 2);
  const crackleBuf = ctx.createBuffer(1, crackleBufSize, ctx.sampleRate);
  {
    const d = crackleBuf.getChannelData(0);
    for (let i = 0; i < crackleBufSize; i++) d[i] = Math.random() * 2 - 1;
  }
  const crackleSrc = ctx.createBufferSource();
  crackleSrc.buffer = crackleBuf;
  crackleSrc.loop = true;
  const crackleFilter = ctx.createBiquadFilter();
  crackleFilter.type = "bandpass";
  crackleFilter.frequency.value = 2400;
  crackleFilter.Q.value = 0.7;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0.05;
  crackleSrc.connect(crackleFilter);
  crackleFilter.connect(crackleGain);
  crackleGain.connect(master);
  crackleSrc.start();

  function popCrackle() {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    crackleGain.gain.cancelScheduledValues(now);
    crackleGain.gain.setValueAtTime(crackleGain.gain.value, now);
    crackleGain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.22, now + 0.01);
    crackleGain.gain.exponentialRampToValueAtTime(0.05, now + 0.15 + Math.random() * 0.2);
  }
  let crackleTimer = setInterval(popCrackle, 1400);

  // ---- warped bell chime, fired at random intervals -----------------------
  function chime() {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const root = CHORDS[chordIdx][(Math.random() * 3) | 0] * 2;
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = root;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = root * 2.4;
    const modGain = ctx.createGain();
    modGain.gain.value = root * 1.1;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    // a little pitch droop right after the attack — the "warped tape" bit
    carrier.detune.setValueAtTime(0, now);
    carrier.detune.linearRampToValueAtTime(-35 - Math.random() * 40, now + 1.4);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    carrier.connect(g);
    g.connect(master);
    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 2.5);
    mod.stop(now + 2.5);
  }
  function scheduleChime() {
    chime();
    chimeTimer = setTimeout(scheduleChime, 5000 + Math.random() * 9000);
  }
  let chimeTimer = setTimeout(scheduleChime, 3000);

  // ---- glitch/channel-change stingers, called from the slideshow ---------
  function glitchBurst() {
    popCrackle();
    const now = ctx.currentTime;
    padFilter.frequency.cancelScheduledValues(now);
    padFilter.frequency.setValueAtTime(padFilter.frequency.value, now);
    padFilter.frequency.linearRampToValueAtTime(180, now + 0.05);
    padFilter.frequency.linearRampToValueAtTime(900, now + 0.5);
  }
  function channelChangeBurst() {
    popCrackle();
    setTimeout(popCrackle, 90);
    setTimeout(popCrackle, 200);
    chime();
    const now = ctx.currentTime;
    voices.forEach((osc) => {
      osc.detune.cancelScheduledValues(now);
      osc.detune.setValueAtTime(-1200, now);
      osc.detune.linearRampToValueAtTime(0, now + 0.6);
    });
  }

  let started = false;
  return {
    start() {
      if (started) return;
      started = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 1.5);
    },
    setVolume(v) {
      master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.2);
    },
    glitchBurst,
    channelChangeBurst,
    stop() {
      clearInterval(chordTimer);
      clearInterval(crackleTimer);
      clearTimeout(chimeTimer);
      master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    },
  };
}
