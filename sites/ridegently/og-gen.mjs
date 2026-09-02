// Generates public/og.png — the Open Graph preview card for ridegently, a
// Daytona-USA-style select screen for LLMs that then puts the chosen one on
// a gentle rock-on-a-spring ride-on toy. Hand-drawn SVG, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card (riding Claude, the default first pod) — this is the
// static fallback for the bare link. Per-ride cards use the same title text
// swapped in server-side by /r/<id> (src/index.ts); the artwork itself
// doesn't vary per ride, same tradeoff didscope's static og.png makes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0c14", BG2 = "#20172a", FG = "#f1f0ff", DIM = "#8d8bab";
const RIDE = "#d9744f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="20%" cy="-10%" r="70%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffb703"/>
      <stop offset="0.6" stop-color="#ff5fa2"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">ridegently</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-size="21" fill="${DIM}">pick an LLM. ride it gently.</text>
  <text x="64" y="204" font-family="JetBrains Mono" font-size="21" fill="${DIM}">like the sheep, but it's Claude.</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="16" fill="${DIM}">a Daytona-USA-style turntable select screen,</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">then a rock-on-a-spring ride for the one you pick.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#ffb703">ridegently.bisks.net</text>

  <!-- right: the toy, mid-rock -->
  <g transform="translate(880,430) rotate(-7)">
    <path d="M-95 20 Q0 -30 95 20" stroke="#5b4636" stroke-width="12" fill="none" stroke-linecap="round"/>
    <rect x="-8" y="-30" width="16" height="70" rx="6" fill="#7a7a7a"/>
    <ellipse cx="0" cy="-95" rx="92" ry="76" fill="${RIDE}"/>
    <ellipse cx="-46" cy="-158" rx="12" ry="16" fill="#a5502e" transform="rotate(-18 -46 -158)"/>
    <ellipse cx="46" cy="-158" rx="12" ry="16" fill="#a5502e" transform="rotate(18 46 -158)"/>
    <!-- Anthropic's official Claude mark, not a lettermark -->
    <g transform="translate(0,-131) scale(3.75) translate(-12,-12)" fill="rgba(0,0,0,.45)">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/>
    </g>
    <circle cx="0" cy="-208" r="19" fill="#ffd8b0"/>
    <rect x="-17" y="-192" width="34" height="30" rx="12" fill="#4d5ea8"/>
    <rect x="-30" y="-186" width="20" height="7" rx="3" fill="#4d5ea8" transform="rotate(20 -30 -186)"/>
    <rect x="10" y="-186" width="20" height="7" rx="3" fill="#4d5ea8" transform="rotate(-20 30 -186)"/>
  </g>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
