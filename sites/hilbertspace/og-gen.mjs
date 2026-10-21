// Renders public/og.png: a few posts as superposed word clouds.
// Run: node og-gen.mjs  (needs @resvg/resvg-js, e.g. from sites/receipts)
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import { makeState, probs, hash } from "./public/lib/state.js";
const posts = ["quantum states hold every possible future before observation", "endless stream unread beyond comprehension", "hilbert space possibility vector direction", "somebody posted breakfast again today", "amplitude phase interference measurement collapse"];
let t = "";
posts.forEach((post, k) => {
  const st = makeState(post), p = probs(st), cx = 220 + (k % 3) * 380, cy = 120 + Math.floor(k / 3) * 200;
  st.words.forEach((w, i) => {
    const g = hash(w + "~");
    t += `<text x="${cx + ((g % 200) - 100) * 1.1}" y="${cy + (((g >>> 9) % 100) - 50)}" text-anchor="middle" font-family="JetBrains Mono" font-size="${12 + p[i] * 60}" fill="hsl(${(hash(post) % 360 + i * 24) % 360},75%,70%)" opacity="${Math.min(1, 0.25 + p[i] * 1.6).toFixed(2)}">${w}</text>`;
  });
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#05030a"/>${t}
<text x="60" y="540" font-family="JetBrains Mono" font-weight="700" font-size="76" fill="#ece6ff" letter-spacing="6">HILBERT SPACE</text>
<text x="64" y="590" font-family="JetBrains Mono" font-size="26" fill="#b9a8ff">every post is all of its words at once, until you look</text></svg>`;
fs.writeFileSync("public/og.png", new Resvg(svg, { font: { fontFiles: ["fonts/JetBrainsMono.ttf"], loadSystemFonts: false } }).render().asPng());
