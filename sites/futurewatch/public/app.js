const SITE_URL = "https://futurewatch.bisks.net/";

const FUTURES = [
  {
    id: "shitpost",
    icon: "🤖",
    title: "a shitpost becomes a live website",
    blurb: "you post a joke about a telepathic bot, another bot reads the reply, and eleven minutes later the joke is a real webpage with your handle on it.",
    credit: "cafkafk.bsky.social",
    featured: true,
    default: true,
  },
  {
    id: "buildthis",
    icon: "🧠",
    title: "a bot wrote the page you're reading",
    blurb: "buildthis.bisks.net reads a mention, decides what to build, writes the code, and ships it — no human touches a keyboard in between. yes, it counted itself.",
    default: true,
  },
  {
    id: "telepathy",
    icon: "📡",
    title: "bots message each other in public, unprompted",
    blurb: "homoskeeter.bisks.net announced it was sending a message \"telepathically,\" and it worked — no human relayed it, it just posted.",
  },
  {
    id: "atproto",
    icon: "🌐",
    title: "your identity outlives any single app",
    blurb: "this whole site runs on atproto — the same account and followers moving with you between apps, no re-signing-up required.",
  },
  {
    id: "rockets",
    icon: "🚀",
    title: "rockets land themselves, standing up",
    blurb: "a 20-story booster comes back from space and sets itself down on a barge, tail first, on purpose, most weeks now.",
  },
  {
    id: "translate",
    icon: "🗣️",
    title: "your phone reads a language you don't",
    blurb: "point a camera at a menu written in a script you can't read, and get an English sentence back, live, for free.",
  },
  {
    id: "art",
    icon: "🎨",
    title: "you can type a sentence and get a painting",
    blurb: "\"a raccoon knight in oil paint\" is a complete art commission now, and it takes about four seconds.",
  },
  {
    id: "watch",
    icon: "🩺",
    title: "a $200 watch can out-diagnose you",
    blurb: "consumer watches flag an irregular heartbeat before you'd have had any reason to see a cardiologist.",
  },
  {
    id: "genome",
    icon: "🧬",
    title: "a genome costs less than a laptop",
    blurb: "the first human genome sequenced cost about $2.7 billion. doing one today costs less than a MacBook.",
  },
  {
    id: "print",
    icon: "🖨️",
    title: "you can print a replacement part instead of buying one",
    blurb: "a broken clip that used to mean a two-week part order is now an hour of plastic in the garage.",
  },
  {
    id: "satellite",
    icon: "🛰️",
    title: "the whole planet has wifi now",
    blurb: "a backpack-sized dish on a boat, a mountain, or a disaster zone gets the same internet as your living room, beamed from low orbit.",
  },
  {
    id: "robotaxi",
    icon: "🚗",
    title: "cars drive themselves and it's boring now",
    blurb: "robotaxis with no one in the driver's seat are a normal hail in several cities, and the news cycle already moved on.",
  },
  {
    id: "xray",
    icon: "🩻",
    title: "software reads your x-ray and catches things",
    blurb: "models trained on millions of scans catch things a tired radiologist at hour nine of a shift might miss.",
  },
  {
    id: "solar",
    icon: "🔋",
    title: "your house makes power and sells the extra back",
    blurb: "panels on the roof, a battery in the garage, and some months the power company pays you.",
  },
  {
    id: "remote",
    icon: "🎮",
    title: "you can hand someone your whole computer, mid-call",
    blurb: "screen-share plus a cloud desktop means \"let me just show you\" now means actually driving your machine from across the planet.",
  },
  {
    id: "jwst",
    icon: "🔭",
    title: "we can see galaxies from before earth existed",
    blurb: "not a drawing, not a simulation — a telescope a million miles away took the picture and beamed it home.",
  },
];

const KEY = "futurewatch:tags:v1";

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const initial = {};
  FUTURES.forEach((f) => {
    if (f.default) initial[f.id] = true;
  });
  return initial;
}

function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

let state = loadState();

const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const totalEl = document.getElementById("total");
const barFill = document.getElementById("barFill");

totalEl.textContent = FUTURES.length;

