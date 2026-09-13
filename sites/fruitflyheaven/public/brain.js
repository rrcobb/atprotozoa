// A stylized fruit fly "connectome" — real circuit motifs, small enough to run
// at 60fps and to draw as a diagram, not a literal load of the ~130,000-neuron
// FlyWire/hemibrain reconstruction (that dataset is gigabytes of DAG-CBOR mesh
// data with no meaning to a browser-side flight sim, and Cloudflare-cheap rules
// out shipping it as a server-side asset anyway). What's kept is the real
// wiring *pattern*:
//
//   retina (visual field bins)
//     -> lobula columnar neurons (LC): feature detectors, food-shaped vs. wall-shaped
//     -> [in parallel] antennal lobe glomeruli: near-field odor, no direction
//   LC + glomeruli -> Kenyon cells (KC): sparse random mixing, ~4 inputs each,
//     same fan-in real KCs get from projection neurons
//   KC -> mushroom body output neurons (MBON): the *learned* pathway — synapse
//     weights here are the only thing that changes, potentiated by a reward
//     pulse when the fly eats, same as dopamine-gated KC->MBON plasticity in
//     real appetitive conditioning
//   lateral horn (LH): the *innate* pathway, fixed weights, running in
//     parallel to the mushroom body from the same LC/glomerulus input
//   MBON + LH -> fan-shaped body (goal ring, encodes the heading worth
//     steering toward); ellipsoid body (heading ring) tracks the fly's
//     actual current heading directly, no MBON/LH input needed for that part
//   EB vs FB -> steering error -> descending neurons -> wing motor
//
// Everything here is a scalar per node, computed fresh each tick from
// FlyWorld's sensory snapshot. No DOM, no canvas — see scene.js for that.

