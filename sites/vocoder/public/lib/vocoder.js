// vocoder.js — a classic channel vocoder built from plain Web Audio nodes,
// no AudioWorklet or ScriptProcessor needed.
//
// The trick: split the mic (modulator) into N bandpass bands, rectify each
// band with a WaveShaper (y = |x|) and smooth it with a slow lowpass into a
// 0..1-ish envelope, then feed that envelope straight into the matching
// carrier band's GainNode.gain AudioParam. Connecting an audio-rate signal
// to a GainNode's gain param sums with its intrinsic value (left at 0), so
// each carrier band is silent except when the mic has energy in that band —
// the carrier "talks" using the mic's envelope shape. A dedicated noise band
// on top adds a little unvoiced hiss for sibilants ("s", "sh"), which a
// purely tonal carrier can't reproduce on its own.
//
// carrierBus is a shared input: however many oscillator voices are playing
// (polyphony), they all sum into carrierBus before the band split, so the
// vocoder itself doesn't need to know or care how many notes are held.

const BAND_COUNT = 12;
const BAND_MIN_HZ = 160;
const BAND_MAX_HZ = 5200;
const BAND_Q = 3.4;
const ENV_LOWPASS_HZ = 26;
const ENV_DEPTH = 11;
const NOISE_BAND_HZ = 5800;
const NOISE_BAND_Q = 0.9;
const NOISE_ENV_DEPTH = 7;

function logSpace(min, max, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(min * Math.pow(max / min, i / (n - 1)));
  return out;
}

function absCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

function whiteNoiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createVocoder(ctx) {
  const ABS_CURVE = absCurve();

  const modInput = ctx.createGain(); // mic (or any modulator) connects here
  modInput.gain.value = 1;

  const carrierBus = ctx.createGain(); // polyphonic carrier voices connect here
  carrierBus.gain.value = 1;

  const outputBus = ctx.createGain();
  outputBus.gain.value = 1;

  function buildEnvelopeFollower(source, lowpassHz) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = ABS_CURVE;
    const smoothing = ctx.createBiquadFilter();
    smoothing.type = "lowpass";
    smoothing.frequency.value = lowpassHz;
    smoothing.Q.value = 0.7;
    source.connect(shaper);
    shaper.connect(smoothing);
    return smoothing;
  }

  const centers = logSpace(BAND_MIN_HZ, BAND_MAX_HZ, BAND_COUNT);
  const bands = centers.map((freq) => {
    const modBP = ctx.createBiquadFilter();
    modBP.type = "bandpass";
    modBP.frequency.value = freq;
    modBP.Q.value = BAND_Q;
    modInput.connect(modBP);

    const envelope = buildEnvelopeFollower(modBP, ENV_LOWPASS_HZ);
    const envScale = ctx.createGain();
    envScale.gain.value = ENV_DEPTH;
    envelope.connect(envScale);

    const carrierBP = ctx.createBiquadFilter();
    carrierBP.type = "bandpass";
    carrierBP.frequency.value = freq;
    carrierBP.Q.value = BAND_Q;
    carrierBus.connect(carrierBP);

    const bandGain = ctx.createGain();
    bandGain.gain.value = 0; // driven entirely by envScale -> gain param
    carrierBP.connect(bandGain);
    envScale.connect(bandGain.gain);

    const meter = ctx.createAnalyser();
    meter.fftSize = 32;
    meter.smoothingTimeConstant = 0.6;
    bandGain.connect(meter);

    bandGain.connect(outputBus);

    return { freq, meter, meterBuf: new Uint8Array(meter.fftSize) };
  });

  // ---- unvoiced/noise band: gives sibilants a little life -----------------
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = whiteNoiseBuffer(ctx, 2);
  noiseSource.loop = true;
  const noiseCarrierBP = ctx.createBiquadFilter();
  noiseCarrierBP.type = "bandpass";
  noiseCarrierBP.frequency.value = NOISE_BAND_HZ;
  noiseCarrierBP.Q.value = NOISE_BAND_Q;
  noiseSource.connect(noiseCarrierBP);
  noiseSource.start();

  const noiseModBP = ctx.createBiquadFilter();
  noiseModBP.type = "highpass";
  noiseModBP.frequency.value = 4200;
  modInput.connect(noiseModBP);
  const noiseEnvelope = buildEnvelopeFollower(noiseModBP, ENV_LOWPASS_HZ);
  const noiseEnvScale = ctx.createGain();
  noiseEnvScale.gain.value = NOISE_ENV_DEPTH;
  noiseEnvelope.connect(noiseEnvScale);

  const noiseBandGain = ctx.createGain();
  noiseBandGain.gain.value = 0;
  noiseCarrierBP.connect(noiseBandGain);
  noiseEnvScale.connect(noiseBandGain.gain);
  const noiseMeter = ctx.createAnalyser();
  noiseMeter.fftSize = 32;
  noiseMeter.smoothingTimeConstant = 0.6;
  noiseBandGain.connect(noiseMeter);
  noiseBandGain.connect(outputBus);
  bands.push({ freq: NOISE_BAND_HZ, meter: noiseMeter, meterBuf: new Uint8Array(noiseMeter.fftSize), unvoiced: true });

  function bandLevel(band) {
    band.meter.getByteTimeDomainData(band.meterBuf);
    let sumSq = 0;
    for (let i = 0; i < band.meterBuf.length; i++) {
      const s = (band.meterBuf[i] - 128) / 128;
      sumSq += s * s;
    }
    return Math.sqrt(sumSq / band.meterBuf.length);
  }

  return {
    modInput,
    carrierBus,
    outputBus,
    bands,
    bandLevel,
  };
}

// ---- polyphonic carrier voice ------------------------------------------

const ATTACK_SEC = 0.006;
const RELEASE_SEC = 0.09;

export function createCarrierVoice(ctx, destination, freq, waveform) {
  const osc1 = ctx.createOscillator();
  osc1.type = waveform;
  osc1.frequency.value = freq;
  osc1.detune.value = -5;

  const osc2 = ctx.createOscillator();
  osc2.type = waveform;
  osc2.frequency.value = freq;
  osc2.detune.value = 6;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(destination);

  osc1.start();
  osc2.start();

  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.5, now + ATTACK_SEC);

  return {
    setFrequency(f, glideSec) {
      const t = ctx.currentTime + 0.01;
      osc1.frequency.linearRampToValueAtTime(f, t + (glideSec || 0));
      osc2.frequency.linearRampToValueAtTime(f, t + (glideSec || 0));
    },
    release() {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + RELEASE_SEC);
      const stopAt = t + RELEASE_SEC + 0.02;
      try {
        osc1.stop(stopAt);
        osc2.stop(stopAt);
      } catch {}
    },
  };
}
