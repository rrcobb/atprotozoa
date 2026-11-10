// Generates public/og.png for golem grocer. Needs @resvg/resvg-js (npm install @resvg/resvg-js --no-save).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#101612"/>
<rect y="0" width="1200" height="300" fill="#c7cdd0"/><rect y="300" width="1200" height="330" fill="#6d7378"/>
<rect x="0" y="120" width="300" height="360" fill="#6b5039"/><rect x="900" y="120" width="300" height="360" fill="#6b5039"/>
<g fill="#e0443a"><rect x="20" y="150" width="260" height="60"/></g><g fill="#f2b632"><rect x="20" y="250" width="260" height="60"/></g><g fill="#3f9ad6"><rect x="20" y="350" width="260" height="60"/></g>
<g fill="#5cb85c"><rect x="920" y="150" width="260" height="60"/></g><g fill="#d96ba0"><rect x="920" y="250" width="260" height="60"/></g><g fill="#f08a3c"><rect x="920" y="350" width="260" height="60"/></g>
<g stroke="#7d8187" stroke-width="22" stroke-linecap="round"><path d="M560 400 L545 470 M640 400 L655 470 M520 330 L470 390 M680 330 L730 390"/></g>
<ellipse cx="600" cy="330" rx="90" ry="85" fill="#c97a2e"/>
<circle cx="565" cy="310" r="22" fill="#fff"/><circle cx="635" cy="310" r="22" fill="#fff"/><circle cx="565" cy="312" r="10" fill="#d11"/><circle cx="635" cy="312" r="10" fill="#d11"/>
<rect x="575" y="355" width="50" height="10" fill="#222"/>
<rect width="1200" height="630" fill="none" stroke="#7fe07f" stroke-width="8"/>
<text x="600" y="90" text-anchor="middle" font-family="monospace" font-weight="700" font-size="72" fill="#101612">GOLEM GROCER</text>
<text x="600" y="570" text-anchor="middle" font-family="monospace" font-size="30" fill="#e8efe6">finish your list. the food is waking up. 28.5 mph.</text>
<text x="600" y="605" text-anchor="middle" font-family="monospace" font-size="22" fill="#7fe07f">golem-grocer.bisks.net</text>
</svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
