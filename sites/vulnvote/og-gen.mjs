// Renders public/og.png (1200x630). Needs @resvg/resvg-js.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0f1115"/>
<text x="80" y="230" font-family="sans-serif" font-weight="700" font-size="120" fill="#e6e8ec">vulnvote</text>
<text x="80" y="320" font-family="sans-serif" font-size="42" fill="#8b93a1">reddit for vulnerabilities, on atproto</text>
<text x="80" y="480" font-family="sans-serif" font-size="150" fill="#ff6a3d">▲</text><text x="220" y="480" font-family="sans-serif" font-size="150" fill="#5b9dff">▼</text>
<text x="80" y="570" font-family="sans-serif" font-size="32" fill="#8b93a1">dedupe aliases · weight voters · vote by how bad it really is</text></svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg).render().asPng());
