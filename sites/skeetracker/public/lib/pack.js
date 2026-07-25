// pack.js — turn a song into something that fits in a skeet thread, and back.
// Pipeline: song -> compact array form (short keys compress better and are
// smaller to begin with) -> JSON -> gzip (CompressionStream) -> base64url ->
// split into <=maxLen chunks, each tagged "SKTR/i x N: <payload>" so a loader
// can find and reassemble them regardless of what order the thread's replies
// come back in, or whether other people's replies are mixed in.

const MAGIC = "SKTR";
// Fixed, deliberately generous header budget ("SKTR/9999x9999:" = 15 chars)
// so payload chunking never has to guess at header width up front.
const HEADER_BUDGET = `${MAGIC}/9999x9999:`.length;

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function compact(song) {
  return [
    song.title || "",
    song.bpm,
    song.spr,
    song.rows,
    song.chans,
    song.ins.map((i) => [
      i.name,
      i.wave,
      round3(i.a),
      round3(i.d),
      i.s,
      round3(i.r),
      i.gain,
      i.cutoff || 0,
      i.q || 0,
    ]),
    song.pats.map((pat) => pat.map((row) => row.map((cell) => cell || 0))),
    song.order,
  ];
}

function expand(c) {
  const [title, bpm, spr, rows, chans, insArr, patsArr, order] = c;
  return {
    title,
    bpm,
    spr,
    rows,
    chans,
    ins: insArr.map(([name, wave, a, d, s, r, gain, cutoff, q]) => ({
      name,
      wave,
      a,
      d,
      s,
      r,
      gain,
      cutoff,
      q,
    })),
    pats: patsArr.map((pat) =>
      pat.map((row) => row.map((cell) => (cell === 0 ? null : cell))),
    ),
    order,
  };
}

async function gzip(bytes) {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Requires CompressionStream (Chrome/Firefox/Safari 16.4+).
export async function songToChunks(song, maxLen = 280) {
  const json = JSON.stringify(compact(song));
  const bytes = new TextEncoder().encode(json);
  const gz = await gzip(bytes);
  const b64 = b64urlEncode(gz);

  const payloadLen = maxLen - HEADER_BUDGET;
  if (payloadLen < 20) throw new Error("maxLen too small");

  const parts = [];
  for (let pos = 0; pos < b64.length; pos += payloadLen) {
    parts.push(b64.slice(pos, pos + payloadLen));
  }
  if (!parts.length) parts.push("");
  const total = parts.length;
  return parts.map((part, i) => `${MAGIC}/${i + 1}x${total}:${part}`);
}

export async function chunksToSong(texts) {
  const re = new RegExp(`${MAGIC}/(\\d+)x(\\d+):([A-Za-z0-9_-]+)`);
  const found = new Map();
  let total = null;
  for (const t of texts) {
    const m = t.match(re);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    const tot = parseInt(m[2], 10);
    if (total === null) total = tot;
    found.set(idx, m[3]);
  }
  if (total === null) {
    throw new Error("no skeetracker song chunks found in that thread");
  }
  let b64 = "";
  for (let i = 1; i <= total; i++) {
    if (!found.has(i)) {
      throw new Error(`missing part ${i} of ${total} — is the whole thread public?`);
    }
    b64 += found.get(i);
  }
  const gz = b64urlDecode(b64);
  const bytes = await gunzip(gz);
  const json = new TextDecoder().decode(bytes);
  return expand(JSON.parse(json));
}
