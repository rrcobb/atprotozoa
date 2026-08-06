"use strict";

// Moods placed on a rough valence/arousal wheel so "distance" between two
// moods maps to something that actually feels emotionally coherent, instead
// of a flat random score. x = negative/positive feeling, y = calm/intense.
const MOODS = [
  { key: "joyful", label: "joyful", emoji: "😄", x: 0.8, y: 0.6 },
  { key: "romantic", label: "romantic", emoji: "💕", x: 0.7, y: 0.15 },
  { key: "hopeful", label: "hopeful", emoji: "🌱", x: 0.55, y: 0.3 },
  { key: "hype", label: "hype", emoji: "⚡", x: 0.6, y: 0.9 },
  { key: "chill", label: "chill", emoji: "😌", x: 0.5, y: -0.6 },
  { key: "cozy", label: "cozy", emoji: "🕯️", x: 0.4, y: -0.4 },
  { key: "dreamy", label: "dreamy", emoji: "🌙", x: 0.2, y: -0.3 },
  { key: "nostalgic", label: "nostalgic", emoji: "🍂", x: -0.05, y: -0.2 },
  { key: "melancholy", label: "melancholy", emoji: "🌧️", x: -0.5, y: -0.3 },
  { key: "lonely", label: "lonely", emoji: "🌌", x: -0.6, y: -0.55 },
  { key: "anxious", label: "anxious", emoji: "😬", x: -0.5, y: 0.6 },
  { key: "angry", label: "angry", emoji: "🔥", x: -0.75, y: 0.8 },
];

// Curated real songs (title + artist only), tagged by mood key. Used to fill
// out the generated half of the shared playlist around whatever the two
// people actually typed in as their own favorites.
const SONGS = {
  joyful: ["Happy — Pharrell Williams", "Walking on Sunshine — Katrina & The Waves", "Good as Hell — Lizzo", "Can't Stop the Feeling! — Justin Timberlake", "Uptown Funk — Mark Ronson ft. Bruno Mars", "Best Day of My Life — American Authors"],
  romantic: ["At Last — Etta James", "Perfect — Ed Sheeran", "All of Me — John Legend", "Thinking Out Loud — Ed Sheeran", "Can't Help Falling in Love — Elvis Presley", "La Vie en Rose — Édith Piaf"],
  hopeful: ["Here Comes the Sun — The Beatles", "Fix You — Coldplay", "Brave — Sara Bareilles", "Three Little Birds — Bob Marley", "Rise Up — Andra Day", "I Lived — OneRepublic"],
  hype: ["Stronger — Kanye West", "Eye of the Tiger — Survivor", "Can't Hold Us — Macklemore & Ryan Lewis", "Levitating — Dua Lipa", "Titanium — David Guetta ft. Sia", "Blinding Lights — The Weeknd"],
  chill: ["Sunday Morning — Maroon 5", "Banana Pancakes — Jack Johnson", "Landslide — Fleetwood Mac", "Holocene — Bon Iver", "Breathe — Télépopmusik", "Watermelon Sugar — Harry Styles"],
  cozy: ["Autumn Leaves — Eva Cassidy", "Home — Edward Sharpe & The Magnetic Zeros", "Put Your Records On — Corinne Bailey Rae", "Sweater Weather — The Neighbourhood", "cardigan — Taylor Swift", "Sunday Candy — Donnie Trumpet & The Social Experiment"],
  dreamy: ["Dreams — Fleetwood Mac", "Space Song — Beach House", "Ribs — Lorde", "Video Games — Lana Del Rey", "Weightless — Marconi Union", "Moon River — Audrey Hepburn"],
  nostalgic: ["September — Earth, Wind & Fire", "Yellow — Coldplay", "The Night We Met — Lord Huron", "Vienna — Billy Joel", "Boston — Augustana", "Photograph — Ed Sheeran"],
  melancholy: ["Someone Like You — Adele", "Hurt — Johnny Cash", "Skinny Love — Bon Iver", "Everybody Hurts — R.E.M.", "Liability — Lorde", "Motion Sickness — Phoebe Bridgers"],
  lonely: ["Alone — Heart", "Bloodstream — Stateless", "Vincent — Don McLean", "Iris — Goo Goo Dolls", "Lover, You Should've Come Over — Jeff Buckley", "Nothing Compares 2 U — Sinéad O'Connor"],
  anxious: ["Everybody's Changing — Keane", "Breathe Me — Sia", "The Chain — Fleetwood Mac", "Mad World — Gary Jules", "Heavy — Linkin Park ft. Kiiara", "1-800-273-8255 — Logic"],
  angry: ["Break Stuff — Limp Bizkit", "Killing in the Name — Rage Against the Machine", "You Oughta Know — Alanis Morissette", "Before I Forget — Slipknot", "Bad Blood — Taylor Swift", "Zombie — The Cranberries"],
};

