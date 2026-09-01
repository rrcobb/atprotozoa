// zitronflip — archive + generator, all client-side.

const SITE_URL = "https://zitronflip.bisks.net";

// Real, dated calls — paraphrased from danluu.com/zitron's tally of Ed
// Zitron's AI predictions. Every one of them turned out wrong; that's the
// entire premise of the site.
const ARCHIVE = [
  {
    date: "Feb 2024",
    quote: "We're reaching the upper limits of what generative AI can do and how accurate its outputs can be.",
    reality: "Models kept getting meaningfully more accurate and capable through the rest of 2024 and into 2025.",
  },
  {
    date: "Mar 2024",
    quote: "“Have We Reached Peak AI?” — hallucinations mean progress is capped at then-current levels.",
    reality: "Hallucination rates fell and capability climbed on every major benchmark that followed.",
  },
  {
    date: "Apr 2024",
    quote: "AI companies are running out of training data, so models can't keep improving.",
    reality: "Synthetic data, better post-training, and new architectures kept improvement going anyway.",
  },
  {
    date: "Jun 2024",
    quote: "OpenAI's growth is stalling, implying some kind of coming collapse.",
    reality: "OpenAI's revenue and usage kept climbing sharply through 2025.",
  },
  {
    date: "Jul 2024",
    quote: "Generative AI is peaking, if it hasn't already — it cannot do much more than it currently does.",
    reality: "The next 12 months shipped agentic tool use, much longer context, and sharp coding-capability jumps.",
  },
  {
    date: "Aug 2024",
    quote: "Generative AI is a dead-end technology that has peaked.",
    reality: "Adoption and capability both kept accelerating.",
  },
  {
    date: "Aug 2024",
    quote: "The AI bubble has three quarters to prove itself, or it collapses.",
    reality: "Three quarters came and went. No collapse.",
  },
  {
    date: "Sep 2024",
    quote: "A new frontier model “shows OpenAI is desperate and out of ideas,” re-iterating the no-more-data claim.",
    reality: "That model line kicked off a whole new reasoning-model category that every lab then raced to match.",
  },
  {
    date: "Oct 2024",
    quote: "OpenAI's revenue forecasts are absurd — “almost a financial crime to say out loud.”",
    reality: "OpenAI beat its cited 2025 revenue goal.",
  },
];

// Generator: compose a fresh doomer take + its "guaranteed" opposite. This
// isn't trying to be a real prediction — it's a joke machine that riffs on
// the same shape of claim the archive above already disproved.
const SUBJECTS = [
  "generative AI",
  "this new model",
  "the AI bubble",
  "this startup's valuation",
  "agentic AI",
  "this chatbot",
  "AI coding tools",
  "the compute buildout",
  "this AI IPO",
  "synthetic data",
  "the next model release",
  "AI-generated video",
];

const CLAIMS = [
  "has peaked and cannot possibly improve further",
  "is running out of training data and will stall out",
  "is a dead end that investors will deeply regret",
  "will collapse within two quarters, mark it down",
  "is nothing but hype with zero real capability gains left",
  "cannot be made more efficient, more powerful, or more useful",
  "is desperate, out of ideas, and quietly failing behind the scenes",
  "will never turn a profit at this valuation, full stop",
  "is a bubble on the verge of popping, any day now",
  "has hit a wall that no amount of compute will fix",
];

const OPPOSITES = [
  "so betting on it getting dramatically better, shipping faster, and making someone very rich is the safe trade.",
  "so the reasonable prediction is: it gets better, it gets cheaper, and it ships anyway.",
  "which means, historically speaking, it's about to have its best quarter yet.",
  "which is exactly the setup for the opposite to happen within the year.",
  "so mark your calendar — the rebuttal headline writes itself in six months.",
  "which is the tell that it's about to get funded, shipped, and hyped even harder.",
  "so expect a bigger round, a bigger launch, and a very awkward correction thread.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

let currentTake = "";
let currentOpp = "";

function generate() {
  const subject = pick(SUBJECTS);
  const claim = pick(CLAIMS);
  const opp = pick(OPPOSITES);

  currentTake = `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${claim}.`;
  currentOpp = `Guaranteed opposite: ${subject} ${opp}`;

  const takeEl = document.getElementById("gen-take");
  const verdictEl = document.getElementById("gen-verdict");
  const oppEl = document.getElementById("gen-opp");

  takeEl.innerHTML = `“${esc(currentTake)}”`;
  verdictEl.style.display = "block";
  oppEl.innerHTML = `<b>${esc(currentOpp)}</b>`;
  oppEl.style.display = "block";

  document.getElementById("gen-actions").style.display = "block";
  document.getElementById("flip-btn").textContent = "flip another";

  const shareText = buildShareText();
  document.getElementById("share-bsky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

function buildShareText() {
  return `"${currentTake}" — wrong, guaranteed. ${currentOpp} flip your own at ${SITE_URL}`;
}

function renderArchive() {
  const list = document.getElementById("archive-list");
  list.innerHTML = ARCHIVE.map(
    (item) => `
    <div class="archive-item">
      <div class="date">${esc(item.date)}</div>
      <div class="quote">“${esc(item.quote)}”</div>
      <div class="reality"><b>WRONG.</b> ${esc(item.reality)}</div>
    </div>`
  ).join("");
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

function buildShareCard(cb) {
  const canvas = document.getElementById("shareCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const grad = ctx.createRadialGradient(W * 0.75, 0, 0, W * 0.75, 0, H);
  grad.addColorStop(0, "#2a1f45");
  grad.addColorStop(1, "#120e1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f3ecff";
  ctx.font = "800 54px monospace";
  ctx.fillText("ZITRONFLIP", 56, 100);

  ctx.fillStyle = "#a595c2";
  ctx.font = "600 20px monospace";
  wrapText(ctx, `“${currentTake}” — WRONG.`, 56, 170, 1080, 28);

  ctx.fillStyle = "#ffcf4d";
  ctx.font = "700 24px monospace";
  wrapText(ctx, currentOpp, 56, 320, 1080, 32);

  ctx.fillStyle = "#ff5da2";
  ctx.font = "700 26px monospace";
  ctx.fillText("zitronflip.bisks.net", 56, H - 46);

  canvas.toBlob((blob) => cb(blob), "image/png");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word + " ";
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
}

document.getElementById("flip-btn").addEventListener("click", generate);

document.getElementById("share-card-btn").addEventListener("click", () => {
  buildShareCard(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "zitronflip.png", { type: "image/png" });
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file], text: buildShareText(), title: "zitronflip" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zitronflip.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
});

renderArchive();
