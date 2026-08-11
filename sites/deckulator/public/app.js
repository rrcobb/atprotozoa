// deckulator — client-side takeoff + advisory engine. Everything here runs
// in the browser against user-entered dimensions; there is no server state.
//
// The span table, fastener costs, and environmental-model coefficients below
// are illustrative planning figures (see the on-page advisory), not values
// pulled from a stamped span table for any one jurisdiction.

const BOARD_PROFILES = [
  { id: "54x6-pt", label: '5/4 x 6 PT decking', widthIn: 5.5, thicknessIn: 1.0, gapIn: 0.1875, hidden: false },
  { id: "2x6", label: "2x6 dimensional lumber", widthIn: 5.5, thicknessIn: 1.5, gapIn: 0.25, hidden: false },
  { id: "1x4-tg", label: "1x4 T&G cedar", widthIn: 3.5, thicknessIn: 0.75, gapIn: 0.0625, hidden: false },
  { id: "comp-55", label: "Composite, grooved-edge, 5.5in", widthIn: 5.5, thicknessIn: 1.0, gapIn: 0.1875, hidden: true },
  { id: "pvc-35-tg", label: "3.5in T&G PVC", widthIn: 3.5, thicknessIn: 1.0, gapIn: 0.125, hidden: false },
];

const SPECIES = [
  { id: "syp-pt", label: "Pressure-Treated Southern Yellow Pine", priceBF: 3.1, E: 1600000, moisturePct: 19 },
  { id: "cedar", label: "Western Red Cedar", priceBF: 5.4, E: 1100000, moisturePct: 12 },
  { id: "redwood", label: "Redwood, Construction Heart", priceBF: 7.25, E: 1200000, moisturePct: 12 },
  { id: "ipe", label: "Ipe (Brazilian hardwood)", priceBF: 12.9, E: 3200000, moisturePct: 9 },
  { id: "composite", label: "Composite, capped polymer", priceBF: 6.8, E: 700000, moisturePct: 0 },
  { id: "tm-ash", label: "Thermally Modified Ash", priceBF: 9.1, E: 1450000, moisturePct: 6 },
];

// Approximate single-span joist tables (ft), 40psf live / 10psf dead, L/360 —
// illustrative planning figures, not a substitute for a stamped span table.
const JOIST_SPECIES = [
  {
    id: "syp2", label: "PT Southern Yellow Pine #2",
    span: { 12: { "2x6": 11.08, "2x8": 14.58, "2x10": 18.0, "2x12": 21.25 },
            16: { "2x6": 10.0,  "2x8": 13.25, "2x10": 16.42, "2x12": 19.33 },
            24: { "2x6": 8.75,  "2x8": 11.5,  "2x10": 14.33, "2x12": 16.92 } },
  },
  {
    id: "df-larch", label: "Douglas Fir-Larch #2",
    span: { 12: { "2x6": 10.75, "2x8": 14.17, "2x10": 17.42, "2x12": 20.17 },
            16: { "2x6": 9.75,  "2x8": 12.83, "2x10": 15.75, "2x12": 18.33 },
            24: { "2x6": 8.5,   "2x8": 11.0,  "2x10": 13.5,  "2x12": 15.75 } },
  },
  {
    id: "hem-fir", label: "Hem-Fir #2",
    span: { 12: { "2x6": 10.25, "2x8": 13.5,  "2x10": 16.67, "2x12": 19.33 },
            16: { "2x6": 9.33,  "2x8": 12.25, "2x10": 15.0,  "2x12": 17.5 },
            24: { "2x6": 8.08,  "2x8": 10.67, "2x10": 13.0,  "2x12": 15.17 } },
  },
  {
    id: "spf", label: "Spruce-Pine-Fir #2",
    span: { 12: { "2x6": 9.92, "2x8": 13.08, "2x10": 16.0,  "2x12": 18.58 },
            16: { "2x6": 9.0,  "2x8": 11.83, "2x10": 14.5,  "2x12": 16.83 },
            24: { "2x6": 7.83, "2x8": 10.33, "2x10": 12.67, "2x12": 14.75 } },
  },
  {
    id: "lvl", label: "Engineered LVL",
    span: { 12: { "2x6": 13.0,  "2x8": 17.17, "2x10": 21.17, "2x12": 24.75 },
            16: { "2x6": 11.83, "2x8": 15.58, "2x10": 19.17, "2x12": 22.42 },
            24: { "2x6": 10.25, "2x8": 13.5,  "2x10": 16.67, "2x12": 19.5 } },
  },
];