const VERDICTS = [
  { min: 88, text: "cosmically in sync", lines: [
    "put this on the playlist, it's basically a duet already.",
    "you two are finishing each other's choruses.",
    "this is the kind of match that gets its own group chat name.",
  ] },
  { min: 72, text: "genuinely well-matched", lines: [
    "different songs, same wavelength — that's the good kind of overlap.",
    "not identical, but it clicks. worth a second playlist.",
    "this holds up past the first three tracks, which is rare.",
  ] },
  { min: 55, text: "good complementary energy", lines: [
    "you balance each other out more than you match, and that works too.",
    "one of you sets the mood, the other one keeps it interesting.",
    "not a mirror image, but a good pairing — send the playlist and see.",
  ] },
  { min: 38, text: "an interesting contrast", lines: [
    "very different moods walked into this playlist. could go either way.",
    "this is either going to be a great mix or a total mess. no in-between.",
    "opposites, technically. see what happens when the shuffle hits track 4.",
  ] },
  { min: 0, text: "chaotic but could be fun", lines: [
    "wildly different wavelengths — but some of the best mixtapes start here.",
    "this playlist has no business working. try it anyway.",
    "not a match on paper. put the songs on and find out in person.",
  ] },
];

// ---- deterministic hashing / RNG (same inputs -> same match, every time) ----
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function moodByKey(key) {
  return MOODS.find((m) => m.key === key) || MOODS[0];
}

function computeMatch({ nameA, nameB, songA, songB, moodAKey, moodBKey }) {
  const moodA = moodByKey(moodAKey);
  const moodB = moodByKey(moodBKey);

  const dist = Math.hypot(moodA.x - moodB.x, moodA.y - moodB.y);
  const maxDist = Math.hypot(2, 2); // wheel spans roughly [-1,1] on each axis
  const closeness = 1 - dist / maxDist; // 0..1

  const seed = hashString([nameA, nameB, songA, songB, moodAKey, moodBKey].join("|"));
  const rng = mulberry32(seed);

  const base = 35 + closeness * 50;
  const jitter = (rng() - 0.5) * 26; // +/-13, personalized by names+songs
  const score = Math.round(clamp(base + jitter, 3, 99));

  const bucket = VERDICTS.find((v) => score >= v.min);
  const line = bucket.lines[seed % bucket.lines.length];

  // playlist: the two typed-in favorites up front, then songs pulled from
  // both moods' pools, shuffled deterministically off the same seed.
  const poolA = SONGS[moodA.key] || [];
  const poolB = SONGS[moodB.key] || [];
  const pool = seededShuffle(
    [...poolA.map((s) => ({ title: s, from: moodA })), ...poolB.map((s) => ({ title: s, from: moodB }))],
    rng
  );

  const seen = new Set();
  const generated = [];
  for (const song of pool) {
    if (seen.has(song.title)) continue;
    seen.add(song.title);
    generated.push(song);
    if (generated.length >= 6) break;
  }

  const playlist = [];
  if (songA.trim()) playlist.push({ title: songA.trim(), tag: nameA.trim() || "you", seed: true });
  if (songB.trim()) playlist.push({ title: songB.trim(), tag: nameB.trim() || "them", seed: true });
  for (const g of generated) playlist.push({ title: g.title, tag: g.from.emoji + " " + g.from.label, seed: false });

  return { moodA, moodB, score, verdictText: bucket.text, verdictLine: line, playlist };
}

