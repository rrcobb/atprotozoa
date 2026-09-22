class FakeEl {
  constructor() { this._html = ""; this._text = ""; this.href = ""; this.disabled = false; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  addEventListener() {}
}

const els = {};
for (const id of [
  "desktop-recent", "mobile-recent", "desktop-alltime", "mobile-alltime",
  "desktop-critical", "mobile-critical", "desktop-live", "mobile-live",
  "live-checked", "live-feed-list", "live-refresh", "shareBtn",
]) els["#" + id] = new FakeEl();

globalThis.document = { querySelector: (sel) => els[sel] || null };
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
};
globalThis.window = {};
// real fetch — this hits the live NVD API through the app's own rate-limited queue

function strip(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

await import("./app.js");

// headline (15 calls) + first live poll (5 calls) at ~7.5s spacing ≈ 2.5-3min
await new Promise((r) => setTimeout(r, 170000));

for (const id of ["desktop-recent", "mobile-recent", "desktop-alltime", "mobile-alltime", "desktop-critical", "mobile-critical", "desktop-live", "mobile-live"]) {
  console.log(id + ":", strip(els["#" + id].innerHTML));
}
console.log("live-checked:", els["#live-checked"].textContent);
console.log("feed:", strip(els["#live-feed-list"].innerHTML).slice(0, 600));
console.log("share:", decodeURIComponent(els["#shareBtn"].href));
process.exit(0);
