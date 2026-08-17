// burnbook — forges one procedurally-unique "book" per visit, then walks it
// through a scripted, irreversible cremation. Nothing about a book is ever
// sent anywhere or kept past a page refresh: the only trace that survives
// the ceremony is the certificate the visitor chooses to download or share.

// ---------------------------------------------------------------- word banks

const ADJ = [
  "weathered", "gilded", "unspoken", "forbidden", "brittle", "luminous",
  "hollow", "feral", "tender", "crooked", "silent", "drowned", "threadbare",
  "ashen", "velvet", "iron", "quiet", "wandering", "unfinished", "sunken",
  "glass", "endless", "forgotten", "patient", "restless", "salt-worn",
  "moth-eaten", "half-remembered", "unlicensed", "provisional", "counterfeit",
  "migratory", "overexposed", "underlined", "load-bearing", "combustible",
];

const NOUN = [
  "archive", "orchard", "apology", "atlas", "migration", "inheritance",
  "seance", "ledger", "hunger", "correspondence", "wilderness", "insomnia",
  "harbor", "geometry", "confession", "static", "undertow", "weather",
  "inventory", "liturgy", "sediment", "marginalia", "thaw", "quarantine",
  "honeycomb", "vigil", "tide", "catalog", "exile", "kinship", "recursion",
  "witness", "erosion", "custody", "aftertaste", "inheritance tax",
];

const PROPER = [
  "Wrenmoor", "the Ninth District", "Calloway", "the Vale", "Saint Ferrous",
  "Hollow Creek", "the Long Coast", "Ancion", "the Salt Road", "Embervale",
  "the Drowned Counties", "Petrel Bay", "the Interregnum", "Isolde",
  "Thessaly Row", "the Underwriters", "Gravenhurst", "the Last Exchange",
  "Corrigan's Landing", "the Northern Vacancy",
];

const FIRST = [
  "Marguerite", "Osric", "Petra", "Yannick", "Fen", "Ilsa", "Cormac",
  "Bellamy", "Sorcha", "Ambrose", "Junia", "Teodor", "Wren", "Halcyon",
  "Perpetua", "Casimir", "Odalys", "Rasmus", "Vesper", "Thaddeus",
];

const LAST = [
  "Vane", "Ashworth", "Quill", "Marrow", "Loxley", "Sennet", "Corbeau",
  "Sable", "Wrye", "Hallow", "Bramwell", "Costigan", "Fenwick", "Draye",
  "Ossory", "Tallis", "Vireo", "Kestrel", "Brackish", "Amesbury",
];

const GENRES = [
  "elegy", "fable", "field notes", "confession", "apocrypha", "marginalia",
  "correspondence", "liturgy", "almanac", "testimony", "case study",
  "invocation", "inventory", "epilogue",
];

const TITLE_TEMPLATES = [
  (a, n, p) => `The ${cap(a)} ${cap(n)} of ${p}`,
  (a, n, p) => `${p}, or The ${cap(a)} ${cap(n)}`,
  (a, n, p) => `A ${cap(a)} History of ${cap(n)}`,
  (a, n, p, n2) => `${cap(n)} and ${cap(n2)}`,
  (a, n, p) => `The Last ${cap(n)} in ${p}`,
  (a, n, p) => `Notes on ${cap(a)} ${cap(n)}`,
  (a, n, p) => `What the ${cap(n)} Remembers`,
  (a, n, p, n2, a2) => `${cap(a2)} ${cap(a)} ${cap(n)}`,
  (a, n, p) => `${p}: A ${cap(n)}`,
  (a, n, p) => `Instructions for Leaving ${p}`,
];

const CHAPTER_TEMPLATES = [
  (a, n) => `On ${cap(n)}`,
  (a, n) => `The ${cap(a)} Years`,
  (a, n) => `${cap(n)}, Interrupted`,
  (a, n, p) => `A Letter from ${p}`,
  (a, n) => `What Remained of the ${cap(n)}`,
  (a, n) => `${cap(a)} Weather`,
  (a, n) => `An Inventory of ${cap(n)}`,
  (a, n, p) => `${p} at Dawn`,
  (a, n) => `The ${cap(n)} Nobody Claimed`,
  (a, n) => `Afterward: ${cap(n)}`,
];

