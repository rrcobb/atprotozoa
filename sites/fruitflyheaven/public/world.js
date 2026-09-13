// The garden: fly position/heading, fruit, and the sensory sampling that
// turns "where is the fruit" into the egocentric bins FlyBrain expects.
// Depends on brain.js (FlyBrain) being loaded first.

const FlyWorld = (() => {
  const ARENA_W = 800;
  const ARENA_H = 460;
  const MARGIN = 24;

  const BASE_SPEED = 78; // px/s
  const EAT_RADIUS = 24;
  const CAPTURE_SLOW_RADIUS = 65;
  const FRUIT_TARGET = 6;
  const FOOD_VISUAL_RANGE = 360;
  const ODOR_RANGE = 230;
  const WALL_RANGE = 150;
  const ANGULAR_SIGMA = 0.5; // radians, ~29 degrees

  const FLAVORS = [
    { name: "banana", glomerulus: 0, color: "#f4d35e", glow: "#fff2b0" },
    { name: "mango", glomerulus: 1, color: "#ff9f45", glow: "#ffcf8f" },
    { name: "orange", glomerulus: 2, color: "#ff7a3d", glow: "#ffb27a" },
    { name: "strawberry", glomerulus: 3, color: "#ff5d7a", glow: "#ffb3c1" },
  ];

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomFruitPos() {
    return {
      x: rand(MARGIN + 30, ARENA_W - MARGIN - 30),
      y: rand(MARGIN + 30, ARENA_H - MARGIN - 30),
    };
  }

  function spawnFruit() {
    const flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    const pos = randomFruitPos();
    return {
      id: Math.random().toString(36).slice(2),
      x: pos.x,
      y: pos.y,
      flavor,
      bornAt: 0, // filled in by caller with world.time, used for spawn-in animation
    };
  }

  // Distance from (x,y) to the arena rectangle boundary along `angle`.
  function rayToBounds(x, y, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    if (dx > 1e-6) best = Math.min(best, (ARENA_W - x) / dx);
    else if (dx < -1e-6) best = Math.min(best, (0 - x) / dx);
    if (dy > 1e-6) best = Math.min(best, (ARENA_H - y) / dy);
    else if (dy < -1e-6) best = Math.min(best, (0 - y) / dy);
    if (!Number.isFinite(best) || best < 0) return WALL_RANGE;
    return best;
  }

  function createWorld(seed) {
    const fruits = [];
    for (let i = 0; i < FRUIT_TARGET; i++) fruits.push(spawnFruit());
    return {
      time: 0,
      fly: {
        x: ARENA_W / 2,
        y: ARENA_H / 2,
        heading: rand(0, Math.PI * 2),
        speed: BASE_SPEED,
        wingPhase: 0,
      },
      fruits,
      particles: [],
      brain: FlyBrain.createBrain(seed || 7),
      stats: { eaten: 0, sinceLast: 0, bestSinceLast: 0 },
      lastActivations: null,
      lastMotor: null,
    };
  }

  // Potential-field escape vector: perpendicular distance to each of the 4
  // walls, pushed away along that wall's inward normal. At a corner the two
  // near walls' pushes add into a diagonal vector pointing at open space —
  // stable regardless of which way the fly happens to be facing.
  function wallEscapeVec(x, y) {
    const pushLeft = Math.max(0, 1 - x / WALL_RANGE);
    const pushRight = Math.max(0, 1 - (ARENA_W - x) / WALL_RANGE);
    const pushTop = Math.max(0, 1 - y / WALL_RANGE);
    const pushBottom = Math.max(0, 1 - (ARENA_H - y) / WALL_RANGE);
    return { x: pushLeft - pushRight, y: pushTop - pushBottom };
  }

  function sense(world) {
    const { fly, fruits } = world;
    const foodByAngle = new Array(FlyBrain.RETINA_N).fill(0);
    const wallByAngle = new Array(FlyBrain.RETINA_N).fill(0);
    const odorByGlomerulus = new Array(FlyBrain.ODOR_N).fill(0);

    for (let i = 0; i < FlyBrain.RETINA_N; i++) {
      const absAngle = fly.heading + FlyBrain.retinaAngle(i);
      const wallDist = rayToBounds(fly.x, fly.y, absAngle);
      wallByAngle[i] = Math.max(0, 1 - wallDist / WALL_RANGE);

      let acc = 0;
      for (const f of fruits) {
        const dx = f.x - fly.x;
        const dy = f.y - fly.y;
        const dist = Math.hypot(dx, dy);
        const proximity = Math.max(0, 1 - dist / FOOD_VISUAL_RANGE);
        if (proximity <= 0) continue;
        const bearing = Math.atan2(dy, dx);
        const delta = wrapAngle(bearing - absAngle);
        const kernel = Math.exp(-(delta * delta) / (2 * ANGULAR_SIGMA * ANGULAR_SIGMA));
        acc += proximity * kernel;
      }
      foodByAngle[i] = Math.min(1, acc);
    }

    for (const f of fruits) {
      const dist = Math.hypot(f.x - fly.x, f.y - fly.y);
      const proximity = Math.max(0, 1 - dist / ODOR_RANGE);
      const g = f.flavor.glomerulus;
      odorByGlomerulus[g] = Math.max(odorByGlomerulus[g], proximity);
    }

    const hunger = Math.max(0, Math.min(1, world.stats.sinceLast / 40));

    return { foodByAngle, wallByAngle, odorByGlomerulus, wallVec: wallEscapeVec(fly.x, fly.y), hunger };
  }

  function spawnEatParticles(world, x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(20, 70);
      world.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
        color,
      });
    }
  }

  function tick(world, dt) {
    world.time += dt;
    const sensory = sense(world);
    const result = FlyBrain.step(world.brain, sensory, world.fly.heading, dt);
    world.lastActivations = result.activations;
    world.lastMotor = result.motor;

    const fly = world.fly;
    fly.heading = wrapAngle(fly.heading + result.motor.angularVelocity * dt);

    const avoid = Math.max(0, Math.min(1, result.motor.avoidDrive));
    const approach = Math.max(0, Math.min(1, result.motor.approachDrive));
    fly.speed = Math.max(24, Math.min(150, BASE_SPEED * (1 - 0.4 * avoid) * (1 + 0.2 * approach)));

    // Landing deceleration: real flies brake hard as a fixated target's
    // retinal image expands (the looming/landing reflex), which here doubles
    // as the fix for a real control bug this sim had — without it, the
    // fly's minimum turning radius at cruise speed was larger than
    // EAT_RADIUS, so it settled into a stable orbit around food instead of
    // ever closing the last few pixels onto it.
    let nearestFruitDist = Infinity;
    for (const f of world.fruits) {
      nearestFruitDist = Math.min(nearestFruitDist, Math.hypot(f.x - fly.x, f.y - fly.y));
    }
    if (nearestFruitDist < CAPTURE_SLOW_RADIUS) {
      fly.speed *= Math.max(0.22, nearestFruitDist / CAPTURE_SLOW_RADIUS);
    }

    fly.x += Math.cos(fly.heading) * fly.speed * dt;
    fly.y += Math.sin(fly.heading) * fly.speed * dt;

    // Soft backstop: the avoidance drive should keep this from triggering
    // often, but a hard clamp keeps the fly on-screen no matter what.
    if (fly.x < MARGIN) {
      fly.x = MARGIN;
      fly.heading = Math.atan2(Math.sin(fly.heading), -Math.cos(fly.heading));
    } else if (fly.x > ARENA_W - MARGIN) {
      fly.x = ARENA_W - MARGIN;
      fly.heading = Math.atan2(Math.sin(fly.heading), -Math.cos(fly.heading));
    }
    if (fly.y < MARGIN) {
      fly.y = MARGIN;
      fly.heading = Math.atan2(-Math.sin(fly.heading), Math.cos(fly.heading));
    } else if (fly.y > ARENA_H - MARGIN) {
      fly.y = ARENA_H - MARGIN;
      fly.heading = Math.atan2(-Math.sin(fly.heading), Math.cos(fly.heading));
    }

    fly.wingPhase += dt * (18 + result.motor.arousal * 10 + fly.speed * 0.05);

    world.stats.sinceLast += dt;

    for (let i = world.fruits.length - 1; i >= 0; i--) {
      const f = world.fruits[i];
      const dist = Math.hypot(f.x - fly.x, f.y - fly.y);
      if (dist < EAT_RADIUS) {
        FlyBrain.reward(world.brain, 1);
        spawnEatParticles(world, f.x, f.y, f.flavor.glow);
        world.fruits.splice(i, 1);
        world.stats.eaten++;
        world.stats.bestSinceLast = Math.max(world.stats.bestSinceLast, world.stats.sinceLast);
        world.stats.lastMeal = world.stats.sinceLast;
        world.stats.sinceLast = 0;
        const spawned = spawnFruit();
        spawned.bornAt = world.time;
        world.fruits.push(spawned);
      }
    }

    for (let i = world.particles.length - 1; i >= 0; i--) {
      const p = world.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt * 1.3;
      if (p.life <= 0) world.particles.splice(i, 1);
    }
  }

  function addFruitAt(world, x, y) {
    if (world.fruits.length >= FRUIT_TARGET + 4) return;
    const flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    world.fruits.push({
      id: Math.random().toString(36).slice(2),
      x: Math.max(MARGIN, Math.min(ARENA_W - MARGIN, x)),
      y: Math.max(MARGIN, Math.min(ARENA_H - MARGIN, y)),
      flavor,
      bornAt: world.time,
    });
  }

  return {
    ARENA_W,
    ARENA_H,
    FLAVORS,
    EAT_RADIUS,
    createWorld,
    tick,
    addFruitAt,
  };
})();

if (typeof module !== "undefined") module.exports = FlyWorld;
