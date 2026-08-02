// Directory search + object-class filter. No framework, no build step —
// filters the <li> list that generate.mjs already wrote into the page.
(function () {
  const search = document.getElementById("search");
  const buttons = document.querySelectorAll(".controls button[data-filter]");
  const items = Array.from(document.querySelectorAll("#directory li"));
  const count = document.getElementById("count");

  let activeClass = "all";

  function apply() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const li of items) {
      const matchesClass = activeClass === "all" || li.dataset.class === activeClass;
      const matchesSearch = !q || li.dataset.search.includes(q);
      const visible = matchesClass && matchesSearch;
      li.style.display = visible ? "" : "none";
      if (visible) shown++;
    }
    count.textContent = `${shown} object${shown === 1 ? "" : "s"} shown`;
  }

  search.addEventListener("input", apply);
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeClass = btn.dataset.filter;
      apply();
    });
  });
})();
