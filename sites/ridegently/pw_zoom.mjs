import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync } from "fs";
import { extname } from "path";

const PORT = 8935;
const mime = { ".html": "text/html", ".png": "image/png", ".ttf": "font/ttf" };
const server = createServer((req, res) => {
  let path = req.url === "/" ? "/public/index.html" : req.url;
  try {
    const data = readFileSync("." + path);
    res.writeHead(200, { "content-type": mime[extname(path)] || "text/plain" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(300);

// step through all 8 pods, screenshot each centered/selected
for (let i = 0; i < 8; i++) {
  await page.screenshot({ path: `/tmp/rg_pod_${i}.png`, clip: { x: 300, y: 130, width: 300, height: 220 } });
  await page.click("#nextBtn");
  await page.waitForTimeout(400);
}

await browser.close();
server.close();
console.log("done");
