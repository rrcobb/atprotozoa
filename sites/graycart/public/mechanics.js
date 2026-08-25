// graycart — the four procedural mechanics. Every cartridge picks exactly
// one of these and randomizes its own parameters, sprites, and A/B button
// mapping, so no on-screen text ever explains the rules: the player learns
// by bumping into things. Screen is a fixed 160x144 (real Game Boy res).
(function (global) {
  "use strict";

  const W = 160,
    H = 144;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function dist(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }
  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
  }
  // Randomly assigns two named actions to the physical A/B buttons so the
  // same mechanic can wire up differently cartridge to cartridge.
  function mapActions(rng, primary, secondary) {
    return rng.bool()
      ? { a: primary, b: secondary }
      : { a: secondary, b: primary };
  }

  // ---------------------------------------------------------------------
  // DODGE — hazards fall from the top, stay alive along the bottom row.
  // ---------------------------------------------------------------------
  class Dodge {
    constructor(rng, sprites, audio) {
      this.rng = rng;
      this.audio = audio;
      this.status = "playing";
      this.playerW = 10;
      this.playerH = 6;
      this.x = W / 2;
      this.y = H - 14;
      this.speed = rng.range(70, 105);
      this.dashMul = 2.1;
      this.dashDur = 0.16;
      this.dashCd = 0.7;
      this.shrinkDur = 0.6;
      this.shrinkCd = 1.1;
      this.dashT = 0;
      this.dashCdT = 0;
      this.shrinkT = 0;
      this.shrinkCdT = 0;
      this.hazardSize = rng.int(7, 11);
      this.spawnBase = rng.range(0.55, 0.85);
      this.spawnT = this.spawnBase;
      this.fallBase = rng.range(45, 75);
      this.elapsed = 0;
      this.winTime = rng.range(26, 40);
      this.hazards = [];
      this.actions = mapActions(rng, "dash", "shrink");
      this.playerSprite = sprites.makeSprite(rng, 8, 0.55, 1);
      this.hazardSprite = sprites.makeSprite(
        rng,
        this.hazardSize,
        0.6,
        2
      );
    }

    update(dt, input) {
      if (this.status !== "playing") return;
      this.elapsed += dt;
      const mul = this.dashT > 0 ? this.dashMul : 1;
      let moved = false;
      if (input.held.left) {
        this.x -= this.speed * mul * dt;
        moved = true;
      }
      if (input.held.right) {
        this.x += this.speed * mul * dt;
        moved = true;
      }
      this.x = clamp(this.x, this.playerW / 2, W - this.playerW / 2);
      if (moved) this.audio.play("move");

      if (input.pressed[this.actions.a === "dash" ? "a" : "b"] && this.dashCdT <= 0) {
        this.dashT = this.dashDur;
        this.dashCdT = this.dashCd;
        this.audio.play("action");
      }
      if (
        input.pressed[this.actions.a === "shrink" ? "a" : "b"] &&
        this.shrinkCdT <= 0
      ) {
        this.shrinkT = this.shrinkDur;
        this.shrinkCdT = this.shrinkCd;
        this.audio.play("action");
      }
      this.dashT = Math.max(0, this.dashT - dt);
      this.dashCdT = Math.max(0, this.dashCdT - dt);
      this.shrinkT = Math.max(0, this.shrinkT - dt);
      this.shrinkCdT = Math.max(0, this.shrinkCdT - dt);

      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const hs = this.hazardSize;
        this.hazards.push({ x: this.rng.range(hs, W - hs), y: -hs });
        this.spawnT = Math.max(0.22, this.spawnBase - this.elapsed * 0.006);
      }
      const fallSpeed = this.fallBase * (1 + this.elapsed * 0.012);
      for (const hz of this.hazards) hz.y += fallSpeed * dt;
      this.hazards = this.hazards.filter((hz) => hz.y < H + this.hazardSize);

      const pw = this.playerW * (this.shrinkT > 0 ? 0.5 : 1);
      const prect = {
        x: this.x - pw / 2,
        y: this.y - this.playerH / 2,
        w: pw,
        h: this.playerH,
      };
      if (this.dashT <= 0) {
        for (const hz of this.hazards) {
          const hrect = {
            x: hz.x - this.hazardSize / 2,
            y: hz.y - this.hazardSize / 2,
            w: this.hazardSize,
            h: this.hazardSize,
          };
          if (rectsOverlap(prect, hrect)) {
            this.status = "lose";
            this.audio.play("lose");
            break;
          }
        }
      }
      if (this.status === "playing" && this.elapsed >= this.winTime) {
        this.status = "win";
        this.audio.play("win");
      }
    }

    render(g, shades) {
      for (const hz of this.hazards) {
        global.GC.drawSprite(
          g,
          this.hazardSprite,
          hz.x - this.hazardSize / 2,
          hz.y - this.hazardSize / 2,
          shades,
          1
        );
      }
      const pw = this.playerW * (this.shrinkT > 0 ? 0.5 : 1);
      if (this.dashT <= 0 || Math.floor(this.elapsed * 20) % 2 === 0) {
        global.GC.drawSprite(
          g,
          this.playerSprite,
          this.x - pw / 2,
          this.y - 4,
          shades,
          pw / 8
        );
      }
      const ticks = 24;
      const filled = Math.floor(clamp(this.elapsed / this.winTime, 0, 1) * ticks);
      g.fillStyle = shades[1];
      for (let i = 0; i < filled; i++) {
        g.fillRect(4 + i * ((W - 8) / ticks), 2, 2, 2);
      }
    }
  }

  // ---------------------------------------------------------------------
  // GATHER — free-roam arena, collect pips, dodge wanderers.
  // ---------------------------------------------------------------------
  class Gather {
    constructor(rng, sprites, audio) {
      this.rng = rng;
      this.audio = audio;
      this.status = "playing";
      this.x = W / 2;
      this.y = H / 2;
      this.r = 4;
      this.speed = rng.range(48, 78);
      this.margin = 8;
      this.winCount = rng.int(6, 10);
      this.collected = 0;
      this.pickupR = 3;
      this.pickups = [];
      const pickupCount = rng.int(3, 5);
      for (let i = 0; i < pickupCount; i++) this.pickups.push(this.spawnPickup());
      const hazardCount = rng.int(1, 3);
      this.hazardR = 4;
      this.hazards = [];
      for (let i = 0; i < hazardCount; i++) {
        this.hazards.push({
          x: rng.range(this.margin, W - this.margin),
          y: rng.range(this.margin, H - this.margin),
          vx: 0,
          vy: 0,
          turnT: 0,
          speed: rng.range(28, 52),
        });
      }
      this.pulseDur = 0.16;
      this.pulseCd = 2.0;
      this.pulseR = rng.range(28, 48);
      this.freezeDur = rng.range(1.0, 2.0);
      this.freezeCd = 3.0;
      this.pulseT = 0;
      this.pulseCdT = 0;
      this.freezeT = 0;
      this.freezeCdT = 0;
      this.actions = mapActions(rng, "pulse", "freeze");
      this.playerSprite = sprites.makeSprite(rng, 8, 0.55, 1);
      this.pickupSprite = sprites.makeSprite(rng, 5, 0.6, 3);
      this.hazardSprite = sprites.makeSprite(rng, 8, 0.6, 2);
    }

    spawnPickup() {
      return {
        x: this.rng.range(this.margin, W - this.margin),
        y: this.rng.range(this.margin, H - this.margin),
      };
    }

    update(dt, input) {
      if (this.status !== "playing") return;
      let dx = 0,
        dy = 0;
      if (input.held.left) dx -= 1;
      if (input.held.right) dx += 1;
      if (input.held.up) dy -= 1;
      if (input.held.down) dy += 1;
      if (dx || dy) {
        const n = Math.hypot(dx, dy);
        this.x = clamp(this.x + (dx / n) * this.speed * dt, this.margin, W - this.margin);
        this.y = clamp(this.y + (dy / n) * this.speed * dt, this.margin, H - this.margin);
        this.audio.play("move");
      }

      const pulseBtn = this.actions.a === "pulse" ? "a" : "b";
      const freezeBtn = this.actions.a === "freeze" ? "a" : "b";
      if (input.pressed[pulseBtn] && this.pulseCdT <= 0) {
        this.pulseT = this.pulseDur;
        this.pulseCdT = this.pulseCd;
        this.audio.play("action");
        for (const hz of this.hazards) {
          const d = dist(this.x, this.y, hz.x, hz.y) || 1;
          if (d < this.pulseR) {
            hz.x = clamp(hz.x + ((hz.x - this.x) / d) * 20, this.margin, W - this.margin);
            hz.y = clamp(hz.y + ((hz.y - this.y) / d) * 20, this.margin, H - this.margin);
          }
        }
      }
      if (input.pressed[freezeBtn] && this.freezeCdT <= 0) {
        this.freezeT = this.freezeDur;
        this.freezeCdT = this.freezeCd;
        this.audio.play("action");
      }
      this.pulseT = Math.max(0, this.pulseT - dt);
      this.pulseCdT = Math.max(0, this.pulseCdT - dt);
      this.freezeT = Math.max(0, this.freezeT - dt);
      this.freezeCdT = Math.max(0, this.freezeCdT - dt);

      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        if (dist(this.x, this.y, p.x, p.y) < this.r + this.pickupR + 1) {
          this.collected++;
          this.audio.play("pickup");
          this.pickups[i] = this.spawnPickup();
        }
      }
      if (this.collected >= this.winCount) {
        this.status = "win";
        this.audio.play("win");
        return;
      }

      if (this.freezeT <= 0) {
        for (const hz of this.hazards) {
          hz.turnT -= dt;
          if (hz.turnT <= 0) {
            const ang = this.rng.range(0, Math.PI * 2);
            hz.vx = Math.cos(ang) * hz.speed;
            hz.vy = Math.sin(ang) * hz.speed;
            hz.turnT = this.rng.range(0.5, 1.6);
          }
          hz.x += hz.vx * dt;
          hz.y += hz.vy * dt;
          if (hz.x < this.margin || hz.x > W - this.margin) hz.vx *= -1;
          if (hz.y < this.margin || hz.y > H - this.margin) hz.vy *= -1;
          hz.x = clamp(hz.x, this.margin, W - this.margin);
          hz.y = clamp(hz.y, this.margin, H - this.margin);
        }
      }

      if (this.pulseT <= 0) {
        for (const hz of this.hazards) {
          if (dist(this.x, this.y, hz.x, hz.y) < this.r + this.hazardR) {
            this.status = "lose";
            this.audio.play("lose");
            break;
          }
        }
      }
    }

    render(g, shades) {
      for (const p of this.pickups) {
        global.GC.drawSprite(g, this.pickupSprite, p.x - 2.5, p.y - 2.5, shades, 1);
      }
      for (const hz of this.hazards) {
        global.GC.drawSprite(g, this.hazardSprite, hz.x - 4, hz.y - 4, shades, 1);
      }
      global.GC.drawSprite(g, this.playerSprite, this.x - 4, this.y - 4, shades, 1);
      g.fillStyle = shades[1];
      for (let i = 0; i < this.winCount; i++) {
        const lit = i < this.collected;
        const px = 5 + i * 7;
        if (lit) g.fillRect(px, 3, 3, 3);
        else g.strokeStyle = shades[1], g.strokeRect(px + 0.5, 3.5, 2, 2);
      }
    }
  }

  // ---------------------------------------------------------------------
  // MAZE — fog-lit corridors, a patroller or two, find the exit.
  // ---------------------------------------------------------------------
  class Maze {
    constructor(rng, sprites, audio) {
      this.rng = rng;
      this.audio = audio;
      this.status = "playing";
      this.cols = 13;
      this.rows = 11;
      this.cell = 10;
      this.offX = Math.round((W - this.cols * this.cell) / 2);
      this.offY = Math.round((H - this.rows * this.cell) / 2) + 2;

      // occupancy grid at half-cell resolution: odd,odd = cell centers,
      // even rows/cols = walls unless carved open between two cells.
      const oc = this.cols * 2 + 1;
      const or_ = this.rows * 2 + 1;
      const occ = [];
      for (let y = 0; y < or_; y++) occ.push(new Array(oc).fill(false));
      const visited = [];
      for (let y = 0; y < this.rows; y++) visited.push(new Array(this.cols).fill(false));
      const stack = [[0, 0]];
      visited[0][0] = true;
      occ[1][1] = true;
      while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        const dirs = rng.shuffle([
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]);
        let advanced = false;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx,
            ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          if (visited[ny][nx]) continue;
          visited[ny][nx] = true;
          occ[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = true;
          occ[ny * 2 + 1][nx * 2 + 1] = true;
          stack.push([nx, ny]);
          advanced = true;
          break;
        }
        if (!advanced) stack.pop();
      }
      this.occ = occ;
      this.occRows = or_;
      this.occCols = oc;

      // BFS from start to find the farthest cell -> exit.
      const dist2 = [];
      for (let y = 0; y < this.rows; y++) dist2.push(new Array(this.cols).fill(-1));
      dist2[0][0] = 0;
      const q = [[0, 0]];
      let far = [0, 0];
      while (q.length) {
        const [cx, cy] = q.shift();
        if (dist2[cy][cx] > dist2[far[1]][far[0]]) far = [cx, cy];
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]) {
          const nx = cx + dx,
            ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          if (!occ[cy * 2 + 1 + dy][cx * 2 + 1 + dx]) continue;
          if (dist2[ny][nx] !== -1) continue;
          dist2[ny][nx] = dist2[cy][cx] + 1;
          q.push([nx, ny]);
        }
      }
      this.exitCell = far;

      this.x = this.offX + this.cell / 2;
      this.y = this.offY + this.cell / 2;
      this.r = 3;
      this.speed = rng.range(46, 68);
      this.baseRadius = rng.range(24, 34);
      this.flareBonus = 18;
      this.flareDur = 1.1;
      this.flareCd = 2.5;
      this.flareT = 0;
      this.flareCdT = 0;
      this.phaseDur = 0.25;
      this.phaseCd = 3.0;
      this.phaseT = 0;
      this.phaseCdT = 0;
      this.actions = mapActions(rng, "flare", "phase");

      const hazardCount = rng.int(1, 2);
      this.hazards = [];
      for (let i = 0; i < hazardCount; i++) {
        let hx, hy;
        do {
          hx = rng.int(0, this.cols - 1);
          hy = rng.int(0, this.rows - 1);
        } while (hx < 2 && hy < 2);
        this.hazards.push({
          cx: hx,
          cy: hy,
          x: this.offX + hx * this.cell + this.cell / 2,
          y: this.offY + hy * this.cell + this.cell / 2,
          targetCx: hx,
          targetCy: hy,
          speed: rng.range(24, 40),
          fromDir: null,
        });
      }
      this.playerSprite = sprites.makeSprite(rng, 6, 0.5, 1);
      this.hazardSprite = sprites.makeSprite(rng, 6, 0.6, 2);
    }

    neighbors(cx, cy) {
      const out = [];
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        if (!this.occ[cy * 2 + 1 + dy][cx * 2 + 1 + dx]) continue;
        out.push([nx, ny, [dx, dy]]);
      }
      return out;
    }

    occBlocked(px, py, allowPhase) {
      if (allowPhase) return false;
      const ox = Math.floor((px - this.offX) / (this.cell / 2));
      const oy = Math.floor((py - this.offY) / (this.cell / 2));
      if (oy < 0 || ox < 0 || oy >= this.occRows || ox >= this.occCols) return true;
      return !this.occ[oy][ox];
    }

    tryMove(dx, dy, dt, allowPhase) {
      const speed = this.speed * dt;
      const nx = this.x + dx * speed;
      if (
        !this.occBlocked(nx - this.r, this.y - this.r, allowPhase) &&
        !this.occBlocked(nx + this.r, this.y - this.r, allowPhase) &&
        !this.occBlocked(nx - this.r, this.y + this.r, allowPhase) &&
        !this.occBlocked(nx + this.r, this.y + this.r, allowPhase)
      ) {
        this.x = nx;
      }
      const ny = this.y + dy * speed;
      if (
        !this.occBlocked(this.x - this.r, ny - this.r, allowPhase) &&
        !this.occBlocked(this.x + this.r, ny - this.r, allowPhase) &&
        !this.occBlocked(this.x - this.r, ny + this.r, allowPhase) &&
        !this.occBlocked(this.x + this.r, ny + this.r, allowPhase)
      ) {
        this.y = ny;
      }
    }

    update(dt, input) {
      if (this.status !== "playing") return;
      const allowPhase = this.phaseT > 0;
      let dx = 0,
        dy = 0;
      if (input.held.left) dx -= 1;
      if (input.held.right) dx += 1;
      if (input.held.up) dy -= 1;
      if (input.held.down) dy += 1;
      if (dx || dy) {
        const n = Math.hypot(dx, dy);
        this.tryMove(dx / n, dy / n, dt, allowPhase);
        this.audio.play("move");
      }
      this.x = clamp(this.x, this.offX + this.r, this.offX + this.cols * this.cell - this.r);
      this.y = clamp(this.y, this.offY + this.r, this.offY + this.rows * this.cell - this.r);

      const flareBtn = this.actions.a === "flare" ? "a" : "b";
      const phaseBtn = this.actions.a === "phase" ? "a" : "b";
      if (input.pressed[flareBtn] && this.flareCdT <= 0) {
        this.flareT = this.flareDur;
        this.flareCdT = this.flareCd;
        this.audio.play("action");
      }
      if (input.pressed[phaseBtn] && this.phaseCdT <= 0) {
        this.phaseT = this.phaseDur;
        this.phaseCdT = this.phaseCd;
        this.audio.play("action");
      }
      this.flareT = Math.max(0, this.flareT - dt);
      this.flareCdT = Math.max(0, this.flareCdT - dt);
      this.phaseT = Math.max(0, this.phaseT - dt);
      this.phaseCdT = Math.max(0, this.phaseCdT - dt);

      for (const hz of this.hazards) {
        const tx = this.offX + hz.targetCx * this.cell + this.cell / 2;
        const ty = this.offY + hz.targetCy * this.cell + this.cell / 2;
        const d = dist(hz.x, hz.y, tx, ty);
        if (d < 1) {
          const opts = this.neighbors(hz.targetCx, hz.targetCy).filter(
            ([, , dir]) => !hz.fromDir || dir[0] !== -hz.fromDir[0] || dir[1] !== -hz.fromDir[1]
          );
          const pool = opts.length ? opts : this.neighbors(hz.targetCx, hz.targetCy);
          if (pool.length) {
            const [nx, ny, dir] = this.rng.pick(pool);
            hz.cx = hz.targetCx;
            hz.cy = hz.targetCy;
            hz.targetCx = nx;
            hz.targetCy = ny;
            hz.fromDir = dir;
          }
        } else {
          hz.x += ((tx - hz.x) / d) * hz.speed * dt;
          hz.y += ((ty - hz.y) / d) * hz.speed * dt;
        }
        if (!allowPhase && dist(this.x, this.y, hz.x, hz.y) < this.r + 4) {
          this.status = "lose";
          this.audio.play("lose");
        }
      }

      const exitX = this.offX + this.exitCell[0] * this.cell + this.cell / 2;
      const exitY = this.offY + this.exitCell[1] * this.cell + this.cell / 2;
      if (this.status === "playing" && dist(this.x, this.y, exitX, exitY) < 4) {
        this.status = "win";
        this.audio.play("win");
      }
    }

    render(g, shades) {
      const radius = this.baseRadius + (this.flareT > 0 ? this.flareBonus : 0);
      g.fillStyle = shades[1];
      for (let oy = 0; oy < this.occRows; oy++) {
        for (let ox = 0; ox < this.occCols; ox++) {
          if (!this.occ[oy][ox]) continue;
          const px = this.offX + ox * (this.cell / 2);
          const py = this.offY + oy * (this.cell / 2);
          if (dist(px, py, this.x, this.y) > radius) continue;
          g.fillRect(px - 2, py - 2, 4, 4);
        }
      }
      const exitX = this.offX + this.exitCell[0] * this.cell + this.cell / 2;
      const exitY = this.offY + this.exitCell[1] * this.cell + this.cell / 2;
      if (dist(exitX, exitY, this.x, this.y) <= radius) {
        g.fillStyle = shades[3];
        g.fillRect(exitX - 3, exitY - 3, 6, 6);
      }
      for (const hz of this.hazards) {
        if (dist(hz.x, hz.y, this.x, this.y) > radius) continue;
        global.GC.drawSprite(g, this.hazardSprite, hz.x - 3, hz.y - 3, shades, 1);
      }
      if (this.phaseT <= 0 || Math.floor(performance.now() / 40) % 2 === 0) {
        global.GC.drawSprite(g, this.playerSprite, this.x - 3, this.y - 3, shades, 1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // CLIMB — ascend generated platforms; fall too far behind and it's over.
  // ---------------------------------------------------------------------
  class Climb {
    constructor(rng, sprites, audio) {
      this.rng = rng;
      this.audio = audio;
      this.status = "playing";
      this.gravity = 340;
      this.jumpVel = -rng.range(150, 190);
      this.moveSpeed = rng.range(48, 76);
      this.maxJumpHeight = (this.jumpVel * this.jumpVel) / (2 * this.gravity);
      this.bMode = rng.pick(["double", "float"]);
      this.usedDouble = false;

      this.groundY = H - 10;
      this.platforms = [
        { x: W / 2 - 20, y: this.groundY, w: 40, h: 4, spike: false },
      ];
      this.winHeight = rng.range(420, 620);
      let y = this.groundY;
      while (this.groundY - y < this.winHeight + 40) {
        const gap = rng.range(0.5, 0.82) * this.maxJumpHeight;
        y -= gap;
        const w = rng.range(22, 40);
        const x = clamp(
          this.platforms[this.platforms.length - 1].x + rng.range(-45, 45),
          4,
          W - 4 - w
        );
        const spike = this.platforms.length > 2 && rng.bool(0.18);
        this.platforms.push({ x, y, w, h: 4, spike });
      }
      this.topPlatform = this.platforms[this.platforms.length - 1];

      this.x = W / 2;
      this.y = this.groundY - 8;
      this.vx = 0;
      this.vy = 0;
      this.w = 7;
      this.h = 8;
      this.onGround = true;
      this.coyote = 0;
      this.cameraY = 0;
      this.playerSprite = sprites.makeSprite(rng, 7, 0.55, 1);
    }

    update(dt, input) {
      if (this.status !== "playing") return;
      this.vx = 0;
      if (input.held.left) this.vx = -this.moveSpeed;
      if (input.held.right) this.vx = this.moveSpeed;
      if (this.vx !== 0) this.audio.play("move");

      const jumpBtn = "a";
      const secondaryBtn = "b";
      if (input.pressed[jumpBtn] && (this.onGround || this.coyote > 0)) {
        this.vy = this.jumpVel;
        this.onGround = false;
        this.coyote = 0;
        this.usedDouble = false;
        this.audio.play("action");
      } else if (
        this.bMode === "double" &&
        input.pressed[secondaryBtn] &&
        !this.onGround &&
        !this.usedDouble
      ) {
        this.vy = this.jumpVel * 0.85;
        this.usedDouble = true;
        this.audio.play("action");
      }
      const floating = this.bMode === "float" && input.held[secondaryBtn] && this.vy > 0;

      this.vy += this.gravity * (floating ? 0.35 : 1) * dt;
      this.x = clamp(this.x + this.vx * dt, this.w / 2, W - this.w / 2);
      const prevY = this.y;
      this.y += this.vy * dt;

      this.coyote = Math.max(0, this.coyote - dt);
      this.onGround = false;
      if (this.vy >= 0) {
        for (const p of this.platforms) {
          const feetPrev = prevY + this.h / 2;
          const feetNow = this.y + this.h / 2;
          if (
            feetPrev <= p.y &&
            feetNow >= p.y &&
            this.x + this.w / 2 > p.x &&
            this.x - this.w / 2 < p.x + p.w
          ) {
            if (p.spike) {
              this.status = "lose";
              this.audio.play("lose");
              return;
            }
            this.y = p.y - this.h / 2;
            this.vy = 0;
            this.onGround = true;
            this.coyote = 0.1;
          }
        }
      }

      this.cameraY = Math.min(this.cameraY, this.y - H * 0.55);
      if (this.y - this.cameraY > H + 30) {
        this.status = "lose";
        this.audio.play("lose");
        return;
      }
      if (this.y <= this.topPlatform.y + 6) {
        this.status = "win";
        this.audio.play("win");
      }
    }

    render(g, shades) {
      for (const p of this.platforms) {
        const sy = p.y - this.cameraY;
        if (sy < -8 || sy > H + 8) continue;
        g.fillStyle = shades[p.spike ? 2 : 1];
        g.fillRect(p.x, sy, p.w, p.h);
      }
      global.GC.drawSprite(
        g,
        this.playerSprite,
        this.x - 3.5,
        this.y - this.cameraY - 3.5,
        shades,
        1
      );
      const climbed = clamp((this.groundY - this.y) / this.winHeight, 0, 1);
      g.fillStyle = shades[1];
      g.fillRect(W - 4, H - 4 - climbed * (H - 8), 2, climbed * (H - 8));
    }
  }

  function createMechanic(kind, rng, sprites, audio) {
    if (kind === "dodge") return new Dodge(rng, sprites, audio);
    if (kind === "gather") return new Gather(rng, sprites, audio);
    if (kind === "maze") return new Maze(rng, sprites, audio);
    if (kind === "climb") return new Climb(rng, sprites, audio);
    throw new Error("unknown mechanic: " + kind);
  }

  global.GC = global.GC || {};
  global.GC.MECHANIC_KINDS = ["dodge", "gather", "maze", "climb"];
  global.GC.createMechanic = createMechanic;
  global.GC.SCREEN_W = W;
  global.GC.SCREEN_H = H;
})(window);
