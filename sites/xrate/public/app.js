// xrate: live currency converter. One bulk fetch of a full rate table
// (all 165 currencies against a single base) gives every possible pair for
// free — switching "from"/"to" afterward is pure arithmetic, no refetch.
// See notes/40-new-site-playbook.md's bulk-read guidance: this is the same
// spirit as "one getRepo download instead of a paginated walk," just applied
// to a rates API instead of an atproto repo.
const RATES_BASE = "USD";
const RATES_URL = `https://api.frankfurter.dev/v2/rates?base=${RATES_BASE}`;
const CURRENCIES_URL = "https://api.frankfurter.dev/v2/currencies";
const CACHE_KEY = "xrate.cache.v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — rates update once/day anyway

const GLANCE_CODES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"];

const els = {
  amount: document.getElementById("amount"),
  fromCur: document.getElementById("fromCur"),
  toCur: document.getElementById("toCur"),
  swapBtn: document.getElementById("swapBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  resultFigure: document.getElementById("resultFigure"),
  rateLine: document.getElementById("rateLine"),
  status: document.getElementById("status"),
  glanceWrap: document.getElementById("glanceWrap"),
  glanceBase: document.getElementById("glanceBase"),
  glanceTable: document.getElementById("glanceTable"),
};

let names = {}; // code -> display name
let ratesToUsd = {}; // code -> units per 1 USD
let rateDate = null;

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, fetchedAt: Date.now() }));
  } catch {
    // localStorage unavailable (private mode, quota) — fine, just refetch next load
  }
}

async function fetchFresh() {
  const [ratesRes, namesRes] = await Promise.all([
    fetch(RATES_URL),
    fetch(CURRENCIES_URL),
  ]);
  if (!ratesRes.ok || !namesRes.ok) throw new Error("rate lookup failed");
  const ratesList = await ratesRes.json();
  const currencyList = await namesRes.json();

  const rates = {};
  let date = null;
  for (const entry of ratesList) {
    rates[entry.quote] = entry.rate;
    date = entry.date;
  }

  const nameMap = {};
  for (const c of currencyList) nameMap[c.iso_code] = c.name;

  return { rates, names: nameMap, date };
}

function populateSelects() {
  const codes = Object.keys(ratesToUsd).sort();
  const stored = JSON.parse(localStorage.getItem("xrate.pair.v1") || "null");
  const from = stored?.from && ratesToUsd[stored.from] ? stored.from : "USD";
  const to = stored?.to && ratesToUsd[stored.to] ? stored.to : "EUR";

  for (const sel of [els.fromCur, els.toCur]) {
    sel.innerHTML = "";
    for (const code of codes) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${code} — ${names[code] || code}`;
      sel.appendChild(opt);
    }
  }
  els.fromCur.value = from;
  els.toCur.value = to;
}

function savePair() {
  localStorage.setItem(
    "xrate.pair.v1",
    JSON.stringify({ from: els.fromCur.value, to: els.toCur.value })
  );
}

function pairRate(from, to) {
  // ratesToUsd[x] = units of x per 1 USD, so units of `to` per 1 `from` is:
  return ratesToUsd[to] / ratesToUsd[from];
}

function formatNumber(n) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 2 });
}

function recompute() {
  const amount = parseFloat(els.amount.value);
  const from = els.fromCur.value;
  const to = els.toCur.value;
  if (!from || !to || !ratesToUsd[from] || !ratesToUsd[to]) return;

  const rate = pairRate(from, to);
  if (!isFinite(amount)) {
    els.resultFigure.textContent = "—";
  } else {
    els.resultFigure.textContent = `${formatNumber(amount * rate)} ${to}`;
  }
  els.rateLine.textContent = `1 ${from} = ${formatNumber(rate)} ${to}${rateDate ? ` · rates as of ${rateDate}` : ""}`;
  savePair();
  renderGlance(from);
}

function renderGlance(base) {
  els.glanceBase.textContent = base;
  const codes = GLANCE_CODES.filter((c) => c !== base && ratesToUsd[c]);
  if (!codes.length) {
    els.glanceWrap.style.display = "none";
    return;
  }
  els.glanceTable.innerHTML = codes
    .map((c) => `<tr><td>${c}</td><td>${formatNumber(pairRate(base, c))}</td></tr>`)
    .join("");
  els.glanceWrap.style.display = "";
}

async function loadRates(forceFresh) {
  setStatus(forceFresh ? "refreshing rates…" : "loading rates…");
  const cached = !forceFresh && readCache();
  if (cached) {
    ratesToUsd = cached.rates;
    names = cached.names;
    rateDate = cached.date;
    populateSelects();
    recompute();
    setStatus(`rates as of ${rateDate} (cached)`);
    return;
  }

  try {
    const fresh = await fetchFresh();
    ratesToUsd = fresh.rates;
    names = fresh.names;
    rateDate = fresh.date;
    writeCache(fresh);
    populateSelects();
    recompute();
    setStatus(`rates as of ${rateDate}`);
  } catch (err) {
    const fallback = readCache(); // even a stale cache beats nothing
    if (fallback) {
      ratesToUsd = fallback.rates;
      names = fallback.names;
      rateDate = fallback.date;
      populateSelects();
      recompute();
      setStatus(`live lookup failed, showing rates from ${rateDate}`, true);
    } else {
      setStatus("couldn't load exchange rates — try refreshing", true);
    }
  }
}

els.amount.addEventListener("input", recompute);
els.fromCur.addEventListener("change", recompute);
els.toCur.addEventListener("change", recompute);
els.swapBtn.addEventListener("click", () => {
  const from = els.fromCur.value;
  els.fromCur.value = els.toCur.value;
  els.toCur.value = from;
  recompute();
});
els.refreshBtn.addEventListener("click", () => loadRates(true));

loadRates(false);
