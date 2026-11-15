// lobby.js — who's online, and a direct line to them.
//
// There is no game server. Presence and the WebRTC handshake ride on ntfy.sh,
// a public pub/sub service with open CORS (POST a text body to
// https://ntfy.sh/<topic>, read https://ntfy.sh/<topic>/sse). Everyone in the
// lobby posts a small "hi" every 30s; the lobby is whoever said hi in the last
// 75s. A challenge is an offer/answer pair posted to the same topic; once the
// peers connect, the fight itself is peer-to-peer over RTCDataChannel and never
// touches ntfy again (anonymous ntfy allows ~1 post per 5s sustained, far too
// slow for a game, fine for presence and a handshake).

const TOPIC = "bisks-simcluster-arcade-lobby-v1";
const BASE = "https://ntfy.sh/" + TOPIC;
const HEARTBEAT_MS = 30000; // ntfy's anonymous rate (1 post / 5s) leaves plenty of room at this cadence
const STALE_MS = 75000; // two missed heartbeats plus slack
const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];

const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");

// A Conn wraps the two data channels (r = reliable events, u = unreliable snapshots).
function makeConn(pc, initiator) {
  const conn = { initiator, pc, onopen: null, onclose: null, open: false, ch: {} };
  // Messages that land before anyone has set onmessage (the other side can say
  // "ready" the instant the channel opens) wait in a queue and flush on assignment.
  let handler = null;
  const queue = [];
  Object.defineProperty(conn, "onmessage", {
    get: () => handler,
    set: (fn) => { handler = fn; while (handler && queue.length) handler(queue.shift()); },
  });
  const wire = (ch) => {
    conn.ch[ch.label] = ch;
    ch.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (handler) handler(m); else queue.push(m);
    };
    ch.onopen = () => {
      if (conn.ch.r && conn.ch.u && conn.ch.r.readyState === "open" && conn.ch.u.readyState === "open" && !conn.open) {
        conn.open = true;
        conn.onopen && conn.onopen();
      }
    };
    ch.onclose = () => { if (conn.open) { conn.open = false; conn.onclose && conn.onclose(); } };
  };
  conn.wire = wire;
  conn.send = (obj, reliable = true) => {
    const ch = conn.ch[reliable ? "r" : "u"];
    if (ch && ch.readyState === "open") ch.send(JSON.stringify(obj));
  };
  conn.close = () => { try { pc.close(); } catch {} if (conn.open) { conn.open = false; conn.onclose && conn.onclose(); } };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState) && conn.open) { conn.open = false; conn.onclose && conn.onclose(); }
  };
  if (initiator) {
    wire(pc.createDataChannel("r"));
    wire(pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 }));
  } else {
    pc.ondatachannel = (e) => wire(e.channel);
  }
  return conn;
}

function gathered(pc, ms = 4000) {
  return new Promise((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const done = () => { pc.removeEventListener("icegatheringstatechange", chk); res(); };
    const chk = () => { if (pc.iceGatheringState === "complete") done(); };
    pc.addEventListener("icegatheringstatechange", chk);
    setTimeout(done, ms);
  });
}

// ntfy bodies cap at 4096 bytes. A description with every candidate can brush
// that, so drop IPv6 candidates if (and only if) it's too big.
function sdpFor(pc) {
  let sdp = pc.localDescription.sdp;
  const pack = (s) => JSON.stringify({ type: pc.localDescription.type, sdp: s });
  if (pack(sdp).length > 3000) sdp = sdp.split("\r\n").filter((l) => !(l.startsWith("a=candidate") && /\s[0-9a-f]*:[0-9a-f:]+\s/i.test(l))).join("\r\n");
  return pack(sdp);
}

