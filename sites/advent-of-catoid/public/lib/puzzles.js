// The thirty puzzles. Pure functions, no DOM: each day has
//   gen(rng)  -> the puzzle input text (deterministic per seed)
//   p1(input) / p2(input) -> the answer (string or number)
//   example   -> a tiny input shown in the story
// Answers are computed in the visitor's browser by running the solver on the
// generated input, so there is no answer key to host.

// ---------- seeded rng ----------
export function makeRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

const lines = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l.length);
const nums = (s) => lines(s).map(Number);
const LET = "abcdefghijklmnopqrstuvwxyz";
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---------- day 1: nap sunbeams ----------
const d1 = (s) => s.split(/\n\s*\n/).map((g) => sum(nums(g))).sort((a, b) => b - a);

// ---------- day 2: pounce, stretch, crouch ----------
function d2(s, withAim) {
  let x = 0, depth = 0, aim = 0;
  for (const l of lines(s)) {
    const [cmd, nStr] = l.split(" ");
    const n = Number(nStr);
    if (!withAim) {
      if (cmd === "pounce") x += n;
      else if (cmd === "stretch") depth += n;
      else if (cmd === "crouch") depth -= n;
    } else if (cmd === "stretch") aim += n;
    else if (cmd === "crouch") aim -= n;
    else if (cmd === "pounce") { x += n; depth += aim * n; }
  }
  return x * depth;
}

// ---------- day 3: hairball parity ----------
const mostCommon = (set, i) => {
  let ones = 0;
  for (const b of set) if (b[i] === "1") ones++;
  return ones * 2 >= set.length ? "1" : "0"; // ties count as 1
};
function d3p1(s) {
  const bits = lines(s);
  let g = "", e = "";
  for (let i = 0; i < bits[0].length; i++) {
    const m = mostCommon(bits, i);
    g += m;
    e += m === "1" ? "0" : "1";
  }
  return parseInt(g, 2) * parseInt(e, 2);
}
function d3filter(bits, keepMost) {
  let set = bits;
  for (let i = 0; i < bits[0].length && set.length > 1; i++) {
    const m = mostCommon(set, i);
    const want = keepMost ? m : m === "1" ? "0" : "1";
    set = set.filter((b) => b[i] === want);
  }
  return parseInt(set[0], 2);
}
const d3p2 = (s) => { const b = lines(s); return d3filter(b, true) * d3filter(b, false); };

// ---------- day 4: whisker windows ----------
function d4(s, w) {
  const a = nums(s);
  let n = 0;
  for (let i = w; i < a.length; i++) if (a[i] > a[i - w]) n++; // window sums differ by a[i]-a[i-w]
  return n;
}

// ---------- day 5: litter box grid ----------
function d5grid(s) { return lines(s).map((l) => [...l].map(Number)); }
function d5p1(s) {
  const g = d5grid(s);
  let risk = 0;
  g.forEach((row, y) => row.forEach((h, x) => {
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = g[y + dy]?.[x + dx];
      if (v !== undefined && v <= h) return;
    }
    risk += h + 1;
  }));
  return risk;
}
function d5p2(s) {
  const g = d5grid(s);
  const seen = g.map((r) => r.map(() => false));
  const sizes = [];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (seen[y][x] || g[y][x] === 9) continue;
    let n = 0;
    const st = [[y, x]];
    seen[y][x] = true;
    while (st.length) {
      const [cy, cx] = st.pop();
      n++;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = cy + dy, nx = cx + dx;
        if (g[ny]?.[nx] === undefined || g[ny][nx] === 9 || seen[ny][nx]) continue;
        seen[ny][nx] = true;
        st.push([ny, nx]);
      }
    }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  return sizes[0] * sizes[1] * sizes[2];
}

// ---------- day 6: yarn tangle ----------
const OPEN = "([{<", CLOSE = ")]}>";
const BAD_SCORE = [3, 57, 1197, 25137];
function d6classify(line) {
  const st = [];
  for (const ch of line) {
    const o = OPEN.indexOf(ch);
    if (o >= 0) { st.push(o); continue; }
    const c = CLOSE.indexOf(ch);
    if (st.pop() !== c) return { bad: BAD_SCORE[c] };
  }
  let score = 0;
  while (st.length) score = score * 5 + st.pop() + 1;
  return st.length === 0 && score ? { fix: score } : {};
}
const d6p1 = (s) => sum(lines(s).map((l) => d6classify(l).bad || 0));
function d6p2(s) {
  const fixes = lines(s).map((l) => d6classify(l).fix).filter(Boolean).sort((a, b) => a - b);
  return fixes[Math.floor(fixes.length / 2)];
}

// ---------- day 7: laser dot chase ----------
function d7(s, diagonals) {
  const hit = new Map();
  let n = 0;
  for (const l of lines(s)) {
    const [x1, y1, x2, y2] = l.match(/\d+/g).map(Number);
    if (!diagonals && x1 !== x2 && y1 !== y2) continue;
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    const len = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= len; i++) {
      const k = (y1 + dy * i) * 100000 + (x1 + dx * i);
      const c = (hit.get(k) || 0) + 1;
      hit.set(k, c);
      if (c === 2) n++;
    }
  }
  return n;
}

// ---------- day 8: kitten census ----------
function d8(s, days) {
  let c = new Array(9).fill(0);
  s.trim().split(",").forEach((v) => c[Number(v)]++);
  for (let d = 0; d < days; d++) {
    const born = c[0];
    c = [...c.slice(1), born];
    c[6] += born;
  }
  return sum(c);
}

// ---------- day 9: cardboard boxes ----------
function d9(s, ribbon) {
  return sum(lines(s).map((l) => {
    const [a, b, c] = l.split("x").map(Number).sort((p, q) => p - q);
    return ribbon ? 2 * (a + b) + a * b * c : 2 * (a * b + b * c + a * c) + a * b;
  }));
}

// ---------- day 10: cat door keypads ----------
const PAD1 = ["123", "456", "789"];
const PAD2 = ["  1  ", " 234 ", "56789", " ABC ", "  D  "];
function d10(s, pad) {
  let y = pad.findIndex((r) => r.includes("5"));
  let x = pad[y].indexOf("5");
  let out = "";
  for (const l of lines(s)) {
    for (const ch of l) {
      const [dy, dx] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[ch];
      const c = pad[y + dy]?.[x + dx];
      if (c && c !== " ") { y += dy; x += dx; }
    }
    out += pad[y][x];
  }
  return out;
}

// ---------- day 11: mouse vault rooms ----------
const checksum = (name) => {
  const c = {};
  for (const ch of name) if (ch !== "-") c[ch] = (c[ch] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1)).slice(0, 5).join("");
};
const rotate = (s, n) => [...s].map((ch) => (ch === "-" ? "-" : LET[(LET.indexOf(ch) + n) % 26])).join("");
function d11rooms(s) {
  return lines(s).map((l) => {
    const m = l.match(/^([a-z-]+)-(\d+)\[([a-z]+)\]$/);
    return { name: m[1], id: Number(m[2]), sum: m[3] };
  }).filter((r) => checksum(r.name) === r.sum);
}
const d11p1 = (s) => sum(d11rooms(s).map((r) => r.id));
const d11p2 = (s) => d11rooms(s).find((r) => rotate(r.name, r.id % 26) === "tuna-warehouse-stash")?.id;

