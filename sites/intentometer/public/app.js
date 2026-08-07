"use strict";

// Five flavors of "what you really meant." Word/phrase lists are lowercase;
// matching is done against a lowercased copy of the input. Weight is how
// hard a single hit pushes that category (before caps/punctuation signals
// are added on top).
const CATS = {
  genuine: {
    label: "genuine",
    color: "#6ef2c9",
    weight: 6,
    words: ["love", "miss you", "thank you", "thanks so much", "appreciate", "grateful", "proud of", "glad", "happy for you", "means a lot", "really do", "so sweet"],
    emoji: ["❤️", "💕", "🥰", "🙏", "😊", "💖", "🥺"],
  },
  petty: {
    label: "petty",
    color: "#ffb84d",
    weight: 7,
    words: ["fine", "whatever", "sure jan", "noted", "cool cool cool", "must be nice", "no worries", "totally fine", "k.", "anyway", "if you say so", "good for you", "wow ok"],
    emoji: ["🙄", "😏", "💅", "😒"],
  },
  feral: {
    label: "feral",
    color: "#ff5fa8",
    weight: 8,
    words: ["swear to god", "unhinged", "feral", "i will scream", "kill", "murder", "rage", "losing my mind", "i cannot even", "absolutely not", "so help me", "done with this"],
    emoji: ["💀", "🔪", "🔥", "😤", "🖕", "😡"],
  },
  guarded: {
    label: "guarded",
    color: "#7fb3ff",
    weight: 6,
    words: ["maybe", "i guess", "idk", "no offense but", "not to be dramatic but", "just saying", "per my last email", "allegedly", "supposedly", "with all due respect"],
    emoji: ["👀", "😬", "🫡"],
  },
  chaotic: {
    label: "chaotic",
    color: "#f4e04d",
    weight: 5,
    words: ["lol", "lmao", "haha", "literally", "random but", "wait no", "anyway so", "ok so", "bear with me", "not to be that person"],
    emoji: ["😭", "🤡", "🫠", "🙃", "😵‍💫"],
  },
};

const CAT_ORDER = ["genuine", "petty", "feral", "guarded", "chaotic"];

const VERDICTS = [
  { min: 82, text: "certified unhinged", lines: [
    "this was not written by a person who paused to reconsider.",
    "screenshot this before you regret it. too late, we already did.",
    "the group chat is going to have questions.",
  ] },
  { min: 62, text: "feral, but self-aware about it", lines: [
    "you know exactly what you're doing and you're doing it anyway.",
    "there's a version of this with less exclamation points. you didn't write it.",
    "this reads like the third draft, not the first — and it shows.",
  ] },
  { min: 42, text: "plausible deniability intact", lines: [
    "technically defensible. spiritually, we both know.",
    "if anyone asks, you can say you meant it kindly. barely.",
    "a solid B+ in saying something while saying nothing.",
  ] },
  { min: 22, text: "suspiciously composed", lines: [
    "almost too calm. what are you not saying.",
    "this is the tone of someone editing out three other sentences.",
    "measured. deliberate. slightly worrying, honestly.",
  ] },
  { min: 0, text: "so calm it's a little suspicious", lines: [
    "either you mean this completely or you're playing a very long game.",
    "zero red flags detected, which is itself a red flag.",
    "this message has never hurt anyone and we don't trust it.",
  ] },
];

