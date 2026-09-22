// Minimal client-side ZIP writer — store method only (no DEFLATE). Every
// entry here is already a compressed PNG, so re-compressing would just burn
// CPU for no size win; "store" is a perfectly valid ZIP entry, not a
// shortcut. Just enough of the format (local headers + central directory +
// end-of-central-directory) for unzip/Finder/Explorer/7-Zip to open it.
// No dependency — this is the whole point of doing it locally rather than
// pulling in a CDN library for ten PNGs.

const CRC_TABLE = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time fields the ZIP format still uses for mod times.
function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (Math.max(0, date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, dosDate };
}

function u16(n) {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}
function u32(n) {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}
function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// entries: [{ name: string, data: Uint8Array }] -> Blob (application/zip)
export function makeZip(entries, date = new Date()) {
  const { time, dosDate } = dosDateTime(date);
  const encoder = new TextEncoder();
  const fileChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20), // version needed to extract
      u16(0), // general purpose flag
      u16(0), // compression method: 0 = store
      u16(time),
      u16(dosDate),
      u32(crc),
      u32(data.length), // compressed size == uncompressed (store)
      u32(data.length),
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
    ]);
    fileChunks.push(localHeader, data);

    centralChunks.push(
      concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed to extract
        u16(0), // general purpose flag
        u16(0), // compression method
        u16(time),
        u16(dosDate),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0), // extra field length
        u16(0), // comment length
        u16(0), // disk number start
        u16(0), // internal file attributes
        u32(0), // external file attributes
        u32(offset), // offset of local header
        nameBytes,
      ])
    );

    offset += localHeader.length + data.length;
  }

  const centralStart = offset;
  const central = concat(centralChunks);

  const eocd = concat([
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk where central directory starts
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(centralStart),
    u16(0), // comment length
  ]);

  return new Blob([...fileChunks, central, eocd], { type: "application/zip" });
}