// ---------- day 12: nine lives (look-and-say) ----------
function d12(s, n) {
  let t = Uint8Array.from(s.trim(), Number);
  for (let i = 0; i < n; i++) {
    const out = new Uint8Array(t.length * 2); // a run of k digits becomes at most 2 digits (runs are <= 3 long)
    let o = 0;
    for (let j = 0; j < t.length;) {
      let k = j;
      while (k < t.length && t[k] === t[j]) k++;
      out[o++] = k - j;
      out[o++] = t[j];
      j = k;
    }
    t = out.subarray(0, o);
  }
  return t.length;
}

// ---------- day 13: scratching post elevator ----------
const d13p1 = (s) => [...s.trim()].reduce((f, c) => f + (c === "(" ? 1 : -1), 0);
function d13p2(s) {
  let f = 0, i = 0;
  for (const c of s.trim()) {
    f += c === "(" ? 1 : -1;
    i++;
    if (f < 0) return i;
  }
}

// ---------- day 14: hunt chirps ----------
function d14(s, w) {
  const t = s.trim();
  for (let i = w; i <= t.length; i++) if (new Set(t.slice(i - w, i)).size === w) return i;
}

// ---------- day 15: prowl route ----------
function d15(s, firstRepeat) {
  let x = 0, y = 0, h = 0;
  const seen = new Set(["0,0"]);
  for (const step of s.trim().split(/,\s*/)) {
    h = (h + (step[0] === "R" ? 1 : 3)) % 4;
    const [dx, dy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][h];
    for (let i = Number(step.slice(1)); i > 0; i--) {
      x += dx; y += dy;
      if (firstRepeat) {
        const k = x + "," + y;
        if (seen.has(k)) return Math.abs(x) + Math.abs(y);
        seen.add(k);
      }
    }
  }
  return firstRepeat ? undefined : Math.abs(x) + Math.abs(y);
}

// ---------- day 16: collar tags (json) ----------
function d16(s, skipHairball) {
  const walk = (v) => {
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return sum(v.map(walk));
    if (v && typeof v === "object") {
      if (skipHairball && Object.values(v).includes("hairball")) return 0;
      return sum(Object.values(v).map(walk));
    }
    return 0;
  };
  return walk(JSON.parse(s));
}

// ---------- day 17: catnip containers ----------
function d17(s) {
  const [target, ...sizes] = nums(s);
  const ways = {};
  (function rec(i, left, used) {
    if (left === 0) { ways[used] = (ways[used] || 0) + 1; return; }
    if (left < 0 || i >= sizes.length) return;
    rec(i + 1, left - sizes[i], used + 1);
    rec(i + 1, left, used);
  })(0, target, 0);
  return ways;
}
const d17p1 = (s) => sum(Object.values(d17(s)));
const d17p2 = (s) => { const w = d17(s); return w[Math.min(...Object.keys(w).map(Number))]; };

// ---------- day 18: tabby light grid ----------
function d18(s, bright) {
  const g = new Int32Array(10000);
  for (const l of lines(s)) {
    const m = l.match(/^(turn on|turn off|toggle) (\d+),(\d+) through (\d+),(\d+)$/);
    const [x1, y1, x2, y2] = m.slice(2).map(Number);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const i = y * 100 + x;
      if (!bright) g[i] = m[1] === "toggle" ? 1 - g[i] : m[1] === "turn on" ? 1 : 0;
      else g[i] = Math.max(0, g[i] + (m[1] === "toggle" ? 2 : m[1] === "turn on" ? 1 : -1));
    }
  }
  return sum(g);
}

// ---------- day 19: cat-flap passwords ----------
function d19(s, positional) {
  let n = 0;
  for (const l of lines(s)) {
    const [, a, b, ch, pw] = l.match(/^(\d+)-(\d+) (\w): (\w+)$/);
    if (!positional) {
      const c = [...pw].filter((x) => x === ch).length;
      if (c >= +a && c <= +b) n++;
    } else if ((pw[a - 1] === ch) !== (pw[b - 1] === ch)) n++;
  }
  return n;
}

// ---------- day 20: mouse maze jumps ----------
function d20(s, strange, budget = Infinity) {
  const o = Int32Array.from(nums(s));
  let i = 0, steps = 0;
  while (i >= 0 && i < o.length) {
    const j = i + o[i];
    o[i] += strange && o[i] >= 3 ? -1 : 1;
    i = j;
    if (++steps > budget) return -1;
  }
  return steps;
}

// ---------- day 21: cat cafe seating ----------
const seatId = (p) => parseInt([...p].map((c) => (c === "B" || c === "R" ? 1 : 0)).join(""), 2);
const d21p1 = (s) => Math.max(...lines(s).map(seatId));
function d21p2(s) {
  const ids = new Set(lines(s).map(seatId));
  for (let i = Math.min(...ids); i < Math.max(...ids); i++) if (!ids.has(i)) return i;
}

// ---------- day 22: kibble memory game ----------
function d22(s, turns) {
  const start = s.trim().split(",").map(Number);
  const last = new Int32Array(turns + 1); // turn on which a number was last spoken; 0 = never
  start.slice(0, -1).forEach((n, i) => (last[n] = i + 1));
  let cur = start[start.length - 1];
  for (let t = start.length; t < turns; t++) {
    const prev = last[cur];
    last[cur] = t;
    cur = prev ? t - prev : 0;
  }
  return cur;
}

// ---------- day 23: rule 30 (elementary automaton) ----------
function d23(s, part2) {
  const rule = Number(s.match(/rule (\d+)/)[1]);
  const N = Number(s.match(/steps (\d+)/)[1]);
  const gens = part2 ? N * 10 : N;
  const W = 2 * gens + 3, mid = gens + 1;
  let row = new Uint8Array(W), nxt = new Uint8Array(W);
  row[mid] = 1;
  let total = 1, centre = 1;
  for (let g = 0; g < gens; g++) {
    for (let x = 1; x < W - 1; x++) nxt[x] = (rule >> ((row[x - 1] << 2) | (row[x] << 1) | row[x + 1])) & 1;
    [row, nxt] = [nxt, row];
    let live = 0;
    for (let x = 0; x < W; x++) live += row[x];
    total += live;
    centre += row[mid];
  }
  return part2 ? centre : total;
}

