(() => {
  const W = 11, H = 9, FOOD = ["🍚", "🫘", "🍅", "🥑"];
  const $ = id => document.getElementById(id);
  let floor, hp, bowl, map, px, py, foes, over, best = +localStorage.getItem("chipotlike-best") || 0;

  const rnd = n => Math.floor(Math.random() * n);
  function gen() {
    map = Array.from({ length: H }, () => Array(W).fill("."));
    for (let i = 0; i < 10 + floor; i++) map[rnd(H)][rnd(W)] = "#";
    px = 0; py = 0; map[0][0] = ".";
    const free = () => { for (;;) { const x = rnd(W), y = rnd(H); if (map[y][x] === "." && (x + y > 3)) return [x, y]; } };
    const [ex, ey] = [W - 1, H - 1]; map[ey][ex] = "E";
    map[ey][ex - 1] = "."; map[ey - 1][ex] = ".";
    for (let i = 0; i < 4; i++) { const [x, y] = free(); map[y][x] = FOOD[rnd(4)]; }
    foes = [];
    for (let i = 0; i < 1 + Math.floor(floor / 2); i++) { const [x, y] = free(); foes.push({ x, y }); }
  }
  // flood fill so the exit is always reachable
  function reachable() {
    const seen = new Set(["0,0"]), q = [[0, 0]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=W||ny>=H||map[ny][nx]==="#"||seen.has(nx+","+ny)) continue; seen.add(nx+","+ny); q.push([nx,ny]); } }
    return seen.has((W-1)+","+(H-1));
  }
  function newFloor() { do gen(); while (!reachable()); }
  function draw() {
    const out = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        if (x === px && y === py) row += "🌯";
        else if (foes.some(f => f.x === x && f.y === y)) row += "💸";
        else { const c = map[y][x]; row += c === "#" ? "🧱" : c === "E" ? "🚪" : c === "." ? "⬜" : c; }
      }
      out.push(row);
    }
    $("grid").textContent = out.join("\n");
    $("floor").textContent = floor; $("hp").textContent = "❤️".repeat(Math.max(hp, 0));
    $("bowl").textContent = bowl.length ? bowl.join("") : "empty";
  }
  function say(t) { $("msg").textContent = t; }
  function start() { floor = 1; hp = 3; bowl = []; over = false; newFloor(); say("arrow keys / WASD to move. bump things."); draw(); }
  function end() {
    over = true;
    if (floor > best) { best = floor; localStorage.setItem("chipotlike-best", best); }
    say(`charged extra. you reached floor ${floor} with a ${bowl.length}-item bowl (best: floor ${best}).`);
    setShare(`I made it to floor ${floor} of chipotlike with a ${bowl.length}-item bowl 🌯 guac was extra.`);
  }
  function move(dx, dy) {
    if (over) return;
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || map[ny][nx] === "#") { draw(); return; }
    const hit = foes.findIndex(f => f.x === nx && f.y === ny);
    if (hit >= 0) { foes.splice(hit, 1); say("you waived the upcharge. (they were just a fee.)"); }
    else {
      px = nx; py = ny;
      const c = map[py][px];
      if (FOOD.includes(c)) { bowl.push(c); map[py][px] = "."; if (hp < 3) hp++; say("into the bowl. +1."); }
      else if (c === "E") {
        if (bowl.length >= 2) { floor++; say(`floor ${floor}. the line gets longer.`); newFloor(); draw(); return; }
        say("the exit won't open on an empty bowl. need 2+ ingredients.");
      }
    }
    // foes step toward you (skip every third turn so they're beatable)
    for (const f of foes) {
      if (Math.random() < 0.33) continue;
      const sx = Math.sign(px - f.x), sy = Math.sign(py - f.y);
      const opts = Math.abs(px - f.x) > Math.abs(py - f.y) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
      for (const [ox, oy] of opts) {
        if (!ox && !oy) continue;
        const tx = f.x + ox, ty = f.y + oy;
        if (tx === px && ty === py) { hp--; say("💸 upcharge! -1 hp"); break; }
        if (map[ty][tx] === "#" || foes.some(o => o.x === tx && o.y === ty)) continue;
        f.x = tx; f.y = ty; break;
      }
    }
    draw();
    if (hp <= 0) end();
  }
  const keys = { ArrowUp: [0,-1], w: [0,-1], ArrowDown: [0,1], s: [0,1], ArrowLeft: [-1,0], a: [-1,0], ArrowRight: [1,0], d: [1,0] };
  addEventListener("keydown", e => { const k = keys[e.key]; if (k) { e.preventDefault(); move(...k); } });
  document.querySelectorAll(".pad button").forEach(b => b.addEventListener("click", () => move(...{ u: [0,-1], d: [0,1], l: [-1,0], r: [1,0] }[b.dataset.d])));
  $("restart").addEventListener("click", start);
  start();
})();
