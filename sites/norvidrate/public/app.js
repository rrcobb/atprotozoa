// norvidrate: xrate's currency converter (one bulk Frankfurter rate-table
// fetch, all pairs free after that — see notes/40-new-site-playbook.md's
// bulk-read guidance) plus one synthetic currency, NORVID, whose USD value
// comes from lib/norvid.js instead of an FX feed: what xbill would bill to
// download @norvid-studies.bsky.social's own repo at X's read-API rate card.
// shimmermathlabs.com's ask: "do you really think we want a normal currency
// converter? ... recompute conversion factor daily."
//
// The norvid rate is priced in the background so it never blocks the page:
// a cached-or-fallback value is merged into the rate table immediately (the
// converter is usable the instant Frankfurter's rates land), then refined in
// place once the real repo walk finishes, without rebuilding the dropdowns.
import { peekNorvidCache, isFreshToday, getNorvidRate, forceRefreshNorvidRate, FALLBACK_USD, NORVID_HANDLE } from "./lib/norvid.js";

const RATES_BASE = "USD";
const RATES_URL = `https://api.frankfurter.dev/v2/rates?base=${RATES_BASE}`;
const CURRENCIES_URL = "https://api.frankfurter.dev/v2/currencies";
const CACHE_KEY = "norvidrate.cache.v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — rates update once/day anyway
const PAIR_KEY = "norvidrate.pair.v1";

const NORVID = "NORVID";
const GLANCE_CODES = ["USD", "EUR", "GBP", "JPY", NORVID];

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
  norvidStatus: document.getElementById("norvidStatus"),
};

let names = {}; // code -> display name
let ratesToUsd = {}; // code -> units per 1 USD
let rateDate = null;
let norvidInfo = null;

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function setNorvidStatus(msg, isErr) {
  els.norvidStatus.textContent = msg || "";
  els.norvidStatus.classList.toggle("err", !!isErr);
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

// Merges the norvid rate (whatever's known right now — cache, fallback, or a
// freshly-computed value) into the shared rate table. `info.usdPerNorvid` is
// dollars per 1 norvid; ratesToUsd wants units-per-1-USD, so it's inverted.
function applyNorvidInfo(info) {
  norvidInfo = info;
  ratesToUsd[NORVID] = 1 / info.usdPerNorvid;
  names[NORVID] = `Norvid (@${NORVID_HANDLE})`;
  setNorvidStatus(describeNorvid(info), info.fallback);
}

function describeNorvid(info) {
  if (!info) return "";
  const money = "$" + info.usdPerNorvid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (info.fallback) return `1 NORVID ≈ ${money} (fallback figure — live xbill lookup failed)`;
  const posts = info.postsFetched != null ? `${info.postsFetched.toLocaleString()} posts` : null;
  const via = posts ? `${posts} in @${NORVID_HANDLE}'s repo, priced at xbill's rate card` : "priced at xbill's rate card";
  return info.stale
    ? `1 NORVID ≈ ${money} (from ${info.date}, recomputing…)`
    : `1 NORVID = ${money} — ${via}, as of ${info.date}`;
}

function populateSelects() {
  const codes = Object.keys(ratesToUsd).sort();
  const stored = JSON.parse(localStorage.getItem(PAIR_KEY) || "null");
  const from = stored?.from && ratesToUsd[stored.from] ? stored.from : "USD";
  const to = stored?.to && ratesToUsd[stored.to] ? stored.to : (ratesToUsd[NORVID] ? NORVID : "EUR");

  for (const sel of [els.fromCur, els.toCur]) {
    const prev = sel.value;
    sel.innerHTML = "";
    for (const code of codes) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${code} — ${names[code] || code}`;
      sel.appendChild(opt);
    }
    if (prev && ratesToUsd[prev]) sel.value = prev; // preserve a user's pick across a background norvid refresh
  }
  if (!els.fromCur.value) els.fromCur.value = from;
  if (!els.toCur.value) els.toCur.value = to;
}

function savePair() {
  localStorage.setItem(PAIR_KEY, JSON.stringify({ from: els.fromCur.value, to: els.toCur.value }));
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
  const asOf = to === NORVID || from === NORVID ? "" : rateDate ? ` · rates as of ${rateDate}` : "";
  els.rateLine.textContent = `1 ${from} = ${formatNumber(rate)} ${to}${asOf}`;
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

// Shows a cached-or-fallback norvid rate immediately (no network wait), then
// — only when today's entry isn't already cached — runs the real xbill-style
// repo walk in the background and swaps in the live number once it lands.
async function loadNorvid() {
  const cached = peekNorvidCache();
  const provisional = cached || {
    usdPerNorvid: FALLBACK_USD,
    postsFetched: null,
    date: null,
    fallback: true,
    stale: false,
  };
  applyNorvidInfo(provisional);
  populateSelects();
  recompute();

  if (isFreshToday(cached)) return; // already today's number, nothing to refresh

  const fresh = await getNorvidRate((status) => setNorvidStatus(`norvid: ${status}`));
  applyNorvidInfo(fresh);
  recompute(); // ratesToUsd.NORVID changed but the option list didn't — no need to repopulate
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
els.refreshBtn.addEventListener("click", async () => {
  await loadRates(true);
  setNorvidStatus("recomputing norvid rate…");
  const fresh = await forceRefreshNorvidRate((status) => setNorvidStatus(`norvid: ${status}`));
  applyNorvidInfo(fresh);
  recompute();
});

loadRates(false);
loadNorvid();
