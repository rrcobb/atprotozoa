// Draws a simple cartoon seal as an inline SVG body, scaled by a 0..1 "size"
// factor. Sized off real followersCount elsewhere (sqrt scale — see app.js
// sizeFor) so a seal never looks perfectly linear against a huge account.
export const TINTS = ["#5aa9d6", "#7fc9a8", "#e0a94e", "#c97fd0", "#e0687a", "#6bb8e0"];

export function tintFor(seed) {
  let h = 0;
  for (const c of String(seed || "x")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}

// scale: 0.32 .. 1 roughly, maps to a body that fills more/less of the 140x140 viewBox.
export function sealSvg(scale, color, blubberized) {
  const s = Math.max(0.28, Math.min(1, scale));
  const bodyW = 46 + s * 40; // 46..86 half-width-ish
  const bodyH = 30 + s * 26;
  const cx = 70, cy = 92;
  const headR = 16 + s * 9;
  const flipperW = 14 + s * 10;

  const blubberFill = blubberized ? "#ffb84d" : color;
  const bellyFill = blubberized ? "#ffd9a0" : "#0002";

  return `
    <ellipse cx="${cx + 26}" cy="${cy + 14}" rx="${flipperW}" ry="${flipperW * 0.5}" fill="${blubberFill}" opacity="0.85" transform="rotate(28 ${cx + 26} ${cy + 14})"/>
    <ellipse cx="${cx - 26}" cy="${cy + 14}" rx="${flipperW}" ry="${flipperW * 0.5}" fill="${blubberFill}" opacity="0.85" transform="rotate(-28 ${cx - 26} ${cy + 14})"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${bodyW}" ry="${bodyH}" fill="${blubberFill}"/>
    <ellipse cx="${cx}" cy="${cy + bodyH * 0.35}" rx="${bodyW * 0.55}" ry="${bodyH * 0.45}" fill="${bellyFill}"/>
    <circle cx="${cx}" cy="${cy - bodyH - headR * 0.55}" r="${headR}" fill="${blubberFill}"/>
    <circle cx="${cx - headR * 0.4}" cy="${cy - bodyH - headR * 0.65}" r="${Math.max(1.6, headR * 0.13)}" fill="#0c1a26"/>
    <circle cx="${cx + headR * 0.4}" cy="${cy - bodyH - headR * 0.65}" r="${Math.max(1.6, headR * 0.13)}" fill="#0c1a26"/>
    <ellipse cx="${cx}" cy="${cy - bodyH - headR * 0.35}" rx="${headR * 0.22}" ry="${headR * 0.14}" fill="#0c1a26"/>
    ${[-1, 1].flatMap((side) =>
      [0, 1, 2].map(
        (i) =>
          `<line x1="${cx + side * headR * 0.55}" y1="${cy - bodyH - headR * 0.4 + i * 3}" x2="${cx + side * (headR + 14)}" y2="${cy - bodyH - headR * 0.5 + i * 4 - 4}" stroke="#0c1a26" stroke-width="1" opacity="0.5"/>`,
      ),
    ).join("")}
  `;
}

export function renderSeal(svgEl, scale, color, blubberized) {
  svgEl.innerHTML = sealSvg(scale, color, blubberized);
}
