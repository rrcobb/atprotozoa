(function () {
  const AV = "https://public.api.bsky.app/xrpc/";
  const WS = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
  const MAX_BUFFER = 2000;
  const sessions = new Map();

  async function get(path, params) {
    const u = new URL(AV + path);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u);
    return r.ok ? r.json() : null;
  }

  // paginate app.bsky.graph.getFollows for the target's whole follow list
  async function allFollows(actor) {
    let out = [], cursor = "";
    for (let i = 0; i < 25; i++) {
      const d = await get("app.bsky.graph.getFollows", { actor, limit: "100", ...(cursor ? { cursor } : {}) });
      if (!d) break;
      out = out.concat(d.follows || []);
      cursor = d.cursor;
      if (!cursor) break;
    }
    return out;
  }

  function pushWords(s, text, author, uri) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return;
    // a separator beat between posts so the stream doesn't read as one run-on sentence
    if (s.buffer.length) s.buffer.push({ w: "·", sep: true });
    for (const w of words) {
      s.buffer.push({ w, h: author.handle, d: author.displayName || author.handle, a: author.avatar || "", uri });
    }
    s.wordsSeen += words.length;
    const overflow = s.buffer.length - MAX_BUFFER;
    if (overflow > 0) {
      s.buffer.splice(0, overflow);
      s.cursor = Math.max(0, s.cursor - overflow);
    }
  }

  function connectSocket(s) {
    if (s.socket) return;
    s.socket = new WebSocket(WS);
    s.socket.onopen = () => { s.connected = true; };
    s.socket.onmessage = (e) => {
      try {
        const x = JSON.parse(e.data);
        const c = x.commit, r = c && c.record;
        if (x.kind !== "commit" || !c || c.operation !== "create" || c.collection !== "app.bsky.feed.post" || !r) return;
        const who = s.follows.get(x.did);
        if (!who) return;
        const uri = `at://${x.did}/app.bsky.feed.post/${c.rkey}`;
        pushWords(s, r.text, who, uri);
      } catch {}
    };
    s.socket.onclose = () => { s.connected = false; s.socket = null; setTimeout(() => connectSocket(s), 2000); };
    s.socket.onerror = () => {};
  }

  async function connect(handle) {
    let s = sessions.get(handle);
    if (s) return status(handle);
    s = { buffer: [], cursor: 0, follows: new Map(), wordsSeen: 0, connected: false, socket: null, status: "loading", profile: null };
    sessions.set(handle, s);
    const p = await get("app.bsky.actor.getProfile", { actor: handle });
    if (!p || !p.did) {
      s.status = "error";
      s.error = "that handle doesn't resolve to an account";
      return status(handle);
    }
    s.profile = { did: p.did, handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" };
    const follows = await allFollows(p.did);
    follows.forEach((f) => s.follows.set(f.did, { handle: f.handle, displayName: f.displayName || f.handle, avatar: f.avatar || "" }));
    s.status = s.follows.size ? "ready" : "empty";
    connectSocket(s);
    preload(s, follows.slice(0, 15));
    return status(handle);
  }

  // the firehose can take a while to produce a post from a small follow
  // list — seed the buffer with each of the first 15 follows' latest post
  // so the reader isn't just sitting on a blank screen waiting.
  async function preload(s, people) {
    const posts = await Promise.all(people.map((f) => get("app.bsky.feed.getAuthorFeed", { actor: f.did, limit: "1" }).catch(() => null)));
    for (const d of posts) {
      const item = d && d.feed && d.feed[0];
      const post = item && item.post;
      if (!post) continue;
      const who = s.follows.get(post.author.did);
      if (!who) continue;
      pushWords(s, post.record && post.record.text, who, post.uri);
    }
  }

  function status(handle) {
    const s = sessions.get(handle);
    if (!s) return { status: "error", error: "not connected" };
    return {
      status: s.status,
      error: s.error,
      profile: s.profile,
      followCount: s.follows.size,
      bufferLength: s.buffer.length,
      wordsSeen: s.wordsSeen,
      connected: s.connected,
    };
  }

  // pulls the next entry off the loop cursor, wrapping around whatever's
  // currently buffered — this is the "keep looping" part of the brief.
  function next(handle) {
    const s = sessions.get(handle);
    if (!s || !s.buffer.length) return null;
    if (s.cursor >= s.buffer.length) s.cursor = 0;
    const entry = s.buffer[s.cursor];
    s.cursor++;
    return entry;
  }

  function reset(handle) {
    const s = sessions.get(handle);
    if (s) s.cursor = 0;
  }

  window.speedhoseClient = { connect, status, next, reset };
})();
