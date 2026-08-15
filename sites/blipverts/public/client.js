(function () {
  const AV = "https://public.api.bsky.app/xrpc/";
  const WS = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
  // speedhose caps its buffer at 2000 words; blipverts holds whole posts, so
  // it caps at a post count instead — 300 posts is comfortably north of what
  // a 2000-word buffer of typical bsky posts would hold.
  const MAX_BUFFER = 300;
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

  // push one WHOLE post into the buffer as a single entry — this is the
  // thing that's different from speedhose, which explodes text into one
  // buffer slot per word. blipverts flashes the whole post at once, held on
  // screen for (word count / wpm) so the reading pace matches speedhose
  // exactly, just chunked into full posts instead of one word at a time.
  function pushPost(s, text, author, uri, qd) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const wordCount = clean.split(" ").filter(Boolean).length;
    s.buffer.push({ text: clean, words: wordCount, h: author.handle, d: author.displayName || author.handle, a: author.avatar || "", uri, qd: qd || 0 });
    s.wordsSeen += wordCount;
    const overflow = s.buffer.length - MAX_BUFFER;
    if (overflow > 0) {
      s.buffer.splice(0, overflow);
      s.cursor = Math.max(0, s.cursor - overflow);
    }
  }

  // astra.fail asked speedhose for a way to skip media/quote posts, and (as
  // a stretch) to mark how many quote-levels deep a post came from — blipverts
  // keeps those same options. embed shape reference:
  // app.bsky.embed.{images,video,record,recordWithMedia}.
  function hasMedia(embed) {
    if (!embed) return false;
    if (embed.$type === "app.bsky.embed.images" || embed.$type === "app.bsky.embed.video") return true;
    if (embed.$type === "app.bsky.embed.recordWithMedia") {
      const mt = embed.media && embed.media.$type;
      return mt === "app.bsky.embed.images" || mt === "app.bsky.embed.video";
    }
    return false;
  }
  function isQuote(embed) {
    return !!embed && (embed.$type === "app.bsky.embed.record" || embed.$type === "app.bsky.embed.recordWithMedia");
  }
  function shouldSkip(s, rawEmbed) {
    if (s.opts.skipMedia && hasMedia(rawEmbed)) return true;
    if (s.opts.skipQuotes && isQuote(rawEmbed)) return true;
    return false;
  }

  // fetch the hydrated PostView for a uri we just saw on the firehose — the
  // raw commit record only carries a {uri,cid} ref for a quote, not its text.
  // getPosts returns a fully hydrated, recursively-nested embed view, so one
  // call is enough to walk an arbitrary quote-of-quote-of-quote chain.
  async function fetchPostView(uri) {
    const d = await get("app.bsky.feed.getPosts", { uris: uri });
    return (d && d.posts && d.posts[0]) || null;
  }

  const MAX_QUOTE_DEPTH = 5;

  // walk a hydrated embed view, collecting {depth, text, author, uri} for
  // every quoted post nested inside it, however deep the AppView hydrated it.
  function extractQuoteChain(embedView, depth, out) {
    if (!embedView || depth > MAX_QUOTE_DEPTH) return;
    let recordView = null;
    if (embedView.$type === "app.bsky.embed.record#view") recordView = embedView.record;
    else if (embedView.$type === "app.bsky.embed.recordWithMedia#view") recordView = embedView.record && embedView.record.record;
    if (!recordView || recordView.$type !== "app.bsky.embed.record#viewRecord") return;
    const text = recordView.value && recordView.value.text;
    if (text) out.push({ depth, text, author: recordView.author, uri: recordView.uri });
    (recordView.embeds || []).forEach((e) => extractQuoteChain(e, depth + 1, out));
  }

  function expandQuotes(s, embedView) {
    if (!s.opts.showQuotes || !embedView) return;
    const chain = [];
    extractQuoteChain(embedView, 1, chain);
    for (const item of chain) {
      const a = item.author || {};
      pushPost(s, item.text, { handle: a.handle || "unknown", displayName: a.displayName, avatar: a.avatar }, item.uri, item.depth);
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
        if (shouldSkip(s, r.embed)) return;
        const uri = `at://${x.did}/app.bsky.feed.post/${c.rkey}`;
        pushPost(s, r.text, who, uri);
        if (s.opts.showQuotes && isQuote(r.embed)) {
          fetchPostView(uri).then((pv) => expandQuotes(s, pv && pv.embed)).catch(() => {});
        }
      } catch {}
    };
    s.socket.onclose = () => { s.connected = false; s.socket = null; setTimeout(() => connectSocket(s), 2000); };
    s.socket.onerror = () => {};
  }

  async function connect(handle, opts) {
    let s = sessions.get(handle);
    if (s) {
      if (opts) Object.assign(s.opts, opts);
      return status(handle);
    }
    s = {
      buffer: [], cursor: 0, follows: new Map(), wordsSeen: 0, connected: false, socket: null, status: "loading", profile: null,
      opts: Object.assign({ skipMedia: false, skipQuotes: false, showQuotes: false }, opts || {}),
    };
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
      const rawEmbed = post.record && post.record.embed;
      if (shouldSkip(s, rawEmbed)) continue;
      pushPost(s, post.record && post.record.text, who, post.uri);
      // getAuthorFeed already returns a hydrated view — no extra fetch needed here
      if (isQuote(rawEmbed)) expandQuotes(s, post.embed);
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

  // pulls the next post off the loop cursor, wrapping around whatever's
  // currently buffered — this is the "keep looping" part of speedhose,
  // carried over unchanged.
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

  function setOptions(handle, opts) {
    const s = sessions.get(handle);
    if (s) Object.assign(s.opts, opts);
  }

  window.blipvertsClient = { connect, status, next, reset, setOptions };
})();
