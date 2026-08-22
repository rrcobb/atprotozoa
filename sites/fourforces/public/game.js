/* fourforces — procgen QWOP Sisyphus.
 *
 * Sisyphus walks the hill on his own; that part was never negotiable. What
 * you control is Q/W/O/P, one dial per fundamental force (gravity,
 * electromagnetism, the weak force, the strong force). Hold a key to ramp
 * its dial, release and it decays. Keep the four roughly level and the walk
 * moves forward; let them drift apart and it drags.
 *
 * The hillside is a Conway-family cellular automaton — a grid of live/dead
 * cells whose column population is the terrain height. Whichever dial is
 * currently winning picks the ruleset (Conway / HighLife / Seeds /
 * Day&Night), so the physical shape of the hill follows whichever force you
 * favor. Push the weak force hard and generations tick fast, which can open
 * a gap in the ground under your feet with no warning — that's decay. Mash
 * the strong force to its cap for too long and it stops sharing with the
 * other three: the whole hillside collapses to a point and the run ends.
 *
 * No build step, no audio — pure canvas + requestAnimationFrame.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_BASE_Y = H * 0.68;
  const HERO_X = W * 0.26;
  const PXPERM = 12; // px of scroll per displayed "meter"
  const SUMMIT_M = 240;

  // --- terrain grid (the cellular automaton) -------------------------------
  const COLW = 16;
  const ROWS = 16;
  const BUMPPX = 4.6;
  const VISCOLS = Math.ceil(W / COLW) + 1;
  const LEFTBUF = 10;
  const RIGHTBUF = 16;
  const GRIDW = VISCOLS + LEFTBUF + RIGHTBUF;

  const RULESETS = {
    Q: { key: 'Q', name: 'Conway (classic)', color: '#ff6b6b', birth: [3], survive: [2, 3] },
    W: { key: 'W', name: 'HighLife', color: '#ffd166', birth: [3, 6], survive: [2, 3] },
    O: { key: 'O', name: 'Seeds', color: '#6bffb8', birth: [2], survive: [] },
    P: { key: 'P', name: 'Day & Night', color: '#7a5cff', birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function genColumn(density) {
    const col = new Uint8Array(ROWS);
    for (let r = 0; r < ROWS; r++) col[r] = Math.random() < density ? 1 : 0;
    return col;
  }
  function aliveCount(col) {
    let n = 0;
    for (let r = 0; r < ROWS; r++) n += col[r];
    return n;
  }

  // --- persistent upgrades ("coupling constants" gacha) --------------------
  const UPGRADE_POOL = [
    { id: 'ramp_q', name: 'Graviton Coupling', rarity: 'common', desc: 'gravity dial ramps 20% faster.', apply: (b) => b.rampQ += 0.2 },
    { id: 'ramp_w', name: 'Photon Coupling', rarity: 'common', desc: 'electromagnetism dial ramps 20% faster.', apply: (b) => b.rampW += 0.2 },
    { id: 'ramp_o', name: 'Boson Coupling', rarity: 'common', desc: 'weak force dial ramps 20% faster.', apply: (b) => b.rampO += 0.2 },
    { id: 'grip', name: 'Lattice Traction', rarity: 'common', desc: 'electromagnetism grants 15% more grip.', apply: (b) => b.gripBonus += 0.15 },
    { id: 'ramp_p', name: 'Gluon Coupling', rarity: 'rare', desc: 'strong force dial ramps 20% faster. bold choice.', apply: (b) => b.rampP += 0.2 },
    { id: 'slow_decay', name: 'Vacuum Stability', rarity: 'rare', desc: 'all four dials decay 15% slower.', apply: (b) => b.decayMult *= 0.85 },
    { id: 'wide_harmony', name: 'Unified Field', rarity: 'legendary', desc: 'harmony tolerance widened — forgiving even when the dials drift.', apply: (b) => b.harmonyBonus += 0.18 },
    { id: 'collapse_grace', name: 'Quantum Foam Buffer', rarity: 'legendary', desc: 'the strong force takes noticeably longer to go nuclear.', apply: (b) => b.collapseGrace += 90 }
  ];
  const RARITY_WEIGHT = { common: 60, rare: 30, legendary: 10 };

  function freshBonuses() {
    return { rampQ: 0, rampW: 0, rampO: 0, rampP: 0, gripBonus: 0, decayMult: 1, harmonyBonus: 0, collapseGrace: 0 };
  }
  function loadUpgrades() {
    try {
      const raw = JSON.parse(localStorage.getItem('fourforces.upgrades') || '[]');
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    return [];
  }
  function saveUpgrades(list) {
    try { localStorage.setItem('fourforces.upgrades', JSON.stringify(list)); } catch (e) {}
  }
  function computeBonuses(list) {
    const b = freshBonuses();
    for (const id of list) {
      const u = UPGRADE_POOL.find((x) => x.id === id);
      if (u) u.apply(b);
    }
    return b;
  }
  function pullGacha() {
    const total = Object.values(RARITY_WEIGHT).reduce((a, c) => a + c, 0);
    let r = Math.random() * total, rarity = 'common';
    for (const [k, w] of Object.entries(RARITY_WEIGHT)) { if (r < w) { rarity = k; break; } r -= w; }
    const pool = UPGRADE_POOL.filter((u) => u.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // --- elements -------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const els = {
    dist: el('dist'), loops: el('loops'), best: el('best'),
    rulesetName: el('rulesetName'),
    start: el('startOverlay'), pause: el('pauseOverlay'), end: el('endOverlay'),
    startBtn: el('startBtn'), restartBtn: el('restartBtn'),
    endTitle: el('endTitle'), endMsg: el('endMsg'),
    gachaCard: el('gachaCard'), gachaBtn: el('gachaBtn'),
    gachaRarity: el('gachaRarity'), gachaName: el('gachaName'), gachaDesc: el('gachaDesc'),
    share: el('shareBtn'), upgradeStrip: el('upgradeStrip'),
    dialBars: {
      Q: document.querySelector('#dialQ .dial-bar > i'),
      W: document.querySelector('#dialW .dial-bar > i'),
      O: document.querySelector('#dialO .dial-bar > i'),
      P: document.querySelector('#dialP .dial-bar > i')
    },
    dialWraps: { Q: el('dialQ'), W: el('dialW'), O: el('dialO'), P: el('dialP') },
    touch: { Q: el('tQ'), W: el('tW'), O: el('tO'), P: el('tP'), jump: el('touchJump') }
  };

  let upgradeIds = loadUpgrades();
  let bonuses = computeBonuses(upgradeIds);

  function renderUpgradeStrip() {
    if (!upgradeIds.length) { els.upgradeStrip.textContent = ''; return; }
    const counts = {};
    upgradeIds.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
    els.upgradeStrip.innerHTML = Object.entries(counts).map(([id, n]) => {
      const u = UPGRADE_POOL.find((x) => x.id === id);
      if (!u) return '';
      return u.name + (n > 1 ? ' ×' + n : '');
    }).filter(Boolean).join('<br>');
  }

  const RAMP_BASE = 0.05, DECAY_BASE = 0.017;
  const state = {
    running: false, paused: false, t: 0,
    scrollX: 0, penalty: 0, best: 0, loops: 0,
    dials: { Q: 0, W: 0, O: 0, P: 0 },
    held: { Q: false, W: false, O: false, P: false },
    dominant: 'Q',
    grid: [], worldColStart: 0, genTimer: 0, seedDensity: 0.34,
    hero: { airY: 0, vy: 0, contourY: 0, jumping: false },
    fallStun: 0, fallCooldown: 0,
    pHold: 0, collapsing: 0, collapseGrace: 150,
    particles: []
  };

  function initGrid() {
    state.grid = [];
    state.seedDensity = rnd(0.28, 0.42);
    for (let i = 0; i < GRIDW; i++) state.grid.push(genColumn(state.seedDensity));
    state.worldColStart = 0;
  }

  function ensureWindow() {
    const desired = Math.floor(state.scrollX / COLW) - LEFTBUF;
    while (desired > state.worldColStart) {
      state.grid.shift();
      state.grid.push(genColumn(state.seedDensity));
      state.worldColStart++;
    }
  }

  function gridIdxForWorldCol(worldCol) {
    return worldCol - state.worldColStart;
  }

  function stepLife(ruleset) {
    const births = new Set(ruleset.birth), survives = new Set(ruleset.survive);
    const src = state.grid;
    const next = new Array(GRIDW);
    for (let c = 0; c < GRIDW; c++) {
      const col = new Uint8Array(ROWS);
      for (let r = 0; r < ROWS; r++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= GRIDW) continue;
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const rr = r + dr;
            if (rr < 0 || rr >= ROWS) continue;
            n += src[cc][rr];
          }
        }
        const alive = src[c][r] === 1;
        col[r] = alive ? (survives.has(n) ? 1 : 0) : (births.has(n) ? 1 : 0);
      }
      next[c] = col;
    }
    // weak-force decay glitch: a few spontaneous flips, more at higher O
    const glitches = Math.floor(state.dials.O * 7);
    for (let i = 0; i < glitches; i++) {
      const c = Math.floor(rnd(0, GRIDW)), r = Math.floor(rnd(0, ROWS));
      next[c][r] = next[c][r] ? 0 : 1;
    }
    state.grid = next;
  }

  function dominantForce() {
    const d = state.dials;
    let best = 'Q', bv = d.Q;
    if (d.W > bv) { best = 'W'; bv = d.W; }
    if (d.O > bv) { best = 'O'; bv = d.O; }
    if (d.P > bv) { best = 'P'; bv = d.P; }
    return best;
  }

  function harmonyScore() {
    const d = state.dials;
    const mean = (d.Q + d.W + d.O + d.P) / 4;
    const variance = ((d.Q - mean) ** 2 + (d.W - mean) ** 2 + (d.O - mean) ** 2 + (d.P - mean) ** 2) / 4;
    return clamp(1 - variance * 9 + bonuses.harmonyBonus, 0, 1);
  }

  function computeSpeed() {
    const d = state.dials;
    const harmony = harmonyScore();
    const speedFactor = 0.2 + 0.9 * harmony;
    const gripFactor = 0.4 + 0.8 * d.W + bonuses.gripBonus;
    const gravityDrag = 0.15 + 0.55 * d.Q;
    const BASE = 2.7;
    const s = BASE * speedFactor * gripFactor - gravityDrag * BASE * 0.35;
    return clamp(s, 0, 4.8);
  }

  function loadBest() {
    try { state.best = parseInt(localStorage.getItem('fourforces.best') || '0', 10) || 0; } catch (e) {}
  }
  function saveBest() {
    try { localStorage.setItem('fourforces.best', String(state.best)); } catch (e) {}
  }
  function loadLoops() {
    try { state.loops = parseInt(localStorage.getItem('fourforces.loops') || '0', 10) || 0; } catch (e) {}
  }
  function saveLoops() {
    try { localStorage.setItem('fourforces.loops', String(state.loops)); } catch (e) {}
  }

  function reset() {
    state.running = true; state.paused = false; state.t = 0;
    state.scrollX = 0; state.penalty = 0;
    state.dials = { Q: 0.3, W: 0.3, O: 0.3, P: 0.3 };
    state.fallStun = 0; state.fallCooldown = 0;
    state.pHold = 0; state.collapsing = 0;
    state.collapseGrace = 150 + bonuses.collapseGrace;
    state.hero.airY = 0; state.hero.vy = 0; state.hero.contourY = 0; state.hero.jumping = false;
    state.particles = [];
    state.genTimer = 0;
    initGrid();
  }

  function dist() {
    return Math.max(0, state.scrollX / PXPERM - state.penalty);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(1, 4);
      state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: rnd(20, 40), color });
    }
  }

  function heroWorldCol() {
    return Math.floor((state.scrollX + HERO_X) / COLW);
  }

  function contourPxAt(worldCol) {
    const gi = clamp(gridIdxForWorldCol(worldCol), 0, GRIDW - 1);
    return aliveCount(state.grid[gi]) * BUMPPX;
  }

  function jump() {
    const h = state.hero;
    if (!h.jumping && state.fallStun === 0 && state.collapsing === 0) {
      const JUMP_V = -(8.2 + (1 - state.dials.Q) * 4.4);
      h.vy = JUMP_V; h.jumping = true;
    }
  }

  function triggerFall() {
    state.penalty += 11 + Math.random() * 6;
    state.fallStun = 46;
    state.fallCooldown = 60;
    burst(HERO_X, GROUND_BASE_Y, '#ff5d8f', 20);
  }

  function beginCollapse() {
    state.collapsing = 95;
  }

  function finishRun(title, msg) {
    state.running = false;
    const d = Math.floor(dist());
    if (d > state.best) { state.best = d; saveBest(); }
    els.endTitle.textContent = title;
    els.endMsg.textContent = msg + ' Distance: ' + d + 'm.';
    els.gachaCard.classList.add('hidden');
    els.gachaBtn.classList.remove('hidden');
    els.gachaBtn.disabled = false;
    els.gachaBtn.textContent = '🎲 pull a coupling constant';
    const loopBit = state.loops > 0 ? (' (' + state.loops + ' summit' + (state.loops === 1 ? '' : 's') + ' reached)') : '';
    const text = 'Ran fourforces to ' + d + 'm' + loopBit + ' before ' + (title.toLowerCase().includes('collaps') ? 'the strong force ate everything' : 'the myth reset') + '. Q/W/O/P dial the four fundamental forces and the hillside is a live cellular automaton: https://fourforces.bisks.net/';
    els.share.href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(text);
    els.end.classList.remove('hidden');
  }

  function beginSummit() {
    state.loops++; saveLoops();
    const d = Math.floor(dist());
    if (d > state.best) { state.best = d; saveBest(); }
    burst(HERO_X, GROUND_BASE_Y - 40, '#ffd166', 30);
    state.scrollX = 0; state.penalty = 0;
    state.seedDensity = rnd(0.28, 0.42);
    initGrid();
  }

  // --- update -----------------------------------------------------------
  function update() {
    state.t++;
    const d = state.dials;

    // dials ramp/decay
    const ramp = {
      Q: RAMP_BASE * (1 + bonuses.rampQ), W: RAMP_BASE * (1 + bonuses.rampW),
      O: RAMP_BASE * (1 + bonuses.rampO), P: RAMP_BASE * (1 + bonuses.rampP)
    };
    ['Q', 'W', 'O', 'P'].forEach((k) => {
      if (state.held[k]) d[k] = clamp(d[k] + ramp[k], 0, 1);
      else d[k] = clamp(d[k] - DECAY_BASE * bonuses.decayMult, 0, 1);
    });
    state.dominant = dominantForce();

    if (state.collapsing > 0) {
      state.collapsing--;
      if (state.collapsing === 0) {
        finishRun('NUCLEAR COLLAPSE', 'The strong force stopped sharing. Everything — the hill, the boulder, Sisyphus — collapsed to a single point.');
      }
      return;
    }

    // strong-force sustained-max tracking -> collapse
    if (d.P > 0.94) state.pHold++; else state.pHold = Math.max(0, state.pHold - 2);
    if (state.pHold > state.collapseGrace) { beginCollapse(); return; }

    if (state.fallStun > 0) {
      state.fallStun--;
    } else {
      const speed = computeSpeed();
      state.scrollX += speed;
      ensureWindow();

      // CA generation tick — faster with higher weak-force dial
      state.genTimer++;
      const interval = clamp(Math.round(58 - d.O * 46), 9, 58);
      if (state.genTimer >= interval) {
        state.genTimer = 0;
        stepLife(RULESETS[state.dominant]);
      }

      if (dist() >= SUMMIT_M) beginSummit();
    }

    // hero vertical
    const h = state.hero;
    const targetContour = contourPxAt(heroWorldCol());
    h.contourY += (targetContour - h.contourY) * 0.3;

    if (h.jumping) {
      const GRAV = 0.42 + d.Q * 0.6;
      h.vy += GRAV;
      h.airY += h.vy;
      if (h.airY >= 0) { h.airY = 0; h.vy = 0; h.jumping = false; }
    }

    // gap check — only when grounded, not stunned, cooldown elapsed
    if (state.fallCooldown > 0) state.fallCooldown--;
    if (!h.jumping && state.fallStun === 0 && state.fallCooldown === 0) {
      const frontCol = Math.floor((state.scrollX + HERO_X + 14) / COLW);
      const gi = clamp(gridIdxForWorldCol(frontCol), 0, GRIDW - 1);
      if (aliveCount(state.grid[gi]) === 0) triggerFall();
    }

    for (const p of state.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // --- render -------------------------------------------------------------
  function drawTerrain() {
    const frac = state.scrollX % COLW;
    const baseGrid = Math.floor(state.scrollX / COLW) - state.worldColStart;
    const rc = RULESETS[state.dominant];
    for (let c = -1; c <= VISCOLS; c++) {
      const gi = clamp(baseGrid + c, 0, GRIDW - 1);
      const x = c * COLW - frac;
      const pop = aliveCount(state.grid[gi]);
      const bump = pop * BUMPPX;
      const groundY = GROUND_BASE_Y - bump;
      if (pop === 0) {
        ctx.fillStyle = '#05040d';
        ctx.fillRect(x, GROUND_BASE_Y, COLW + 1, H - GROUND_BASE_Y);
        continue;
      }
      const t = pop / ROWS;
      const g = ctx.createLinearGradient(0, groundY, 0, H);
      g.addColorStop(0, rc.color);
      g.addColorStop(1, '#1a1440');
      ctx.fillStyle = g;
      ctx.fillRect(x, groundY, COLW + 1, H - groundY);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + t * 0.12) + ')';
      ctx.fillRect(x, groundY, COLW + 1, 2);
    }
  }

  function drawHero() {
    const h = state.hero;
    const y = GROUND_BASE_Y - h.contourY + h.airY;
    const flash = state.fallStun > 0 && state.t % 6 < 3;

    ctx.save();
    ctx.translate(HERO_X, y);

    // boulder
    const spin = state.scrollX * 0.09;
    ctx.save();
    ctx.translate(28, -22);
    ctx.rotate(spin % (Math.PI * 2));
    ctx.fillStyle = flash ? '#ff5d8f' : '#8d86a8';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9c2ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-5, -5, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, 4, 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // figure
    ctx.strokeStyle = flash ? '#ff5d8f' : '#eae6ff';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 4;
    const stride = !h.jumping ? Math.sin(state.t * 0.28) * 6 : 0;
    ctx.beginPath();
    ctx.moveTo(-4, -20); ctx.lineTo(-8 + stride, 0);
    ctx.moveTo(-4, -20); ctx.lineTo(0 - stride, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 6;
    ctx.moveTo(-4, -20); ctx.lineTo(14, -32);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(8, -34); ctx.lineTo(22, -28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, -40, 6, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function draw() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_BASE_Y);
    g.addColorStop(0, '#0c1030'); g.addColorStop(1, '#1c1440');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_BASE_Y);

    // distant parallax bands
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#2a2560';
    for (let i = 0; i < 6; i++) {
      let x = (i * 220 - state.scrollX * 0.1) % (W + 260);
      if (x < -130) x += W + 260;
      ctx.beginPath();
      ctx.moveTo(x - 90, GROUND_BASE_Y);
      ctx.lineTo(x, GROUND_BASE_Y - 90);
      ctx.lineTo(x + 90, GROUND_BASE_Y);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawTerrain();
    drawHero();

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;

    if (state.collapsing > 0) {
      const p = 1 - state.collapsing / 95;
      ctx.save();
      const cx = W / 2, cy = H / 2;
      const shake = (1 - p) * 6;
      ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
      ctx.fillStyle = 'rgba(0,0,0,' + (p * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, (1 - p) * (W * 0.75)), 0, Math.PI * 2);
      ctx.rect(0, 0, W, H);
      ctx.fill('evenodd');
      ctx.restore();
    }
  }

  function updateHud() {
    els.dist.textContent = Math.floor(dist());
    els.loops.textContent = state.loops;
    els.best.textContent = Math.max(state.best, Math.floor(dist()));
    ['Q', 'W', 'O', 'P'].forEach((k) => {
      els.dialBars[k].style.width = Math.round(state.dials[k] * 100) + '%';
      els.dialWraps[k].classList.toggle('dominant', state.dominant === k);
    });
    els.rulesetName.textContent = RULESETS[state.dominant].name;
  }

  function frame() {
    if (state.running && !state.paused) { update(); updateHud(); }
    draw();
    requestAnimationFrame(frame);
  }

  // --- controls -----------------------------------------------------------
  function startGame() {
    els.start.classList.add('hidden');
    els.end.classList.add('hidden');
    reset();
  }
  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    els.pause.classList.toggle('hidden', !state.paused);
  }

  const KEYMAP = { KeyQ: 'Q', KeyW: 'W', KeyO: 'O', KeyP: 'P' };
  document.addEventListener('keydown', (e) => {
    if (KEYMAP[e.code]) {
      e.preventDefault();
      if (!state.running) startGame();
      state.held[KEYMAP[e.code]] = true;
      return;
    }
    switch (e.code) {
      case 'Space': case 'ArrowUp':
        e.preventDefault();
        if (!state.running) startGame(); else jump();
        break;
      case 'Escape': togglePause(); break;
      case 'Enter': if (!state.running) startGame(); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) state.held[KEYMAP[e.code]] = false;
  });

  function bindHold(node, key) {
    if (!node) return;
    const down = (ev) => { ev.preventDefault(); if (!state.running) startGame(); state.held[key] = true; };
    const up = (ev) => { if (ev) ev.preventDefault(); state.held[key] = false; };
    node.addEventListener('touchstart', down, { passive: false });
    node.addEventListener('touchend', up, { passive: false });
    node.addEventListener('mousedown', down);
    node.addEventListener('mouseup', up);
    node.addEventListener('mouseleave', up);
  }
  bindHold(els.touch.Q, 'Q'); bindHold(els.touch.W, 'W');
  bindHold(els.touch.O, 'O'); bindHold(els.touch.P, 'P');
  if (els.touch.jump) {
    els.touch.jump.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.running) startGame(); else jump(); }, { passive: false });
    els.touch.jump.addEventListener('mousedown', (e) => { e.preventDefault(); if (!state.running) startGame(); else jump(); });
  }

  els.startBtn.addEventListener('click', startGame);
  els.restartBtn.addEventListener('click', startGame);

  els.gachaBtn.addEventListener('click', () => {
    const pick = pullGacha();
    upgradeIds.push(pick.id);
    saveUpgrades(upgradeIds);
    bonuses = computeBonuses(upgradeIds);
    renderUpgradeStrip();
    els.gachaCard.classList.remove('hidden');
    els.gachaRarity.textContent = pick.rarity.toUpperCase();
    els.gachaName.textContent = pick.name;
    els.gachaDesc.textContent = pick.desc;
    els.gachaBtn.disabled = true;
    els.gachaBtn.textContent = 'pulled — good luck next run';
  });

  // boot
  loadBest(); loadLoops();
  renderUpgradeStrip();
  reset();
  state.running = false;
  els.start.classList.remove('hidden');
  requestAnimationFrame(frame);
})();
