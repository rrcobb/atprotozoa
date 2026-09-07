// csv.js — a small RFC4180-ish CSV parser plus fuzzy header mapping onto the
// five fields shelfspace cares about (Title, Authors, ISBN/UID, Last Date
// Read, Stars). Hand-rolled rather than pulling in a CDN dependency: the
// grammar is short, and it keeps the only external network call this site
// makes the Open Library cover fetch, not a parser library. Handles quoted
// fields with embedded commas, "" escaped quotes, and embedded newlines
// (reviews routinely have both) — a naive line.split(",") would silently
// shred those rows.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalize line endings up front so \r\n and \r don't leave stray \r
  // characters inside unquoted fields.
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Trailing field/row (files without a final newline).
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank trailing rows a trailing newline produces.
  while (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
  return { headers, records };
}

// Header name -> canonical field, matched case-insensitively against a set
// of aliases seen in Goodreads/StoryGraph/LibraryThing exports and plain
// hand-made spreadsheets.
const FIELD_ALIASES = {
  title: ["title", "book title", "name", "book"],
  authors: ["author", "authors", "author(s)", "author name", "writer"],
  isbn: ["isbn", "isbn13", "isbn-13", "isbn10", "isbn-10", "uid", "id", "asin"],
  dateRead: [
    "last date read",
    "date read",
    "read date",
    "finished",
    "date finished",
    "last read",
    "read at",
  ],
  stars: ["stars", "star rating", "rating", "my rating", "score"],
  format: ["format", "binding", "physical format", "type"],
};

function normalizeHeader(h) {
  return h.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function mapHeaders(headers) {
  const mapping = {}; // canonical -> original header
  const normalized = headers.map(normalizeHeader);
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    let found = null;
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        found = headers[idx];
        break;
      }
    }
    if (found) mapping[canonical] = found;
  }
  return mapping;
}

function parseStars(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  // Normalize a 0-100 or 0-10 scale down to 0-5 if it's clearly not already
  // a star rating — most exports are already 0-5, so leave those alone.
  if (n > 5 && n <= 10) return n / 2;
  if (n > 10) return Math.min(5, n / 20);
  return n;
}

function parseYear(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

// Turns raw CSV records into normalized book objects. Rows with no title are
// dropped (can't shelve a book with nothing to put on the spine) and counted
// as skipped so the upload preview can be honest about it.
export function buildBooks(records, mapping) {
  const books = [];
  let skipped = 0;
  records.forEach((rec, i) => {
    const title = mapping.title ? rec[mapping.title] : "";
    if (!title) {
      skipped++;
      return;
    }
    const isbnRaw = mapping.isbn ? rec[mapping.isbn] : "";
    const isbn = (isbnRaw || "").replace(/[^0-9Xx]/g, "");
    books.push({
      id: `b${i}`,
      title,
      authors: mapping.authors ? rec[mapping.authors] || "Unknown" : "Unknown",
      isbn: isbn.length >= 9 ? isbn : "",
      dateRead: mapping.dateRead ? rec[mapping.dateRead] || "" : "",
      year: parseYear(mapping.dateRead ? rec[mapping.dateRead] : ""),
      stars: parseStars(mapping.stars ? rec[mapping.stars] : ""),
      format: mapping.format ? rec[mapping.format] || "" : "",
      raw: rec,
    });
  });
  return { books, skipped };
}