const OPENING_TEMPLATES = [
  (a, n, p, who) => `${who} had not meant to stay in ${p} past the ${a} season, but the ${n} had other plans, and by the time anyone thought to write it down, it was already the only version left.`,
  (a, n, p, who) => `Every account of ${p} agrees on one thing: the ${n} arrived first, and everything ${a} came after it.`,
  (a, n, p, who) => `${who} kept a single rule about the ${n} — never name it aloud in ${p} — and broke it exactly once, which is the reason this book exists at all.`,
  (a, n, p, who) => `It is difficult now to say whether the ${n} was ${a} because of ${p}, or whether ${p} became ${a} because of the ${n}. ${who} never settled the question either.`,
  (a, n, p, who) => `There is a ${a} kind of quiet that only settles over ${p} after the ${n} has already happened, and ${who} wrote most of this from inside it.`,
];

const OPENING_TEMPLATES2 = [
  (a, n, p, who) => `What follows is not a complete account. ${who} was ${a} about most things, and the ${n} least of all.`,
  (a, n, p, who) => `Read it once. It was written to be read once, by whoever finished forging it, and by no one else, ever.`,
  (a, n, p, who) => `Somewhere between the first page and this one, the ${n} stopped being a metaphor for ${p} and started being the whole book.`,
];

const EULOGY_TEMPLATES = [
  (title, who) => `We are gathered, briefly, to lose "${title}."`,
  (title, who) => `${who} wrote it. You read it, or you didn't. Either way, it only happened once.`,
  (title, who) => `No copy was kept. No draft survives. This was the only version of the truth it told.`,
  (title, who) => `What is remembered of "${title}" now lives only in whoever was here for this.`,
  (title, who) => `Let the record show: it existed, briefly, and it was never boring.`,
  (title, who) => `Nothing here gets a second printing.`,
];

const EPITAPHS = [
  "It existed once. It will not exist again.",
  "No copy was made. No copy will be.",
  "The only reader was the last reader.",
  "It burned the way it lived: once.",
  "Nothing about this book survives you.",
  "This edition is now permanently out of print.",
  "It is not in any archive, including this one.",
];

// ---------------------------------------------------------------- destruction methods

const METHODS = [
  {
    id: "burn", emoji: "🔥", label: "burn", verbClause: "Once it burns",
    buttonLabel: "burn it", closer: "is ash now.",
    pastPhrase: "cremated", epitaphExtra: "Ash to ash. Page to page.",
  },
  {
    id: "shred", emoji: "✂️", label: "shred", verbClause: "Once it goes through the shredder",
    buttonLabel: "shred it", closer: "is a thousand unreadable strips now.",
    pastPhrase: "shredded", epitaphExtra: "Every strip is too narrow to reassemble.",
  },
  {
    id: "drown", emoji: "🌊", label: "drown", verbClause: "Once it sinks and the ink runs",
    buttonLabel: "drown it", closer: "is silt at the bottom now.",
    pastPhrase: "drowned", epitaphExtra: "Waterlogged, then gone, then forgotten.",
  },
  {
    id: "bury", emoji: "🪦", label: "bury", verbClause: "Once the last shovel of dirt goes on",
    buttonLabel: "bury it", closer: "is six feet down now.",
    pastPhrase: "buried", epitaphExtra: "No headstone. No return address.",
  },
  {
    id: "vaporize", emoji: "🕳️", label: "black hole", verbClause: "Once it crosses the event horizon",
    buttonLabel: "feed the void", closer: "has crossed the event horizon.",
    pastPhrase: "fed to a black hole", epitaphExtra: "Not even the light got out.",
  },
  {
    id: "devour", emoji: "🦗", label: "moths", verbClause: "Once the moths are finished",
    buttonLabel: "feed the moths", closer: "is a binding and some dust now.",
    pastPhrase: "fed to the moths", epitaphExtra: "They left the cover. They left nothing else.",
  },
];

let selectedMethodId = "burn";
function currentMethod() { return METHODS.find((m) => m.id === selectedMethodId) || METHODS[0]; }

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// ---------------------------------------------------------------- forging

function catalogNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `BB-${y}${m}${d}-${hex}`;
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function forgeBook() {
  const a = pick(ADJ), n = pick(NOUN), p = pick(PROPER), n2 = pick(NOUN), a2 = pick(ADJ);
  const title = pick(TITLE_TEMPLATES)(a, n, p, n2, a2);
  const author = `${pick(FIRST)} ${pick(LAST)}`;
  const genre = pick(GENRES);
  const chapters = pickN(CHAPTER_TEMPLATES, 5 + Math.floor(Math.random() * 4)).map((t) => t(pick(ADJ), pick(NOUN), pick(PROPER)));
  const opening = `${pick(OPENING_TEMPLATES)(a, n, p, author)} ${pick(OPENING_TEMPLATES2)(pick(ADJ), pick(NOUN), p, author)}`;
  const pages = 40 + Math.floor(Math.random() * 360);
  const catalog = catalogNumber();
  const hue = hashHue(title + author + catalog);
  const cover = `hsl(${hue} 38% 22%)`;
  const forgedAt = new Date();

  return { title, author, genre, chapters, opening, pages, catalog, cover, hue, forgedAt };
}

// ---------------------------------------------------------------- rendering

const els = {
  forge: document.getElementById("forge"),
  stage: document.getElementById("stage"),
  ceremony: document.getElementById("ceremony"),
  confirmStep: document.getElementById("confirmStep"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmClause: document.getElementById("confirmClause"),
  confirmYes: document.getElementById("confirmYes"),
  confirmYesLabel: document.getElementById("confirmYesLabel"),
  confirmNo: document.getElementById("confirmNo"),
  burnStep: document.getElementById("burnStep"),
  pyreBook: document.getElementById("pyreBook"),
  flameCanvas: document.getElementById("flameCanvas"),
  eulogy: document.getElementById("eulogy"),
  cert: document.getElementById("cert"),
  certTitle: document.getElementById("certTitle"),
  certAuthor: document.getElementById("certAuthor"),
  certEpitaph: document.getElementById("certEpitaph"),
  certStamp: document.getElementById("certStamp"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  forgeAgain: document.getElementById("forgeAgain"),
};

let current = null;

function renderBook(book) {
  els.cert.classList.remove("show");
  els.stage.innerHTML = "";
  const div = document.createElement("div");
  div.className = "book";
  div.style.setProperty("--cover", book.cover);
  div.innerHTML = `
    <div class="stamp">UNIQUE<br>EDITION</div>
    <div class="genre">${escapeHtml(book.genre)}</div>
    <h2 class="title serif">${escapeHtml(book.title)}</h2>
    <div class="byline">by <b>${escapeHtml(book.author)}</b></div>
    <div class="meta">
      <span><b>${book.pages}</b> pages</span>
      <span><b>1</b> of <b>1</b> copies ever printed</span>
      <span>forged ${book.forgedAt.toLocaleString()}</span>
    </div>
    <p class="excerpt serif">${escapeHtml(book.opening)}</p>
    <details class="chapters">
      <summary>table of contents (${book.chapters.length})</summary>
      <ol>${book.chapters.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ol>
    </details>
    <div class="catalog">catalog no. ${book.catalog} · no further copies will be printed, digitized, cached, or archived</div>
    <div class="method-picker">
      <div class="method-label">choose how it ends</div>
      <div class="method-grid" id="methodGrid"></div>
    </div>
    <div class="book-actions">
      <button id="beginBurn" class="danger" type="button">begin the ceremony</button>
    </div>
  `;
  els.stage.appendChild(div);
  renderMethodGrid(div.querySelector("#methodGrid"));
  document.getElementById("beginBurn").addEventListener("click", () => openConfirm(book));
}

function renderMethodGrid(grid) {
  grid.innerHTML = "";
  for (const m of METHODS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "method-btn" + (m.id === selectedMethodId ? " active" : "");
    btn.textContent = `${m.emoji} ${m.label}`;
    btn.addEventListener("click", () => {
      selectedMethodId = m.id;
      grid.querySelectorAll(".method-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    grid.appendChild(btn);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- ceremony

function openConfirm(book) {
  current = book;
  const method = currentMethod();
  els.confirmTitle.textContent = `"${book.title}"`;
  els.confirmClause.textContent = method.verbClause;
  els.confirmYesLabel.textContent = method.buttonLabel;
  els.confirmStep.style.display = "";
  els.burnStep.style.display = "none";
  els.ceremony.classList.add("show");
}

els.confirmNo.addEventListener("click", () => {
  els.ceremony.classList.remove("show");
});

els.confirmYes.addEventListener("click", () => {
  els.confirmStep.style.display = "none";
  els.burnStep.style.display = "";
  runCeremony(current);
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function typeLine(text) {
  els.eulogy.innerHTML = "";
  const span = document.createElement("span");
  els.eulogy.appendChild(span);
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  cursor.textContent = "▍";
  els.eulogy.appendChild(cursor);
  for (let i = 0; i < text.length; i++) {
    span.textContent += text[i];
    await sleep(18);
  }
  await sleep(650);
}

async function runCeremony(book) {
  const method = currentMethod();
  els.pyreBook.className = `pyreBook m-${method.id}`;
  els.pyreBook.style.animation = "";
  els.pyreBook.style.setProperty("--cover", book.cover);
  els.flameCanvas.classList.remove("show");

  const lines = pickN(EULOGY_TEMPLATES, 3).map((t) => t(book.title, book.author));
  lines.push(method.epitaphExtra);
  for (const line of lines) {
    await typeLine(line);
  }

  els.flameCanvas.classList.add("show");
  els.pyreBook.classList.add("active");
  const stopParticles = startParticles(els.flameCanvas, method.id);
  await sleep(2200);
  els.pyreBook.style.animation = "none"; // stop the active-state keyframe so the gone-state transition can take over
  els.pyreBook.classList.add("gone");
  await sleep(1500);
  stopParticles();
  els.eulogy.innerHTML = `<span style="color:var(--ash)">${escapeHtml(book.catalog)} ${escapeHtml(method.closer)}</span>`;
  await sleep(1400);

  els.ceremony.classList.remove("show");
  showCertificate(book, method);
}

// ---- particle sims: one small canvas physics loop per method -------------

function startParticles(canvas, methodId) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2 + 40;
  let particles = [];
  let running = true;

  const SPAWNERS = {
    burn() {
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 60, y: cy + Math.random() * 20,
          vy: -1.2 - Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.8,
          life: 0, maxLife: 40 + Math.random() * 40, size: 6 + Math.random() * 10,
          hue: 18 + Math.random() * 40, shape: "circle",
        });
      }
      if (Math.random() < 0.3) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 90, y: cy + 10,
          vy: -0.6 - Math.random() * 1.2, vx: (Math.random() - 0.5) * 1.4,
          life: 0, maxLife: 80 + Math.random() * 60, size: 1.5 + Math.random() * 2,
          hue: 40 + Math.random() * 20, shape: "circle",
        });
      }
    },
    shred() {
      for (let i = 0; i < 2; i++) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 50, y: cy - 30 + Math.random() * 20,
          vy: 1.6 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 1.6,
          rot: Math.random() * Math.PI, vrot: (Math.random() - 0.5) * 0.3,
          life: 0, maxLife: 70 + Math.random() * 40, w: 5, h: 22 + Math.random() * 14,
          hue: 38, light: 78, shape: "strip",
        });
      }
    },
    drown() {
      if (Math.random() < 0.7) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 70, y: cy + 40 + Math.random() * 20,
          vy: -0.6 - Math.random() * 0.9, vx: (Math.random() - 0.5) * 0.5,
          life: 0, maxLife: 90 + Math.random() * 60, size: 2 + Math.random() * 5,
          hue: 200, shape: "circle", wobble: Math.random() * Math.PI * 2,
        });
      }
    },
    bury() {
      for (let i = 0; i < 2; i++) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 100, y: cy - 90 - Math.random() * 30,
          vy: 1.8 + Math.random() * 1.4, vx: (Math.random() - 0.5) * 0.6,
          life: 0, maxLife: 60 + Math.random() * 30, size: 4 + Math.random() * 6,
          hue: 28, light: 22 + Math.random() * 10, shape: "clump",
        });
      }
    },
    vaporize() {
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 60;
        particles.push({
          x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
          angle, dist, spin: 0.08 + Math.random() * 0.08,
          life: 0, maxLife: 60 + Math.random() * 30, size: 2 + Math.random() * 3,
          hue: 260 + Math.random() * 40, shape: "orbit",
        });
      }
    },
    devour() {
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: cx + Math.cos(angle) * 55, y: cy + Math.sin(angle) * 60,
          angle, radius: 50 + Math.random() * 20, speed: 0.05 + Math.random() * 0.06,
          life: 0, maxLife: 50 + Math.random() * 30, size: 2 + Math.random() * 2,
          hue: 42, light: 55, shape: "flit",
        });
      }
    },
  };

  function update(p) {
    switch (p.shape) {
      case "circle":
        p.x += p.vx; p.y += p.vy; p.vy -= p.wobble !== undefined ? -0.005 : 0.01;
        if (p.wobble !== undefined) { p.wobble += 0.2; p.x += Math.sin(p.wobble) * 0.4; }
        break;
      case "strip":
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vrot;
        break;
      case "clump":
        p.x += p.vx; p.y += p.vy; p.vy += 0.08;
        break;
      case "orbit":
        p.angle += p.spin; p.dist *= 0.965;
        p.x = cx + Math.cos(p.angle) * p.dist; p.y = cy + Math.sin(p.angle) * p.dist;
        break;
      case "flit":
        p.angle += p.speed; p.radius *= 0.99;
        p.x = cx + Math.cos(p.angle) * p.radius; p.y = cy + Math.sin(p.angle * 1.3) * p.radius * 0.6;
        break;
    }
    p.life++;
  }

  function draw(p) {
    const t = p.life / p.maxLife;
    const alpha = Math.max(0, 1 - t);
    ctx.save();
    if (p.shape === "circle") {
      const size = p.size * (1 - t * 0.7);
      ctx.beginPath();
      ctx.fillStyle = p.light !== undefined
        ? `hsla(${p.hue}, 70%, ${p.light}%, ${alpha})`
        : `hsla(${p.hue}, 95%, ${55 - t * 25}%, ${alpha})`;
      ctx.arc(p.x, p.y, Math.max(0, size), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "strip") {
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `hsla(${p.hue}, 40%, ${p.light}%, ${alpha})`;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.shape === "clump") {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 35%, ${p.light}%, ${alpha})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "orbit") {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "flit") {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 30%, ${p.light}%, ${alpha})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function step() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    (SPAWNERS[methodId] || SPAWNERS.burn)();
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const p of particles) {
      update(p);
      draw(p);
    }
    requestAnimationFrame(step);
  }
  step();

  return () => {
    running = false;
    setTimeout(() => ctx.clearRect(0, 0, W, H), 400);
  };
}

