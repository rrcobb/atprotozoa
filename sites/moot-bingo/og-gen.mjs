// Generates public/og.png — the Open Graph preview card for moot-bingo, so a
// shared link auto-renders a picture of the game in Bluesky / other unfurlers.
//
// It hand-draws a representative "screenshot" of the bingo machine as an SVG
// (the same look the live canvas produces: a metallic lottery drum full of
// glossy spheres on the left, a partly-daubed 5×5 card on the right) at the
// canonical OG size, then rasterises it with headless Chromium.
//
//   node og-gen.mjs        # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across builds.
// House style: self-contained, copy-don't-abstract. Re-run this by hand if you
// change the artwork.

import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const W = 1200, H = 630;

// palette lifted from the site
const TINTS = ["#1a5fd0","#1f8a4c","#d81e6a","#e0a400","#8e44ad",
  "#c0392b","#0f9b9b","#e2711d","#5566dd","#2c8c3c"];
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0",
  DAUB = "#d81e6a", GOLD = "#e0a400", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";

// tiny seeded RNG so the layout is identical every run
let seed = 1337;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── a glossy sphere, same lighting as the canvas drawSphere() ─────────────
let gid = 0;
function sphere(x, y, r, fill, label) {
  const id = "s" + gid++;
  return `
  <g>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
    ${label ? `<text x="${x}" y="${y + r * 0.30}" text-anchor="middle"
        font-family="ui-monospace, monospace" font-weight="700"
        font-size="${(r * 0.8).toFixed(1)}" fill="rgba(255,255,255,.92)">${esc(label)}</text>` : ""}
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#gloss-${id})"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#shade-${id})"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/>
  </g>`;
}
function sphereDefs(x, y, r, id) {
  return `
    <radialGradient id="gloss-${id}" gradientUnits="userSpaceOnUse"
        cx="${x - r * 0.35}" cy="${y - r * 0.4}" r="${r * 1.25}">
      <stop offset="0" stop-color="rgba(255,255,255,.6)"/>
      <stop offset="0.35" stop-color="rgba(255,255,255,.08)"/>
      <stop offset="0.7" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="shade-${id}" gradientUnits="userSpaceOnUse"
        cx="${x + r * 0.2}" cy="${y + r * 0.25}" r="${r * 1.15}">
      <stop offset="0.72" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,.5)"/>
    </radialGradient>`;
}

// two-letter fake initials for avatarless spheres
const SYL = ["mo","ri","no","ce","ab","gr","mi","bo","th","el","so","ka",
  "vi","ju","le","da","po","tu","xy","qz"];
const initialFor = () => SYL[Math.floor(rnd() * SYL.length)].toUpperCase();

// ── drum on the left ──────────────────────────────────────────────────────
const cx = 330, cy = 355, R = 218;

// pack ~16 non-overlapping spheres inside the drum
const balls = [];
const target = 16;
let tries = 0;
while (balls.length < target && tries < 4000) {
  tries++;
  const rr = 30 + rnd() * 14;
  const ang = rnd() * Math.PI * 2;
  const rad = rnd() * (R - rr - 6);
  const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
  if (balls.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + rr + 2)) continue;
  balls.push({ x, y, r: rr, fill: TINTS[Math.floor(rnd() * TINTS.length)], label: initialFor() });
}

const drumDefs = balls.map((b, i) => sphereDefs(b.x, b.y, b.r, "s" + i)).join("");
gid = 0;
const drumBalls = balls.map((b) => sphere(b.x, b.y, b.r, b.fill, b.label)).join("");

