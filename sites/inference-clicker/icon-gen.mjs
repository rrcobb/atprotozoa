// Renders public/icons/*.png (PWA icons) from one SVG. No fonts needed.
//   npm install @resvg/resvg-js --no-save   # one-time
//   node icon-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#0d2a5c"/><stop offset="1" stop-color="#040814"/></radialGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19f0ff"/><stop offset="1" stop-color="#2f6bff"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)" stroke="url(#l)" stroke-width="14" stroke-linecap="round" fill="none">
    <rect x="136" y="136" width="240" height="240" rx="28"/>
    ${[190, 256, 322].map((v) => `<path d="M${v} 136V92M${v} 376V420M136 ${v}H92M376 ${v}H420"/>`).join("")}
    <path d="M226 196L296 256L226 316" stroke-width="24"/>
    <path d="M316 316H350" stroke-width="24"/>
  </g>
</svg>`;

mkdirSync(new URL("./public/icons/", import.meta.url), { recursive: true });
const out = (name, size, pad) => {
  const png = new Resvg(svg(pad), { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`./public/icons/${name}`, import.meta.url), png);
};
out("icon-192.png", 192, 0);
out("icon-512.png", 512, 0);
out("icon-maskable-512.png", 512, 0.22); // content inside the 80% safe zone
out("apple-touch-icon.png", 180, 0.08);
console.log("icons written");
