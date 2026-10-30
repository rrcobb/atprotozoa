// Show this site's recent traffic in the footer, from stats.bisks.net.
// Copy this file into public/lib/ and add one line before </body>:
//   <script src="lib/visits.js" data-site="<name>" data-into="footer"></script>
// data-site  the site name (sites/<name>, the subdomain) — required
// data-into  CSS selector for the element to append to (default "footer")
// Fails silently: if stats are down or the site has no data, nothing appears.
(() => {
  const tag = document.currentScript;
  const name = tag.dataset.site;
  if (!name) return;
  const into = document.querySelector(tag.dataset.into || "footer");
  if (!into) return;

  const bars = (arr) => {
    const max = Math.max(1, ...arr);
    return arr
      .map((v) => `<i style="flex:1;background:currentColor;opacity:.45;min-height:1px;height:${Math.max(8, (v / max) * 100)}%"></i>`)
      .join("");
  };

  fetch(`https://stats.bisks.net/stats/${name}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.total7) return;
      const week = d.requests.slice(-7);
      const el = document.createElement("span");
      el.className = "visits";
      el.style.cssText = "display:inline-flex;align-items:center;gap:.4rem;vertical-align:middle";
      el.title = `${d.total.toLocaleString("en-US")} requests in the last 30 days`;
      el.innerHTML =
        `<span>${d.total7.toLocaleString("en-US")} visits this week</span>` +
        `<span style="display:inline-flex;align-items:flex-end;gap:1px;height:.75rem;width:2.5rem">${bars(week)}</span>`;
      into.append(document.createTextNode(" · "), el);
    })
    .catch(() => {});
})();
