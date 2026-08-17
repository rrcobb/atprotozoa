"use strict";

// Five flavors of "why this isn't normal" (mundane pulls the score UP, the
// other four pull it down). Word/phrase lists are lowercase; matching is
// done against a lowercased copy of the input. Weight is how hard a single
// hit pushes that category (before punctuation/caps signals are added).
const CATS = {
  mundane: {
    label: "mundane",
    color: "#2f8f5b",
    weight: 6,
    words: [
      "how are you", "how's it going", "what's up", "nice to meet you", "good morning",
      "good night", "good afternoon", "thank you", "thanks so much", "no worries",
      "sounds good", "let me know", "have a good day", "have a good one", "take care",
      "happy birthday", "on my way", "talk soon", "see you later", "same here",
      "i agree", "makes sense", "sounds like a plan", "safe travels", "get well soon",
      "congratulations", "nice weather", "long time no see",
    ],
    emoji: ["🙂", "👍", "😊", "🎉"],
  },
  extremely_online: {
    label: "extremely online",
    color: "#c98a1f",
    weight: 7,
    words: [
      "mutuals", "the algorithm", "ratio", "vagueposting", "for you page", "delulu",
      "rizz", "no cap", "bestie", "the girlies", "unalive", "-pilled", "based",
      "cringe", "npc", "touch grass", "brainrot", "moot", "tfw", "iykyk", "rent free",
      "quote tweet", "og post", "the timeline", "girlboss", "it's giving",
      "the discourse", "main character energy", "screenshot this", "the reply guys",
      "block and move on",
    ],
    emoji: ["💀", "😭", "🫠"],
  },
  cult_coded: {
    label: "cult-coded",
    color: "#8b5cd6",
    weight: 8,
    words: [
      "you freaks", "what else is like this", "trust the process", "we don't do that here",
      "manifesting", "the universe wants", "everything happens for a reason",
      "protect my peace", "high vibration", "energy vampire", "healing journey",
      "release what no longer serves you", "you are the main character",
      "law of attraction", "surround yourself with", "this is your sign",
      "raise your vibration", "align with your purpose",
    ],
    emoji: ["🔮", "✨"],
  },
  cryptic: {
    label: "cryptic",
    color: "#3f7fd1",
    weight: 6,
    words: [
      "some people", "no offense but", "not to be dramatic but", "you know who you are",
      "i won't name names", "allegedly", "if you know you know", "interesting how",
      "curious", "just saying", "watching this closely", "certain individuals",
      "we all know why", "won't say who", "no shade but",
    ],
    emoji: ["👀"],
  },
  unhinged: {
    label: "unhinged",
    color: "#c0392b",
    weight: 8,
    words: [
      "swear to god", "unhinged", "feral", "losing my mind", "i cannot even",
      "absolutely deranged", "rage", "spiraling", "intrusive thoughts", "delusional",
      "certified lunatic", "no thoughts just vibes", "brain empty", "i will scream",
      "kill", "murder", "so help me", "done with this", "i am not okay",
    ],
    emoji: ["🔪", "🤡", "😵‍💫", "🔥"],
  },
};

const CAT_ORDER = ["mundane", "extremely_online", "cult_coded", "cryptic", "unhinged"];

