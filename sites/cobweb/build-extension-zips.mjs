// Packs public/extension/ into per-browser zips, then rewrites the download
// links in public/index.html to be `data:` URIs holding the zip bytes
// (base64) right in the page source — so the plugin really is "hosted as a
// data literal": there's no separate hosted .zip the server has to serve,
// the whole archive is a string literal in the HTML you're already loading.
// A plain ZIP writer (store + deflate via zlib) since this box has no
// system `zip` binary and no zip npm package installed.
//
//   node build-extension-zips.mjs

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const extDir = join(root, "public/extension");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, dosDate };
}

// entries: [{ name, data: Buffer }]
function buildZip(entries) {
  const { time, dosDate } = dosDateTime(new Date());
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const payload = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralBuf, end]);
}

function loadEntries(manifestOverridePath) {
  const files = walk(extDir);
  const entries = [];
  for (const abs of files) {
    const rel = relative(extDir, abs).split("\\").join("/");
    if (rel === "manifest.firefox.json") continue; // never ship the source override file itself
    const name = rel === "manifest.json" && manifestOverridePath ? rel : rel;
    const data = rel === "manifest.json" && manifestOverridePath ? readFileSync(manifestOverridePath) : readFileSync(abs);
    entries.push({ name, data });
  }
  return entries;
}

const chromeZip = buildZip(loadEntries(null));
const firefoxZip = buildZip(loadEntries(join(extDir, "manifest.firefox.json")));

writeFileSync(join(root, "public/cobweb-extension-chrome.zip"), chromeZip);
writeFileSync(join(root, "public/cobweb-extension-firefox.zip"), firefoxZip);
console.log("chrome zip:", chromeZip.length, "bytes");
console.log("firefox zip:", firefoxZip.length, "bytes");

const chromeDataUri = "data:application/zip;base64," + chromeZip.toString("base64");
const firefoxDataUri = "data:application/zip;base64," + firefoxZip.toString("base64");

const htmlPath = join(root, "public/index.html");
let html = readFileSync(htmlPath, "utf8");

function replaceHref(html, id, dataUri) {
  const re = new RegExp(`(id="${id}"[^>]*href=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`couldn't find anchor with id="${id}" in index.html`);
  return html.replace(re, `$1${dataUri}$2`);
}

html = replaceHref(html, "dl-chrome", chromeDataUri);
html = replaceHref(html, "dl-firefox", firefoxDataUri);

writeFileSync(htmlPath, html);
console.log("rewrote public/index.html download links to inline data: URIs");
