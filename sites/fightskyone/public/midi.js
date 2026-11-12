// Reads a standard MIDI file into a short loop for the music to replay:
// { name, bpm, beats, notes: [[startBeat, lengthBeats, midiNote, velocity]] }.
// Only notes, the first tempo and a track name are kept; the file itself is
// never stored or sent anywhere. Used by the popup (your own loop) and by the
// sky page when testing (?midi=<url>).

// eslint-disable-next-line no-unused-vars
function parseMidi(buf) {
  const d = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  if (str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntracks = d.getUint16(10), div = d.getUint16(12);
  if (div & 0x8000) throw new Error('SMPTE timing is not supported');
  let p = 8 + d.getUint32(4), bpm = 120, name = '', last = 0;
  const notes = [];
  for (let tr = 0; tr < ntracks && p < buf.byteLength; tr++) {
    if (str(p, 4) !== 'MTrk') break;
    const end = p + 8 + d.getUint32(p + 4);
    let i = p + 8, tick = 0, run = 0;
    const on = new Map();
    const vl = () => { let v = 0, b; do { b = d.getUint8(i++); v = (v << 7) | (b & 127); } while (b & 128); return v; };
    while (i < end) {
      tick += vl();
      let st = d.getUint8(i);
      if (st === 0xff) {
        const type = d.getUint8(i + 1); i += 2;
        const len = vl();
        if (type === 0x51 && len === 3) bpm = 60e6 / ((d.getUint8(i) << 16) | (d.getUint8(i + 1) << 8) | d.getUint8(i + 2));
        if ((type === 0x03 || type === 0x01) && !name) name = str(i, len).trim();
        i += len;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) { i++; i += vl(); continue; }
      if (st & 0x80) { run = st; i++; } else st = run;
      const kind = st & 0xf0;
      if (kind === 0xc0 || kind === 0xd0) { i++; continue; }
      const a = d.getUint8(i), b = d.getUint8(i + 1); i += 2;
      if (kind === 0x90 && b > 0) on.set(a, [tick, b]);
      else if (kind === 0x80 || kind === 0x90) {
        const s = on.get(a);
        if (s) { on.delete(a); notes.push([s[0] / div, (tick - s[0]) / div, a, s[1]]); last = Math.max(last, tick / div); }
      }
    }
    p = end;
  }
  if (!notes.length) throw new Error('no notes in this file');
  notes.sort((x, y) => x[0] - y[0]);
  // Round the loop up to whole bars of 4/4, at most 16 bars.
  const beats = Math.min(64, Math.max(4, Math.ceil((last - 1e-3) / 4) * 4));
  return {
    name: name || 'MIDI loop', bpm: Math.min(200, Math.max(60, Math.round(bpm))), beats,
    notes: notes.filter(n => n[0] < beats).slice(0, 512).map(([t, l, n, v]) => [+t.toFixed(4), +l.toFixed(4), n, v]),
  };
}

if (typeof window !== 'undefined') window.parseMidi = parseMidi;
