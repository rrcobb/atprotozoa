(() => {
  const $ = id => document.getElementById(id);
  const ITEMS = { burger: ["🍔", "burger"], fries: ["🍟", "fries"], shake: ["🥤", "shake"], nuggets: ["🍗", "nuggets"], salad: ["🥗", "salad"], pie: ["🥧", "pie"] };
  const NAMES = Object.keys(ITEMS);
  const FILLER = ["uhh, hi, can I get", "yeah gimme", "hold on kids— I'll have", "good morning! just", "*crackle* …I want", "is the ice cream machine working? no? ok. so"];
  const NUM = ["zero", "one", "two", "three"];
  let want, bag, served, tips, strikes, patience, maxPat, running, timer, cars;
  let best = +localStorage.getItem("drivethrusim-best") || 0;

  function ui() {
    $("served").textContent = served; $("tips").textContent = tips; $("strikes").textContent = strikes;
    $("bag").textContent = NAMES.filter(n => bag[n]).map(n => `${bag[n]}× ${ITEMS[n][0]}`).join("  ") || "(empty)";
    $("lane").textContent = "🚗".repeat(Math.max(cars, 0)) + (running ? "" : "");
  }
  function newOrder() {
    want = {};
    const n = 1 + Math.floor(Math.random() * Math.min(2 + served / 4, 4));
    for (let i = 0; i < n; i++) { const k = NAMES[Math.floor(Math.random() * NAMES.length)]; want[k] = Math.min((want[k] || 0) + 1 + (Math.random() < 0.3 ? 1 : 0), 3); }
    const parts = NAMES.filter(k => want[k]).map(k => `${NUM[want[k]]} ${ITEMS[k][1]}${want[k] > 1 && k !== "fries" && k !== "nuggets" ? "s" : ""}`);
    const text = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.at(-1) : parts[0];
    $("bubble").textContent = `🚗 "${FILLER[Math.floor(Math.random() * FILLER.length)]} ${text}."`;
    bag = {}; maxPat = Math.max(7, 16 - served * 0.35 + parts.length * 2); patience = maxPat; cars = 2 + Math.min(3, Math.floor(served / 5));
    ui();
  }
  function strike(why) {
    strikes++; $("msg").textContent = why;
    if (strikes >= 3) return finish();
    newOrder();
  }
  function finish() {
    running = false; clearInterval(timer);
    if (tips > best) { best = tips; localStorage.setItem("drivethrusim-best", best); }
    $("bubble").textContent = `shift over. ${served} orders, $${tips} in tips (best $${best}). 3 strikes: you're getting a talking-to.`;
    $("start").textContent = "new shift";
    setShare(`I served ${served} cars and made $${tips} in tips in drive thru sim 🚗`);
  }
  function tick() {
    patience -= 0.1;
    const f = Math.max(patience / maxPat, 0);
    $("pat").style.width = f * 100 + "%"; $("pat").style.background = f > .5 ? "#2a9d3a" : f > .25 ? "#e0a800" : "#c0322b";
    if (patience <= 0) strike("the car honked and left. 😤");
  }
  function start() {
    served = 0; tips = 0; strikes = 0; running = true; $("msg").textContent = "";
    $("start").textContent = "restart shift";
    clearInterval(timer); timer = setInterval(tick, 100); newOrder();
  }
  $("menu").innerHTML = NAMES.map(n => `<button type="button" data-i="${n}">${ITEMS[n][0]}<small>${ITEMS[n][1]}</small></button>`).join("");
  $("menu").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]");
    if (!b || !running) return;
    bag[b.dataset.i] = (bag[b.dataset.i] || 0) + 1; ui();
  });
  $("clear").addEventListener("click", () => { if (running) { bag = {}; ui(); } });
  $("serve").addEventListener("click", () => {
    if (!running) return;
    const ok = NAMES.every(n => (bag[n] || 0) === (want[n] || 0));
    if (!ok) return strike("wrong bag. the customer is already checking it. strike!");
    const tip = Math.max(1, Math.ceil(patience / maxPat * 5));
    served++; tips += tip; $("msg").textContent = `thank you, drive thru! +$${tip}`;
    newOrder();
  });
  $("start").addEventListener("click", start);
  served = 0; tips = 0; strikes = 0; bag = {}; cars = 0; ui();
})();
