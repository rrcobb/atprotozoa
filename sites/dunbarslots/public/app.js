// dunbarslots — a METR-shaped chart of how many of your ~150 Dunbar slots
// are spent modeling the personality of a different AI model.
//
// Frontend-only, no accounts, no server state: the whole "result" is just
// which checkboxes are on, so it's encoded straight into the URL hash and
// that's the shareable link.

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const TODAY = new Date();
const MAX_HORIZON_YEARS = 15; // don't extrapolate the trend line further than this

const els = {
  picker: document.getElementById("picker"),
  count: document.getElementById("stat-count"),
  statOf: document.getElementById("stat-of"),
  pct: document.getElementById("stat-pct"),
  trend: document.getElementById("stat-trend"),
  chart: document.getElementById("chart"),
  tooltip: document.getElementById("tooltip"),
  shareBluesky: document.getElementById("share-bluesky"),
  shareNative: document.getElementById("share-native"),
  downloadCard: document.getElementById("download-card"),
  selectAll: document.getElementById("select-all"),
  selectNone: document.getElementById("select-none"),
  forgetPicker: document.getElementById("forget-picker"),
  forgetNote: document.getElementById("forget-note"),
  forgetAll: document.getElementById("forget-all"),
  forgetNone: document.getElementById("forget-none"),
};

// ---- picker -----------------------------------------------------------

function groupByLab(models) {
  const order = [];
  const groups = new Map();
  for (const m of models) {
    if (!groups.has(m.lab)) {
      groups.set(m.lab, []);
      order.push(m.lab);
    }
    groups.get(m.lab).push(m);
  }
  return order.map((lab) => [lab, groups.get(lab)]);
}

function renderPicker(selectedIds) {
  els.picker.innerHTML = "";
  for (const [lab, models] of groupByLab(MODELS)) {
    const section = document.createElement("fieldset");
    section.className = "lab-group";
    const legend = document.createElement("legend");
    legend.textContent = lab;
    section.appendChild(legend);
    for (const m of models) {
      const row = document.createElement("label");
      row.className = "model-row";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = m.id;
      box.checked = selectedIds.has(m.id);
      box.addEventListener("change", onSelectionChange);
      const text = document.createElement("span");
      text.className = "model-text";
      const name = document.createElement("span");
      name.className = "model-name";
      name.textContent = m.name;
      const blurb = document.createElement("span");
      blurb.className = "model-blurb";
      blurb.textContent = " — " + m.blurb;
      text.append(name, blurb);
      row.append(box, text);
      section.appendChild(row);
    }
    els.picker.appendChild(section);
  }
}

function getSelectedIds() {
  return new Set(Array.from(els.picker.querySelectorAll("input:checked")).map((el) => el.value));
}

