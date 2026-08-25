(function () {
  const fieldEl = document.getElementById("field");
  const emptyEl = document.getElementById("empty");
  const statsEl = document.getElementById("stats");
  const legendEl = document.getElementById("legend");
  const searchEl = document.getElementById("search");
  const tooltipEl = document.getElementById("tooltip");

  const RING_CLASS = {
    "own-appview": "ring-own",
    "plain-field": "ring-plain",
    thirdparty: "ring-thirdparty",
    none: "",
  };

  const activeTags = new Set(); // empty = show all

  fetch("data/survey.json")
    .then((r) => r.json())
    .then((data) => render(data))
    .catch((err) => {
      fieldEl.textContent = "couldn't load survey data: " + err.message;
    });

  function render(data) {
    const sites = data.sites;

    // --- stats bar ---
    const withAtproto = sites.filter((s) => s.primary !== "none").length;
    const ownTypeahead = sites.filter((s) => s.typeahead === "own-appview").length;
    const plainField = sites.filter((s) => s.typeahead === "plain-field").length;
    const thirdparty = sites.filter((s) => s.typeahead === "thirdparty").length;
    const oauthCount = sites.filter((s) => s.tags.includes("oauth")).length;
    const jetstreamCount = sites.filter((s) => s.tags.includes("jetstream")).length;

    statsEl.innerHTML = [
      `<span><b>${sites.length}</b> sites surveyed</span>`,
      `<span><b>${withAtproto}</b> call atproto in some form</span>`,
      `<span><b>${oauthCount}</b> use OAuth login</span>`,
      `<span><b>${jetstreamCount}</b> subscribe to Jetstream</span>`,
      `<span><b>${ownTypeahead}</b> own-AppView typeahead</span>`,
      `<span><b>${plainField}</b> plain field, no typeahead</span>`,
      `<span><b>${thirdparty}</b> third-party typeahead</span>`,
    ].join("");

    // --- legend (from tagLegend, richest first) ---
    const legendTags = [...data.tagLegend].sort((a, b) => b.tier - a.tier);
    legendEl.innerHTML = "";
    for (const tag of legendTags) {
      const count = sites.filter((s) => s.primary === tag.id).length;
      if (count === 0) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tag = tag.id;
      btn.innerHTML = `<span class="swatch" style="background:var(--t-${tag.id}, var(--t-none))"></span>${tag.label} (${count})`;
      btn.addEventListener("click", () => {
        if (activeTags.has(tag.id)) {
          activeTags.delete(tag.id);
        } else {
          activeTags.add(tag.id);
        }
        refreshLegendState();
        draw();
      });
      legendEl.appendChild(btn);
    }
    const noneCount = sites.filter((s) => s.primary === "none").length;
    if (noneCount > 0) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tag = "none";
      btn.innerHTML = `<span class="swatch" style="background:var(--t-none)"></span>no atproto detected (${noneCount})`;
      btn.addEventListener("click", () => {
        if (activeTags.has("none")) activeTags.delete("none");
        else activeTags.add("none");
        refreshLegendState();
        draw();
      });
      legendEl.appendChild(btn);
    }

    function refreshLegendState() {
      legendEl.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("off", activeTags.size > 0 && !activeTags.has(b.dataset.tag));
      });
    }

    // --- dot field ---
    let dotEls = [];
    function draw() {
      fieldEl.innerHTML = "";
      const q = searchEl.value.trim().toLowerCase();
      let shown = 0;
      dotEls = [];
      for (const site of sites) {
        const matchesTag = activeTags.size === 0 || activeTags.has(site.primary);
        const matchesQuery = !q || site.name.toLowerCase().includes(q) || site.title.toLowerCase().includes(q);
        const visible = matchesTag && matchesQuery;
        if (visible) shown++;

        const wrap = document.createElement("div");
        wrap.className = "dot-wrap";
        const dot = document.createElement("a");
        dot.href = site.url;
        dot.target = "_blank";
        dot.rel = "noopener";
        dot.className = "dot" + (RING_CLASS[site.typeahead] ? " " + RING_CLASS[site.typeahead] : "");
        dot.style.background = `var(--t-${site.primary}, var(--t-none))`;
        if (!visible) dot.classList.add("dimmed");
        dot.setAttribute("aria-label", site.name);
        dot.addEventListener("mouseenter", (e) => showTooltip(e, site));
        dot.addEventListener("mousemove", positionTooltip);
        dot.addEventListener("mouseleave", hideTooltip);
        dot.addEventListener("focus", (e) => showTooltip(e, site));
        dot.addEventListener("blur", hideTooltip);
        wrap.appendChild(dot);
        fieldEl.appendChild(wrap);
      }
      emptyEl.style.display = shown === 0 ? "block" : "none";
    }

    searchEl.addEventListener("input", draw);
    draw();
  }

  function showTooltip(e, site) {
    const tagLabels = site.tags.length ? site.tags.join(", ") : "none detected";
    const taLabel = {
      "own-appview": "own-AppView typeahead",
      "plain-field": "plain field, no typeahead",
      thirdparty: "third-party typeahead",
      none: "no handle field detected",
    }[site.typeahead];
    tooltipEl.innerHTML = `
      <div class="tt-name">${site.name}</div>
      <div class="tt-tags">${tagLabels}</div>
      <div class="tt-ta">typeahead: ${taLabel}</div>
    `;
    tooltipEl.classList.add("show");
    positionTooltip(e);
  }

  function positionTooltip(e) {
    const x = e.clientX ?? (e.target.getBoundingClientRect().left + 10);
    const y = e.clientY ?? (e.target.getBoundingClientRect().top + 10);
    const pad = 14;
    let left = x + pad;
    let top = y + pad;
    if (left + 260 > window.innerWidth) left = x - 260 - pad;
    if (top + 90 > window.innerHeight) top = y - 90 - pad;
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
  }

  function hideTooltip() {
    tooltipEl.classList.remove("show");
  }
})();