const JOIST_SIZES = ["2x6", "2x8", "2x10", "2x12"];

const PATTERN_MULT = {
  straight: { mult: 1.0, waste: 10 },
  diagonal: { mult: 1.42, waste: 18 },
  herringbone: { mult: 1.5, waste: 22 },
  "picture-frame": { mult: 1.0, waste: 15 },
};

const FASTENER_COST = { hidden: 0.32, face2: 0.09, face3: 0.09 };
const FASTENER_PER_CROSSING = { hidden: 2, face2: 2, face3: 3 };

const LUNAR_CONFIDENCE = {
  "New Moon": 12, "Waxing Crescent": 34, "First Quarter": 58,
  "Waxing Gibbous": 79, "Full Moon": 97, "Waning Gibbous": 71,
  "Last Quarter": 46, "Waning Crescent": 21,
};

const TORQUE_BASE = { star: 155, square: 140, phillips: 110 }; // in-lbs, driver clutch setting suggestion

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => "$" + fmt(n, 2);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function populateSelect(sel, items, labelFn) {
  sel.innerHTML = items.map((it, i) => `<option value="${i}">${labelFn(it)}</option>`).join("");
}

function init() {
  populateSelect($("boardProfile"), BOARD_PROFILES, (p) => p.label);
  populateSelect($("species"), SPECIES, (s) => s.label);
  populateSelect($("joistSpecies"), JOIST_SPECIES, (s) => s.label);
  $("joistSpecies").value = "0";

  document.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  $("boardProfile").addEventListener("change", () => {
    const p = BOARD_PROFILES[Number($("boardProfile").value)];
    $("gapIn").value = p.gapIn;
    if (p.hidden) $("fastenerSystem").value = "hidden";
    render();
  });

  $("species").addEventListener("change", () => {
    $("priceOverride").value = "";
    render();
  });

  $("printBtn").addEventListener("click", () => window.print());
  $("copyBtn").addEventListener("click", copySummary);
  $("assistantBtn").addEventListener("click", runAssistant);

  $("sessionId").textContent = String(100000 + Math.floor(Math.random() * 899999));

  render();
}

let lastResult = null;

