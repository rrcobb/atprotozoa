// broad daylight — real solar elevation math (NOAA solar position algorithm,
// computed straight from UTC so no timezone-offset bookkeeping is needed),
// bolted onto a made-up "predictive crime coefficient" that exists to be a
// joke about predictive policing, not a working one.

const els = {
  place: document.getElementById("place"),
  lat: document.getElementById("lat"),
  lon: document.getElementById("lon"),
  when: document.getElementById("when"),
  useLoc: document.getElementById("useLoc"),
  useNow: document.getElementById("useNow"),
  analyze: document.getElementById("analyze"),
  geoErr: document.getElementById("geoErr"),
  results: document.getElementById("results"),
  breadthLabel: document.getElementById("breadthLabel"),
  breadthSub: document.getElementById("breadthSub"),
  gaugeFill: document.getElementById("gaugeFill"),
  baccVal: document.getElementById("baccVal"),
  offense: document.getElementById("offense"),
  confidence: document.getElementById("confidence"),
  stamp: document.getElementById("stamp"),
  shareBtn: document.getElementById("shareBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  card: document.getElementById("card"),
};

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) +
    ":" + pad(date.getMinutes())
  );
}
els.when.value = toLocalInputValue(new Date());

els.useNow.addEventListener("click", () => {
  els.when.value = toLocalInputValue(new Date());
});

els.useLoc.addEventListener("click", () => {
  els.geoErr.style.display = "none";
  if (!navigator.geolocation) {
    els.geoErr.textContent = "geolocation isn't available in this browser.";
    els.geoErr.style.display = "block";
    return;
  }
  els.useLoc.disabled = true;
  els.useLoc.textContent = "locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      els.lat.value = pos.coords.latitude.toFixed(4);
      els.lon.value = pos.coords.longitude.toFixed(4);
      if (els.place.value === "here" || !els.place.value) els.place.value = "here";
      els.useLoc.disabled = false;
      els.useLoc.textContent = "use my location";
    },
    (err) => {
      els.geoErr.textContent = "couldn't get your location: " + err.message;
      els.geoErr.style.display = "block";
      els.useLoc.disabled = false;
      els.useLoc.textContent = "use my location";
    }
  );
});

// --- solar elevation (NOAA algorithm, degrees) ---------------------------
function solarElevationDeg(date, latDeg, lonDeg) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000) + 1;

  const hoursUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hoursUTC - 12) / 24);

  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const timeOffset = eqtime + 4 * lonDeg;
  const tst = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + timeOffset;
  const hourAngleDeg = tst / 4 - 180;

  const lat = latDeg * rad;
  const ha = hourAngleDeg * rad;
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zenithDeg = Math.acos(Math.min(1, Math.max(-1, cosZenith))) / rad;
  return 90 - zenithDeg;
}

function breadthCategory(elev) {
  if (elev <= -6) return { label: "civil darkness", sub: "no daylight to speak of, broad or otherwise", pct: 2 };
  if (elev <= 0) return { label: "sub-horizon twilight", sub: "daylight is, at most, a rumor", pct: 8 };
  if (elev <= 10) return { label: "narrow daylight", sub: "the sun is present but keeping a low profile", pct: 20 };
  if (elev <= 25) return { label: "modest daylight", sub: "daylight of unremarkable breadth", pct: 38 };
  if (elev <= 45) return { label: "considerable daylight", sub: "getting broad; witnesses likely", pct: 58 };
  if (elev <= 65) return { label: "broad daylight", sub: "textbook broad-daylight conditions", pct: 78 };
  return { label: "extremely broad daylight", sub: "essentially panoramic; nowhere to hide", pct: 96 };
}

// --- deterministic "prediction" (mulberry32, seeded from the inputs) -----
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OFFENSES = [
  "Unauthorized Vibe Check",
  "Aggravated Jaywalking",
  "Public Display of Confidence",
  "Failure to Yield to Goose",
  "Loitering Near a Farmers Market with Intent to Sample",
  "Excessive Feeding of Pigeons",
  "Wearing Socks with Sandals in a School Zone",
  "Reading Over Someone's Shoulder on Transit",
  "Unlicensed Dog Costume Ownership",
  "Suspicious Enthusiasm for Recycling",
  "Loud Sighing in a Quiet Car",
  "Bringing a Whole Rotisserie Chicken to a Picnic",
  "Parking Slightly Crooked but with Total Conviction",
  "Walking a Cat on a Leash Provocatively",
  "Owning More Tote Bags Than Is Strictly Necessary",
];

