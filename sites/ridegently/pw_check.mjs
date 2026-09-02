import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync } from "fs";
import { extname } from "path";

const PORT = 8934;
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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on("console", (m) => console.log("PAGE:", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/rg_select.png" });

// click ride
await page.click("#rideBtn");
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/rg_ride.png" });

// drag the toy
const box = await page.locator("#toy").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
await page.waitForTimeout(50);
await page.screenshot({ path: "/tmp/rg_drag.png" });
await page.mouse.up();
await page.waitForTimeout(150);
await page.screenshot({ path: "/tmp/rg_release.png" });

await browser.close();
server.close();
console.log("done");