let vanes = "";
for (let k = 0; k < 6; k++) {
  const a = 0.4 + (k * Math.PI) / 3;
  vanes += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * R).toFixed(1)}"
    y2="${(cy + Math.sin(a) * R).toFixed(1)}" stroke="rgba(0,0,0,.05)" stroke-width="2"/>`;
}

// ── bingo card on the right ────────────────────────────────────────────────
const gx = 700, gy = 178, cellsAcross = 5, cell = 76, gap = 8;
const daubed = new Set([1, 4, 6, 7, 12, 13, 18, 21, 24, 3, 10]); // some marked, incl. FREE(12)
const winLine = new Set([0, 6, 12, 18, 24]); // a diagonal bingo, gold
const centre = 12;
let card = "";
let cbi = 0;
const cardDefs = [];
for (let i = 0; i < 25; i++) {
  const r = Math.floor(i / cellsAcross), c = i % cellsAcross;
  const x = gx + c * (cell + gap), y = gy + r * (cell + gap);
  const free = i === centre, isDaub = daubed.has(i) || free, isWin = winLine.has(i);
  const bg = isWin ? "#fff8e6" : FAINTBG;
  const border = isWin ? GOLD : isDaub ? DAUB : FAINT;
  card += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="8"
    fill="${bg}" stroke="${border}" stroke-width="${isWin || isDaub ? 2 : 1}"/>`;
  // the sphere in the cell
  const bx = x + cell / 2, by = y + cell * 0.42, br = cell * 0.27;
  const fill = free ? GOLD : TINTS[(i * 3 + 1) % TINTS.length];
  cardDefs.push(sphereDefs(bx, by, br, "c" + i));
  card += sphere(bx, by, br, fill, free ? "" : initialFor());
  // the daub stamp
  if (isDaub) {
    const dc = isWin ? GOLD : DAUB;
    card += `<circle cx="${bx}" cy="${by}" r="${br * 1.15}" fill="${dc}" opacity="0.42"/>`;
  }
  // handle label
  card += `<text x="${x + cell / 2}" y="${y + cell - 12}" text-anchor="middle"
    font-family="ui-monospace, monospace" font-size="11"
    fill="${free ? GOLD : MUTED}" font-weight="${free ? 700 : 400}">${free ? "FREE" : "@" + initialFor().toLowerCase()}</text>`;
}
// re-run sphere() ids consistently: reset gid before card spheres were built above
// (drum used ids 0..; card sphereDefs use "c"+i so no clash — fine)

// BINGO header over the card
const header = "BINGO".split("").map((ch, c) =>
  `<text x="${gx + c * (cell + gap) + cell / 2}" y="${gy - 16}" text-anchor="middle"
    font-family="ui-monospace, monospace" font-weight="700" font-size="24"
    letter-spacing="2" fill="${ACCENT}">${ch}</text>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="drumbody" x1="0" y1="${cy - R}" x2="0" y2="${cy + R}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fbfbfb"/>
      <stop offset="1" stop-color="#ededed"/>
    </linearGradient>
    <clipPath id="drumclip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
    ${drumDefs}
    ${cardDefs.join("")}
  </defs>

  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- wordmark -->
  <text x="64" y="74" font-family="ui-monospace, monospace" font-weight="700"
    font-size="34" fill="${INK}">moot bingo</text>
  <text x="64" y="108" font-family="ui-monospace, monospace" font-size="18"
    fill="${MUTED}">your mutuals as spheres in a lottery drum</text>

  <!-- drum -->
  <g clip-path="url(#drumclip)">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#drumbody)"/>
    ${vanes}
    ${drumBalls}
  </g>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#c7c7c7" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 2.5}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>

  <!-- card -->
  ${header}
  ${card}

  <!-- footer strip -->
  <text x="64" y="600" font-family="ui-monospace, monospace" font-size="16"
    fill="${MUTED}">draw a moot · daub the card · five in a row is a bingo</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="ui-monospace, monospace"
    font-size="16" fill="${ACCENT}">bisks.net/games/moot-bingo</text>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style></head>
<body>${svg}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
const htmlPath = join(dir, "card.html");
writeFileSync(htmlPath, html);

const out = new URL("./public/og.png", import.meta.url).pathname;
execFileSync("chromium", [
  "--headless",
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  `--window-size=${W},${H}`,
  `--screenshot=${out}`,
  "file://" + htmlPath,
], { stdio: "inherit" });

console.log("wrote", out);
