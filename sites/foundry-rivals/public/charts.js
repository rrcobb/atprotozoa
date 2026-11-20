// Tiny SVG line charts for the sim's time series. No dependencies.
const COLORS = ["#f0a73a", "#6cb6ff", "#7ee08a", "#ff7b8a", "#c39bff", "#5fd6d0", "#e6d36a"];
export const color = (i) => COLORS[i % COLORS.length];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (v, money) => {
  const a = Math.abs(v), p = money ? "$" : "";
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return sign + p + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return sign + p + Math.round(a / 1e3) + "k";
  if (a >= 1e3) return sign + p + (a / 1e3).toFixed(1) + "k";
  if (a >= 100) return sign + p + Math.round(a);
  return sign + p + (Math.round(a * 10) / 10);
};

// days: x values; series: [{name, data, color?}]; opts: {money, h, zero}
export function lineChart(days, series, opts = {}) {
  const n = days.length;
  if (n < 2) return `<div class="chart empty dim">chart fills in as days pass…</div>`;
  const W = 320, H = opts.h || 110, L = 38, R = 6, T = 6, B = 16;
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s.data) if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo)) return "";
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (i) => L + ((W - L - R) * i) / (n - 1);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const grid = [lo + pad, (lo + hi) / 2, hi - pad].map((v) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#2f343d"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${short(v, opts.money)}</text>`).join("");
  const zero = opts.zero ? `<line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#5a606c" stroke-dasharray="3 3"/>` : "";
  const lines = series.map((s, k) => {
    const pts = s.data.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
    return `<polyline fill="none" stroke="${s.color || color(k)}" stroke-width="${s.bold ? 2.2 : 1.4}" stroke-linejoin="round" points="${pts}"/>`;
  }).join("");
  const axis = `<text x="${L}" y="${H - 3}">day ${days[0]}</text><text x="${W - R}" y="${H - 3}" text-anchor="end">day ${days[n - 1]}</text>`;
  const legend = series.map((s, k) => {
    const last = s.data[s.data.length - 1];
    return `<span><i style="background:${s.color || color(k)}"></i>${esc(s.name)} <b>${last == null ? "–" : short(last, opts.money)}</b></span>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "time series chart")}">${grid}${zero}${lines}${axis}</svg><div class="legend">${legend}</div></div>`;
}

// inline sparkline for the header
export function spark(data, c = "#f0a73a") {
  const n = data.length;
  if (n < 2) return "";
  const lo = Math.min(...data), hi = Math.max(...data), W = 90, H = 20;
  const pts = data.map((v, i) => `${((W * i) / (n - 1)).toFixed(1)},${(H - 2 - ((H - 4) * (v - lo)) / (hi - lo || 1)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline fill="none" stroke="${c}" stroke-width="1.5" points="${pts}"/></svg>`;
}
