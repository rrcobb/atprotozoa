// chart.js — a small single-series line chart for a rating-over-time log.
// Plain inline SVG, no dependencies. Built per the repo's dataviz skill:
// one hue (a single series needs no legend — the card title already names
// it), a 2px line with round joins, >=8px end markers with a 2px surface
// ring, a crosshair + one tooltip that lists the hovered point, hairline
// recessive gridlines, and an accessible <table> fallback so every value is
// reachable without hovering.

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 30 };
const ACCENT = "#a8672a"; // crema gold — passes >=3:1 against the cream surface (see notes below)
const SURFACE = "#fdf6ea";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(ms) {
  if (!ms) return "?";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// `reviews` — same shape fetchLog() returns, any order. Renders into `el`
// (a plain container) and returns nothing; call again to re-render.
export function renderChart(el, reviews) {
  const points = reviews
    .filter((r) => r.reviewedAt)
    .slice()
    .sort((a, b) => a.reviewedAt - b.reviewedAt);

  if (points.length < 2) {
    el.innerHTML = `<p class="chart-empty">log a couple more lattes and a trend line shows up here.</p>`;
    return;
  }

  const minT = points[0].reviewedAt;
  const maxT = points[points.length - 1].reviewedAt;
  const spanT = Math.max(1, maxT - minT);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (t) => PAD.left + ((t - minT) / spanT) * plotW;
  const y = (r) => PAD.top + plotH - (r / 10) * plotH;

  const coords = points.map((p) => ({ ...p, cx: x(p.reviewedAt), cy: y(p.rating) }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");

  const gridlines = [0, 5, 10]
    .map((v) => {
      const gy = y(v).toFixed(1);
      return `<line x1="${PAD.left}" y1="${gy}" x2="${W - PAD.right}" y2="${gy}" class="chart-grid" />
        <text x="${PAD.left - 6}" y="${gy}" class="chart-axis-label" text-anchor="end" dominant-baseline="middle">${v}</text>`;
    })
    .join("\n");

  const dots = coords
    .map(
      (c, i) => `<circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="4" fill="${ACCENT}" stroke="${SURFACE}" stroke-width="2" data-i="${i}" />
        <circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="12" fill="transparent" class="chart-hit" data-i="${i}" />`,
    )
    .join("\n");

  const last = coords[coords.length - 1];

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Rating over time, ${points.length} reviews">
      ${gridlines}
      <path d="${linePath}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      <text x="${last.cx.toFixed(1)}" y="${(last.cy - 12).toFixed(1)}" class="chart-end-label" text-anchor="end">${last.rating.toFixed(1)}</text>
      <line class="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + plotH}" style="display:none" />
    </svg>
    <div class="chart-tooltip" style="display:none"></div>
    <details class="chart-table-toggle">
      <summary>view as table</summary>
      <table class="chart-table">
        <thead><tr><th>date</th><th>drink</th><th>rating</th></tr></thead>
        <tbody>
          ${coords
            .slice()
            .reverse()
            .map(
              (c) =>
                `<tr><td>${esc(fmtDate(c.reviewedAt))}</td><td>${esc(c.drink)}</td><td>${c.rating.toFixed(1)}/10</td></tr>`,
            )
            .join("\n")}
        </tbody>
      </table>
    </details>
  `;

  const svg = el.querySelector(".chart-svg");
  const crosshair = el.querySelector(".chart-crosshair");
  const tooltip = el.querySelector(".chart-tooltip");

  function showPoint(i) {
    const c = coords[i];
    crosshair.setAttribute("x1", c.cx.toFixed(1));
    crosshair.setAttribute("x2", c.cx.toFixed(1));
    crosshair.style.display = "block";
    tooltip.style.display = "block";
    tooltip.style.left = `${(c.cx / W) * 100}%`;
    tooltip.style.top = `${(c.cy / H) * 100}%`;
    tooltip.innerHTML = `<strong>${c.rating.toFixed(1)}/10</strong><span>${esc(c.drink)}</span><span class="dim">${esc(fmtDate(c.reviewedAt))}</span>`;
  }
  function hide() {
    crosshair.style.display = "none";
    tooltip.style.display = "none";
  }

  el.querySelectorAll(".chart-hit").forEach((hit) => {
    const i = Number(hit.dataset.i);
    hit.addEventListener("pointerenter", () => showPoint(i));
    hit.addEventListener("focus", () => showPoint(i));
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.cx - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    showPoint(nearest);
  });
}
