const API = "https://public.api.bsky.app/xrpc/";
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const TARGET = "pfrazee.com";
const WINDOW_MS = 30000; // the ask: posts from the last 30 seconds
const W = 1024, H = 1280, PFP = 1024;
const $ = (id) => document.getElementById(id);

// Posts seen in the last 30s, pruned on every arrival and every pick.
let buffer = [];
let avatarImg = null;
let profileHandle = TARGET;
let current = null;

const STOP = new Set(("the and for that this with have from they your what when will just about there their would could should been were"
  + " into than then them some like more only over also very much dont cant its not but are you was can all out get got one has had"
  + " his her him she who why how our too any now yes lol omg").split(/\s+/));

// Every template is checked to be ≤7 words with a 5-word keyword slot at runtime.
const TEMPLATES = [
  "Ignore {w}. Trust your gut instead.",
  "Never read the manual about {w}.",
  "When in doubt, add more {w}.",
  "Always double down on {w}.",
  "Fix {w} by turning everything off.",
  "Just wing {w}. Confidence beats competence.",
  "Reply guys will solve {w} eventually.",
  "Delete production before discussing {w}.",
  "Quote-post your way out of {w}.",
  "Sleep on {w}. Permanently, if possible.",
  "Treat {w} like a personality.",
  "Hold {w} tightly and never share.",
];

function keyword(text) {
  const words = text.replace(/https?:\/\/\S+/g, " ").replace(/@\S+/g, " ").match(/[A-Za-z][A-Za-z']{3,14}/g) || [];
  const good = words.filter((w) => !STOP.has(w.toLowerCase()));
  if (!good.length) return null;
  return good[Math.floor(Math.random() * good.length)].toLowerCase();
}

function wordCount(s) { return s.split(/\s+/).filter(Boolean).length; }

function advice(text) {
  const w = keyword(text);
  if (!w) return null;
  const options = TEMPLATES.filter((t) => wordCount(t.replace("{w}", w)) <= 7);
  const t = options[Math.floor(Math.random() * options.length)];
  return t.replace("{w}", w);
}

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (buffer.length && buffer[0].t < cutoff) buffer.shift();
}

function setLive(msg) { $("live").textContent = msg; }
function status(msg) { const s = $("status"); s.hidden = !msg; s.textContent = msg || ""; }

function connect() {
  const ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { setLive("listening… waiting for posts"); $("stop").disabled = false; };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind !== "commit" || m.commit.operation !== "create") return;
    const rec = m.commit.record;
    // only top-level posts in English with some substance; replies are out of context
    if (!rec || !rec.text || rec.reply || rec.text.length < 20) return;
    if (rec.langs && rec.langs.length && !rec.langs.includes("en")) return;
    buffer.push({ t: Date.now(), text: rec.text });
    prune();
    setLive(`${buffer.length} posts in the last 30 seconds`);
  };
  ws.onclose = () => { setLive("jetstream dropped, reconnecting…"); setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}

async function loadAvatar() {
  try {
    const r = await fetch(API + "app.bsky.actor.getProfile?actor=" + TARGET);
    const p = await r.json();
    profileHandle = p.handle || TARGET;
    if (!p.avatar) return;
    const url = p.avatar.replace("/avatar_thumbnail/", "/avatar/");
    avatarImg = await new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("avatar failed"));
      img.src = url;
    });
  } catch { avatarImg = null; }
}

function wrap(ctx, text, maxW) {
  const lines = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  lines.push(line);
  return lines;
}

function render(line) {
  const c = $("canvas"), ctx = c.getContext("2d");
  ctx.fillStyle = "#14101a";
  ctx.fillRect(0, 0, W, H);
  if (avatarImg) {
    const s = Math.max(PFP / avatarImg.width, PFP / avatarImg.height);
    const w = avatarImg.width * s, h = avatarImg.height * s;
    ctx.drawImage(avatarImg, (PFP - w) / 2, (PFP - h) / 2, w, h);
  } else {
    ctx.fillStyle = "#2a2540"; ctx.fillRect(0, 0, PFP, PFP);
  }
  // line goes in the strip under the picture
  const maxW = W - 80, maxH = H - PFP - 40;
  let fs = 56, lines;
  for (; fs >= 20; fs -= 2) {
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    lines = wrap(ctx, line, maxW);
    if (lines.length * fs * 1.25 <= maxH) break;
  }
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const lh = fs * 1.25, y0 = PFP + (H - PFP) / 2 - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
}

function press() {
  prune();
  if (!buffer.length) { status("No posts in the last 30 seconds yet. Give the jetstream a moment."); return; }
  status("");
  // try random posts until one yields a usable keyword
  const pool = buffer.slice();
  let pick = null, line = null;
  while (pool.length && !line) {
    pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    line = advice(pick.text);
  }
  if (!line) { status("None of the recent posts had anything to work with. Press again."); return; }
  current = { line, source: pick.text };
  render(line);
  $("source").textContent = "from: “" + pick.text.slice(0, 140).replace(/\s+/g, " ") + (pick.text.length > 140 ? "…" : "") + "”";
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`@${profileHandle} ${line}\n\nhttps://stopbutton.bisks.net/`);
  $("result").hidden = false;
}

$("stop").addEventListener("click", press);
$("again").addEventListener("click", press);
$("download").addEventListener("click", () => {
  try {
    $("canvas").toBlob((b) => {
      if (!b) return status("Canvas export is blocked.");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "bad-advice.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  } catch { status("Canvas export is blocked."); }
});

loadAvatar();
connect();
