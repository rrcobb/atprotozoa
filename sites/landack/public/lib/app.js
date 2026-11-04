import { parseNations, buildStatement, checklist } from "./statement.js";

const $ = (id) => document.getElementById(id);
let place = null; // { name, lat, lon, country }

// Per-country starting points. Only sources that are Indigenous-run or that
// publish nation-supplied boundaries; every country also gets the general ones.
const BY_COUNTRY = {
  US: [["National Congress of American Indians", "https://www.ncai.org/tribal-directory"], ["Tribal Leaders Directory (BIA)", "https://www.bia.gov/service/tribal-leaders-directory"]],
  CA: [["Whose Land (Native Land Digital)", "https://whose.land/"], ["Treaties and Aboriginal agreements (Crown-Indigenous Relations)", "https://www.rcaanc-cirnac.gc.ca/eng/1100100028574/1529354437231"]],
  AU: [["AIATSIS Map of Indigenous Australia", "https://aiatsis.gov.au/explore/map-indigenous-australia"]],
  NZ: [["Te Kāhui Māngai (iwi and hapū directory)", "https://www.tkm.govt.nz/"]],
};

function status(msg) { $("searchmsg").textContent = msg; }

async function search(q) {
  status("Searching…");
  $("hits").textContent = "";
  try {
    const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=" + encodeURIComponent(q));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const res = j.results || [];
    if (!res.length) return status("No match. Try the city name alone.");
    status("Pick the right one:");
    for (const x of res) {
      const label = [x.name, x.admin1, x.country].filter(Boolean).join(", ");
      const b = document.createElement("button");
      b.type = "button"; b.className = "hit"; b.textContent = label;
      b.onclick = () => choose({ name: label, lat: x.latitude, lon: x.longitude, country: x.country_code });
      $("hits").appendChild(b);
    }
  } catch (e) {
    status("Search failed (" + e.message + "). Check your connection and try again.");
  }
}

function choose(p) {
  place = p;
  $("hits").textContent = "";
  status("");
  const ll = p.lat.toFixed(4) + ", " + p.lon.toFixed(4);
  $("placeline").textContent = p.name + " (" + ll + ")";
  const list = $("sources");
  list.textContent = "";
  const add = (t, u) => {
    const li = document.createElement("li"), a = document.createElement("a");
    a.href = u; a.target = "_blank"; a.rel = "noopener"; a.textContent = t;
    li.appendChild(a); list.appendChild(li);
  };
  add("Native Land Digital map: search \"" + p.name.split(",")[0] + "\" or paste " + ll, "https://native-land.ca/");
  for (const [t, u] of BY_COUNTRY[p.country] || []) add(t, u);
  add("The local government's, university's or library's own acknowledgement (they often did this work with the nation)", "https://www.google.com/search?q=" + encodeURIComponent(p.name.split(",")[0] + " land acknowledgement nation"));
  $("verify").hidden = false;
  $("compose").hidden = false;
  $("place").value = p.name.split(",")[0];
  render();
}

function opts() {
  return {
    place: $("place").value,
    nations: parseNations($("nations").value),
    status: $("status").value,
    treaty: $("treaty").value,
    timeImmemorial: $("tim").checked,
    enslaved: $("slave").checked,
    action: $("action").value,
    format: $("format").value,
  };
}

function render() {
  const o = opts();
  $("treatywrap").hidden = !(o.status === "treaty" || o.status === "ceded");
  const text = buildStatement(o);
  $("out").textContent = text || "Add at least one nation to see it.";
  const w = $("warns");
  w.textContent = "";
  if (text) for (const m of checklist(o)) { const li = document.createElement("li"); li.textContent = m; w.appendChild(li); }
  const post = (text || "").slice(0, 250);
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent((post ? post + "\n\n" : "") + "https://landack.bisks.net/");
}

$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (q) search(q);
});
$("geo").addEventListener("click", () => {
  if (!navigator.geolocation) return status("Your browser can't share location. Use the search box.");
  status("Asking for your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => { status(""); choose({ name: "My location", lat: pos.coords.latitude, lon: pos.coords.longitude, country: "" }); $("place").value = ""; $("place").placeholder = "Name this place"; render(); },
    () => status("Location was blocked. Use the search box instead.")
  );
});
for (const id of ["place", "nations", "status", "treaty", "tim", "slave", "action", "format"]) {
  $(id).addEventListener("input", render);
  $(id).addEventListener("change", render);
}
$("copy").addEventListener("click", async () => {
  const t = $("out").textContent;
  try { await navigator.clipboard.writeText(t); $("copymsg").textContent = "Copied."; }
  catch { $("copymsg").textContent = "Select the text and copy it by hand."; }
});
