// Parsing for Apple's privacy.apple.com data export. Pure functions, no DOM,
// so tests/apple.test.mjs can run them under node.

// Minimal RFC4180 CSV parser (quoted fields, doubled quotes, CRLF).
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// "Artist - Title" (Daily Tracks' Track Description). Artists may contain " - "
// themselves, so split on the first one; that's right far more often than not.
function splitDescription(d) {
  const i = d.indexOf(" - ");
  return i < 0 ? { artist: "", track: d.trim() } : { artist: d.slice(0, i).trim(), track: d.slice(i + 3).trim() };
}

// Which of Apple's CSVs is this? Returns "daily", "activity" or null.
export function detectKind(rows) {
  if (!rows.length) return null;
  const h = new Set(rows[0].map((x) => x.trim()));
  if (h.has("Track Description") && h.has("Date Played")) return "daily";
  if (h.has("Song Name") && h.has("Event Start Timestamp")) return "activity";
  return null;
}

// offsetMin: minutes east of UTC that the daily file's local dates/hours are in.
// Daily Tracks has only a date and a list of hours per row, so plays are spread
// across the listed hours; the export carries no minute-level time.
export function playsFromDaily(rows, offsetMin = 0) {
  const out = [];
  for (const r of toObjects(rows)) {
    const n = parseInt(r["Play Count"], 10) || 0;
    const d = (r["Date Played"] || "").trim();
    if (n < 1 || !/^\d{8}$/.test(d)) continue;
    const { artist, track } = splitDescription(r["Track Description"] || "");
    if (!track) continue;
    const hours = (r["Hours"] || "").split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < 24);
    if (!hours.length) hours.push(12);
    const dur = parseInt(r["Play Duration Milliseconds"], 10);
    const per = n ? Math.round(dur / n) : 0;
    const base = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
    const slot = {};
    for (let k = 0; k < n; k++) {
      const h = hours[k % hours.length];
      const idx = (slot[h] = (slot[h] ?? -1) + 1);
      const t = base + h * 3600e3 + Math.min(idx, 59) * 60e3 - offsetMin * 60e3;
      out.push({ track, artist, album: "", playedTime: new Date(t).toISOString(), durationMs: per > 0 ? per : 0, id: r["Track Identifier"] || "" });
    }
  }
  return out;
}

// "Apple Music Play Activity.csv": one row per play, with real timestamps (UTC).
export function playsFromActivity(rows) {
  const out = [];
  for (const r of toObjects(rows)) {
    const track = (r["Song Name"] || "").trim();
    const ts = r["Event Start Timestamp"] || r["Event End Timestamp"] || "";
    const t = Date.parse(ts.replace(" ", "T").replace(/Z?$/, "Z"));
    if (!track || isNaN(t)) continue;
    const dur = parseInt(r["Play Duration Milliseconds"], 10);
    if (dur === 0) continue; // opened and instantly skipped, not a listen
    out.push({
      track, artist: (r["Artist Name"] || "").trim(), album: (r["Album Name"] || "").trim(),
      playedTime: new Date(t).toISOString(), durationMs: dur > 0 ? dur : 0, id: r["Apple Id"] || r["Container Identifier"] || "",
    });
  }
  return out;
}

export function playsFromCSV(text, offsetMin = 0) {
  const rows = parseCSV(text);
  const kind = detectKind(rows);
  if (kind === "daily") return { kind, plays: playsFromDaily(rows, offsetMin) };
  if (kind === "activity") return { kind, plays: playsFromActivity(rows) };
  return { kind: null, plays: [] };
}

// fm.teal.alpha.feed.play record. Teal's lexicon wants `artists` objects;
// `artistNames` is its deprecated twin, kept for readers that still use it.
export function toRecord(p) {
  const rec = {
    $type: "fm.teal.alpha.feed.play",
    trackName: p.track,
    artists: p.artist ? [{ artistName: p.artist }] : [],
    artistNames: p.artist ? [p.artist] : [],
    playedTime: p.playedTime,
    musicServiceBaseDomain: "music.apple.com",
    submissionClientAgent: "apple-to-popfeed/1.0 (apple-to-popfeed.bisks.net)",
  };
  if (p.album) rec.releaseName = p.album;
  if (p.durationMs > 0) rec.duration = Math.round(p.durationMs / 1000);
  return rec;
}

// Deterministic TID-shaped rkey from the play, so re-importing the same file
// lands on the same keys and can be skipped instead of duplicated.
const B32 = "234567abcdefghijklmnopqrstuvwxyz";
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function rkeyFor(p, seq = 0) {
  const us = BigInt(Date.parse(p.playedTime)) * 1000n + BigInt(seq);
  const clock = BigInt(fnv(p.track + "\u0000" + p.artist) & 0x3ff);
  let v = (us << 10n) | clock; // 53-bit timestamp + 10-bit id, top bit 0
  let s = "";
  for (let i = 0; i < 13; i++) { s = B32[Number(v & 31n)] + s; v >>= 5n; }
  return s;
}

// Assign rkeys; plays sharing a timestamp get seq 0,1,2... so keys stay unique.
export function withKeys(plays) {
  const seen = new Map();
  return plays.map((p) => {
    const k = p.playedTime + "\u0000" + p.track + "\u0000" + p.artist;
    const seq = seen.get(k) ?? 0;
    seen.set(k, seq + 1);
    return { ...p, rkey: rkeyFor(p, seq) };
  });
}

// --- zip reading (Apple ships a zip, sometimes zips inside zips) -------------
// Reads the central directory, inflates with DecompressionStream("deflate-raw").
export async function readZip(buf) {
  const dv = new DataView(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error("not a zip file");
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const files = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    files.push({ name, method, csize, off });
  }
  return files.map((f) => ({
    name: f.name,
    async bytes() {
      const lh = f.off;
      const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      const raw = new Uint8Array(buf, start, f.csize);
      if (f.method === 0) return raw.slice().buffer;
      if (f.method !== 8) throw new Error("unsupported zip compression in " + f.name);
      const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(ds).arrayBuffer();
    },
  }));
}
