// Posts from the people you follow, as in skytreeone's chatter: the follow
// list from Bluesky's public AppView (cached for six hours) and new posts
// from Jetstream, Bluesky's public JSON firehose, filtered to those accounts.
// Nothing needs a login or a key. `demo` mode makes up a few clearly labelled
// placeholder posts instead, for testing without an account.

const APPVIEW = 'https://public.api.bsky.app/xrpc/';
const JETSTREAMS = [
  'jetstream2.us-east.bsky.network', 'jetstream1.us-east.bsky.network',
  'jetstream1.us-west.bsky.network', 'jetstream2.us-west.bsky.network',
];
const REPLAY = 3 * 3600e3;
const FOLLOWS_TTL = 6 * 3600e3;
// Jetstream accepts at most 10,000 wantedDids per connection, so more follows
// than that couldn't be listened to anyway.
const MAX_DIDS = 10000;
const CDN = 'https://cdn.bsky.app/img/';

export async function xrpc(method, params) {
  const u = new URL(APPVIEW + method);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${method}: ${r.status}`);
  return r.json();
}

export async function loadFollows(actor, prefix) {
  const key = `${prefix}follows:${actor}`;
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.at < FOLLOWS_TTL) return c;
  } catch { /* no cache */ }
  const people = {};
  let cursor, n = 0;
  do {
    const j = await xrpc('app.bsky.graph.getFollows', { actor, limit: 100, cursor });
    for (const f of j.follows) { people[f.did] = [f.handle, f.displayName || '', f.avatar || '']; n++; }
    cursor = j.cursor;
  } while (cursor && n < MAX_DIDS);
  const c = { at: Date.now(), people };
  try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* full */ }
  return c;
}

// What to show of a post's embed: up to four image thumbnails, a video
// thumbnail, a link card, or a note that it quotes another post.
function media(did, embed) {
  if (!embed) return null;
  const t = embed.$type || '';
  const img = i => ({ src: `${CDN}feed_thumbnail/plain/${did}/${i.image?.ref?.$link}@jpeg`, alt: i.alt || '' });
  if (t === 'app.bsky.embed.images') return { images: (embed.images || []).filter(i => i.image?.ref?.$link).slice(0, 4).map(img) };
  if (t === 'app.bsky.embed.video' && embed.video?.ref?.$link) {
    return { images: [{ src: `https://video.bsky.app/watch/${encodeURIComponent(did)}/${embed.video.ref.$link}/thumbnail.jpg`, alt: embed.alt || 'video' }], video: true };
  }
  if (t === 'app.bsky.embed.external' && embed.external) {
    const e = embed.external;
    return { link: { title: e.title || e.uri, uri: e.uri, thumb: e.thumb?.ref?.$link ? `${CDN}feed_thumbnail/plain/${did}/${e.thumb.ref.$link}@jpeg` : '' } };
  }
  if (t === 'app.bsky.embed.record') return { quote: true };
  if (t === 'app.bsky.embed.recordWithMedia') return { ...media(did, embed.media), quote: true };
  return null;
}

// Jetstream, filtered to the follows. The DID list goes in an options_update
// message rather than the URL (it can be thousands long). Reconnects resume
// from the last event seen.
export function listen(dids, onPost, onStatus) {
  let n = 0, backoff = 2, cursor = (Date.now() - REPLAY) * 1000;
  function open() {
    const host = JETSTREAMS[n++ % JETSTREAMS.length];
    const ws = new WebSocket(`wss://${host}/subscribe?requireHello=true&cursor=${cursor}`);
    ws.onopen = () => {
      backoff = 2;
      ws.send(JSON.stringify({
        type: 'options_update',
        payload: { wantedCollections: ['app.bsky.feed.post'], wantedDids: dids, maxMessageSizeBytes: 0 },
      }));
      onStatus(`listening to ${dids.length} people`);
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.time_us) cursor = m.time_us;
      const c = m.commit;
      if (m.kind !== 'commit' || c?.operation !== 'create' || c.collection !== 'app.bsky.feed.post') return;
      if (c.record?.reply) return; // top-level posts only
      onPost({
        did: m.did, rkey: c.rkey, text: c.record?.text || '', media: media(m.did, c.record?.embed),
        at: Date.parse(c.record?.createdAt) || Date.now(),
      });
    };
    ws.onclose = () => {
      onStatus('reconnecting…');
      setTimeout(open, backoff * 1000);
      backoff = Math.min(60, backoff * 2);
    };
  }
  open();
}

// Loosely the picture's colour: pixels weighted by saturation squared times
// brightness, so the vivid part wins over a grey background.
export async function avatarColour(url) {
  const r = await fetch(url.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/'));
  if (!r.ok) throw new Error(r.status);
  const bmp = await createImageBitmap(await r.blob());
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let sw = 0, sr = 0, sg = 0, sb = 0, ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    const s = mx ? (mx - mn) / mx : 0, w = s * s * (mx / 255);
    sw += w; sr += w * R; sg += w * G; sb += w * B;
    ar += R; ag += G; ab += B;
  }
  const n = d.length / 4;
  return sw < n * 0.02 ? [ar / n, ag / n, ab / n] : [sr / sw, sg / sw, sb / sw];
}

// ---------------------------------------------------------------- demo
// Placeholder pilots and posts for trying the sim without an account. They
// say what they are, and they never pretend to be real people.
const DEMO_PEOPLE = [
  ['demo-amber.example', 'Demo Pilot Amber'], ['demo-teal.example', 'Demo Pilot Teal'],
  ['demo-violet.example', 'Demo Pilot Violet'], ['demo-lime.example', 'Demo Pilot Lime'],
  ['demo-coral.example', 'Demo Pilot Coral'], ['demo-sky.example', 'Demo Pilot Sky'],
];
const DEMO_LINES = [
  'This is a demo post. Sign in to bsky.app and the jets up here are the people you follow.',
  'Demo post: lock on by pointing at a jet, then click to send a missile. The burst opens the post.',
  'Demo post: nobody gets hurt up here. A hit just pops the post open and the jet rolls away.',
  'Demo post: press Enter on an open post to read its thread on Bluesky.',
  'Demo post: W and S for throttle, the mouse to steer, Tab to switch targets.',
  'Demo post: the clouds drift with the wind, and their shadows cross the fields below.',
  'Demo post: fly low over the forest and the trees are the same ones as in skytreeone.',
  'Demo post: Esc takes you back to your feed.',
];
const DEMO_COLOURS = [[214, 140, 40], [40, 170, 160], [140, 90, 200], [120, 190, 60], [230, 110, 90], [80, 150, 230]];

export function demoFeed(onPost) {
  const people = {};
  DEMO_PEOPLE.forEach(([h, n], i) => { people[`did:demo:${i}`] = [h, n, '']; });
  let k = 0;
  const one = () => {
    const i = k % DEMO_PEOPLE.length;
    onPost({ did: `did:demo:${i}`, rkey: `demo${k}`, text: DEMO_LINES[k % DEMO_LINES.length], media: null, at: Date.now() - (8 - Math.min(k, 8)) * 300e3, demo: true });
    k++;
  };
  const start = () => {
    for (let i = 0; i < 8; i++) one();
    setInterval(one, 20000);
  };
  return { at: Date.now(), people, start, colours: Object.fromEntries(DEMO_COLOURS.map((c, i) => [`did:demo:${i}`, c])) };
}