const VERDICTS = [
  { min: 85, text: "certifiably normal", lines: [
    "you could say this to your grandmother and she'd nod along.",
    "no notes. deeply, reassuringly boring.",
    "this is what normal sounds like. never change.",
  ] },
  { min: 65, text: "normal enough to pass", lines: [
    "would not raise an eyebrow at a bus stop.",
    "a completely reasonable thing to say out loud, to a stranger, in public.",
    "passes as normal to the untrained eye. we are a trained eye.",
  ] },
  { min: 45, text: "normal-adjacent", lines: [
    "gives it away only to the terminally online.",
    "your coworkers would smile and slowly back away.",
    "technically words. spiritually, a red flag.",
  ] },
  { min: 25, text: "no longer passing as normal", lines: [
    "your local coffee shop is quietly concerned.",
    "this has \"made a whole online personality out of it\" energy.",
    "normal is not the word anyone reaches for here.",
  ] },
  { min: 0, text: "not normal, actually", lines: [
    "please put the phone down and go outside.",
    "this phrase requires context no one asked for.",
    "you have been extremely online for an alarming amount of time.",
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

function computeNormalness(rawText) {
  const text = rawText.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  // Small floor per category so a phrase with zero evidence still produces a
  // (mostly flat) breakdown instead of dividing by zero.
  const raw = { mundane: 2, extremely_online: 2, cult_coded: 2, cryptic: 2, unhinged: 2 };
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
    raw.unhinged += Math.min(bangs, 5) * 3;
    evidence.push({ cat: "unhinged", phrase: bangs >= 3 ? `${bangs} exclamation points in a row` : "an exclamation point", weight: Math.min(bangs, 5) * 3 });
  }

  const ellipses = (text.match(/\.\.\./g) || []).length;
  if (ellipses) {
    raw.cryptic += ellipses * 4;
    evidence.push({ cat: "cryptic", phrase: "a trailing off ellipsis", weight: ellipses * 4 });
  }

  const hashtags = (text.match(/#\w+/g) || []).length;
  if (hashtags) {
    raw.extremely_online += Math.min(hashtags, 5) * 4;
    evidence.push({ cat: "extremely_online", phrase: hashtags > 1 ? `${hashtags} hashtags` : "a hashtag", weight: Math.min(hashtags, 5) * 4 });
  }

  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upperLetters = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 4) {
    const capsRatio = upperLetters.length / letters.length;
    if (capsRatio > 0.35) {
      raw.unhinged += Math.round(capsRatio * 50);
      evidence.push({ cat: "unhinged", phrase: "written in ALL CAPS", weight: Math.round(capsRatio * 50) });
    }
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4 && /[.!]$/.test(text)) {
    raw.mundane += 8;
    evidence.push({ cat: "mundane", phrase: "a perfectly ordinary short reply", weight: 8 });
  }

  if (words.length >= 12 && !/[.!?]/.test(text)) {
    raw.extremely_online += 8;
    evidence.push({ cat: "extremely_online", phrase: "a run-on sentence with zero punctuation brakes", weight: 8 });
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

  // Score off the raw evidence weight (not the pct share), so a phrase with
  // no signal at all lands near a calm, unremarkable baseline instead of
  // getting dragged around by relative shares of a near-empty total.
  const netWeird =
    raw.extremely_online * 0.9 +
    raw.cult_coded * 1.1 +
    raw.unhinged * 1.2 +
    raw.cryptic * 0.7 -
    raw.mundane * 1.0;

  const normalness = clamp(Math.round(85 - netWeird), 0, 100);

  const seed = hashString(text);
  const rng = mulberry32(seed);
  const bucket = VERDICTS.find((v) => normalness >= v.min);
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

  return { pct, dominant, normalness, verdictText: bucket.text, verdictLine, tell };
}

// ---- UI wiring ----
const els = {
  screenForm: document.getElementById("screen-form"),
  screenResult: document.getElementById("screen-result"),
  message: document.getElementById("message"),
  charcount: document.getElementById("charcount"),
  readBtn: document.getElementById("readBtn"),
  needle: document.getElementById("needle"),
  scoreNum: document.getElementById("scoreNum"),
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
  p.set("p", text);
  return "https://normalometer.bisks.net/?" + p.toString();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showResult(text) {
  const result = computeNormalness(text);
  if (!result) return;
  current = { text, result };

  els.screenForm.classList.add("hidden");
  els.screenResult.classList.remove("hidden");

  const rotate = -90 + (result.normalness / 100) * 180;
  els.needle.style.transform = `rotate(${rotate}deg)`;
  els.scoreNum.textContent = String(result.normalness);
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
    els.tell.innerHTML = `<b>the tell:</b> nothing detected. suspiciously normal, or you just didn't try.`;
  }

  history.replaceState(null, "", buildShareUrl(text).replace("https://normalometer.bisks.net", ""));
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
  if (!p.has("p")) return;
  const text = p.get("p").slice(0, 220);
  els.message.value = text;
  updateCharcount();
  showResult(text);
})();

// ---- sharing ----
function buildShareText() {
  if (!current) return "";
  const { text, result } = current;
  const url = buildShareUrl(text);
  return `the normalometer scored my phrase ${result.normalness}/100 ${result.verdictText} (mostly ${CATS[result.dominant].label}, ${result.pct[result.dominant]}%): ${url}`;
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
  bg.addColorStop(0, "#fbf6ea");
  bg.addColorStop(1, "#f1ead6");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.font = "800 46px monospace";
  ctx.fillStyle = "#2b2620";
  ctx.fillText("the normalometer", W / 2, 120);

  ctx.font = "800 150px monospace";
  const scoreColor = result.normalness >= 65 ? "#2f8f5b" : result.normalness >= 45 ? "#c98a1f" : "#c0392b";
  ctx.fillStyle = scoreColor;
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 14;
  ctx.fillText(result.normalness + "/100", W / 2, 300);
  ctx.shadowBlur = 0;

  ctx.font = "800 36px monospace";
  ctx.fillStyle = "#2b2620";
  ctx.fillText(result.verdictText, W / 2, 355);

  ctx.font = "22px monospace";
  ctx.fillStyle = "#7a7060";
  const quoteLines = wrapLines(ctx, `"${text}"`, W - 200);
  quoteLines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 420 + i * 32));

  ctx.strokeStyle = "#ded4b8";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(120, 560);
  ctx.lineTo(W - 120, 560);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "700 22px monospace";
  ctx.fillStyle = "#7a7060";
  ctx.fillText("the full reading:", W / 2, 605);

  const barColors = { mundane: "#2f8f5b", extremely_online: "#c98a1f", cult_coded: "#8b5cd6", cryptic: "#3f7fd1", unhinged: "#c0392b" };
  ctx.font = "24px monospace";
  CAT_ORDER.slice()
    .sort((a, b) => result.pct[b] - result.pct[a])
    .forEach((key, i) => {
      ctx.fillStyle = barColors[key];
      ctx.fillText(truncate(ctx, `${CATS[key].label}: ${result.pct[key]}%`, W - 160), W / 2, 650 + i * 40);
    });

  ctx.font = "600 26px monospace";
  ctx.fillStyle = "#2f8f5b";
  ctx.fillText("normalometer.bisks.net", W / 2, 1010);

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
      const file = new File([blob], "normalometer.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "the normalometer" });
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
      a.download = "normalometer.png";
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