// ---- UI wiring ----
const els = {
  screenForm: document.getElementById("screen-form"),
  screenResult: document.getElementById("screen-result"),
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  songA: document.getElementById("songA"),
  songB: document.getElementById("songB"),
  moodA: document.getElementById("moodA"),
  moodB: document.getElementById("moodB"),
  matchBtn: document.getElementById("matchBtn"),
  scoreNum: document.getElementById("scoreNum"),
  scoreVerdict: document.getElementById("scoreVerdict"),
  scoreSub: document.getElementById("scoreSub"),
  chipNameA: document.getElementById("chipNameA"),
  chipMoodA: document.getElementById("chipMoodA"),
  chipNameB: document.getElementById("chipNameB"),
  chipMoodB: document.getElementById("chipMoodB"),
  playlist: document.getElementById("playlist"),
  shareBtn: document.getElementById("shareBtn"),
  copyBtn: document.getElementById("copyBtn"),
  againBtn: document.getElementById("againBtn"),
};

for (const sel of [els.moodA, els.moodB]) {
  for (const m of MOODS) {
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = `${m.emoji} ${m.label}`;
    sel.appendChild(opt);
  }
}
els.moodA.value = "hopeful";
els.moodB.value = "chill";

let current = null;

function buildShareUrl(input) {
  const p = new URLSearchParams();
  p.set("a", input.nameA);
  p.set("b", input.nameB);
  p.set("sa", input.songA);
  p.set("sb", input.songB);
  p.set("ma", input.moodAKey);
  p.set("mb", input.moodBKey);
  return "https://moodmatch.bisks.net/?" + p.toString();
}

function readInputFromForm() {
  return {
    nameA: els.nameA.value || "you",
    nameB: els.nameB.value || "them",
    songA: els.songA.value,
    songB: els.songB.value,
    moodAKey: els.moodA.value,
    moodBKey: els.moodB.value,
  };
}

function showResult(input) {
  current = { input, match: computeMatch(input) };
  const { match } = current;

  els.screenForm.classList.add("hidden");
  els.screenResult.classList.remove("hidden");

  els.scoreNum.textContent = String(match.score);
  els.scoreVerdict.textContent = match.verdictText;
  els.scoreSub.textContent = match.verdictLine;

  els.chipNameA.textContent = input.nameA;
  els.chipMoodA.textContent = `${match.moodA.emoji} ${match.moodA.label}`;
  els.chipNameB.textContent = input.nameB;
  els.chipMoodB.textContent = `${match.moodB.emoji} ${match.moodB.label}`;

  els.playlist.innerHTML = "";
  match.playlist.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "track" + (t.seed ? " seed" : "");
    row.innerHTML = `<span class="track-n">${i + 1}</span><span class="track-title">${escapeHtml(t.title)}</span><span class="track-tag">${escapeHtml(t.tag)}</span>`;
    els.playlist.appendChild(row);
  });

  const url = buildShareUrl(input);
  history.replaceState(null, "", url.replace("https://moodmatch.bisks.net", ""));
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

els.matchBtn.addEventListener("click", () => {
  showResult(readInputFromForm());
});

els.againBtn.addEventListener("click", () => {
  els.screenResult.classList.add("hidden");
  els.screenForm.classList.remove("hidden");
  history.replaceState(null, "", "/");
});

