// Webring bar: prev / hub / random / next. Copied per site; the ring list is
// the same in every copy (and in pop-webring/src/index.ts).
(function () {
  var RING = ["chipotlike", "corral-royale", "subwaidvania", "applebeesthetic", "drive-thru-sim", "waffleborne", "popeyelite", "shackgaze", "cheesecake-factorio"];
  var self = document.currentScript && document.currentScript.getAttribute("data-site");
  var i = RING.indexOf(self);
  if (i < 0) return;
  var u = function (n) { return "https://" + n + ".bisks.net/"; };
  var prev = RING[(i + RING.length - 1) % RING.length];
  var next = RING[(i + 1) % RING.length];
  var pool = RING.filter(function (n) { return n !== self; });
  var css = document.createElement("style");
  css.textContent =
    ".popring{display:flex;flex-wrap:wrap;gap:.4rem .9rem;justify-content:center;align-items:center;" +
    "margin:2rem 0 0;padding:.7rem 1rem;border-top:2px dashed currentColor;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;opacity:.85}" +
    ".popring a{color:inherit;text-decoration:underline}.popring b{font-weight:700}";
  document.head.appendChild(css);
  var bar = document.createElement("nav");
  bar.className = "popring";
  bar.setAttribute("aria-label", "pop restaurant webring");
  var link = function (href, text) {
    var a = document.createElement("a"); a.href = href; a.textContent = text; return a;
  };
  var hub = document.createElement("b"); hub.textContent = "pop restaurant webring";
  var rnd = link("#", "random");
  rnd.addEventListener("click", function (e) {
    e.preventDefault();
    location.href = u(pool[Math.floor(Math.random() * pool.length)]);
  });
  [link(u(prev), "\u2190 " + prev), hub, link("https://pop-webring.bisks.net/", "all " + RING.length), rnd, link(u(next), next + " \u2192")]
    .forEach(function (el) { bar.appendChild(el); });
  document.body.appendChild(bar);
})();