function runAnalysis() {
  const lat = parseFloat(els.lat.value);
  const lon = parseFloat(els.lon.value);
  const place = (els.place.value || "here").trim() || "here";
  const whenVal = els.when.value;
  const date = whenVal ? new Date(whenVal) : new Date();

  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(date.getTime())) {
    els.geoErr.textContent = "check your latitude, longitude, and date/time.";
    els.geoErr.style.display = "block";
    return;
  }
  els.geoErr.style.display = "none";

  const elev = solarElevationDeg(date, lat, lon);
  const cat = breadthCategory(elev);

  const seedStr = `${lat.toFixed(2)}|${lon.toFixed(2)}|${date.toDateString()}|${date.getHours()}`;
  const rng = mulberry32(hashSeed(seedStr));
  const noise = Math.round((rng() - 0.5) * 60); // -30..+30
  const elevComponent = Math.max(0, Math.round(elev)); // 0..~90, clamps negative elevation to 0
  const bacc = Math.min(100, Math.max(0, Math.round(elevComponent * 0.6 + noise + 15)));
  const offense = OFFENSES[Math.floor(rng() * OFFENSES.length)];

  els.breadthLabel.textContent = `${elev.toFixed(1)}° — ${cat.label}`;
  els.breadthSub.textContent = cat.sub;
  els.gaugeFill.style.width = `${cat.pct}%`;
  els.baccVal.textContent = bacc;
  els.offense.textContent = offense;
  els.confidence.textContent = "model confidence: 100% (means nothing)";
  els.stamp.textContent = `${place} · ${date.toLocaleString()}`;

  els.results.classList.add("show");

  window._lastResult = { place, date, elev, cat, bacc, offense, lat, lon };
}

els.analyze.addEventListener("click", runAnalysis);

// --- share card + bluesky intent ------------------------------------------
function buildShareText(r) {
  const url = "https://broaddaylight.bisks.net/";
  const text =
    `BACC for ${r.place}: ${r.bacc}/100. Sun at ${r.elev.toFixed(1)}° — ${r.cat.label}. ` +
    `Predicted offense: ${r.offense}. As scientific as real predictive policing (not at all). ${url}`;
  return text.length <= 300 ? text : text.slice(0, 296) + "… " + url;
}

function drawCard(r) {
  const ctx = els.card.getContext("2d");
  const W = 1200, H = 630;
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, W, H);

  // tape stripe
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 16);
  ctx.clip();
  ctx.translate(-40, 0);
  for (let x = -40; x < W + 40; x += 36) {
    ctx.fillStyle = (Math.floor(x / 36)) % 2 === 0 ? "#ffcc00" : "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 40, -40);
    ctx.lineTo(x + 58, -40);
    ctx.lineTo(x + 18, 40);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#8b93a1";
  ctx.font = "24px 'JetBrains Mono', monospace";
  ctx.fillText("EXPERIMENTAL CRIMINOLOGY UNIT", 64, 90);

  ctx.fillStyle = "#eef0f2";
  ctx.font = "bold 64px 'JetBrains Mono', monospace";
  ctx.fillText("broad daylight", 60, 165);

  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 30px 'JetBrains Mono', monospace";
  ctx.fillText(r.place, 64, 225);

  ctx.fillStyle = "#8b93a1";
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText(`${r.elev.toFixed(1)}° sun elevation — ${r.cat.label}`, 64, 262);

  // score
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 150px 'JetBrains Mono', monospace";
  ctx.fillText(String(r.bacc), 64, 430);
  ctx.fillStyle = "#8b93a1";
  ctx.font = "36px 'JetBrains Mono', monospace";
  const scoreW = ctx.measureText(String(r.bacc)).width;
  ctx.font = "bold 150px 'JetBrains Mono', monospace";
  const bigW = ctx.measureText(String(r.bacc)).width;
  ctx.font = "36px 'JetBrains Mono', monospace";
  ctx.fillText("/100 BACC", 64 + bigW + 16, 430);

  ctx.fillStyle = "#eef0f2";
  ctx.font = "26px 'JetBrains Mono', monospace";
  ctx.fillText("predicted offense:", 64, 490);
  ctx.fillStyle = "#ff9d9d";
  ctx.font = "bold 26px 'JetBrains Mono', monospace";
  wrapText(ctx, r.offense, 64, 528, 1070, 34);

  ctx.fillStyle = "#8b93a1";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText("this is satire. the score is fake. broaddaylight.bisks.net", 64, 596);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function handleShare() {
  const r = window._lastResult;
  if (!r) return;
  drawCard(r);
  const shareText = buildShareText(r);

  if (canShareFiles()) {
    els.card.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "broad-daylight.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "broad daylight" });
        return;
      } catch {
        // fall through to intent link
      }
      openIntent(shareText);
    }, "image/png");
    return;
  }
  openIntent(shareText);
}

function openIntent(text) {
  const url = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  window.open(url, "_blank", "noopener");
}

function handleDownload() {
  const r = window._lastResult;
  if (!r) return;
  drawCard(r);
  els.card.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "broad-daylight.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

els.shareBtn.addEventListener("click", handleShare);
els.downloadBtn.addEventListener("click", handleDownload);