// ---- deterministic hashing / RNG (same input -> same reading, every time) ----
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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function computeIntent(rawText) {
  const text = rawText.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const raw = { genuine: 3, petty: 3, feral: 3, guarded: 3, chaotic: 3 };
  const evidence = [];

  for (const key of CAT_ORDER) {
    const cat = CATS[key];
    for (const phrase of cat.words) {
      if (lower.includes(phrase)) {
        raw[key] += cat.weight;
        evidence.push({ cat: key, phrase: `"${phrase}"`, weight: cat.weight });
      }
    }
    for (const e of cat.emoji) {
      if (text.includes(e)) {
        raw[key] += 5;
        evidence.push({ cat: key, phrase: e, weight: 5 });
      }
    }
  }

  const bangs = (text.match(/!/g) || []).length;
  if (bangs) {
    raw.feral += Math.min(bangs, 5) * 4;
    raw.chaotic += Math.min(bangs, 5) * 2;
    evidence.push({ cat: "feral", phrase: bangs >= 3 ? `${bangs} exclamation points in a row` : "an exclamation point", weight: Math.min(bangs, 5) * 4 });
  }

  const qmarks = (text.match(/\?/g) || []).length;
  if (qmarks) {
    raw.guarded += Math.min(qmarks, 5) * 3;
    evidence.push({ cat: "guarded", phrase: "a question it didn't need to ask", weight: Math.min(qmarks, 5) * 3 });
  }

  const ellipses = (text.match(/\.\.\./g) || []).length;
  if (ellipses) {
    raw.guarded += ellipses * 4;
    raw.petty += ellipses * 2;
    evidence.push({ cat: "guarded", phrase: "a trailing off ellipsis", weight: ellipses * 4 });
  }

  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upperLetters = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 4) {
    const capsRatio = upperLetters.length / letters.length;
    if (capsRatio > 0.35) {
      raw.feral += Math.round(capsRatio * 60);
      evidence.push({ cat: "feral", phrase: "written in ALL CAPS", weight: Math.round(capsRatio * 60) });
    }
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && /[.!]$/.test(text)) {
    raw.petty += 14;
    evidence.push({ cat: "petty", phrase: "a suspiciously short reply", weight: 14 });
  }

  if (words.length >= 12 && !/[.!?]/.test(text)) {
    raw.chaotic += 10;
    evidence.push({ cat: "chaotic", phrase: "a run-on sentence with zero punctuation brakes", weight: 10 });
  }

  const total = CAT_ORDER.reduce((s, k) => s + raw[k], 0);
  const pct = {};
  let assigned = 0;
  CAT_ORDER.forEach((k, i) => {
    if (i === CAT_ORDER.length - 1) {
      pct[k] = 100 - assigned;
    } else {
      pct[k] = Math.round((raw[k] / total) * 100);
      assigned += pct[k];
    }
  });

  const dominant = CAT_ORDER.slice().sort((a, b) => pct[b] - pct[a])[0];

  const intensity = clamp(
    Math.round(pct.feral * 0.8 + pct.chaotic * 0.5 + pct.petty * 0.2 - pct.genuine * 0.3 - pct.guarded * 0.1 + 25),
    0,
    100
  );

  const seed = hashString(text);
  const rng = mulberry32(seed);
  const bucket = VERDICTS.find((v) => intensity >= v.min);
  const verdictLine = bucket.lines[Math.floor(rng() * bucket.lines.length)];

  let tell;
  const dominantEvidence = evidence.filter((e) => e.cat === dominant).sort((a, b) => b.weight - a.weight);
  if (dominantEvidence.length) {
    tell = dominantEvidence[0];
  } else if (evidence.length) {
    tell = evidence.slice().sort((a, b) => b.weight - a.weight)[0];
  } else {
    tell = null;
  }

  return { pct, dominant, intensity, verdictText: bucket.text, verdictLine, tell };
}

// ---- UI wiring ----
const els = {
  screenForm: document.getElementById("screen-form"),
  screenResult: document.getElementById("screen-result"),
  message: document.getElementById("message"),
  charcount: document.getElementById("charcount"),
  readBtn: document.getElementById("readBtn"),
  needle: document.getElementById("needle"),
  intensityNum: document.getElementById("intensityNum"),
  scoreVerdict: document.getElementById("scoreVerdict"),
  scoreSub: document.getElementById("scoreSub"),
  bars: document.getElementById("bars"),
  tell: document.getElementById("tell"),
  shareBtn: document.getElementById("shareBtn"),
  copyBtn: document.getElementById("copyBtn"),
  againBtn: document.getElementById("againBtn"),
};

let current = null;

