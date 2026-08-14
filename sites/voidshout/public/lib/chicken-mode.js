// chicken-mode.js — the buildthis-bot chicken-mode easter egg, factored into
// one shared file instead of being pasted into all eleven voidshout pages
// (sibling sites like trigrams paste the whole block per-page; with this
// many pages in one site, one shared file is the less-copy version of the
// same convention). Self-contained: injects its own styles/button/coop.
(function () {
  var css = document.createElement("style");
  css.textContent =
    "#cm-toggle{position:fixed;right:.85rem;bottom:.85rem;z-index:2147483000;font-family:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;font-size:.7rem;line-height:1;background:rgba(20,20,20,.72);color:#ddd;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:.45rem .6rem;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);box-shadow:0 4px 14px rgba(0,0,0,.35)}" +
    "#cm-toggle.on{background:#f4b400;color:#1a1206;border-color:#f4b400}" +
    "#cm-coop{position:fixed;left:0;right:0;bottom:0;height:2.2rem;overflow:hidden;pointer-events:none;z-index:2147483000;display:none}" +
    "#cm-coop.on{display:block}" +
    ".cm-chicken{position:absolute;bottom:.1rem;font-size:1.5rem;transform:scaleX(-1);animation-name:cm-strut;animation-timing-function:linear;animation-iteration-count:infinite;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}" +
    "@keyframes cm-strut{0%{transform:translateX(-3rem) scaleX(-1)}48%{transform:translateX(calc(100vw + 3rem)) scaleX(-1) translateY(-.3rem)}50%{transform:translateX(calc(100vw + 3rem)) scaleX(1)}98%{transform:translateX(-3rem) scaleX(1) translateY(-.3rem)}100%{transform:translateX(-3rem) scaleX(-1)}}";
  document.head.appendChild(css);

  var toggle = document.createElement("button");
  toggle.id = "cm-toggle";
  toggle.type = "button";
  toggle.title = "it's not really corgi mode";
  toggle.textContent = "🐔";
  var coop = document.createElement("div");
  coop.id = "cm-coop";
  document.body.appendChild(toggle);
  document.body.appendChild(coop);

  var KEY = "chicken-mode";
  var spawner = null;
  function spawn() {
    var c = document.createElement("div");
    c.className = "cm-chicken";
    c.textContent = Math.random() < 0.15 ? "🐓" : "🐔";
    var duration = 14 + Math.random() * 10;
    c.style.animationDuration = duration + "s";
    c.style.animationDelay = -Math.random() * duration + "s";
    c.style.fontSize = (1.1 + Math.random() * 0.9) + "rem";
    coop.appendChild(c);
  }
  function start() {
    if (spawner) return;
    coop.innerHTML = "";
    for (var i = 0; i < 5; i++) spawn();
    spawner = setInterval(function () {
      if (coop.children.length < 8) spawn();
    }, 4000);
  }
  function stop() {
    if (spawner) clearInterval(spawner);
    spawner = null;
    coop.innerHTML = "";
  }
  function setMode(on) {
    coop.classList.toggle("on", on);
    toggle.classList.toggle("on", on);
    if (on) start();
    else stop();
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch (e) {}
  }
  toggle.addEventListener("click", function () {
    setMode(!coop.classList.contains("on"));
  });
  var startedOn = false;
  try {
    startedOn = localStorage.getItem(KEY) === "1";
  } catch (e) {}
  if (startedOn) setMode(true);
})();
