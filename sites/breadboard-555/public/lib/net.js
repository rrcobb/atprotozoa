// Shared-state plumbing for breadboard-555.
//
// Online games are one Automerge document, found again from its URL in
// location.hash (that is the join link). Peers sync over the public
// sync.automerge.org relay plus BroadcastChannel between tabs of one browser,
// and each browser keeps a copy in IndexedDB so a reload rejoins the game.
// The library comes from a CDN at runtime so there is nothing to bundle; if it
// can't load, main.js falls back to hot-seat on one device.
//
// Both stores expose { get(), change(fn), onChange(cb) }.

const AM = "https://esm.sh/@automerge/vanillajs@2.5.6";
const RELAY = "wss://sync.automerge.org";

export function clientId() {
  let id = localStorage.getItem("bb555-client");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + "";
    localStorage.setItem("bb555-client", id);
  }
  return id;
}

export function localStore(initial) {
  let doc = initial;
  const subs = [];
  return {
    get: () => doc,
    change(fn) { fn(doc); subs.forEach((f) => f()); },
    onChange(cb) { subs.push(cb); },
  };
}

function timeout(ms, what) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(what + " timed out")), ms));
}

// url: an automerge: url from the hash, or null to start a new game from `initial`.
export async function onlineStore(url, initial) {
  const m = await Promise.race([import(AM), timeout(15000, "loading automerge")]);
  const repo = new m.Repo({
    storage: new m.IndexedDBStorageAdapter("bb555"),
    network: [new m.BroadcastChannelNetworkAdapter(), new m.WebSocketClientAdapter(RELAY)],
  });
  let handle;
  if (url) {
    if (!m.isValidAutomergeUrl(url)) throw new Error("that join link isn't a valid game");
    handle = await Promise.race([repo.find(url), timeout(20000, "finding the game")]);
  } else {
    handle = repo.create(initial);
  }
  const subs = [];
  handle.on("change", () => subs.forEach((f) => f()));
  return {
    url: handle.url,
    get: () => handle.doc(),
    change: (fn) => handle.change(fn),
    onChange(cb) { subs.push(cb); },
  };
}
