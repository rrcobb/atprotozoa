// Generates public/og.png (needs @resvg/resvg-js; npm install --no-save).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
let cards = "";
const seeds = [[820,110,0.9,-8],[960,250,1.3,6],[740,330,1.7,-4],[1000,430,2.2,10],[860,490,1.1,3],[640,150,0.6,-12]];
seeds.forEach(([x,y,s,r],i)=>{const hue=(i*57+20)%360;cards+=`<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><rect width="170" height="70" rx="9" fill="#1c1622" stroke="hsl(${hue} 60% 60%)" stroke-width="2"/><rect x="12" y="12" width="70" height="7" fill="hsl(${hue} 70% 70%)"/><rect x="12" y="30" width="140" height="6" fill="#9186a0"/><rect x="12" y="45" width="100" height="6" fill="#9186a0"/></g>`});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0c0910"/>${cards}
<text x="64" y="170" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#f0e9df">FEED<tspan fill="#ff3b5c">STORM</tspan></text>
<text x="66" y="225" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#5fd6d1">EVER FEEL ATTACKED BY YOUR FEED?</text>
<text x="66" y="290" font-family="JetBrains Mono" font-size="22" fill="#9186a0">live firehose posts, flying at your face.</text>
<text x="66" y="324" font-family="JetBrains Mono" font-size="22" fill="#9186a0">swat them. flip the insanity switch.</text></svg>`;
const png=new Resvg(svg,{font:{fontFiles:[fileURLToPath(new URL("./fonts/JetBrainsMono.ttf",import.meta.url))],loadSystemFonts:false,defaultFontFamily:"JetBrains Mono"}}).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png",import.meta.url)),png);
