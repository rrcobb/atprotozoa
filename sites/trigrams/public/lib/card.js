// card.js — render a trigram "card" to a PNG (client-side, no worker). The card
// echoes the /quiver look: the trigram big, a small label, the source-post line
// underneath. Built as SVG, rasterized via canvas. Returns { bytes, dataUrl, alt }.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// Wrap a single line (no newlines in it) into lines of at most `max` chars
// (rough — mono font, so char count tracks width well). Hard-breaks any
// single word longer than `max` (e.g. a long URL) so it can't overflow the
// card edge.
function wrapLine(text, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (let w of words) {
    while (w.length > max) {
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, max));
      w = w.slice(max);
    }
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Wrap text into lines of at most `max` chars. Explicit newlines in the
// source (a post quoted verbatim often has them) are honored as real line
// breaks instead of being collapsed into spaces like ordinary whitespace.
function wrap(text, max) {
  return String(text)
    .split(/\r\n|\r|\n/)
    .flatMap((para) => (para.trim() ? wrapLine(para, max) : [""]));
}

// Build the SVG string. 1200x630-ish social card ratio, but tuned for a phrase.
function cardSvg({ trigram, post, byline }) {
  const W = 1000, H = 525;
  const pad = 64;
  const mono =
    "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
  const serif = "Georgia, 'Times New Roman', serif";

  // Trigram: big, wrapped, and SIZED TO FIT. Monospace char width ≈ 0.6·fontSize.
  // Pick the largest font (capped) whose widest line fits the usable width, then
  // wrap at that font's char budget. This keeps long words like "contribution"
  // from clipping the card edge.
  const usable = W - pad * 2;
  const CHAR_W = 0.6; // mono advance ÷ font size
  const longestWord = trigram.split(" ").reduce((m, w) => Math.max(m, w.length), 0);
  // font so the longest single word fits on one line; also cap so short phrases
  // aren't absurdly huge.
  let titleSize = Math.min(80, Math.floor(usable / (longestWord * CHAR_W)));
  const charsPerLine = Math.max(6, Math.floor(usable / (titleSize * CHAR_W)));
  const titleLines = wrap(trigram, charsPerLine);
  if (titleLines.length > 3) titleSize = Math.floor(titleSize * 0.85); // very long → shrink
  const titleLH = titleSize * 1.12;
  const titleY = pad + titleSize;

  // Post excerpt: a few lines of serif under a rule. Bound the line count by
  // the room actually left above the byline watermark — a long, multi-line
  // trigram pushes the rule down, and without this the excerpt used to run
  // straight into (or past) the byline text at the bottom of the card.
  const ruleY = titleY + (titleLines.length - 1) * titleLH + 44;
  const postLineH = 34;
  const postFirstY = ruleY + 46;
  const bylineY = H - 40;
  const safeGap = 30; // clear air the excerpt must leave above the byline
  const maxPostLines = Math.min(
    4,
    Math.max(0, Math.floor((bylineY - safeGap - postFirstY) / postLineH) + 1),
  );
  const wrappedPost = wrap(post || "", 58);
  const postLines = wrappedPost.slice(0, maxPostLines);
  if (wrappedPost.length > postLines.length && postLines.length) {
    const last = postLines[postLines.length - 1];
    postLines[postLines.length - 1] = last.length > 55 ? last.slice(0, 55) + "…" : last + " …";
  }

  const titleSpans = titleLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${titleY + i * titleLH}" font-family="${mono}" font-size="${titleSize}" font-weight="700" fill="#111">${esc(l)}</text>`,
    )
    .join("");
  const postSpans = postLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${postFirstY + i * postLineH}" font-family="${serif}" font-size="25" fill="#5a5a5a">${esc(l)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="10" height="${H}" fill="#1a5fd0"/>
    <text x="${pad}" y="${pad - 20}" font-family="${mono}" font-size="20" letter-spacing="3" fill="#1a5fd0">3-GRAM · YOURS ALONE</text>
    ${titleSpans}
    <line x1="${pad}" y1="${ruleY}" x2="${W - pad}" y2="${ruleY}" stroke="#e4e4e4" stroke-width="2"/>
    ${postSpans}
    <text x="${pad}" y="${H - 40}" font-family="${mono}" font-size="20" fill="#8a8a8a">${esc(byline || "trigrams.bisks.net")}</text>
  </svg>`;
}

// Rasterize an SVG string to a PNG blob via canvas.
async function svgToPng(svg, W, H) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const scale = 2; // retina
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const dataUrl = canvas.toDataURL("image/png");
    return { bytes, dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Public: make a card PNG for a trigram. Returns { bytes, dataUrl, alt }.
export async function makeCard({ trigram, post, byline }) {
  const W = 1000, H = 525;
  const svg = cardSvg({ trigram, post, byline });
  const { bytes, dataUrl } = await svgToPng(svg, W, H);
  return {
    bytes,
    dataUrl,
    width: W,
    height: H,
    alt: `A card reading "${trigram}" — a three-word phrase unique to this account on Bluesky.`,
  };
}