function buildShareUrl(text) {
  const p = new URLSearchParams();
  p.set("m", text);
  return "https://intentometer.bisks.net/?" + p.toString();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showResult(text) {
  const result = computeIntent(text);
  if (!result) return;
  current = { text, result };

  els.screenForm.classList.add("hidden");
  els.screenResult.classList.remove("hidden");

  const rotate = -90 + (result.intensity / 100) * 180;
  els.needle.style.transform = `rotate(${rotate}deg)`;
  els.intensityNum.textContent = String(result.intensity);
  els.scoreVerdict.textContent = result.verdictText;
  els.scoreSub.textContent = result.verdictLine;

  els.bars.innerHTML = "";
  CAT_ORDER.slice()
    .sort((a, b) => result.pct[b] - result.pct[a])
    .forEach((key) => {
      const cat = CATS[key];
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `<span class="bar-label" style="color:${cat.color}">${cat.label}</span><span class="bar-track"><span class="bar-fill" style="width:${result.pct[key]}%;background:${cat.color}"></span></span><span class="bar-pct">${result.pct[key]}%</span>`;
      els.bars.appendChild(row);
    });

  if (result.tell) {
    els.tell.innerHTML = `<b>the tell:</b> ${escapeHtml(result.tell.phrase)}`;
  } else {
    els.tell.innerHTML = `<b>the tell:</b> nothing obvious. that's not nothing.`;
  }

  history.replaceState(null, "", buildShareUrl(text).replace("https://intentometer.bisks.net", ""));
}

function updateCharcount() {
  els.charcount.textContent = String(els.message.value.length);
  els.readBtn.disabled = els.message.value.trim().length === 0;
}

els.message.addEventListener("input", updateCharcount);
updateCharcount();

els.readBtn.addEventListener("click", () => {
  showResult(els.message.value);
});

els.message.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !els.readBtn.disabled) {
    showResult(els.message.value);
  }
});

els.againBtn.addEventListener("click", () => {
  els.screenResult.classList.add("hidden");
  els.screenForm.classList.remove("hidden");
  history.replaceState(null, "", "/");
});

// ---- restore a shared reading straight from the URL ----
(function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has("m")) return;
  const text = p.get("m").slice(0, 220);
  els.message.value = text;
  updateCharcount();
  showResult(text);
})();

// ---- sharing ----
function buildShareText() {
  if (!current) return "";
  const { text, result } = current;
  const url = buildShareUrl(text);
  return `the intentometer read my message as ${result.intensity}% ${result.verdictText} (mostly ${result.dominant}, ${result.pct[result.dominant]}%): ${url}`;
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

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function buildShareCard() {
  const { text, result } = current;
  const c = document.getElementById("sharecanvas");
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;

  const bg = ctx.createRadialGradient(W / 2, -60, 100, W / 2, H / 2, W);
  bg.addColorStop(0, "#3a1d5c");
  bg.addColorStop(1, "#100a17");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.font = "800 46px monospace";
  ctx.fillStyle = "#ff5fa8";
  ctx.fillText("the intentometer", W / 2, 120);

  ctx.font = "800 150px monospace";
  ctx.fillStyle = "#f4ecff";
  ctx.shadowColor = "rgba(255,95,168,0.5)";
  ctx.shadowBlur = 30;
  ctx.fillText(result.intensity + "%", W / 2, 300);
  ctx.shadowBlur = 0;

  ctx.font = "800 36px monospace";
  ctx.fillStyle = "#6ef2c9";
  ctx.fillText(result.verdictText, W / 2, 355);

  ctx.font = "22px monospace";
  ctx.fillStyle = "#a998c4";
  const quoteLines = wrapLines(ctx, `"${text}"`, W - 200);
  quoteLines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 420 + i * 32));

  ctx.strokeStyle = "#362450";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(120, 560);
  ctx.lineTo(W - 120, 560);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "700 22px monospace";
  ctx.fillStyle = "#a998c4";
  ctx.fillText("the full reading:", W / 2, 605);

  const barColors = { genuine: "#6ef2c9", petty: "#ffb84d", feral: "#ff5fa8", guarded: "#7fb3ff", chaotic: "#f4e04d" };
  ctx.font = "24px monospace";
  CAT_ORDER.slice()
    .sort((a, b) => result.pct[b] - result.pct[a])
    .forEach((key, i) => {
      ctx.fillStyle = barColors[key];
      ctx.fillText(truncate(ctx, `${CATS[key].label}: ${result.pct[key]}%`, W - 160), W / 2, 650 + i * 40);
    });

  ctx.font = "600 26px monospace";
  ctx.fillStyle = "#6ef2c9";
  ctx.fillText("intentometer.bisks.net", W / 2, 1010);

  return c;
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
      const file = new File([blob], "intentometer.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "the intentometer" });
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
      a.download = "intentometer.png";
      a.click();
    }, "image/png");
    openBlueskyIntent(shareText);
  }
});

els.copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const url = buildShareUrl(current.text);
  try {
    await navigator.clipboard.writeText(url);
    els.copyBtn.textContent = "copied!";
    setTimeout(() => (els.copyBtn.textContent = "copy link to this reading"), 1400);
  } catch {
    openBlueskyIntent(buildShareText());
  }
});
