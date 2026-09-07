// covers.js — Open Library Covers API access, with a small persistent cache
// so a return visit doesn't re-fetch a cover for every book on the shelf.
//
// The CSV itself never leaves the browser (see app.js) — the only network
// calls this site makes are anonymous GETs to covers.openlibrary.org keyed
// by ISBN, the same request anyone's browser could make directly.

const CACHE_KEY = "shelfspace:covers:v1";
const CACHE_CAP = 500; // distinct ISBNs' worth of tiny thumbs kept in localStorage

function loadDiskCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveDiskCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded or storage disabled (private browsing) — covers just
    // refetch next visit, nothing else depends on this persisting.
  }
}

const diskCache = loadDiskCache();
const memCache = new Map(); // isbn -> Promise<{ img, dominantColor } | null>

export function coverUrl(isbn, size) {
  // default=false: Open Library returns a real 404 instead of its 1x1
  // "no cover" placeholder image, so a missing cover fails the load cleanly
  // and falls through to the procedural spine/cover instead of rendering a
  // blank gray rectangle.
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`;
}

function loadImage(url, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function averageColor(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    // Cross-origin image without CORS clearance taints the canvas — the
    // texture can still render, it just can't be sampled for a color.
    return null;
  }
}

function cacheThumb(isbn, img) {
  try {
    const keys = Object.keys(diskCache);
    if (keys.length >= CACHE_CAP && !(isbn in diskCache)) {
      delete diskCache[keys[0]]; // simple oldest-first eviction, not true LRU
    }
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 72;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 48, 72);
    diskCache[isbn] = c.toDataURL("image/jpeg", 0.72);
    saveDiskCache(diskCache);
  } catch {
    // tainted canvas or storage full — session cache (memCache) still works.
  }
}

// Cover for spine texturing: cheap, cached, fine to call for every book on
// the shelf up front. Returns null if there's no ISBN or Open Library has
// nothing for it (a confirmed miss is itself cached, so it isn't retried
// every visit).
export async function fetchCoverThumb(isbn) {
  if (!isbn) return null;
  if (memCache.has(isbn)) return memCache.get(isbn);

  const promise = (async () => {
    if (diskCache[isbn] === null) return null;
    if (diskCache[isbn]) {
      try {
        const img = await loadImage(diskCache[isbn], false);
        return { img, dominantColor: averageColor(img) };
      } catch {
        // cached data URL somehow broke — fall through to a live fetch
      }
    }
    try {
      const img = await loadImage(coverUrl(isbn, "M"), true);
      const dominantColor = averageColor(img);
      cacheThumb(isbn, img);
      return { img, dominantColor };
    } catch {
      diskCache[isbn] = null;
      saveDiskCache(diskCache);
      return null;
    }
  })();
  memCache.set(isbn, promise);
  return promise;
}

// Full-size cover for the pulled-out inspect view. Not cached beyond the
// browser's own HTTP cache (Open Library serves covers with long-lived
// cache headers) — only a handful of these load per session, one per book
// someone actually clicks on.
export async function fetchCoverLarge(isbn) {
  if (!isbn) return null;
  try {
    return await loadImage(coverUrl(isbn, "L"), true);
  } catch {
    return null;
  }
}
