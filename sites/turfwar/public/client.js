(function () {
  "use strict";

  const WS = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

  // Static faction roster. Real bsky post volume decides who wins — this
  // table only decides which color+label a lang code maps to. Anything not
  // listed falls into the "everyone else" catch-all so the map never has an
  // unrepresented faction and never grows an unbounded one.
  const FACTIONS = [
    { code: "en", label: "english", color: "#4df3ff" },
    { code: "ja", label: "japanese", color: "#ff4dd8" },
    { code: "pt", label: "portuguese", color: "#4dff8f" },
    { code: "es", label: "spanish", color: "#ffe14d" },
    { code: "ko", label: "korean", color: "#ff9a4d" },
    { code: "de", label: "german", color: "#c08dff" },
    { code: "fr", label: "french", color: "#5b8bff" },
    { code: "other", label: "everyone else", color: "#ff3355" },
  ];
  const CODE_TO_FACTION = new Map(FACTIONS.map((f, i) => [f.code, i]));
  const OTHER_IDX = FACTIONS.length - 1;

  const W = 32, H = 18;
  const N = W * H;
  const MAX_HEALTH = 3;
  const MAX_BURSTS = 220; // bounds per-frame canvas draw cost, not a data cap

  const owner = new Uint8Array(N); // 0 = neutral, else factionIdx+1
  const health = new Uint8Array(N);
  const stats = FACTIONS.map(() => ({ strikes: 0, claims: 0, seizes: 0 }));
  let totalStrikes = 0;
  let bursts = [];
  let log = [];
  let dominationShownFor = -1;
  let connected = false;
  let socket = null;
  let listeners = [];

  function idx(x, y) { return y * W + x; }

  function langToFaction(langs) {
    const raw = Array.isArray(langs) && langs.length ? String(langs[0]) : "";
    const code = raw.split("-")[0].toLowerCase();
    return CODE_TO_FACTION.has(code) ? CODE_TO_FACTION.get(code) : OTHER_IDX;
  }

  function neighbors(x, y) {
    const out = [];
    if (x > 0) out.push(idx(x - 1, y));
    if (x < W - 1) out.push(idx(x + 1, y));
    if (y > 0) out.push(idx(x, y - 1));
    if (y < H - 1) out.push(idx(x, y + 1));
    return out;
  }

  // Frontier = neutral/enemy cells adjacent to a cell this faction already
  // holds. Scanning all 576 cells per strike is trivially cheap in JS even
  // at firehose volume, so no incremental index is needed.
  function pickTarget(factionIdx) {
    const owned = [];
    const neutral = [];
    const frontier = [];
    for (let i = 0; i < N; i++) {
      if (owner[i] === factionIdx + 1) owned.push(i);
      else if (owner[i] === 0) neutral.push(i);
    }
    if (owned.length) {
      const seen = new Set();
      for (const o of owned) {
        const x = o % W, y = (o / W) | 0;
        for (const n of neighbors(x, y)) {
          if (owner[n] !== factionIdx + 1 && !seen.has(n)) { seen.add(n); frontier.push(n); }
        }
      }
    }
    if (frontier.length && Math.random() < 0.75) return frontier[(Math.random() * frontier.length) | 0];
    if (neutral.length && (!owned.length || Math.random() < 0.5)) return neutral[(Math.random() * neutral.length) | 0];
    return (Math.random() * N) | 0;
  }

  function factionLabel(i) { return FACTIONS[i] ? FACTIONS[i].label : "?"; }

  function pushLog(text, colorIdx) {
    log.unshift({ text, color: FACTIONS[colorIdx].color, t: Date.now() });
    if (log.length > 60) log.length = 60;
    emit("log");
  }

  function addBurst(x, y, factionIdx, kind) {
    if (bursts.length >= MAX_BURSTS) bursts.shift();
    bursts.push({ x, y, color: FACTIONS[factionIdx].color, kind, t0: performance.now() });
  }

  function strike(factionIdx) {
    totalStrikes++;
    stats[factionIdx].strikes++;
    const cell = pickTarget(factionIdx);
    const x = cell % W, y = (cell / W) | 0;
    const cur = owner[cell];
    if (cur === 0) {
      owner[cell] = factionIdx + 1;
      health[cell] = MAX_HEALTH;
      stats[factionIdx].claims++;
      addBurst(x, y, factionIdx, "claim");
    } else if (cur === factionIdx + 1) {
      health[cell] = Math.min(MAX_HEALTH, health[cell] + 1);
      addBurst(x, y, factionIdx, "reinforce");
    } else {
      health[cell] -= 1;
      if (health[cell] <= 0) {
        const prev = cur - 1;
        owner[cell] = factionIdx + 1;
        health[cell] = MAX_HEALTH;
        stats[factionIdx].seizes++;
        addBurst(x, y, factionIdx, "capture");
        pushLog(`${factionLabel(factionIdx).toUpperCase()} seized (${x},${y}) from ${factionLabel(prev)}`, factionIdx);
        emit("capture", factionIdx);
      } else {
        addBurst(x, y, factionIdx, "hit");
      }
    }
    checkDomination();
    emit("strike");
  }

  function counts() {
    const c = FACTIONS.map(() => 0);
    let neutral = 0;
    for (let i = 0; i < N; i++) { if (owner[i]) c[owner[i] - 1]++; else neutral++; }
    return { c, neutral };
  }

  function checkDomination() {
    const { c } = counts();
    let leader = 0;
    for (let i = 1; i < c.length; i++) if (c[i] > c[leader]) leader = i;
    if (c[leader] / N >= 0.55) {
      if (dominationShownFor !== leader) {
        dominationShownFor = leader;
        emit("domination", leader);
      }
    } else if (dominationShownFor !== -1 && c[leader] / N < 0.5) {
      dominationShownFor = -1;
    }
  }

  function reset() {
    owner.fill(0);
    health.fill(0);
    stats.forEach((s) => { s.strikes = 0; s.claims = 0; s.seizes = 0; });
    totalStrikes = 0;
    bursts = [];
    log = [];
    dominationShownFor = -1;
    emit("reset");
  }

  function connectSocket() {
    if (socket) return;
    socket = new WebSocket(WS);
    socket.onopen = () => { connected = true; emit("connection"); };
    socket.onmessage = (e) => {
      let x;
      try { x = JSON.parse(e.data); } catch { return; }
      const c = x.commit, r = c && c.record;
      if (x.kind !== "commit" || !c || c.operation !== "create" || c.collection !== "app.bsky.feed.post" || !r) return;
      strike(langToFaction(r.langs));
    };
    socket.onclose = () => { connected = false; socket = null; emit("connection"); setTimeout(connectSocket, 2000); };
    socket.onerror = () => {};
  }

  function emit(kind, payload) { listeners.forEach((fn) => fn(kind, payload)); }
  function on(fn) { listeners.push(fn); }

  window.turfwar = {
    FACTIONS, W, H, N,
    owner, health,
    on,
    connect: connectSocket,
    isConnected: () => connected,
    counts,
    stats: () => stats,
    totalStrikes: () => totalStrikes,
    bursts: () => bursts,
    log: () => log,
    reset,
  };
})();
