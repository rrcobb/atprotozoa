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
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = {};
globalThis.fetch = async () => { throw new Error("network should not be hit in this test"); };

await import("./app.js");
await new Promise((r) => setTimeout(r, 100));

console.log("desktop-recent:", els["#desktop-recent"].innerHTML.slice(0, 400));
console.log("---");
console.log("mobile-recent:", els["#mobile-recent"].innerHTML.slice(0, 400));
console.log("---");
console.log("desktop-alltime:", els["#desktop-alltime"].innerHTML.slice(0, 300));
console.log("---");
console.log("live-feed-list:", els["#live-feed-list"].innerHTML);
console.log("---");
console.log("shareBtn href:", els["#shareBtn"].href);
process.exit(0);