function render() {
  const lengthFt = Number($("lengthFt").value) || 0;
  const widthFt = Number($("widthFt").value) || 0;
  const runDir = $("runDirection").value;
  const pattern = $("pattern").value;
  const profile = BOARD_PROFILES[Number($("boardProfile").value)];
  const gapIn = Number($("gapIn").value) || 0;
  const stockLengthFt = Number($("stockLengthFt").value) || 16;
  const wasteOverride = $("wasteOverride").value;

  const species = SPECIES[Number($("species").value)];
  $("specE").textContent = fmt(species.E) + " psi";
  $("specMC").textContent = species.moisturePct + "%";
  if (!$("priceOverride").value) $("priceOverride").value = species.priceBF;
  const priceBF = Number($("priceOverride").value) || species.priceBF;

  const joistSpecies = JOIST_SPECIES[Number($("joistSpecies").value)];
  const joistSpacingIn = Number($("joistSpacingIn").value);
  const frostLineIn = Number($("frostLineIn").value) || 0;

  const fastenerSystem = $("fastenerSystem").value;
  const driveType = $("driveType").value;

  const tempF = Number($("tempF").value) || 70;
  const humidityPct = Number($("humidityPct").value) || 50;
  const pressureInHg = Number($("pressureInHg").value) || 29.92;
  const acclimationDays = Number($("acclimationDays").value) || 0;
  const lunarPhase = $("lunarPhase").value;

  // ── geometry ────────────────────────────────────────────────────────────
  const area = lengthFt * widthFt;
  const perimeter = 2 * (lengthFt + widthFt);
  const pitchFt = (profile.widthIn + gapIn) / 12;

  const perpendicularSpan = runDir === "along-length" ? widthFt : lengthFt;
  const runLength = runDir === "along-length" ? lengthFt : widthFt;

  const patternInfo = PATTERN_MULT[pattern];
  const rows = pitchFt > 0 ? Math.ceil(perpendicularSpan / pitchFt) : 0;
  const piecesPerRow = stockLengthFt > 0 ? Math.ceil((runLength * patternInfo.mult) / stockLengthFt) : 0;
  const fieldBoards = rows * piecesPerRow;

  const wastePct = wasteOverride !== "" ? Number(wasteOverride) : patternInfo.waste;
  let totalBoards = Math.ceil(fieldBoards * (1 + wastePct / 100));

  let borderBoards = 0;
  if (pattern === "picture-frame") {
    borderBoards = Math.ceil((perimeter / stockLengthFt) * 1.15);
    totalBoards += borderBoards;
  }

  const spareBoards = totalBoards > 0 ? Math.max(1, Math.ceil(totalBoards * 0.05)) : 0;
  const buyBoards = totalBoards + spareBoards;

  const linearFt = totalBoards * stockLengthFt;
  const boardFeet = totalBoards * (profile.thicknessIn * profile.widthIn * stockLengthFt) / 12;

  // ── substructure advisory ──────────────────────────────────────────────
  const joistSpanFt = perpendicularSpan;
  const joistCount = joistSpacingIn > 0 ? Math.ceil(runLength / (joistSpacingIn / 12)) + 1 : 0;
  const table = joistSpecies.span[joistSpacingIn] || joistSpecies.span[16];
  let joistSize = null;
  for (const size of JOIST_SIZES) {
    if (table[size] >= joistSpanFt) { joistSize = size; break; }
  }
  const joistOk = !!joistSize;
  const footingDepth = Math.max(frostLineIn, 12) + 6;

  // ── fasteners ───────────────────────────────────────────────────────────
  const crossingsPerBoard = joistCount;
  const perCrossing = FASTENER_PER_CROSSING[fastenerSystem];
  const fastenerCount = totalBoards * crossingsPerBoard * perCrossing;
  const fastenerCost = fastenerCount * FASTENER_COST[fastenerSystem];
  const torque = TORQUE_BASE[driveType] + (fastenerSystem === "hidden" ? -15 : 0) + ($("preDrill").checked ? -10 : 0);

  // ── environmental model (cosmetic, does not adjust the takeoff above) ──
  const hygro = clamp(50 + (humidityPct - 50) * 0.3 - (tempF - 70) * 0.2 + (pressureInHg - 29.92) * 12, 0, 100);
  const lunarConf = LUNAR_CONFIDENCE[lunarPhase];
  const acclimOk = acclimationDays >= (species.moisturePct > 10 ? 3 : 1);

  // ── cost ────────────────────────────────────────────────────────────────
  const costDecking = boardFeet * priceBF;
  const costFasteners = fastenerCost;
  const subtotal = costDecking + costFasteners;
  const bandLow = subtotal * 0.9;
  const bandHigh = subtotal * 1.25;

  // quantum optimizer: cosmetic only — same board count either way, more
  // "realities evaluated" if enabled.
  const realities = $("quantumOpt").checked ? 137 + Math.floor((hygro + lunarConf) * 3.7) : 1;

  // ── write telemetry ─────────────────────────────────────────────────────
  $("tArea").textContent = fmt(area, 1) + " ft²";
  $("tPerimeter").textContent = fmt(perimeter, 1) + " ft";
  $("tPitch").textContent = fmt(pitchFt, 3) + " ft";
  $("tRows").textContent = fmt(rows);
  $("tPatternMult").textContent = "×" + patternInfo.mult.toFixed(2);
  $("tWaste").textContent = fmt(wastePct, 1) + "%";

  $("tFieldBoards").textContent = fmt(fieldBoards);
  $("tBorderBoards").textContent = fmt(borderBoards);
  $("tTotalBoards").textContent = fmt(totalBoards);
  $("tLinearFt").textContent = fmt(linearFt) + " ft";
  $("tBoardFeet").textContent = fmt(boardFeet, 2) + " BF";

  $("tJoistSpan").textContent = fmt(joistSpanFt, 2) + " ft";
  $("tJoistCount").textContent = fmt(joistCount);
  $("tJoistSize").textContent = joistOk ? joistSize : "> 2x12";
  $("tJoistBadge").innerHTML = joistOk
    ? `<span class="badge ok">ADEQUATE (single-span, ${joistSpecies.label})</span>`
    : `<span class="badge warn">EXCEEDS TABLE — add mid-span beam / consult engineer</span>`;
  $("tFooting").textContent = fmt(footingDepth) + " in";

  $("tCrossings").textContent = fmt(crossingsPerBoard);
  $("tFastenerCount").textContent = fmt(fastenerCount);
  $("tFastenerCost").textContent = money(fastenerCost);

  $("tHygro").textContent = fmt(hygro, 1) + " / 100";
  $("tLunar").textContent = fmt(lunarConf) + "%";
  $("tAcclim").textContent = acclimOk ? "within spec" : "below recommended minimum";

  $("tCostDecking").textContent = money(costDecking);
  $("tCostFasteners").textContent = money(costFasteners);
  $("tCostSubtotal").textContent = money(subtotal);
  $("tCostBand").textContent = money(bandLow) + " – " + money(bandHigh);

  $("torqueOut").textContent = fmt(torque) + " in-lbs";
  $("realitiesOut").textContent = fmt(realities);

  $("mHeadline").textContent = `${buyBoards} boards × ${stockLengthFt} ft`;
  $("mSub").textContent =
    `${totalBoards} required + ${spareBoards} spare (${profile.label}, ${species.label}). ` +
    `Recommended joist: ${joistOk ? joistSize + " @ " + joistSpacingIn + '" o.c.' : "consult an engineer"}.`;
  $("mFasteners").textContent = `${fmt(fastenerCount)} (${fastenerSystem === "hidden" ? "clips" : "screws"})`;
  $("mCost").textContent = money(subtotal) + " (materials only)";
  $("mFooting").textContent = fmt(footingDepth) + " in below grade, per post";

  const shareText =
    `deckulator ran ${lengthFt}×${widthFt} through 42 inputs and told me to buy ${buyBoards} boards ` +
    `of ${stockLengthFt}' ${profile.label}, plus ${fmt(fastenerCount)} fasteners. ` +
    `Joist advisory: ${joistOk ? "adequate" : "consult an engineer"}. deckulator.bisks.net`;
  $("shareBtn").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  lastResult = {
    buyBoards, totalBoards, spareBoards, stockLengthFt, profile, species,
    joistOk, joistSize, joistSpacingIn, subtotal, bandLow, bandHigh,
    fastenerCount, footingDepth, boardFeet,
  };
}

