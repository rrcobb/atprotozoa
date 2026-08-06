// Generates public/gracewasright.pptx — a REAL PowerPoint file, not just an
// HTML slideshow styled to look like one. Reads public/data/cases.json (the
// same single source of truth the web slideshow renders from), so the two
// can't drift.
//
//   npm install pptxgenjs --no-save   # one-time, not a project dependency
//   node pptx-gen.mjs                 # writes ./public/gracewasright.pptx

import pptxgen from "pptxgenjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "public/data/cases.json"), "utf8"));

const BG = "16261B";
const CHALK = "F4F1E6";
const CHALK_DIM = "B9C9BB";
const YELLOW = "F2C94C";
const PINK = "EF8FAE";

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "@buildthis.bisks.net";
pptx.title = data.meta.title;
pptx.subject = "gracekind was right — a research deck";

function blankSlide() {
  const s = pptx.addSlide();
  s.background = { color: BG };
  return s;
}

function addEyebrow(s, text) {
  s.addText(text.toUpperCase(), {
    x: 0.7, y: 0.5, w: 12, h: 0.4,
    fontFace: "Consolas", fontSize: 12, color: YELLOW, charSpacing: 2,
  });
}

function addHeading(s, text, y = 1.0) {
  s.addText(text, {
    x: 0.7, y, w: 12, h: 1.2,
    fontFace: "Georgia", fontSize: 34, bold: true, color: CHALK,
  });
}

function addBlocks(s, blocks, startY) {
  let y = startY;
  for (const b of blocks || []) {
    if (b.type === "p") {
      const h = 0.35 + Math.ceil(b.text.length / 95) * 0.28;
      s.addText(b.text, {
        x: 0.7, y, w: 11.6, h,
        fontFace: "Consolas", fontSize: 14, color: CHALK_DIM, valign: "top",
      });
      y += h + 0.12;
    } else if (b.type === "quote") {
      const h = 0.4 + Math.ceil(b.text.length / 80) * 0.32 + (b.attr ? 0.3 : 0);
      s.addShape("rect", { x: 0.7, y, w: 0.06, h, fill: { color: PINK } });
      s.addText(
        [
          { text: `“${b.text}”`, options: { italic: true, fontSize: 16, color: CHALK } },
          ...(b.attr ? [{ text: `\n— ${b.attr}`, options: { fontSize: 11, color: CHALK_DIM, italic: false } }] : []),
        ],
        { x: 0.95, y, w: 11.2, h, fontFace: "Consolas", valign: "top" }
      );
      y += h + 0.18;
    } else if (b.type === "source") {
      s.addText(`sources: ${b.text}`, {
        x: 0.7, y, w: 11.6, h: 0.5,
        fontFace: "Consolas", fontSize: 9, color: "6F8577", valign: "top",
      });
      y += 0.5;
    }
  }
  return y;
}

for (const slide of data.slides) {
  const s = blankSlide();

  if (slide.kind === "title") {
    s.addText(slide.eyebrow.toUpperCase(), {
      x: 0.9, y: 2.3, w: 11.5, h: 0.4,
      fontFace: "Consolas", fontSize: 13, color: YELLOW, charSpacing: 2,
    });
    s.addText(slide.title, {
      x: 0.9, y: 2.7, w: 11.5, h: 1.6,
      fontFace: "Georgia", fontSize: 54, bold: true, color: CHALK,
    });
    s.addText((slide.lines || []).join("\n\n"), {
      x: 0.9, y: 4.5, w: 10.5, h: 1.8,
      fontFace: "Consolas", fontSize: 15, color: CHALK_DIM, valign: "top",
    });
  } else if (slide.kind === "case") {
    addEyebrow(s, slide.eyebrow);
    s.addShape("ellipse", { x: 0.7, y: 1.0, w: 0.55, h: 0.55, fill: { color: "16261B" }, line: { color: YELLOW, width: 2 } });
    s.addText(String(slide.number), { x: 0.7, y: 1.0, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: "Consolas", bold: true, fontSize: 18, color: YELLOW });
    s.addText(slide.title, { x: 1.45, y: 0.95, w: 10.7, h: 0.7, fontFace: "Georgia", fontSize: 28, bold: true, color: CHALK, valign: "middle" });
    addBlocks(s, slide.blocks, 1.85);
  } else if (slide.kind === "tally") {
    addEyebrow(s, slide.eyebrow);
    s.addText(slide.title, { x: 0.7, y: 1.4, w: 11.5, h: 2.2, fontFace: "Georgia", fontSize: 90, bold: true, color: CHALK });
    addBlocks(s, slide.blocks, 3.7);
  } else if (slide.kind === "method") {
    addEyebrow(s, slide.eyebrow);
    addHeading(s, slide.title, 1.0);
    addBlocks(s, slide.blocks, 2.2);
  } else {
    // closing
    addEyebrow(s, slide.eyebrow);
    addHeading(s, slide.title, 2.6);
    s.addText((slide.lines || []).join("\n\n"), {
      x: 0.7, y: 3.9, w: 11, h: 1.8,
      fontFace: "Consolas", fontSize: 14, color: CHALK_DIM, valign: "top",
    });
  }
}

await pptx.writeFile({ fileName: join(__dirname, "public/gracewasright.pptx") });
console.log("wrote public/gracewasright.pptx");