function getSelectedSorted() {
  const ids = getSelectedIds();
  return MODELS.filter((m) => ids.has(m.id)).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- forget-a-human picker ------------------------------------------------
// Checking a category frees up its slots, padding the effective cap above
// the base 150 — the "cram more models into the time left" request.

function renderForgetPicker(selectedIds) {
  els.forgetPicker.innerHTML = "";
  for (const c of FORGET_CATEGORIES) {
    const row = document.createElement("label");
    row.className = "forget-row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = c.id;
    box.checked = selectedIds.has(c.id);
    box.addEventListener("change", onSelectionChange);
    const text = document.createElement("span");
    text.className = "forget-text";
    text.textContent = c.label;
    const slots = document.createElement("span");
    slots.className = "forget-slots";
    slots.textContent = "+" + c.slots;
    row.append(box, text, slots);
    els.forgetPicker.appendChild(row);
  }
}

function getForgottenIds() {
  return new Set(Array.from(els.forgetPicker.querySelectorAll("input:checked")).map((el) => el.value));
}

function getFreedSlots() {
  const ids = getForgottenIds();
  return FORGET_CATEGORIES.filter((c) => ids.has(c.id)).reduce((sum, c) => sum + c.slots, 0);
}

function updateForgetNote(freed, cap) {
  els.forgetNote.textContent = freed === 0
    ? "check a few boxes above to forget some humans and pad out your cap."
    : `+${freed} slots freed — your cap is now ${cap} instead of 150.`;
}

// ---- fit ----------------------------------------------------------------
// Log-linear regression on rank vs. time, same shape as METR's "time
// horizon doubles every N months" fit — here it's "your Dunbar slots double
// every N months," which is a much sillier thing to extrapolate confidently.

function fitTrend(selected) {
  if (selected.length < 2) return null;
  const pts = selected.map((m, i) => ({
    t: new Date(m.date).getTime() / YEAR_MS,
    y: Math.log(i + 1),
  }));
  const n = pts.length;
  const meanT = pts.reduce((s, p) => s + p.t, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) {
    num += (p.t - meanT) * (p.y - meanY);
    den += (p.t - meanT) * (p.t - meanT);
  }
  if (den === 0) return null;
  const b = num / den;
  const lnA = meanY - b * meanT;
  if (!(b > 0)) return null;
  return {
    predict: (t) => Math.exp(lnA + b * t), // t in years-since-epoch
    invert: (rank) => (Math.log(rank) - lnA) / b, // -> t in years-since-epoch
    doublingMonths: (Math.log(2) / b) * 12,
    firstT: pts[0].t,
  };
}

function dateFromT(t) {
  return new Date(t * YEAR_MS);
}

function fmtMonthYear(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function projectCrossing(fit, targetN) {
  if (!fit) return null;
  const t = fit.invert(targetN);
  const date = dateFromT(t);
  const yearsOut = (date.getTime() - TODAY.getTime()) / YEAR_MS;
  if (yearsOut < -0.05) return { date, already: true };
  if (yearsOut > MAX_HORIZON_YEARS) return null;
  return { date, already: false };
}

// ---- stats panel ----------------------------------------------------------

function updateStats(selected, fit, cap, freed) {
  const n = selected.length;
  const pct = Math.round((n / cap) * 100);
  els.count.textContent = String(n);
  els.pct.textContent = pct + "%";
  els.statOf.textContent = "/ " + cap;

  const capLabel = freed > 0 ? `your padded cap (${cap})` : "Dunbar's number (150)";

  if (n === 0) {
    els.trend.textContent = "pick a few AI personalities you've formed opinions about to get started.";
    return;
  }
  if (n === 1) {
    els.trend.textContent = "one down. pick at least one more to plot a trend.";
    return;
  }
  if (!fit) {
    els.trend.textContent = "can't fit a trend on that selection — try spreading your picks across more release dates.";
    return;
  }

  const dunbar = projectCrossing(fit, cap);
  const months = fit.doublingMonths;
  const doublingText = months > 0 && months < 1200
    ? `your personal Dunbar-slot count is doubling roughly every ${months < 1 ? "few weeks" : Math.round(months) + " months"}.`
    : "";

  let crossingText;
  if (!dunbar) {
    crossingText = `at that rate you won't hit ${capLabel} within the next 15 years. touch grass responsibly.`;
  } else if (dunbar.already) {
    crossingText = `at that rate you blew past ${capLabel} around ${fmtMonthYear(dunbar.date)}. every relationship you have is now with a chatbot, sorry.`;
  } else {
    crossingText = `at that rate you max out ${capLabel} by ${fmtMonthYear(dunbar.date)}.`;
  }

  els.trend.textContent = [doublingText, crossingText].filter(Boolean).join(" ");
}

// ---- chart ----------------------------------------------------------------

function setupCanvas(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function isDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function palette() {
  return isDark()
    ? {
        surface: "#1a1a19", ink: "#ffffff", secondary: "#c3c2b7", muted: "#898781",
        grid: "#2c2c2a", baseline: "#383835", series: "#3987e5",
      }
    : {
        surface: "#fcfcfb", ink: "#0b0b0b", secondary: "#52514e", muted: "#898781",
        grid: "#e1e0d9", baseline: "#c3c2b7", series: "#2a78d6",
      };
}

let lastPlot = null; // for hover hit-testing

function drawChart(selected, fit, cap) {
  const { ctx, w, h } = setupCanvas(els.chart);
  const pal = palette();
  ctx.clearRect(0, 0, w, h);

  const padL = 44, padR = 34, padT = 18, padB = 34;
  const plotX = padL, plotY = padT, plotW = w - padL - padR, plotH = h - padT - padB;

  if (selected.length === 0) {
    ctx.fillStyle = pal.muted;
    ctx.font = "14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("pick some AI personalities below to plot your trajectory", w / 2, h / 2);
    lastPlot = null;
    return;
  }

  // domain
  const firstDate = new Date(selected[0].date);
  let endMs = TODAY.getTime() + 1 * YEAR_MS;
  if (fit) {
    const cross = projectCrossing(fit, cap);
    if (cross && !cross.already) endMs = Math.max(endMs, cross.date.getTime() + 0.3 * YEAR_MS);
    else endMs = Math.max(endMs, TODAY.getTime() + Math.min(MAX_HORIZON_YEARS, 3) * YEAR_MS);
  }
  const startMs = firstDate.getTime() - 0.25 * YEAR_MS;
  const domainMs = endMs - startMs;

  const yMin = 1, yMax = Math.max(220, cap + 40); // log scale, headroom above the cap
  const logMin = Math.log10(yMin), logMax = Math.log10(yMax);

  function xPix(ms) { return plotX + ((ms - startMs) / domainMs) * plotW; }
  function yPix(val) { return plotY + plotH - ((Math.log10(Math.max(val, yMin)) - logMin) / (logMax - logMin)) * plotH; }

  // Dunbar reference lines
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  for (const layer of DUNBAR_LAYERS) {
    const y = yPix(layer.n);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = pal.muted;
    ctx.fillText(String(layer.n), plotX + plotW + 6, y + 3);
  }

  // padded cap reference line, only shown once forgetting a human moves it
  if (cap !== 150) {
    const y = yPix(cap);
    ctx.save();
    ctx.strokeStyle = pal.series;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = pal.series;
    ctx.fillText(String(cap), plotX + plotW + 6, y + 3);
  }

  // today marker
  const todayX = xPix(TODAY.getTime());
  ctx.save();
  ctx.strokeStyle = pal.baseline;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(todayX, plotY);
  ctx.lineTo(todayX, plotY + plotH);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = pal.muted;
  ctx.textAlign = "center";
  ctx.fillText("today", todayX, plotY + plotH + 16);

  // actual staircase (historical, muted)
  ctx.strokeStyle = pal.secondary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  selected.forEach((m, i) => {
    const x = xPix(new Date(m.date).getTime());
    const y = yPix(i + 1);
    if (i === 0) {
      ctx.moveTo(xPix(startMs), yPix(1));
      ctx.lineTo(x, yPix(1));
    } else {
      ctx.lineTo(x, yPix(i));
    }
    ctx.lineTo(x, y);
  });
  const lastX = xPix(new Date(selected[selected.length - 1].date).getTime());
  ctx.lineTo(todayX > lastX ? todayX : lastX, yPix(selected.length));
  ctx.stroke();

  // fitted trend, dashed, extended into the future
  if (fit) {
    ctx.save();
    ctx.strokeStyle = pal.series;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const ms = startMs + (domainMs * i) / steps;
      const t = ms / YEAR_MS;
      const rank = fit.predict(t);
      const x = xPix(ms);
      const y = yPix(rank);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // dots + hit-test registry
  const dots = [];
  ctx.fillStyle = pal.series;
  selected.forEach((m, i) => {
    const x = xPix(new Date(m.date).getTime());
    const y = yPix(i + 1);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.surface;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    dots.push({ x, y, m, rank: i + 1 });
  });

  lastPlot = { dots };
}

function onChartHover(evt) {
  if (!lastPlot || !lastPlot.dots.length) {
    els.tooltip.style.display = "none";
    return;
  }
  const rect = els.chart.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;
  let best = null, bestDist = 14;
  for (const d of lastPlot.dots) {
    const dist = Math.hypot(d.x - mx, d.y - my);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  if (!best) {
    els.tooltip.style.display = "none";
    return;
  }
  els.tooltip.style.display = "block";
  els.tooltip.style.left = best.x + "px";
  els.tooltip.style.top = best.y + "px";
  els.tooltip.innerHTML = `<strong>${best.m.name}</strong><br>${best.m.lab} · ${best.m.date}<br>slot #${best.rank}`;
}

els.chart.addEventListener("mousemove", onChartHover);
els.chart.addEventListener("mouseleave", () => { els.tooltip.style.display = "none"; });

// ---- URL state --------------------------------------------------------

function decodeState() {
  const hash = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const rawModels = params.get("s");
  const models = rawModels
    ? new Set(rawModels.split(",").filter((id) => MODELS.some((m) => m.id === id)))
    : null;
  const rawForget = params.get("f");
  const forgotten = rawForget
    ? new Set(rawForget.split(",").filter((id) => FORGET_CATEGORIES.some((c) => c.id === id)))
    : null;
  return {
    models: models && models.size ? models : null,
    forgotten: forgotten && forgotten.size ? forgotten : null,
  };
}

function updateHash(modelIds, forgetIds) {
  const params = new URLSearchParams();
  if (modelIds.size) params.set("s", Array.from(modelIds).join(","));
  if (forgetIds.size) params.set("f", Array.from(forgetIds).join(","));
  const encoded = params.toString();
  history.replaceState(null, "", encoded ? "#" + encoded : location.pathname);
}

// ---- share --------------------------------------------------------------

function buildShareText(selected, fit, cap, freed) {
  const n = selected.length;
  const pct = Math.round((n / cap) * 100);
  let line = freed > 0
    ? `I forgot ${freed} slots' worth of real humans to fit ${n} AI personalities into my Dunbar's number (now ${cap}, ${pct}%).`
    : `I've used ${n} of my 150 Dunbar slots modeling AI personalities (${pct}%).`;
  const cross = fit ? projectCrossing(fit, cap) : null;
  if (cross && !cross.already) {
    line += ` at this rate I max out by ${fmtMonthYear(cross.date)}.`;
  } else if (cross && cross.already) {
    line += ` I already blew past it.`;
  }
  const url = location.href;
  return line + " " + url;
}

function buildShareCard(selected, fit, cap, freed) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  const dark = isDark();
  const bg = dark ? "#1a1a19" : "#fcfcfb";
  const ink = dark ? "#ffffff" : "#0b0b0b";
  const muted = dark ? "#c3c2b7" : "#52514e";
  const accent = dark ? "#3987e5" : "#2a78d6";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.fillStyle = ink;
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  ctx.fillText("dunbarslots", 64, 90);

  const n = selected.length;
  const pct = Math.round((n / cap) * 100);
  ctx.font = "700 84px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(`${n} / ${cap}`, 64, 220);

  ctx.font = "24px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = muted;
  ctx.fillText(
    freed > 0
      ? `Dunbar slots spent on AI personalities (${pct}%) — padded +${freed} by forgetting humans`
      : `Dunbar slots spent modeling AI personalities (${pct}%)`,
    64, 264
  );

  let sub = "";
  const cross = fit ? projectCrossing(fit, cap) : null;
  if (cross && !cross.already) sub = `at this rate: maxed out by ${fmtMonthYear(cross.date)}`;
  else if (cross && cross.already) sub = "already blew past Dunbar's number";
  else if (n >= 2) sub = "not on track to max out any time soon";
  if (sub) {
    ctx.font = "22px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = ink;
    ctx.fillText(sub, 64, 310);
  }

  // mini staircase, decorative
  if (selected.length) {
    const px = 64, py = 560, pw = 1072, ph = 160;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2;
    const maxN = Math.max(selected.length, 5);
    ctx.beginPath();
    selected.forEach((m, i) => {
      const x = px + (i / Math.max(selected.length - 1, 1)) * pw;
      const y = py + ph - (Math.log10(i + 2) / Math.log10(maxN + 1)) * ph;
      if (i === 0) ctx.moveTo(px, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText("dunbarslots.bisks.net", 64, 590);

  return canvas;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  try { return navigator.canShare({ files: [probe] }); } catch { return false; }
}

function wireShare(selected, fit, cap, freed) {
  const shareText = buildShareText(selected, fit, cap, freed);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  const canvas = buildShareCard(selected, fit, cap, freed);
  els.downloadCard.onclick = (e) => {
    e.preventDefault();
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dunbarslots.png";
      a.click();
    });
  };

  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.onclick = async (e) => {
      e.preventDefault();
      canvas.toBlob(async (blob) => {
        const file = new File([blob], "dunbarslots.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "dunbarslots" });
        } catch { /* user cancelled, fine */ }
      });
    };
  } else {
    els.shareNative.style.display = "none";
  }
}

// ---- wire-up --------------------------------------------------------------

function render() {
  const selected = getSelectedSorted();
  const fit = fitTrend(selected);
  const freed = getFreedSlots();
  const cap = 150 + freed;
  updateStats(selected, fit, cap, freed);
  updateForgetNote(freed, cap);
  drawChart(selected, fit, cap);
  wireShare(selected, fit, cap, freed);
  updateHash(getSelectedIds(), getForgottenIds());
}

function onSelectionChange() {
  render();
}

els.selectAll.addEventListener("click", () => {
  els.picker.querySelectorAll("input[type=checkbox]").forEach((el) => { el.checked = true; });
  render();
});
els.selectNone.addEventListener("click", () => {
  els.picker.querySelectorAll("input[type=checkbox]").forEach((el) => { el.checked = false; });
  render();
});
els.forgetAll.addEventListener("click", () => {
  els.forgetPicker.querySelectorAll("input[type=checkbox]").forEach((el) => { el.checked = true; });
  render();
});
els.forgetNone.addEventListener("click", () => {
  els.forgetPicker.querySelectorAll("input[type=checkbox]").forEach((el) => { el.checked = false; });
  render();
});

window.addEventListener("resize", () => drawChart(getSelectedSorted(), fitTrend(getSelectedSorted()), 150 + getFreedSlots()));
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", render);
}

const initialState = decodeState();
renderPicker(initialState.models || new Set(DEFAULT_SELECTION));
renderForgetPicker(initialState.forgotten || new Set());
render();