function summaryText() {
  if (!lastResult) return "";
  const r = lastResult;
  return [
    "DECKULATOR — MATERIALS MANIFEST",
    `Buy: ${r.buyBoards} boards × ${r.stockLengthFt} ft (${r.profile.label}, ${r.species.label})`,
    `  (${r.totalBoards} required + ${r.spareBoards} spare)`,
    `Fasteners: ${fmt(r.fastenerCount)}`,
    `Joist advisory: ${r.joistOk ? r.joistSize + " @ " + r.joistSpacingIn + '" o.c. — adequate' : "exceeds single-span table — consult an engineer"}`,
    `Footing depth: ${fmt(r.footingDepth)} in below grade`,
    `Estimated material cost: ${money(r.subtotal)} (band ${money(r.bandLow)}–${money(r.bandHigh)})`,
    `Board feet: ${fmt(r.boardFeet, 2)} BF`,
    "— deckulator.bisks.net",
  ].join("\n");
}

async function copySummary() {
  const text = summaryText();
  try {
    await navigator.clipboard.writeText(text);
    const btn = $("copyBtn");
    const orig = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = orig), 1400);
  } catch {
    window.prompt("Copy manifest:", text);
  }
}

const ASSISTANT_LINES = [
  (r) => `Configuration parses. Buy ${r.buyBoards} boards; the other 30-odd fields above are advisory context, not additional purchases.`,
  (r) => (r.joistOk
    ? `Joist span reads as adequate for ${r.joistSize} at the selected spacing under a single-span assumption. A drop beam changes this.`
    : `Current span exceeds the single-span table for every listed joist size. A mid-span beam or a licensed engineer's plan resolves this, not a bigger calculator.`),
  (r) => `Fastener count (${fmt(r.fastenerCount)}) assumes no waste on hardware, which does not happen in practice. Buy one extra box.`,
  () => `The lunar phase field does not change the board count. It changes the grain alignment confidence reading. These are not the same number.`,
  (r) => `Estimated cost band: ${money(r.bandLow)} to ${money(r.bandHigh)}. Materials only — footings, delivery, and disposal are not modeled.`,
  () => `Quantum board-packing optimizer is evaluating adjacent realities. All of them agree on the board count in the manifest below.`,
];

function runAssistant() {
  if (!lastResult) return;
  const line = ASSISTANT_LINES[Math.floor(Math.random() * ASSISTANT_LINES.length)](lastResult);
  const out = $("assistantOut");
  out.textContent = "…";
  setTimeout(() => { out.textContent = line; }, 420);
}

init();
