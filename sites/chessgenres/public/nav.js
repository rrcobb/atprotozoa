// Genre switcher. Each genre is a <section id="..."> toggled by the nav buttons.
const GENRES = [
  { id: "td", name: "tower defense", sub: "pieces don't capture here — they <i>guard</i>. each attacks every square it could move to." },
  { id: "city", name: "city builder", title: "Chess City 2000", sub: "pieces are buildings. each one affects every square it could move to. grow the city to 2000 people." },
  { id: null, name: "autobattler" }, { id: null, name: "roguelike" }, { id: null, name: "deckbuilder" },
];
const $ = (id) => document.getElementById(id);
function show(id) {
  const g = GENRES.find((x) => x.id === id);
  for (const x of GENRES) if (x.id) $(x.id).hidden = x.id !== id;
  $("genreName").textContent = g.name;
  $("genreSub").innerHTML = g.sub;
  document.title = g.title ? g.title + " — chess, but in different genres" : "chess, but in different genres";
  for (const b of $("genres").children) b.classList.toggle("on", b.dataset.id === id);
  history.replaceState(null, "", id === "td" ? location.pathname : "#" + id);
}
$("genres").innerHTML = GENRES.map((g) => g.id
  ? `<button data-id="${g.id}">${g.name}</button>`
  : `<button disabled>${g.name} (soon)</button>`).join("");
$("genres").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) show(b.dataset.id); });
const start = location.hash.slice(1);
show(GENRES.some((g) => g.id === start) ? start : "td");
