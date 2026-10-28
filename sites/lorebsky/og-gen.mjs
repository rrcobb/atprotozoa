// Generates public/og.png — a hand-drawn mailing-list page card.
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const font = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
const t = (x, y, s, fill = "#111", size = 26) =>
  `<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="${size}" fill="${fill}" xml:space="preserve">${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#fff"/>
<rect x="0" y="0" width="1200" height="84" fill="#eee"/>
${t(40, 56, "lorebsky", "#111", 40)}${t(330, 56, "[parent] [prev] [next] [root]", "#00e", 26)}
<rect x="40" y="110" width="1120" height="170" fill="#f0f0e8" stroke="#999"/>
${t(60, 148, "From:     rob <bisks.net>")}
${t(60, 184, "Subject:  Re: [bsky] can we have an atproto viewer")}
${t(60, 220, "In-Reply-To: <3myxnybuijk2j@did:plc:f6n22z6…>")}
${t(60, 256, "Date:     Wed, 28 Oct 2026 21:10:01 +0000")}
${t(60, 330, "> my pet basilisk told me bsky allows your own appviews", "#060")}
${t(60, 370, "> [image: a very ugly looking appview]", "#060")}
${t(60, 430, "yes. this one is a mailing list now.")}
${t(60, 510, "thread overview: 9 messages", "#555")}
${t(60, 550, "|- norvid  Advent of Catoid", "#00e")}
${t(60, 590, "`- buildthis  advent of catoid: 30 days of…", "#00e")}
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(out, png);
console.log("wrote", out, png.length);
