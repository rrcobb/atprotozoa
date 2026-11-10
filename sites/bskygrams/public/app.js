import { parseTerms, makeBuckets, countBucket } from "./lib/ngram.js";

const $ = (id) => document.getElementById(id);
const COLORS = ["#2563eb", "#e4572e", "#0f9d58", "#a855f7", "#d19a00", "#0891b2"];
const CONCURRENCY = 4; // gentle on the public AppView's rate limit
let ctl = null;
let series = []; // {term, color, buckets:[{from,to,n,done}]}

// default: the last 12 months
const d0 = new Date(); d0.setUTCMonth(d0.getUTCMonth() - 12);
$("from").value = d0.toISOString().slice(0, 10);

const fmtBucket = (b, gran) => {
  const d = new Date(b.from);
  return gran === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
};

function draw(gran) {
  const svg = $("chart");
  const W = 800, H = 380, L = 56, R = 16, T = 16, B = 40;
  const nb = series.length ? series[0].buckets.length : 0;
  let max = 1;
  for (const s of series) for (const b of s.buckets) max = Math.max(max, b.n);
  const x = (i) => L + (nb <= 1 ? 0 : (i / (nb - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  let h = "";
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4, yy = y(v);
    h += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#eee"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#6b6558">${Math.round(v).toLocaleString()}</text>`;
  }
  if (nb) {
    const step = Math.max(1, Math.ceil(nb / 8));
    for (let i = 0; i < nb; i += step)
      h += `<text x="${x(i)}" y="${H - 18}" text-anchor="middle" font-size="11" fill="#6b6558">${fmtBucket(series[0].buckets[i], gran)}</text>`;
  }
  for (const s of series) {
    const pts = s.buckets.map((b, i) => `${x(i)},${y(b.n)}`).join(" ");
    h += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    s.buckets.forEach((b, i) => {
      h += `<circle cx="${x(i)}" cy="${y(b.n)}" r="3.5" fill="${b.done ? s.color : "#fff"}" stroke="${s.color}" stroke-width="1.5"><title>${s.term} · ${fmtBucket(b, gran)}: ${b.n.toLocaleString()}${b.done ? "" : " (partial)"}</title></circle>`;
    });
  }
  svg.innerHTML = h;
  $("legend").innerHTML = series
    .map((s) => `<span><span class="sw" style="background:${s.color}"></span>${s.term.replace(/</g, "&lt;")} (${s.buckets.reduce((a, b) => a + b.n, 0).toLocaleString()})</span>`)
    .join("");
}

async function run(e) {
  e.preventDefault();
  const terms = parseTerms($("terms").value).slice(0, COLORS.length); // one colour per line
  if (!terms.length) { $("status").textContent = "type a word or phrase first."; return; }
  const gran = $("gran").value;
  const from = Date.parse($("from").value + "T00:00:00Z");
  if (isNaN(from)) { $("status").textContent = "pick a start date."; return; }
  const buckets = makeBuckets(from, Date.now(), gran);
  series = terms.map((term, i) => ({ term, color: COLORS[i], buckets: buckets.map((b) => ({ ...b, n: 0, done: false })) }));
  const tasks = [];
  for (const s of series) for (const b of s.buckets) tasks.push({ s, b });
  ctl = new AbortController();
  $("go").hidden = true; $("stop").hidden = false; $("share").hidden = true;
  let finished = 0, error = null;
  const status = () => { $("status").textContent = `${finished}/${tasks.length} buckets counted…` + (error ? " " + error : ""); };
  status(); draw(gran);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && !ctl.signal.aborted) {
      const { s, b } = tasks[next++];
      try {
        b.n = await countBucket(s.term, b, ctl.signal, (n) => { b.n = n; draw(gran); });
        b.done = true; finished++;
      } catch (err) {
        if (err.name === "AbortError") return;
        error = err.message; // keep going with the other buckets
        finished++;
      }
      status(); draw(gran);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const stopped = ctl.signal.aborted;
  $("go").hidden = false; $("stop").hidden = true;
  $("status").textContent = (stopped ? "stopped. " : "done. ") + `${finished}/${tasks.length} buckets counted.` + (error ? " " + error : "");
  draw(gran);
  $("share").hidden = false;
}

$("form").addEventListener("submit", run);
$("stop").addEventListener("click", () => ctl && ctl.abort());
$("share").addEventListener("click", () => {
  const terms = series.map((s) => `"${s.term}"`).join(" vs ");
  const text = `${terms} on bluesky over time, via bskygrams\nhttps://bskygrams.bisks.net/`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});
draw("month");