// ---------- day 24: cat cradle packages ----------
function reachable(items, target) {
  const r = new Uint8Array(target + 1);
  r[0] = 1;
  for (const w of items) for (let t = target; t >= w; t--) if (r[t - w]) r[t] = 1;
  return !!r[target];
}
function canSplit(items, k, target) {
  if (k === 1) return sum(items) === target;
  if (k === 2) return sum(items) === 2 * target && reachable(items, target);
  // k >= 3: find a subset containing items[0] that sums to target, then split the rest
  let found = false;
  (function rec(i, acc, picked) {
    if (found) return;
    if (acc === target) { if (canSplit(items.filter((_, j) => !picked.includes(j)), k - 1, target)) found = true; return; }
    if (acc > target || i >= items.length) return;
    rec(i + 1, acc + items[i], [...picked, i]);
    rec(i + 1, acc, picked);
  })(1, items[0], [0]);
  return found;
}
function d24(s, groups) {
  const w = nums(s).sort((a, b) => b - a);
  const target = sum(w) / groups;
  for (let size = 1; size <= w.length; size++) {
    const cands = [];
    (function rec(i, left, acc, picked) {
      if (acc > target) return;
      if (left === 0) { if (acc === target) cands.push([...picked]); return; }
      if (w.length - i < left) return;
      picked.push(i); rec(i + 1, left - 1, acc + w[i], picked); picked.pop();
      rec(i + 1, left, acc, picked);
    })(0, size, 0, []);
    const prod = (c) => c.reduce((p, i) => p * w[i], 1);
    cands.sort((a, b) => prod(a) - prod(b));
    for (const c of cands) {
      if (canSplit(w.filter((_, j) => !c.includes(j)), groups - 1, target)) return prod(c);
    }
  }
}

// ---------- day 25: code grid ----------
function codeAt(row, col) {
  const d = row + col - 1;
  const idx = (d * (d - 1)) / 2 + col;
  let result = 1n, base = 252533n, e = BigInt(idx - 1);
  const M = 33554393n;
  while (e > 0n) { if (e & 1n) result = (result * base) % M; base = (base * base) % M; e >>= 1n; }
  return Number((20151125n * result) % M);
}
const d25p1 = (s) => { const [r, c] = s.match(/\d+/g).map(Number); return codeAt(r, c); };
function d25p2(s) {
  const c1 = d25p1(s);
  return codeAt((c1 % 9973) + 1, (Math.floor(c1 / 9973) % 9973) + 1);
}

// ---------- day 26: hairball stack machine ----------
function d26(s, c0) {
  const prog = lines(s).map((l) => l.split(" "));
  const reg = { a: 0, b: 0, c: c0, d: 0 };
  const val = (x) => (x in reg ? reg[x] : Number(x));
  for (let pc = 0; pc >= 0 && pc < prog.length;) {
    const [op, x, y] = prog[pc];
    if (op === "cpy") reg[y] = val(x);
    else if (op === "inc") reg[x]++;
    else if (op === "dec") reg[x]--;
    else if (op === "jnz" && val(x) !== 0) { pc += val(y); continue; }
    pc++;
  }
  return reg.a;
}

// ---------- day 27: mouse stampede ----------
function d27(s, overlap) {
  let n = 0;
  for (const l of lines(s)) {
    const [a, b, c, d] = l.match(/\d+/g).map(Number);
    if (overlap ? a <= d && c <= b : (a <= c && d <= b) || (c <= a && b <= d)) n++;
  }
  return n;
}

// ---------- day 28: catwalk pathfinding ----------
function d28(s, tiled) {
  const base = lines(s).map((l) => [...l].map(Number));
  const h = base.length, w = base[0].length, T = tiled ? 5 : 1;
  const H = h * T, W = w * T;
  const cost = (y, x) => ((base[y % h][x % w] + Math.floor(y / h) + Math.floor(x / w) - 1) % 9) + 1;
  const dist = new Float64Array(H * W).fill(Infinity);
  // binary min-heap of dist * 2^20 + cell index
  const heap = [];
  const push = (v) => {
    let i = heap.push(v) - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        let m = i;
        const l = 2 * i + 1, r = l + 1;
        if (l < heap.length && heap[l] < heap[m]) m = l;
        if (r < heap.length && heap[r] < heap[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  dist[0] = 0;
  push(0);
  const SH = 1048576;
  while (heap.length) {
    const v = pop(), d = Math.floor(v / SH), i = v % SH;
    if (d > dist[i]) continue;
    if (i === H * W - 1) return d;
    const y = Math.floor(i / W), x = i % W;
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
      const nd = d + cost(ny, nx), ni = ny * W + nx;
      if (nd < dist[ni]) { dist[ni] = nd; push(nd * SH + ni); }
    }
  }
}

// ---------- day 29: cat circle ----------
function d29p1(s) {
  const n = Number(s.trim());
  const next = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) next[i] = i === n ? 1 : i + 1;
  let cur = 1;
  while (next[cur] !== cur) { next[cur] = next[next[cur]]; cur = next[cur]; }
  return cur;
}
function d29p2(s) {
  const n = Number(s.trim());
  const next = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) next[i] = i === n ? 1 : i + 1;
  // pre = the cat just before the victim; the victim is directly across the circle
  let pre = 1;
  for (let i = 0; i < Math.floor(n / 2) - 1; i++) pre = next[pre];
  for (let m = n; m > 1; m--) {
    next[pre] = next[next[pre]];
    if (m % 2 === 1) pre = next[pre];
  }
  return pre;
}

// ---------- day 30: the catoid council's sums ----------
function d30(s, plusFirst) {
  const evalLine = (line) => {
    const tok = line.replace(/\s+/g, "").split("");
    let p = 0;
    const atom = () => {
      if (tok[p] === "(") { p++; const v = expr(); p++; return v; }
      return Number(tok[p++]);
    };
    const sumTerm = () => { let v = atom(); while (tok[p] === "+") { p++; v += atom(); } return v; };
    const expr = () => {
      if (plusFirst) { let v = sumTerm(); while (tok[p] === "*") { p++; v *= sumTerm(); } return v; }
      let v = atom();
      while (tok[p] === "+" || tok[p] === "*") { const op = tok[p++]; const r = atom(); v = op === "+" ? v + r : v * r; }
      return v;
    };
    return expr();
  };
  return sum(lines(s).map(evalLine));
}

// ---------- generators ----------
const pad = (n, w = 2) => String(n).padStart(w, "0");
const word = (r, lo, hi) => Array.from({ length: r.int(lo, hi) }, () => LET[r.int(0, 25)]).join("");
const joinL = (a) => a.join("\n");

