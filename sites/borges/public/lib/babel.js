// A browsable Library of Babel, after the 1941 story: 25 symbols (22 letters,
// space, comma, period), pages of 40 lines x 80 characters, 410 pages a book,
// 32 books a shelf, 5 shelves a wall, 4 walls a hexagon. The text of a page is
// derived from its address with a seeded PRNG, so the same address always
// gives the same page. (Not Jonathan Basile's libraryofbabel.info, which
// enumerates the whole space; this one just samples it.)
const ALPHA = "abcdefghilmnopqrstuvyz" + " ,.";
export const LINES = 40, COLS = 80, PAGES = 410, BOOKS = 32, SHELVES = 5, WALLS = 4;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addressString(a) {
  return `${a.hex}.${a.wall}.${a.shelf}.${a.book}.${a.page}`;
}

export function randomAddress(rnd = Math.random) {
  const hexDigits = "0123456789abcdefghijklmnopqrstuvwxyz";
  let hex = "";
  for (let i = 0; i < 12; i++) hex += hexDigits[Math.floor(rnd() * hexDigits.length)];
  return {
    hex,
    wall: 1 + Math.floor(rnd() * WALLS),
    shelf: 1 + Math.floor(rnd() * SHELVES),
    book: 1 + Math.floor(rnd() * BOOKS),
    page: 1 + Math.floor(rnd() * PAGES),
  };
}

// Parses "hex.wall.shelf.book.page"; returns null on anything out of range.
export function parseAddress(s) {
  const p = String(s || "").trim().toLowerCase().split(".");
  if (p.length !== 5 || !/^[0-9a-z]{1,40}$/.test(p[0])) return null;
  const [wall, shelf, book, page] = p.slice(1).map(Number);
  if (!(wall >= 1 && wall <= WALLS && shelf >= 1 && shelf <= SHELVES &&
        book >= 1 && book <= BOOKS && page >= 1 && page <= PAGES)) return null;
  if (![wall, shelf, book, page].every(Number.isInteger)) return null;
  return { hex: p[0], wall, shelf, book, page };
}

export function pageLines(addr) {
  const rnd = mulberry32(hash(addressString(addr)));
  const out = [];
  for (let l = 0; l < LINES; l++) {
    let line = "";
    for (let c = 0; c < COLS; c++) line += ALPHA[Math.floor(rnd() * ALPHA.length)];
    out.push(line);
  }
  return out;
}