const FlyBrain = (() => {
  const RETINA_N = 12; // ommatidia clusters, evenly spaced, full panoramic field
  const LC_N = 6; // pairs of adjacent retina bins pooled per feature channel
  const ODOR_N = 4; // glomeruli, one per fruit flavor
  const KC_N = 20; // Kenyon cells
  const KC_FANIN = 4; // inputs per KC, matching real ~4-6 claw counts
  const EB_N = 8; // ellipsoid body heading-ring cells
  const FB_N = 8; // fan-shaped body goal-ring cells

  const KC_THRESHOLD = 1.15;
  const LEARN_RATE = 0.045;
  const WEIGHT_MAX = 1.6;

  function retinaAngle(i) {
    return (i / RETINA_N) * Math.PI * 2;
  }
  function ebAngle(k) {
    return (k / EB_N) * Math.PI * 2;
  }
  function fbAngle(k) {
    return (k / FB_N) * Math.PI * 2;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Small seeded PRNG so a fresh page load gets the same KC wiring every time
  // (a real fly's mushroom body wiring is also fixed per-individual, just not
  // identical across flies — determinism here just makes behavior debuggable).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createBrain(seed) {
    const rand = mulberry32(seed || 1);
    const inputCount = LC_N * 2 + ODOR_N; // LC-food + LC-wall + glomeruli

    // Fixed random wiring: which inputs each KC samples, and at what weight.
    const kcWiring = [];
    for (let j = 0; j < KC_N; j++) {
      const idx = [];
      const w = [];
      for (let f = 0; f < KC_FANIN; f++) {
        idx.push(Math.floor(rand() * inputCount));
        w.push(0.6 + rand() * 0.4);
      }
      kcWiring.push({ idx, w });
    }

    return {
      inputCount,
      kcWiring,
      // The only weights that ever change: KC -> MBON[approach], KC -> MBON[avoid].
      wApproach: new Array(KC_N).fill(0.05),
      wAvoid: new Array(KC_N).fill(0.18),
      // Trailing eligibility trace per KC — reward potentiates whichever KCs
      // fired recently, not just this instant (real synaptic plasticity has a
      // window of a second or so between odor and reward).
      kcTrace: new Array(KC_N).fill(0),
      wanderAngle: rand() * Math.PI * 2,
      arousal: 0,
    };
  }

  // sensory: { foodByAngle[12], wallByAngle[12], odorByGlomerulus[4] }, all 0..1.
  // The angle bins are egocentric (bin 0 = straight ahead, fixed relative to
  // the fly's own body, like real retinotopic ommatidia) — FlyWorld samples
  // the environment at heading + retinaAngle(i) each tick.
  // heading: current fly heading, radians
  // dt: seconds
  // Returns a full activation snapshot (for rendering) plus the motor output.
  function step(brain, sensory, heading, dt) {
    const { foodByAngle, wallByAngle, odorByGlomerulus, wallVec, hunger } = sensory;

    // --- Lobula columnar pooling: two parallel feature channels off one retina.
    const lcFood = new Array(LC_N);
    const lcWall = new Array(LC_N);
    for (let i = 0; i < LC_N; i++) {
      lcFood[i] = (foodByAngle[2 * i] + foodByAngle[2 * i + 1]) / 2;
      lcWall[i] = (wallByAngle[2 * i] + wallByAngle[2 * i + 1]) / 2;
    }

    // --- Kenyon cells: sparse random mixing of LC + odor.
    const kcInputs = lcFood.concat(lcWall, odorByGlomerulus);
    const kc = new Array(KC_N);
    for (let j = 0; j < KC_N; j++) {
      const { idx, w } = brain.kcWiring[j];
      let sum = 0;
      for (let f = 0; f < idx.length; f++) sum += kcInputs[idx[f]] * w[f];
      kc[j] = Math.max(0, sum - KC_THRESHOLD);
      // Eligibility trace: decays, bumped by current firing.
      brain.kcTrace[j] = brain.kcTrace[j] * 0.9 + kc[j] * 0.3;
    }

    // --- Mushroom body output neurons: the learned pathway.
    let mbonApproach = 0;
    let mbonAvoid = 0;
    for (let j = 0; j < KC_N; j++) {
      mbonApproach += kc[j] * brain.wApproach[j];
      mbonAvoid += kc[j] * brain.wAvoid[j];
    }

    // --- Lateral horn: innate, fixed-weight pathway, parallel to the MB.
    const meanLcFood = lcFood.reduce((a, b) => a + b, 0) / LC_N;
    const meanOdor = odorByGlomerulus.reduce((a, b) => a + b, 0) / ODOR_N;
    const meanLcWall = lcWall.reduce((a, b) => a + b, 0) / LC_N;
    const lhAttract = meanLcFood * 0.6 + meanOdor * 0.4;
    const lhAvoid = meanLcWall;

    const approachDrive = mbonApproach + lhAttract;
    const avoidDrive = mbonAvoid + lhAvoid;
    // Saturating gain for the steering math only (the raw sums above are
    // still returned for the diagram/learning-strength readout). Learned
    // weights grow unbounded over a long session; without a cap here the
    // steering vector's magnitude would too, which doesn't change direction
    // on its own but does drown out the wander/wall terms it's added to.
    const approachGain = approachDrive / (1 + approachDrive);
    const avoidGain = avoidDrive / (1 + avoidDrive);

    // --- Desired heading: vector sum of attraction minus repulsion, plus a
    // slow wander term so the fly never flies in dead-straight robot lines.
    // Search intensifies the longer it's been since the last meal — real
    // starved Drosophila show elevated, more erratic locomotion ("hangry fly"
    // is a documented effect, not just a cute name for it) — which also
    // happens to be what breaks a reactive controller out of a stable orbit
    // near a wall or corner, where a fixed-strength wander term wouldn't.
    const searchGain = 1 + Math.min(1, hunger) * 2;
    brain.wanderAngle = wrapAngle(brain.wanderAngle + (Math.random() - 0.5) * 1.6 * searchGain * dt);
    let vx = Math.cos(brain.wanderAngle) * 0.35 * searchGain;
    let vy = Math.sin(brain.wanderAngle) * 0.35 * searchGain;
    // Lateral-inhibition-style sharpening across directions, relative to
    // whichever bin is currently strongest: a lone fruit's bin passes
    // through at full strength (ratio to itself is 1), but a second,
    // comparably-strong fruit in another direction gets suppressed hard
    // instead of averaged in. Without this, two similarly attractive fruit
    // in different directions blend into a heading that beelines at
    // neither — a real failure mode this sim used to get stuck in,
    // oscillating between two targets forever. Real flies resolve the same
    // problem with attention/selection circuits upstream of steering; this
    // is the cheap stand-in for "mostly commit to one."
    let maxFood = 0;
    for (let i = 0; i < RETINA_N; i++) maxFood = Math.max(maxFood, foodByAngle[i]);
    for (let i = 0; i < RETINA_N; i++) {
      const a = heading + retinaAngle(i);
      const sharpened = maxFood > 0 ? maxFood * Math.pow(foodByAngle[i] / maxFood, 3) : 0;
      vx += Math.cos(a) * sharpened * approachGain;
      vy += Math.sin(a) * sharpened * approachGain;
    }
    // Wall escape direction comes from a simple potential field over the
    // fly's actual position (perpendicular distance to each of the 4 walls),
    // not the egocentric retina bins above. An egocentric raycast repulsion
    // can settle into a stable spinning orbit near a corner (each bin's
    // repulsion rotates together with the fly's own heading); a
    // position-based field always points along the diagonal away from a
    // corner no matter which way the fly is facing, so it can't get stuck.
    vx += wallVec.x * avoidGain * 1.4;
    vy += wallVec.y * avoidGain * 1.4;
    const desiredHeading = Math.atan2(vy, vx);

    // --- Central complex: heading ring + goal ring, compared into a turn error.
    const eb = new Array(EB_N);
    const fb = new Array(FB_N);
    for (let k = 0; k < EB_N; k++) eb[k] = Math.max(0, Math.cos(heading - ebAngle(k)));
    for (let k = 0; k < FB_N; k++) fb[k] = Math.max(0, Math.cos(desiredHeading - fbAngle(k)));

    const headingError = wrapAngle(desiredHeading - heading);
    const turnLeft = Math.max(0, headingError) / Math.PI;
    const turnRight = Math.max(0, -headingError) / Math.PI;

    // --- Descending neurons -> wing motor.
    const dnLeft = turnLeft;
    const dnRight = turnRight;

    brain.arousal = brain.arousal * 0.95 + meanOdor * 0.05;

    return {
      activations: {
        retinaFood: foodByAngle,
        retinaWall: wallByAngle,
        lcFood,
        lcWall,
        odor: odorByGlomerulus,
        kc,
        mbon: [mbonApproach, mbonAvoid],
        lh: [lhAttract, lhAvoid],
        eb,
        fb,
        dn: [dnLeft, dnRight],
      },
      motor: {
        angularVelocity: (dnLeft - dnRight) * 3.2, // rad/s
        avoidDrive,
        approachDrive,
        arousal: brain.arousal,
      },
    };
  }

  // Called when the fly eats: potentiate KC->approach for recently-active KCs,
  // weaken KC->avoid for the same set. Dopamine-gated plasticity, simplified.
  function reward(brain, amount) {
    for (let j = 0; j < KC_N; j++) {
      const trace = brain.kcTrace[j];
      if (trace <= 0) continue;
      brain.wApproach[j] = Math.min(WEIGHT_MAX, brain.wApproach[j] + LEARN_RATE * trace * amount);
      brain.wAvoid[j] = Math.max(0, brain.wAvoid[j] - LEARN_RATE * 0.5 * trace * amount);
    }
  }

  function learningStrength(brain) {
    const sum = brain.wApproach.reduce((a, b) => a + b, 0);
    return sum / KC_N;
  }

  return {
    RETINA_N,
    LC_N,
    ODOR_N,
    KC_N,
    EB_N,
    FB_N,
    retinaAngle,
    ebAngle,
    fbAngle,
    createBrain,
    step,
    reward,
    learningStrength,
  };
})();

if (typeof module !== "undefined") module.exports = FlyBrain;
