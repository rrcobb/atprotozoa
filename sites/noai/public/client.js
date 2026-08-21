(function () {
  const WS = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
  const AV = "https://public.api.bsky.app/xrpc/";
  const MAX_FEED = 150;
  const BANNED = /[ai]/i;

  // Require a little real Latin prose, not just an emoji or a bare @mention.
  // This is what keeps the feed from filling up with CJK/Arabic/Cyrillic
  // posts that trivially have no "a" or "i" because they have no Latin
  // letters at all — those aren't interesting hits, they're a different
  // alphabet. It also means a post with one banned word buried in a URL or
  // handle still correctly disqualifies, since the whole text is tested.
  function qualifies(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    const letters = t.match(/[A-Za-z]/g) || [];
    if (letters.length < 6) return false;
    if (BANNED.test(t)) return false;
    const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length < 3) return false;
    return true;
  }

  const state = {
    socket: null,
    connected: false,
    seen: 0,
    qualified: 0,
    paused: false,
    feed: [], // {uri, did, rkey, text, createdAt, profile}
    profileCache: new Map(), // did -> {handle, displayName, avatar} | null (in flight or failed)
    listeners: new Set(),
  };

  function emit() {
    state.listeners.forEach((fn) => {
      try {
        fn(snapshot());
      } catch {}
    });
  }

  function snapshot() {
    return {
      connected: state.connected,
      seen: state.seen,
      qualified: state.qualified,
      paused: state.paused,
      feed: state.feed,
    };
  }

  async function fetchProfile(did) {
    if (state.profileCache.has(did)) return state.profileCache.get(did);
    const p = (async () => {
      try {
        const r = await fetch(AV + "app.bsky.actor.getProfile?actor=" + encodeURIComponent(did));
        if (!r.ok) return null;
        const d = await r.json();
        return { handle: d.handle, displayName: d.displayName || d.handle, avatar: d.avatar || "" };
      } catch {
        return null;
      }
    })();
    state.profileCache.set(did, p);
    const resolved = await p;
    state.profileCache.set(did, resolved);
    return resolved;
  }

  function connect() {
    if (state.socket) return;
    state.socket = new WebSocket(WS);
    state.socket.onopen = () => {
      state.connected = true;
      emit();
    };
    state.socket.onmessage = async (e) => {
      if (state.paused) return;
      let x;
      try {
        x = JSON.parse(e.data);
      } catch {
        return;
      }
      const c = x.commit,
        r = c && c.record;
      if (x.kind !== "commit" || !c || c.operation !== "create" || c.collection !== "app.bsky.feed.post" || !r) return;
      state.seen++;
      if (state.seen % 25 === 0) emit();
      if (!qualifies(r.text)) return;

      state.qualified++;
      const rkey = c.rkey;
      const uri = `at://${x.did}/app.bsky.feed.post/${rkey}`;
      const entry = {
        uri,
        did: x.did,
        rkey,
        text: String(r.text).trim(),
        createdAt: r.createdAt || new Date(x.time_us / 1000).toISOString(),
        profile: state.profileCache.get(x.did) || null,
      };
      state.feed.unshift(entry);
      if (state.feed.length > MAX_FEED) state.feed.length = MAX_FEED;
      emit();

      const prof = await fetchProfile(x.did);
      entry.profile = prof;
      emit();
    };
    state.socket.onclose = () => {
      state.connected = false;
      state.socket = null;
      emit();
      setTimeout(connect, 2000);
    };
    state.socket.onerror = () => {};
  }

  function setPaused(p) {
    state.paused = !!p;
    emit();
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    fn(snapshot());
    return () => state.listeners.delete(fn);
  }

  // Exposed so the compose box can reuse the exact same rule the feed uses.
  function testText(text) {
    const t = String(text || "");
    const offenders = [];
    for (let i = 0; i < t.length; i++) {
      if (BANNED.test(t[i])) offenders.push(i);
    }
    return { ok: qualifies(t), offenders };
  }

  window.noaiClient = { connect, subscribe, setPaused, testText, snapshot };
})();