// ---- restore a shared match straight from the URL ----
(function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has("a") && !p.has("b")) return;
  const input = {
    nameA: (p.get("a") || "you").slice(0, 24),
    nameB: (p.get("b") || "them").slice(0, 24),
    songA: (p.get("sa") || "").slice(0, 60),
    songB: (p.get("sb") || "").slice(0, 60),
    moodAKey: MOODS.some((m) => m.key === p.get("ma")) ? p.get("ma") : "hopeful",
    moodBKey: MOODS.some((m) => m.key === p.get("mb")) ? p.get("mb") : "chill",
  };
  els.nameA.value = input.nameA === "you" ? "" : input.nameA;
  els.nameB.value = input.nameB === "them" ? "" : input.nameB;
  els.songA.value = input.songA;
  els.songB.value = input.songB;
  els.moodA.value = input.moodAKey;
  els.moodB.value = input.moodBKey;
  showResult(input);
})();

// ---- sharing ----
function buildShareText() {
  if (!current) return "";
  const { input, match } = current;
  const url = buildShareUrl(input);
  return `${input.nameA} + ${input.nameB}: ${match.score}% match (${match.verdictText}). we made a playlist: ${url}`;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildShareCard() {
  const { input, match } = current;
  const c = document.getElementById("sharecanvas");
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;

  const bg = ctx.createRadialGradient(W / 2, -60, 100, W / 2, H / 2, W);
  bg.addColorStop(0, "#3a1d5c");
  bg.addColorStop(1, "#100a17");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.font = "800 52px monospace";
  ctx.fillStyle = "#ff5fa8";
  ctx.fillText("moodmatch", W / 2, 130);

  ctx.font = "800 130px monospace";
  ctx.fillStyle = "#f4ecff";
  ctx.shadowColor = "rgba(110,242,201,0.5)";
  ctx.shadowBlur = 30;
  ctx.fillText(match.score + "%", W / 2, 320);
  ctx.shadowBlur = 0;

  ctx.font = "800 34px monospace";
  ctx.fillStyle = "#6ef2c9";
  ctx.fillText(match.verdictText, W / 2, 380);

  ctx.font = "600 30px monospace";
  ctx.fillStyle = "#f4ecff";
  ctx.fillText(`${match.moodA.emoji} ${input.nameA}  ×  ${input.nameB} ${match.moodB.emoji}`, W / 2, 460);

  ctx.font = "22px monospace";
  ctx.fillStyle = "#a998c4";
  const subLines = wrapLines(ctx, match.verdictLine, W - 200);
  subLines.forEach((l, i) => ctx.fillText(l, W / 2, 510 + i * 30));

  ctx.strokeStyle = "#362450";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(120, 600);
  ctx.lineTo(W - 120, 600);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "700 22px monospace";
  ctx.fillStyle = "#a998c4";
  ctx.fillText("today's shared playlist:", W / 2, 645);

  ctx.font = "22px monospace";
  ctx.fillStyle = "#f4ecff";
  match.playlist.slice(0, 5).forEach((t, i) => {
    ctx.fillText(truncate(ctx, t.title, W - 160), W / 2, 690 + i * 36);
  });

  ctx.font = "600 26px monospace";
  ctx.fillStyle = "#6ef2c9";
  ctx.fillText("moodmatch.bisks.net", W / 2, 1010);

  return c;
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function openBlueskyIntent(text) {
  const href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  window.open(href, "_blank", "noopener");
}

els.shareBtn.addEventListener("click", async () => {
  if (!current) return;
  const shareText = buildShareText();
  const canvas = buildShareCard();

  if (canShareFiles()) {
    canvas.toBlob(async (blob) => {
      const file = new File([blob], "moodmatch.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "moodmatch" });
        return;
      } catch {
        // fall through to bluesky intent below
      }
      openBlueskyIntent(shareText);
    }, "image/png");
  } else {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "moodmatch.png";
      a.click();
    }, "image/png");
    openBlueskyIntent(shareText);
  }
});

els.copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const url = buildShareUrl(current.input);
  try {
    await navigator.clipboard.writeText(url);
    els.copyBtn.textContent = "copied!";
    setTimeout(() => (els.copyBtn.textContent = "copy link to this match"), 1400);
  } catch {
    openBlueskyIntent(buildShareText());
  }
});
