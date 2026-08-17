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
  (title, who) => `Ash to ash. Page to page. Nothing here gets a second printing.`,
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
  confirmYes: document.getElementById("confirmYes"),
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
    <div class="book-actions">
      <button id="beginBurn" class="danger" type="button">begin the ceremony</button>
    </div>
  `;
  els.stage.appendChild(div);
  document.getElementById("beginBurn").addEventListener("click", () => openConfirm(book));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- ceremony

function openConfirm(book) {
  current = book;
  els.confirmTitle.textContent = `"${book.title}"`;
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
  els.pyreBook.className = "pyreBook";
  els.pyreBook.style.setProperty("--cover", book.cover);
  els.flameCanvas.classList.remove("show");

  const lines = pickN(EULOGY_TEMPLATES, 4).map((t) => t(book.title, book.author));
  for (const line of lines) {
    await typeLine(line);
  }

  els.flameCanvas.classList.add("show");
  els.pyreBook.classList.add("burning");
  const stopFlames = startFlames(els.flameCanvas);
  await sleep(2200);
  els.pyreBook.classList.add("ash");
  await sleep(1500);
  stopFlames();
  els.eulogy.innerHTML = `<span style="color:var(--ash)">${escapeHtml(book.catalog)} is ash now.</span>`;
  await sleep(1400);

  els.ceremony.classList.remove("show");
  showCertificate(book);
}

// ---- flame particles: a small canvas fire sim, nothing fancy -------------

function startFlames(canvas) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  let particles = [];
  let running = true;

  function spawn() {
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H / 2 + 40 + Math.random() * 20,
        vy: -1.2 - Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.8,
        life: 0,
        maxLife: 40 + Math.random() * 40,
        size: 6 + Math.random() * 10,
        hue: 18 + Math.random() * 40,
      });
    }
  }

  function step() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    spawn();
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.01;
      p.life++;
      const t = p.life / p.maxLife;
      const alpha = 1 - t;
      const size = p.size * (1 - t * 0.7);
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 95%, ${55 - t * 25}%, ${alpha})`;
      ctx.arc(p.x, p.y, Math.max(0, size), 0, Math.PI * 2);
      ctx.fill();
    }
    // embers drifting up
    if (Math.random() < 0.3) {
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * 90,
        y: H / 2 + 50,
        vy: -0.6 - Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 1.4,
        life: 0,
        maxLife: 80 + Math.random() * 60,
        size: 1.5 + Math.random() * 2,
        hue: 40 + Math.random() * 20,
      });
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

function showCertificate(book) {
  els.stage.innerHTML = "";
  els.certTitle.textContent = `"${book.title}"`;
  els.certAuthor.textContent = `by ${book.author}`;
  const epitaph = pick(EPITAPHS);
  els.certEpitaph.textContent = epitaph;
  const destroyedAt = new Date();
  els.certStamp.textContent = `${book.catalog} · destroyed ${destroyedAt.toLocaleString()}`;
  els.cert.classList.add("show");

  const shareText = buildShareCard(book, epitaph, destroyedAt);
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

function buildShareCard(book, epitaph, destroyedAt) {
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
  ctx.fillText(`${book.catalog} · destroyed ${destroyedAt.toLocaleString()}`, 60, 560);

  ctx.fillStyle = "#d4622c";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText("burnbook.bisks.net", 60, 600);

  return `I just cremated "${book.title}" by ${book.author} (${book.catalog}). It existed once. It will not exist again. https://burnbook.bisks.net/`;
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