export function createLobby({ onPeers, onChallenge, onChallengeGone, onStatus }) {
  const id = rid();
  const peers = new Map(); // id -> { ...presence, seen }
  const pending = new Map(); // from id -> { offer, fighter, t }
  const waiting = new Map(); // to id -> { pc, conn, resolve, reject }
  let me = null; // { fighter, busy }
  let es = null, beat = null, prune = null, started = false;

  const post = (obj) =>
    fetch(BASE, { method: "POST", body: JSON.stringify(obj), keepalive: true }).then((r) => {
      if (!r.ok) throw new Error("lobby post " + r.status);
    });

  const hi = () => {
    if (!me) return;
    post({ t: "hi", id, fighter: me.fighter, busy: !!me.busy }).catch(() => onStatus && onStatus("lobby is rate-limited, retrying…"));
  };

  const emitPeers = () => onPeers && onPeers([...peers.values()].sort((a, b) => a.seen - b.seen));

  function handle(m) {
    if (!m || m.id === id || m.from === id) return;
    if (m.t === "hi") {
      peers.set(m.id, { id: m.id, fighter: m.fighter, busy: !!m.busy, seen: Date.now() });
      emitPeers();
    } else if (m.t === "bye") {
      peers.delete(m.id);
      emitPeers();
    } else if (m.t === "offer" && m.to === id) {
      if (me && me.busy) { post({ t: "decline", to: m.from, from: id }).catch(() => {}); return; }
      pending.set(m.from, { offer: m.sdp, fighter: m.fighter, t: Date.now() });
      onChallenge && onChallenge({ from: m.from, fighter: m.fighter });
    } else if (m.t === "answer" && m.to === id) {
      const w = waiting.get(m.from);
      if (w) w.pc.setRemoteDescription(JSON.parse(m.sdp)).catch((e) => w.reject(e));
    } else if (m.t === "decline" && m.to === id) {
      const w = waiting.get(m.from);
      if (w) { waiting.delete(m.from); w.conn.close(); w.reject(new Error("declined")); }
    } else if (m.t === "cancel" && m.to === id) {
      pending.delete(m.from);
      onChallengeGone && onChallengeGone(m.from);
    }
  }

  function start(initial) {
    me = initial;
    if (started) return;
    started = true;
    // since=3m replays recent hellos so a new arrival sees who's already here
    es = new EventSource(BASE + "/sse?since=3m");
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.event !== "message") return;
        handle(JSON.parse(ev.message));
      } catch {}
    };
    es.onopen = () => onStatus && onStatus("");
    es.onerror = () => onStatus && onStatus("reconnecting to the lobby…");
    hi();
    beat = setInterval(hi, HEARTBEAT_MS);
    prune = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [k, p] of peers) if (now - p.seen > STALE_MS) { peers.delete(k); changed = true; }
      for (const [k, p] of pending) if (now - p.t > 60000) { pending.delete(k); onChallengeGone && onChallengeGone(k); }
      if (changed) emitPeers();
    }, 5000);
  }

  function stop() {
    if (!started) return;
    started = false;
    try { es.close(); } catch {}
    clearInterval(beat); clearInterval(prune);
    post({ t: "bye", id }).catch(() => {});
    peers.clear();
    emitPeers();
  }

  function setMe(next) {
    const wasBusy = me && me.busy;
    me = next;
    if (started && wasBusy !== !!next.busy) hi();
  }

  async function challenge(toId) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const conn = makeConn(pc, true);
    const result = new Promise((resolve, reject) => {
      waiting.set(toId, { pc, conn, reject });
      conn.onopen = () => { waiting.delete(toId); resolve(conn); };
      setTimeout(() => { if (waiting.has(toId)) { waiting.delete(toId); conn.close(); reject(new Error("no answer")); post({ t: "cancel", to: toId, from: id }).catch(() => {}); } }, 45000);
    });
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    await post({ t: "offer", to: toId, from: id, fighter: me.fighter, sdp: sdpFor(pc) });
    return result;
  }

  async function accept(fromId) {
    const p = pending.get(fromId);
    if (!p) throw new Error("that challenge expired");
    pending.delete(fromId);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const conn = makeConn(pc, false);
    const opened = new Promise((resolve, reject) => {
      conn.onopen = () => resolve(conn);
      setTimeout(() => reject(new Error("couldn't connect")), 30000);
    });
    await pc.setRemoteDescription(JSON.parse(p.offer));
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await post({ t: "answer", to: fromId, from: id, sdp: sdpFor(pc) });
    return { conn: await opened, fighter: p.fighter };
  }

  function decline(fromId) {
    pending.delete(fromId);
    post({ t: "decline", to: fromId, from: id }).catch(() => {});
  }

  window.addEventListener("pagehide", () => { if (started) post({ t: "bye", id }).catch(() => {}); });

  return { id, start, stop, setMe, challenge, accept, decline, peers };
}
