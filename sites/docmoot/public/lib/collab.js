// collab.js — the live-sync half of docmoot: owns the WebSocket to a doc's
// Durable Object, keeps a local shadow of the confirmed text, and applies a
// small operational-transform dance so two people typing in different parts
// of the same textarea don't stomp each other.
//
// The op shape and the transform function (rebase) are a duplicate of
// src/index.ts's — same reasoning as sites/logs/sites/didscope duplicating
// small bits of shared logic within one site: this runs in the browser, that
// runs in the Worker/DO, there's no way to share a module between the two
// without a build step, and it's ~15 lines. Keep them in sync if you change
// the op semantics.
//
// Client-side OT bookkeeping, one in-flight op + one buffered op at a time
// (the classic ot.js/ShareJS "synchronized / awaitingConfirm /
// awaitingWithBuffer" client state machine, simplified since we recompute the
// buffer fresh by diffing on every local edit instead of composing ops
// incrementally):
//   shadow            — text last confirmed by the server
//   outstanding       — the one op sent but not yet acked, or null
//   buffer            — further local edits made while outstanding is
//                        in flight, computed fresh each time, or null
// Overlapping-edit collisions (two people editing the exact same characters
// at once) degrade gracefully rather than corrupt anything — see rebase()'s
// comment — and a periodic resync (every 20s) self-heals any drift that
// leaves.

function applyOp(text, op) {
  const p = Math.max(0, Math.min(op.p, text.length));
  const d = Math.max(0, Math.min(op.d, text.length - p));
  return text.slice(0, p) + op.i + text.slice(p + d);
}

function diffOp(oldStr, newStr) {
  if (oldStr === newStr) return null;
  const maxStart = Math.min(oldStr.length, newStr.length);
  let start = 0;
  while (start < maxStart && oldStr[start] === newStr[start]) start++;
  let endOld = oldStr.length;
  let endNew = newStr.length;
  while (endOld > start && endNew > start && oldStr[endOld - 1] === newStr[endNew - 1]) {
    endOld--;
    endNew--;
  }
  return { p: start, d: endOld - start, i: newStr.slice(start, endNew) };
}

// Adjusts `op` (defined against the text before `applied`) so it applies to
// the text after `applied`. Overlapping edits clamp to just after `applied`'s
// insert rather than risk deleting the wrong span.
function rebase(op, applied) {
  const appliedEnd = applied.p + applied.d;
  const delta = applied.i.length - applied.d;
  if (appliedEnd <= op.p) return { p: op.p + delta, d: op.d, i: op.i };
  if (op.p + op.d <= applied.p) return op;
  return { p: Math.max(0, applied.p + applied.i.length), d: 0, i: op.i };
}

const RESYNC_MS = 20_000;
const FLUSH_DEBOUNCE_MS = 150;

export function attachCollab(textareaEl, { docId, mount, onInit, onPresence, onTitle, onStatus }) {
  let ws = null;
  let myId = null;
  let everConnected = false;
  let shadow = "";
  let shadowVersion = 0;
  let outstanding = null;
  let buffer = null;
  let flushTimer = null;
  let resyncTimer = null;
  let reconnectDelay = 1000;
  let closedByUs = false;
  let pendingName = "";

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  }

  function flush() {
    const current = textareaEl.value;
    if (outstanding === null) {
      const op = diffOp(shadow, current);
      if (!op) return;
      outstanding = op;
      send({ t: "edit", v: shadowVersion, op });
    } else {
      const afterOutstanding = applyOp(shadow, outstanding);
      buffer = diffOp(afterOutstanding, current);
    }
  }

  function spliceIntoTextarea(op) {
    const el = textareaEl;
    const focused = document.activeElement === el;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = applyOp(el.value, op);
    if (focused) {
      const shift = (pos) => {
        if (pos <= op.p) return pos;
        if (pos <= op.p + op.d) return op.p + op.i.length;
        return pos + (op.i.length - op.d);
      };
      el.selectionStart = shift(start);
      el.selectionEnd = shift(end);
    }
  }

  function handleInit(msg) {
    const firstInit = !everConnected;
    everConnected = true;
    myId = msg.id;
    shadow = msg.text;
    shadowVersion = msg.version;
    outstanding = null;
    buffer = null;

    if (firstInit) {
      textareaEl.value = shadow;
    } else if (textareaEl.value !== shadow) {
      // Reconnect with local edits made while offline (or racing the socket
      // drop) — keep them, resend as a fresh op against the new shadow.
      const op = diffOp(shadow, textareaEl.value);
      if (op) {
        outstanding = op;
        send({ t: "edit", v: shadowVersion, op });
      }
    }
    if (pendingName) send({ t: "hello", name: pendingName });
    onInit && onInit(msg);
    onPresence && onPresence(msg.users);
  }

  function handleOp(msg) {
    const { op, v, from } = msg;
    if (from === myId) {
      shadow = applyOp(shadow, op);
      shadowVersion = v;
      outstanding = null;
      if (buffer) {
        const toSend = buffer;
        buffer = null;
        outstanding = toSend;
        send({ t: "edit", v: shadowVersion, op: toSend });
      }
      return;
    }
    let toApply = op;
    if (outstanding) {
      const nextOutstanding = rebase(outstanding, toApply);
      toApply = rebase(toApply, outstanding);
      outstanding = nextOutstanding;
    }
    if (buffer) {
      const nextBuffer = rebase(buffer, toApply);
      toApply = rebase(toApply, buffer);
      buffer = nextBuffer;
    }
    shadow = applyOp(shadow, op);
    shadowVersion = v;
    spliceIntoTextarea(toApply);
  }

  function connect() {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${scheme}//${location.host}${mount}/api/doc/${encodeURIComponent(docId)}/ws`);
    onStatus && onStatus(everConnected ? "reconnecting" : "connecting");

    ws.addEventListener("open", () => {
      reconnectDelay = 1000;
      onStatus && onStatus("open");
    });
    ws.addEventListener("message", (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.t === "init") handleInit(msg);
      else if (msg.t === "op") handleOp(msg);
      else if (msg.t === "title") onTitle && onTitle(msg.value, msg.from !== myId);
      else if (msg.t === "presence") onPresence && onPresence(msg.users);
    });
    const onDown = () => {
      if (closedByUs) return;
      onStatus && onStatus("reconnecting");
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 10_000);
    };
    ws.addEventListener("close", onDown);
    ws.addEventListener("error", onDown);
  }

  textareaEl.addEventListener("input", scheduleFlush);
  connect();
  resyncTimer = setInterval(() => send({ t: "resync" }), RESYNC_MS);

  return {
    setName(name) {
      pendingName = name || "";
      send({ t: "hello", name: pendingName });
    },
    setTitle(value) {
      send({ t: "title", value });
    },
    close() {
      closedByUs = true;
      clearTimeout(flushTimer);
      clearInterval(resyncTimer);
      ws && ws.close();
    },
  };
}