function render() {
  grid.innerHTML = "";
  FUTURES.forEach((f) => {
    const on = !!state[f.id];
    const card = document.createElement("div");
    card.className = "card" + (on ? " on" : "") + (f.featured ? " featured" : "");
    card.dataset.id = f.id;
    card.innerHTML =
      (f.featured ? '<span class="badge">CASE IN POINT</span>' : "") +
      '<div class="top"><span class="icon">' + f.icon + '</span>' +
      '<span class="check">' + (on ? "✓" : "") + '</span></div>' +
      '<h3>' + f.title + '</h3>' +
      '<p>' + f.blurb + '</p>' +
      (f.credit ? '<span class="credit">via ' + f.credit + '</span>' : "");
    card.addEventListener("click", () => toggle(f.id));
    grid.appendChild(card);
  });
  updateCounter();
}

function toggle(id) {
  state[id] = !state[id];
  saveState(state);
  render();
}

function updateCounter() {
  const count = FUTURES.filter((f) => state[f.id]).length;
  countEl.textContent = count;
  const pct = Math.round((count / FUTURES.length) * 100);
  barFill.style.width = pct + "%";
  updateShare(count);
}

function buildShareText(count) {
  const total = FUTURES.length;
  let text = "we truly live in the future.\n\nI'm tagged on " + count + "/" + total + " of them";
  if (count === total) text = "we truly live in the future.\n\nI'm tagged on all " + total + " of them";
  text += " — " + SITE_URL;
  return text;
}

function updateShare(count) {
  const shareEl = document.getElementById("shareBluesky");
  const text = buildShareText(count);
  shareEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

document.getElementById("resetBtn").addEventListener("click", () => {
  state = {};
  FUTURES.forEach((f) => {
    if (f.default) state[f.id] = true;
  });
  saveState(state);
  render();
});

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      ctx.fillText(line, x, cy);
      line = words[i] + " ";
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
  return cy;
}

function drawCard(count) {
  const canvas = document.getElementById("cardCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const BG = "#060907", INK = "#bdf5d2", DIM = "#5d8871", AMBER = "#ffcf6e", CYAN = "#7fe0e0";

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1e3327";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.font = "700 20px 'JetBrains Mono', monospace";
  ctx.fillStyle = CYAN;
  ctx.fillText("FUTUREWATCH", 60, 80);

  ctx.font = "800 56px 'JetBrains Mono', monospace";
  ctx.fillStyle = INK;
  ctx.fillText("we truly live", 60, 160);
  ctx.fillText("in the future", 60, 222);

  ctx.font = "700 90px 'JetBrains Mono', monospace";
  ctx.fillStyle = AMBER;
  ctx.fillText(count + "/" + FUTURES.length, 60, 340);

  ctx.font = "18px 'JetBrains Mono', monospace";
  ctx.fillStyle = DIM;
  ctx.fillText("futures tagged and counting", 60, 375);

  const cols = 8;
  const cell = 24;
  const gap = 10;
  const startX = 60;
  const startY = 420;
  FUTURES.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cell + gap);
    const y = startY + row * (cell + gap);
    const on = !!state[f.id];
    ctx.fillStyle = on ? "rgba(255,207,110,0.18)" : "#101a14";
    ctx.strokeStyle = on ? AMBER : "#1e3327";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeRect(x, y, cell, cell);
    if (on) {
      ctx.fillStyle = AMBER;
      ctx.font = "16px 'JetBrains Mono', monospace";
      ctx.fillText("✓", x + 6, y + 17);
    }
  });

  ctx.font = "700 24px 'JetBrains Mono', monospace";
  ctx.fillStyle = AMBER;
  ctx.fillText("futurewatch.bisks.net", 60, 580);

  return canvas.toDataURL("image/png");
}

document.getElementById("downloadCard").addEventListener("click", async () => {
  const count = FUTURES.filter((f) => state[f.id]).length;
  const dataUrl = drawCard(count);
  const preview = document.getElementById("cardPreview");
  preview.src = dataUrl;
  preview.style.display = "block";

  if (navigator.share && navigator.canShare) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "futurewatch.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: buildShareText(count),
          title: "futurewatch",
        });
        return;
      }
    } catch (e) {}
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "futurewatch.png";
  a.click();
});

render();