function gen1(r) {
  const cats = r.int(14, 22);
  return Array.from({ length: cats }, () => joinL(Array.from({ length: r.int(2, 7) }, () => r.int(100, 9000)))).join("\n\n");
}
function gen2(r) {
  return joinL(Array.from({ length: 1000 }, () => `${r.pick(["pounce", "pounce", "stretch", "crouch"])} ${r.int(1, 9)}`));
}
function gen3(r) {
  const bias = Array.from({ length: 12 }, () => 0.25 + r.next() * 0.5);
  return joinL(Array.from({ length: 1001 }, () => bias.map((b) => (r.chance(b) ? "1" : "0")).join("")));
}
function gen4(r) {
  let d = 100;
  return joinL(Array.from({ length: 2000 }, () => (d = Math.max(1, d + r.int(-8, 9)))));
}
function gen5(r) {
  return joinL(Array.from({ length: 50 }, () => Array.from({ length: 100 }, () => (r.chance(0.4) ? 9 : r.int(0, 8))).join("")));
}
function gen6(r) {
  const make = () => {
    const n = r.int(10, 60);
    let s = "";
    const st = [];
    for (let i = 0; i < n; i++) {
      if (st.length && (st.length >= 12 || r.chance(0.5))) s += CLOSE[st.pop()];
      else { const k = r.int(0, 3); st.push(k); s += OPEN[k]; }
    }
    const mode = r.next();
    if (mode < 0.3) { while (st.length) s += CLOSE[st.pop()]; return s; }
    if (mode < 0.7) return s;
    const at = [...s].map((c, i) => (CLOSE.includes(c) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return s;
    const i = r.pick(at);
    const wrong = CLOSE.replace(s[i], "");
    return s.slice(0, i) + r.pick([...wrong]) + s.slice(i + 1);
  };
  const out = [];
  let incomplete = 0;
  while (out.length < 110 || incomplete % 2 === 0) {
    const l = make();
    out.push(l);
    if (d6classify(l).fix) incomplete++;
  }
  return joinL(out);
}
function gen7(r) {
  const out = [];
  for (let i = 0; i < 500; i++) {
    const x1 = r.int(0, 199), y1 = r.int(0, 199);
    const k = r.next();
    if (k < 0.3) out.push(`${x1},${y1} -> ${r.int(0, 199)},${y1}`);
    else if (k < 0.6) out.push(`${x1},${y1} -> ${x1},${r.int(0, 199)}`);
    else {
      const dx = r.chance(0.5) ? 1 : -1, dy = r.chance(0.5) ? 1 : -1;
      const room = Math.min(dx > 0 ? 199 - x1 : x1, dy > 0 ? 199 - y1 : y1);
      const L = r.int(0, room);
      out.push(`${x1},${y1} -> ${x1 + dx * L},${y1 + dy * L}`);
    }
  }
  return joinL(out);
}
const gen8 = (r) => Array.from({ length: 300 }, () => r.int(0, 8)).join(",");
const gen9 = (r) => joinL(Array.from({ length: 1000 }, () => `${r.int(1, 30)}x${r.int(1, 30)}x${r.int(1, 30)}`));
const gen10 = (r) => joinL(Array.from({ length: 5 }, () => Array.from({ length: r.int(40, 90) }, () => r.pick("UDLR")).join("")));
function gen11(r) {
  const rooms = [];
  const room = (name, id, real) => {
    let cs = checksum(name);
    if (!real) { cs = [...cs].reverse().join(""); if (cs === checksum(name)) cs = "zzzzz"; }
    return `${name}-${id}[${cs}]`;
  };
  for (let i = 0; i < 400; i++) {
    const name = Array.from({ length: r.int(2, 4) }, () => word(r, 3, 8)).join("-");
    rooms.push(room(name, r.int(100, 999), r.chance(0.6)));
  }
  const id = r.int(100, 999);
  rooms.splice(r.int(0, rooms.length), 0, room(rotate("tuna-warehouse-stash", 26 - (id % 26)), id, true));
  return joinL(rooms);
}
const gen12 = (r) => Array.from({ length: 8 }, () => r.int(1, 3)).join("");
function gen13(r) {
  let s = Array.from({ length: 7000 }, () => (r.chance(0.49) ? "(" : ")")).join("");
  if (d13p2(s) === undefined) s = ")" + s;
  return s;
}
function gen14(r) {
  const a = Array.from({ length: 4000 }, () => LET[r.int(0, 25)]);
  const at = r.int(300, 3900);
  r.shuffle([...LET]).slice(0, 14).forEach((c, i) => (a[at + i] = c)); // plant one guaranteed marker
  return a.join("");
}
function gen15(r) {
  for (;;) {
    const s = Array.from({ length: 150 }, () => r.pick("LR") + r.int(1, 12)).join(", ");
    if (d15(s, true) !== undefined) return s;
  }
}
function gen16(r) {
  const keys = ["tail", "paws", "naps", "toys", "bowl", "lap", "box", "sun", "mice", "fur", "purr", "claw"];
  const words = ["tabby", "calico", "siamese", "lynx", "ocelot", "bobcat", "manx", "puma"];
  const val = (d) => {
    const k = d >= 4 ? 0 : r.int(0, 4);
    if (k <= 1) return r.int(-50, 200);
    if (k === 2) return r.pick(words);
    if (k === 3) return Array.from({ length: r.int(0, 5) }, () => val(d + 1));
    const o = {};
    r.shuffle([...keys]).slice(0, r.int(1, 5)).forEach((key) => (o[key] = val(d + 1)));
    if (r.chance(0.2)) o.mood = "hairball";
    return o;
  };
  const top = {};
  keys.forEach((k) => (top[k] = val(1)));
  return JSON.stringify(top);
}
function gen17(r) {
  for (;;) {
    const target = r.int(120, 200);
    const sizes = Array.from({ length: 20 }, () => r.int(3, 50));
    const text = joinL([target, ...sizes]);
    if (d17p1(text) > 0) return text;
  }
}
function gen18(r) {
  return joinL(Array.from({ length: 300 }, () => {
    const x1 = r.int(0, 99), y1 = r.int(0, 99);
    const x2 = r.int(x1, 99), y2 = r.int(y1, 99);
    return `${r.pick(["turn on", "turn off", "toggle"])} ${x1},${y1} through ${x2},${y2}`;
  }));
}
function gen19(r) {
  return joinL(Array.from({ length: 1000 }, () => {
    const a = r.int(1, 8), b = r.int(a + 1, 9);
    return `${a}-${b} ${LET[r.int(0, 4)]}: ${Array.from({ length: r.int(9, 14) }, () => LET[r.int(0, 5)]).join("")}`;
  }));
}
function gen20(r) {
  for (;;) {
    const text = joinL(Array.from({ length: 500 }, () => r.pick([-4, -3, -2, -1, 0, 0, 1, 1, 1, 2, 2, 3])));
    if (d20(text, false, 5e6) > 0 && d20(text, true, 5e6) > 0) return text;
  }
}
function gen21(r) {
  const lo = r.int(5, 15), hi = r.int(100, 115);
  const ids = [];
  for (let i = lo * 8; i <= hi * 8 + 7; i++) ids.push(i);
  ids.splice(r.int(10, ids.length - 10), 1);
  r.shuffle(ids);
  return joinL(ids.map((id) => {
    const bits = pad(id.toString(2), 10).padStart(10, "0");
    return [...bits].map((b, i) => (i < 7 ? (b === "1" ? "B" : "F") : b === "1" ? "R" : "L")).join("");
  }));
}
function gen22(r) {
  return r.shuffle(Array.from({ length: 20 }, (_, i) => i)).slice(0, r.int(6, 8)).join(",");
}
function gen23(r) {
  return `rule ${r.pick([30, 90, 110, 126, 150, 18, 22, 54])}\nsteps ${r.int(150, 400)}`;
}
function gen24(r) {
  for (;;) {
    const set = new Set();
    while (set.size < 24) set.add(r.int(1, 60));
    const w = [...set];
    const rem = sum(w) % 12;
    if (rem) { const i = r.int(0, w.length - 1); const fixed = w[i] + (12 - rem); if (set.has(fixed) || fixed > 99) continue; w[i] = fixed; }
    const text = joinL(w);
    if (d24(text, 3) && d24(text, 4)) return text;
  }
}
const gen25 = (r) => `row ${r.int(500, 4000)}, column ${r.int(500, 4000)}`;
function gen26(r) {
  const [A, B, C, E] = [r.int(10, 99), r.int(30, 300), r.int(30, 300), r.int(10, 5000)];
  return joinL([
    `cpy ${A} a`, `cpy ${B} b`, `cpy ${C} d`, "inc a", "dec d", "jnz d -2", "dec b", "jnz b -5",
    "jnz c 5", `cpy ${E} d`, "inc a", "dec d", "jnz d -2",
  ]);
}
function gen27(r) {
  return joinL(Array.from({ length: 1000 }, () => {
    const pair = () => { const a = r.int(1, 99), b = r.int(a, Math.min(99, a + r.int(0, 40))); return `${a}-${b}`; };
    return `${pair()},${pair()}`;
  }));
}
function gen28(r) {
  return joinL(Array.from({ length: 60 }, () => Array.from({ length: 60 }, () => r.int(1, 9)).join("")));
}
const gen29 = (r) => String(r.int(1000000, 3000000));
function gen30(r) {
  const expr = (d) => {
    const n = r.int(2, 5);
    let s = "";
    for (let i = 0; i < n; i++) {
      s += i ? ` ${r.pick("+*")} ` : "";
      s += d < 2 && r.chance(0.3) ? `(${expr(d + 1)})` : r.int(1, 9);
    }
    return s;
  };
  return joinL(Array.from({ length: 300 }, () => expr(0)));
}

// ---------- the calendar ----------

// ---------- day 31: yarn knots ----------
function d31reduce(s) {
  const st = [];
  for (const c of s) {
    const t = st[st.length - 1];
    if (t && t !== c && t.toLowerCase() === c.toLowerCase()) st.pop(); else st.push(c);
  }
  return st.length;
}
const d31p1 = (s) => d31reduce(s.trim());
const d31p2 = (s) => {
  const t = s.trim();
  return Math.min(...[...LET].map((ch) => d31reduce(t.split(ch).join("").split(ch.toUpperCase()).join(""))));
};

// ---------- day 32: purr pattern (look-and-say) ----------
function d32(s, rounds) {
  let cur = s.trim();
  for (let i = 0; i < rounds; i++) {
    let out = [], j = 0;
    while (j < cur.length) {
      let k = j;
      while (k < cur.length && cur[k] === cur[j]) k++;
      out.push(k - j, cur[j]);
      j = k;
    }
    cur = out.join("");
  }
  return cur.length;
}

// ---------- day 33: treat budget ----------
function d33(s, k) {
  const v = nums(s), target = 2020;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    if (k === 2) { if (v[i] + v[j] === target) return v[i] * v[j]; continue; }
    for (let m = j + 1; m < v.length; m++) if (v[i] + v[j] + v[m] === target) return v[i] * v[j] * v[m];
  }
  return -1;
}

// ---------- day 34: tuna tell-tale ----------
function d34(s, w) {
  const t = s.trim();
  for (let i = w; i <= t.length; i++) if (new Set(t.slice(i - w, i)).size === w) return i;
  return -1;
}

// ---------- day 35: cat tent triangles ----------
const tri = (a, b, c) => a + b > c && a + c > b && b + c > a;
function d35(s, columns) {
  const rows = lines(s).map((l) => l.match(/\d+/g).map(Number));
  let n = 0;
  if (!columns) { for (const [a, b, c] of rows) if (tri(a, b, c)) n++; return n; }
  for (let i = 0; i + 2 < rows.length; i += 3)
    for (let c = 0; c < 3; c++) if (tri(rows[i][c], rows[i + 1][c], rows[i + 2][c])) n++;
  return n;
}

// bonus days: generators
function gen31(r) {
  const out = [];
  for (let i = 0; i < 20000; i++) {
    const c = r.pick([...LET]);
    out.push(r.chance(0.5) ? c : c.toUpperCase());
  }
  return out.join("");
}
function gen32(r) {
  return Array.from({ length: 10 }, () => r.int(1, 3)).join("");
}
function gen33(r) {
  // 200 values in 1..2019; plant one pair and one triple that hit 2020 so both parts have an answer
  const v = Array.from({ length: 197 }, () => r.int(1, 2019));
  const a = r.int(100, 1900); v.push(a, 2020 - a);
  const x = r.int(100, 800), y = r.int(100, 800); v.push(x, y, 2020 - x - y);
  return joinL(r.shuffle(v));
}
function gen34(r) {
  const n = r.int(3000, 4000), a = [];
  for (let i = 0; i < n; i++) a.push(LET[r.int(0, 25)]);
  // a guaranteed run of 14 distinct letters so part 2 exists; part 1 always finds one earlier or equal
  const at = r.int(1500, n - 20), run = r.shuffle([...LET]).slice(0, 14);
  for (let i = 0; i < 14; i++) a[at + i] = run[i];
  return a.join("");
}
function gen35(r) {
  return joinL(Array.from({ length: 1500 }, () =>
    Array.from({ length: 3 }, () => String(r.int(1, 999)).padStart(4, " ")).join("")));
}

export const DAYS = [
  {
    title: "Nap Sunbeams",
    intro: [
      "The sun crosses the living room in patches, and every catoid in the house stakes a claim. Each cat logs the minutes of every sunbeam they napped in, one number per line; cats are separated by a blank line.",
      "Which cat soaked up the most sun? Part 1: the total minutes of the best-tanned cat.",
    ],
    part2: ["One cat is not enough: a sunbeam audit wants the top three. What is the combined total of the three best-tanned cats?"],
    example: "1000\n2000\n3000\n\n4000\n\n5000\n6000\n\n7000\n8000\n9000\n\n10000",
    gen: gen1, p1: (s) => d1(s)[0], p2: (s) => sum(d1(s).slice(0, 3)),
  },
  {
    title: "Pounce, Stretch, Crouch",
    intro: [
      "The kitchen floor is a grid and your catoid navigates it with three moves: pounce N (forward N), stretch N (increase depth by N), crouch N (decrease depth by N). Start at 0, 0.",
      "Multiply the final forward position by the final depth.",
    ],
    part2: ["Turns out stretch and crouch change your aim, not your depth. stretch N adds N to aim; crouch N subtracts N; pounce N moves forward N and increases depth by aim × N. Same multiplication at the end."],
    example: "pounce 5\nstretch 5\npounce 8\ncrouch 3\nstretch 8\npounce 2",
    gen: gen2, p1: (s) => d2(s, false), p2: (s) => d2(s, true),
  },
  {
    title: "Hairball Parity",
    intro: [
      "The vet reads hairball diagnostics as binary strings. The gamma rate is built from the most common bit in each column (a tie counts as 1); the epsilon rate uses the least common bit in each column.",
      "Part 1: gamma × epsilon, both read as decimal numbers.",
    ],
    part2: ["Now filter. For the oxygen rating, go column by column keeping only the strings whose bit matches the most common bit in that column (ties keep 1) until one string is left. For the CO₂ rating, keep the least common bit instead (ties keep 0). Multiply the two ratings, read as decimal."],
    example: "00100\n11110\n10110\n10111\n10101\n01111\n00111\n11100\n10000\n11001\n00010\n01010",
    gen: gen3, p1: d3p1, p2: d3p2,
  },
  {
    title: "Whisker Windows",
    intro: [
      "Whiskers take a depth reading of the sofa gap every minute. How many readings are larger than the one right before it?",
    ],
    part2: ["Single readings are noisy. Sum each sliding window of three readings, then count how many window sums are larger than the previous window's sum."],
    example: "199\n200\n208\n210\n200\n207\n240\n269\n260\n263",
    gen: gen4, p1: (s) => d4(s, 1), p2: (s) => d4(s, 3),
  },
  {
    title: "Litter Box Grid",
    intro: [
      "The litter box is a grid of digits, each the height of a pile. A low point is a cell strictly lower than all of its orthogonal neighbours (edges have fewer neighbours).",
      "The risk of a low point is its height plus one. Sum the risk of every low point.",
    ],
    part2: ["Piles of height 9 are walls. A basin is a maximal region of connected (orthogonal) cells that are not 9. Multiply the sizes of the three largest basins."],
    example: "2199943210\n3987894921\n9856789892\n8767896789\n9899965678",
    gen: gen5, p1: d5p1, p2: d5p2,
  },
  {
    title: "Yarn Tangle",
    intro: [
      "A kitten has tangled the yarn bracket chains: pairs of ( ), [ ], { } and < > should nest properly. Some lines are corrupted: the first closing bracket that does not match the most recent unclosed opener is the offender. Scores: ) 3, ] 57, } 1197, > 25137.",
      "Sum the score of the first offender on each corrupted line. Complete and merely incomplete lines score nothing.",
    ],
    part2: ["Discard the corrupted lines. Each remaining incomplete line needs closers appended, in order, to finish it. Score a completion: start at 0; for each closer, multiply by 5 then add its value (`)` 1, `]` 2, `}` 3, `>` 4). Fully balanced lines are ignored. There is an odd number of incomplete lines: the answer is the middle score."],
    example: "[({(<(())[]>[[{[]{<()<>>\n[(()[<>])]({[<{<<[]>>(\n{([(<{}[<>[]}>{[]{[(<()>\n(((({<>}<{<{<>}{[]{[]{}\n[[<[([]))<([[{}[[()]]]\n[{[{({}]{}}([{[{{{}}([]\n{<[[]]>}<{[{[{[]{()[[[]\n[<(<(<(<{}))><([]([]()\n<{([([[(<>()){}]>(<<{{\n<{([{{}}[<[[[<>{}]]]>[]]",
    gen: gen6, p1: d6p1, p2: d6p2,
  },
  {
    title: "Laser Dot Chase",
    intro: [
      "A laser pointer draws straight lines across the carpet, each given as x1,y1 -> x2,y2. For now only consider horizontal and vertical lines. At how many points do at least two lines overlap?",
    ],
    part2: ["The pointer also draws diagonals, always at exactly 45°. Consider every line. At how many points do at least two lines overlap?"],
    example: "0,9 -> 5,9\n8,0 -> 0,8\n9,4 -> 3,4\n2,2 -> 2,1\n7,0 -> 7,4\n6,4 -> 2,0\n0,9 -> 2,9\n3,4 -> 1,4\n0,0 -> 8,8\n5,5 -> 8,2",
    gen: gen7, p1: (s) => d7(s, false), p2: (s) => d7(s, true),
  },
  {
    title: "Kitten Census",
    intro: [
      "Each number is the days left until a catoid has a litter. After a litter the mother resets to 6 days, and each litter is one new kitten starting at 8 days. How many catoids are there after 80 days?",
    ],
    part2: ["The household is thriving. How many catoids after 256 days?"],
    example: "3,4,3,1,2",
    gen: gen8, p1: (s) => d8(s, 80), p2: (s) => d8(s, 256),
  },
  {
    title: "Cardboard Box Stacking",
    intro: [
      "Catoids love boxes, and each gift needs wrapping paper. Each line is a box LxWxH. The paper needed is the surface area plus the area of the smallest face as slack. How many square feet in total?",
    ],
    part2: ["Ribbon too: the shortest perimeter around one face, plus a bow equal to the box's volume. How many feet of ribbon in total?"],
    example: "2x3x4\n1x1x10",
    gen: gen9, p1: (s) => d9(s, false), p2: (s) => d9(s, true),
  },
  {
    title: "Cat Door Keypad",
    intro: [
      "The smart cat door opens on a code typed on a 3×3 keypad (1 2 3 / 4 5 6 / 7 8 9). Your finger starts on 5. Each line of U, D, L, R moves it, ignoring moves off the keypad; the button under your finger at the end of each line is one digit of the code.",
    ],
    part2: ["The real keypad is a diamond:\n    1\n  2 3 4\n5 6 7 8 9\n  A B C\n    D\nStart on 5 again. What is the code now?"],
    example: "ULL\nRRDDD\nLURDL\nUUUUD",
    gen: gen10, p1: (s) => d10(s, PAD1), p2: (s) => d10(s, PAD2),
  },
  {
    title: "Mouse Vault Rooms",
    intro: [
      "The mouse vault lists encrypted room names like aaaaa-bbb-z-y-x-123[abxyz]: dashed words, a sector ID, and a five-letter checksum in brackets. A room is real if its checksum is the five most common letters in the name (dashes don't count), most common first, ties broken alphabetically.",
      "Sum the sector IDs of the real rooms.",
    ],
    part2: ["Decrypt each real room name by rotating every letter forward by its sector ID (wrapping z→a, dashes become spaces). One room stores the tuna warehouse stash (it decrypts to tuna-warehouse-stash). What is its sector ID?"],
    example: "aaaaa-bbb-z-y-x-123[abxyz]\na-b-c-d-e-f-g-h-987[abcde]\nnot-a-real-room-404[oarel]\ntotally-real-room-200[decoy]",
    gen: gen11, p1: d11p1, p2: d11p2,
  },
  {
    title: "Nine Lives, Look and Say",
    intro: [
      "Catoids count their lives by saying what they see: 1 is read as \"one 1\" → 11; 11 → 21; 21 → 1211; 1211 → 111221. Repeatedly apply this to your input digits. What is the length of the result after 40 iterations?",
    ],
    part2: ["Nine lives are not enough. What is the length after 50 iterations?"],
    example: "1",
    gen: gen12, p1: (s) => d12(s, 40), p2: (s) => d12(s, 50),
  },
  {
    title: "Scratching Post Elevator",
    intro: [
      "The scratching post has floors. ( goes up one floor, ) goes down one. You start on floor 0. Which floor do you end on?",
    ],
    part2: ["What is the 1-based position of the first character that takes you into the basement (floor -1)?"],
    example: "()())",
    gen: gen13, p1: d13p1, p2: d13p2,
  },
  {
    title: "Hunt Chirps",
    intro: [
      "A bird feeder sends a stream of letters. A start-of-hunt marker is the first run of four letters that are all different. How many characters have been processed when the first marker is complete (the 1-based position of its last letter)?",
    ],
    part2: ["The real hunt marker is fourteen distinct letters. Same question."],
    example: "mjqjpqmgbljsphdztnvjfqwrcgsmlb",
    gen: gen14, p1: (s) => d14(s, 4), p2: (s) => d14(s, 14),
  },
  {
    title: "Prowl Route",
    intro: [
      "You start at 0,0 facing north. Each instruction turns left (L) or right (R) then walks that many blocks. How many blocks away (Manhattan distance) is the final position?",
    ],
    part2: ["Your route crosses itself. Visit every block along the way, not just the corners. How far is the first block you visit twice?"],
    example: "R5, L5, R5, R3",
    gen: gen15, p1: (s) => d15(s, false), p2: (s) => d15(s, true),
  },
  {
    title: "Collar Tags",
    intro: [
      "Each catoid's collar tag is a JSON document. Add up every number in it — inside objects and arrays at any depth. Strings don't count (a string like \"7\" is not a number).",
    ],
    part2: ["Hairballs spoil whatever they touch. Ignore any object (and everything inside it) that has a property with the string value \"hairball\". Arrays containing such objects still count for their other items."],
    example: "[1,{\"mood\":\"hairball\",\"b\":2},3]",
    gen: gen16, p1: (s) => d16(s, false), p2: (s) => d16(s, true),
  },
  {
    title: "Catnip Containers",
    intro: [
      "The first line is how many litres of catnip must be stored; the other lines are container sizes. Containers are filled completely. How many different combinations of containers (distinct by which containers, even when sizes repeat) hold exactly that amount?",
    ],
    part2: ["Using as few containers as possible, how many different combinations of that minimum size are there?"],
    example: "25\n20\n15\n10\n5\n5",
    gen: gen17, p1: d17p1, p2: d17p2,
  },
  {
    title: "Tabby Light Grid",
    intro: [
      "A 100×100 grid of lights (0,0 to 99,99), all off. Each instruction is turn on, turn off, or toggle over a rectangle (inclusive). After all instructions, how many lights are lit?",
    ],
    part2: ["The lights are actually dimmers, all at brightness 0. turn on adds 1, turn off subtracts 1 (never below 0), toggle adds 2. What is the total brightness?"],
    example: "turn on 0,0 through 99,99\ntoggle 0,0 through 99,0\nturn off 49,49 through 50,50",
    gen: gen18, p1: (s) => d18(s, false), p2: (s) => d18(s, true),
  },
  {
    title: "Cat Flap Passwords",
    intro: [
      "Each line is a password policy and a password: `1-3 a: abcde` means the letter a must appear at least 1 and at most 3 times. How many passwords are valid?",
    ],
    part2: ["The policy numbers are actually two 1-based positions: exactly one of them must contain the letter. How many passwords are valid now?"],
    example: "1-3 a: abcde\n1-3 b: cdefg\n2-9 c: ccccccccc",
    gen: gen19, p1: (s) => d19(s, false), p2: (s) => d19(s, true),
  },
  {
    title: "Mouse Maze Jumps",
    intro: [
      "A maze of jump offsets. Start at the first offset. Each step: jump by the offset at your current position, then increase that offset by 1. Leave the list and you're out. How many steps?",
    ],
    part2: ["Strange offsets: after a jump, if the offset was 3 or more, decrease it by 1; otherwise increase by 1. How many steps now?"],
    example: "0\n3\n0\n1\n-3",
    gen: gen20, p1: (s) => d20(s, false), p2: (s) => d20(s, true),
  },
  {
    title: "Cat Cafe Seating",
    intro: [
      "Boarding passes at the cat cafe are binary: the first 7 characters are F (front, 0) or B (back, 1) for the row; the last 3 are L (0) or R (1) for the column. Seat ID = row × 8 + column, i.e. the whole string as a 10-bit binary number. What is the highest seat ID?",
    ],
    part2: ["Your seat is the only one missing from the list; the seats on both sides of it are present. What is your seat ID?"],
    example: "BFFFBBFRRR\nFFFBBBFRRR\nBBFFBBFRLL",
    gen: gen21, p1: d21p1, p2: d21p2,
  },
  {
    title: "Kibble Memory Game",
    intro: [
      "Catoids play a memory game, starting with your numbers. After the starting numbers: look at the previous number. If it was new, say 0. Otherwise say how many turns ago it was last said before that. What is the 2020th number spoken?",
    ],
    part2: ["The game goes on. What is the 3,000,000th number spoken?"],
    example: "0,3,6",
    gen: gen22, p1: (s) => d22(s, 2020), p2: (s) => d22(s, 3000000),
  },
  {
    title: "Spotted Rule",
    intro: [
      "A catoid's coat pattern grows as a one-dimensional cellular automaton. Start with one live cell in an infinite row of dead cells. Each generation, a cell's next state comes from its (left, self, right) neighbourhood read as a 3-bit number 0–7: the next state is that bit of the rule number. Given `rule R` and `steps N`, count the live cells summed across generations 0 through N inclusive (generation 0 is the single starting cell).",
    ],
    part2: ["Look straight down the centre column. Run 10 × N generations (0 through 10N inclusive); how many of those generations have the centre cell alive?"],
    example: "rule 30\nsteps 4",
    gen: gen23, p1: (s) => d23(s, false), p2: (s) => d23(s, true),
  },
  {
    title: "Cat Cradle Packages",
    intro: [
      "The cat-sled must carry packages of various weights in three groups of equal total weight. Group 1 goes in the front seat and must hold as few packages as possible; among such arrangements, choose the one with the smallest quantum entanglement (product of its weights). The remaining packages must be splittable into two further equal groups. What is the quantum entanglement of group 1 in the best arrangement?",
    ],
    part2: ["A fourth group is added: now four groups of equal weight. Same rules. What is the quantum entanglement of group 1?"],
    example: "1\n2\n3\n4\n5\n7\n8\n9\n10\n11",
    gen: gen24, p1: (s) => d24(s, 3), p2: (s) => d24(s, 4),
  },
  {
    title: "Triangular Code Grid",
    intro: [
      "Catoid vault codes fill an infinite grid diagonally: (row 1, col 1), then (2,1), (1,2), then (3,1), (2,2), (1,3), and so on. The first code is 20151125; each next code is the previous × 252533 mod 33554393. Your input names a row and column. What code is there?",
    ],
    part2: ["Use the code you just found, c. The second vault is at row (c mod 9973) + 1, column (⌊c ÷ 9973⌋ mod 9973) + 1. What code is there?"],
    example: "row 3, column 4",
    gen: gen25, p1: d25p1, p2: d25p2,
  },
  {
    title: "Hairball Stack Machine",
    intro: [
      "The cat-feeder runs a tiny program with registers a, b, c, d (all start at 0). Instructions: `cpy x y` copies a value or register x into register y; `inc r` / `dec r` add or subtract 1; `jnz x y` jumps y instructions (relative; may be negative) if x is not zero. Running off the end halts. What value is left in register a?",
    ],
    part2: ["Start again, but with register c set to 1 before the first instruction. What is a now?"],
    example: "cpy 2 a\ndec a\ninc b\njnz a -2\ncpy b a",
    gen: gen26, p1: (s) => d26(s, 0), p2: (s) => d26(s, 1),
  },
  {
    title: "Mouse Stampede",
    intro: [
      "Each line pairs two cat-assigned ranges of mouse holes, like 2-4,6-8. In how many pairs does one range fully contain the other?",
    ],
    part2: ["In how many pairs do the ranges overlap at all?"],
    example: "2-4,6-8\n2-3,4-5\n5-7,7-9\n2-8,3-7\n6-6,4-6\n2-6,4-8",
    gen: gen27, p1: (s) => d27(s, false), p2: (s) => d27(s, true),
  },
  {
    title: "Catwalk Pathfinding",
    intro: [
      "A grid of digits is the cost to step on each cell of the catwalk. Start at the top-left (its cost is not counted) and reach the bottom-right, moving only up, down, left, right. What is the lowest total cost?",
    ],
    part2: ["The real catwalk is the grid tiled 5×5. Each tile to the right or below has costs one higher than the tile before it, wrapping 9 back to 1. What is the lowest total cost now?"],
    example: "1163751742\n1381373672\n2136511328\n3694931569\n7463417111\n1319128137\n1359912421\n3125421639\n1293138521\n2311944581",
    gen: gen28, p1: (s) => d28(s, false), p2: (s) => d28(s, true),
  },
  {
    title: "Cat Circle",
    intro: [
      "N catoids sit in a circle, numbered 1 to N. Starting with cat 1, each cat in turn steals the toy of the cat to its left (next clockwise), and that cat leaves the circle. Cats with no toy are skipped. Which cat ends up with every toy?",
    ],
    part2: ["New rule: each cat steals from the cat directly across the circle: ⌊remaining ÷ 2⌋ places clockwise from the thief. Which cat wins now?"],
    example: "5",
    gen: gen29, p1: d29p1, p2: d29p2,
  },
  {
    title: "The Catoid Council",
    intro: [
      "The final day. The council evaluates expressions with single digits, +, ×(written *) and parentheses, but it has odd manners: + and * have the SAME precedence and are evaluated left to right (parentheses first). Evaluate every line and report the sum of the results.",
    ],
    part2: ["The council reforms: now addition is evaluated before multiplication. Parentheses still go first. Sum of the results?"],
    example: "1 + 2 * 3 + 4 * 5 + 6\n2 * 3 + (4 * 5)",
    gen: gen30, p1: (s) => d30(s, false), p2: (s) => d30(s, true),
  },
  {
    title: "Yarn Knots",
    intro: [
      "A strand of yarn is a string of letters. Neighbouring letters of the same type but opposite case (like `aA` or `Bb`) knot up and vanish; the strand closes up and it can happen again. How many letters are left when nothing more can vanish?",
    ],
    part2: ["Pick one letter type (both cases) and snip it out of the strand entirely before untangling. What is the shortest strand you can end up with?"],
    example: "dabAcCaCBAcCcaDA",
    gen: gen31, p1: d31p1, p2: d31p2,
  },
  {
    title: "Purr Pattern",
    intro: [
      "A catoid purrs a digit sequence by describing the last one aloud: `211` is read \"one 2, two 1s\" and becomes `1221`. Starting from your input, apply this 40 times. How long is the result?",
    ],
    part2: ["Apply it 50 times instead. How long is the result now?"],
    example: "1",
    gen: gen32, p1: (s) => d32(s, 40), p2: (s) => d32(s, 50),
  },
  {
    title: "Treat Budget",
    intro: [
      "The treat jar ledger lists amounts. Exactly two of them add up to 2020. Multiply those two together.",
    ],
    part2: ["Actually exactly three of them add up to 2020. Multiply those three together."],
    example: "1721\n979\n366\n299\n675\n1456",
    gen: gen33, p1: (s) => d33(s, 2), p2: (s) => d33(s, 3),
  },
  {
    title: "Tuna Tell-Tale",
    intro: [
      "A stream of letters carries a start-of-message marker: the first run of 4 consecutive letters that are all different. How many characters have been read when the first marker is complete (i.e. the 1-based position of its last letter)?",
    ],
    part2: ["Real messages begin after 14 distinct letters in a row. What is the position now?"],
    example: "mjqjpqmgbljsphdztnvjfqwrcgsmlb",
    gen: gen34, p1: (s) => d34(s, 4), p2: (s) => d34(s, 14),
  },
  {
    title: "Cat Tent Triangles",
    intro: [
      "Each line lists three side lengths for a cardboard tent panel. A panel only stands if every pair of sides is strictly longer than the third. How many listed panels are possible?",
    ],
    part2: ["The panels are really listed down the columns, three rows at a time: the first column of each group of three rows is one triangle, then the second, then the third. How many are possible now?"],
    example: "5 10 25\n3 4 5\n 6 8 10\n101 301 501\n102 302 502\n103 303 503",
    gen: gen35, p1: (s) => d35(s, false), p2: (s) => d35(s, true),
  },
];

export function inputFor(seed, day) {
  return DAYS[day - 1].gen(makeRng(`${seed}:${day}`));
}
export function answerFor(seed, day, part, input = inputFor(seed, day)) {
  const d = DAYS[day - 1];
  return String(part === 1 ? d.p1(input) : d.p2(input));
}
export const exampleAnswer = (day, part) => {
  const d = DAYS[day - 1];
  return String(part === 1 ? d.p1(d.example) : d.p2(d.example));
};
export { d20, d29p1, d29p2, codeAt, d12, d6classify };