// ---------------------------------------------------------------- certificate

function showCertificate(book, method) {
  els.stage.innerHTML = "";
  els.certTitle.textContent = `"${book.title}"`;
  els.certAuthor.textContent = `by ${book.author}`;
  const epitaph = pick(EPITAPHS);
  els.certEpitaph.textContent = epitaph;
  const destroyedAt = new Date();
  els.certStamp.textContent = `${book.catalog} · ${method.pastPhrase} ${destroyedAt.toLocaleString()}`;
  els.cert.classList.add("show");

  const shareText = buildShareCard(book, epitaph, destroyedAt, method);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  els.shareDownload.onclick = () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `burnbook-${book.catalog}.png`;
      a.click();
    });
  };

  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.onclick = () => {
      els.shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `burnbook-${book.catalog}.png`, { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "burnbook" });
        } catch (_) {
          // cancelled or unsupported — no-op
        }
      });
    };
  }
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

function buildShareCard(book, epitaph, destroyedAt, method) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const serif = "Georgia, serif";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#100b08");
  bg.addColorStop(1, "#1c1108");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ember glow
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, 500);
  glow.addColorStop(0, "rgba(212, 98, 44, 0.35)");
  glow.addColorStop(1, "rgba(212, 98, 44, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#a3927b";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText("BURNBOOK · CERTIFICATE OF DESTRUCTION", 60, 90);

  ctx.fillStyle = "#ece1c8";
  ctx.font = `700 46px ${serif}`;
  wrapText(ctx, `"${book.title}"`, 60, 190, 1080, 54);

  ctx.fillStyle = "#cbbd9c";
  ctx.font = `26px ${mono}`;
  ctx.fillText(`by ${book.author}`, 60, 300);

  ctx.fillStyle = "#f0a441";
  ctx.font = `italic 30px ${serif}`;
  wrapText(ctx, epitaph, 60, 400, 1080, 40);

  ctx.fillStyle = "#5a5048";
  ctx.font = `20px ${mono}`;
  ctx.fillText(`${book.catalog} · ${method.pastPhrase} ${destroyedAt.toLocaleString()}`, 60, 560);

  ctx.fillStyle = "#d4622c";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText("burnbook.bisks.net", 60, 600);

  return `I just ${method.pastPhrase} "${book.title}" by ${book.author} (${book.catalog}). It existed once. It will not exist again. https://burnbook.bisks.net/`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word + " ";
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, curY);
}

// ---------------------------------------------------------------- wiring

els.forge.addEventListener("click", () => renderBook(forgeBook()));
els.forgeAgain.addEventListener("click", () => renderBook(forgeBook()));

renderBook(forgeBook());
