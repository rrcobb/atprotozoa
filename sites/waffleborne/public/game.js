(() => {
  const $ = id => document.getElementById(id);
  let bhp, hp, st, flasks, state, rolling, bossState, timers = [], over, kills = 0, deaths = +localStorage.getItem("waffleborne-deaths") || 0, hits;
  const BOSS_MAX = 100, HP_MAX = 60, ST_MAX = 100;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  function bars() {
    $("bhp").style.width = Math.max(bhp, 0) / BOSS_MAX * 100 + "%";
    $("hp").style.width = Math.max(hp, 0) / HP_MAX * 100 + "%";
    $("st").style.width = Math.max(st, 0) / ST_MAX * 100 + "%";
    $("flask").textContent = flasks;
  }
  function say(t) { $("msg").textContent = t; }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    bhp = BOSS_MAX; hp = HP_MAX; st = ST_MAX; flasks = 3; over = false; bossState = "idle"; rolling = false; hits = 0;
    $("died").textContent = ""; $("died").style.color = ""; $("arena").className = "arena"; say("the knight telegraphs. roll through the swing, hit during the recovery.");
    bars(); bossLoop();
  }
  // Boss cycle: idle -> tell (wind-up) -> swing (lethal moment) -> recover (vulnerable)
  const ATTACKS = [
    { name: "overhead pour", tell: 750, dmg: 22, recover: 900 },
    { name: "griddle sweep", tell: 600, dmg: 16, recover: 700 },
    { name: "butter bomb", tell: 950, dmg: 30, recover: 1200 },
  ];
  function bossLoop() {
    if (over) return;
    bossState = "idle"; $("boss").style.transform = "";
    later(() => {
      if (over) return;
      const phase2 = bhp < BOSS_MAX / 2;
      const a = ATTACKS[Math.floor(Math.random() * ATTACKS.length)];
      const tell = a.tell * (phase2 ? 0.8 : 1);
      bossState = "tell"; $("arena").className = "arena tell"; $("boss").style.transform = "translateX(20px) scale(1.15)"; say(`the knight raises… (${a.name})`);
      later(() => {
        if (over) return;
        bossState = "swing"; $("arena").className = "arena swing"; $("boss").style.transform = "translateX(-70px) scale(1.2)";
        later(() => { // the swing lands 180ms after it starts; rolling in that window avoids it
          if (over) return;
          if (rolling) { say("you rolled through it."); }
          else { hp -= a.dmg; bars(); say(`${a.name} hits you for ${a.dmg}.`); $("me").style.transform = "translateX(-12px)"; later(() => $("me").style.transform = "", 150); if (hp <= 0) return die(); }
          bossState = "recover"; $("arena").className = "arena"; $("boss").style.transform = "";
          later(bossLoop, a.recover);
        }, 180);
      }, tell);
    }, 500 + Math.random() * 600);
  }
  function die() {
    over = true; deaths++; localStorage.setItem("waffleborne-deaths", deaths);
    $("died").textContent = "YOU WAFFLED"; $("arena").className = "arena";
    say(`deaths: ${deaths}. the knight still has ${Math.round(bhp)} hp. rest at the bonfire.`);
    setShare(`YOU WAFFLED 🧇 (death #${deaths} in waffleborne, Syrup Knight at ${Math.round(bhp)}%)`);
  }
  function win() {
    over = true; $("died").textContent = "SYRUP FELLED"; $("died").style.color = "#d9a93a"; $("arena").className = "arena";
    say(`you won with ${deaths} total death${deaths === 1 ? "" : "s"} behind you. praise the sun.`);
    setShare(`SYRUP FELLED 🧇 I beat the Syrup Knight in waffleborne after ${deaths} death${deaths === 1 ? "" : "s"}.`);
  }
  function attack() {
    if (over || rolling || st < 25) return;
    st -= 25; bars();
    $("me").style.transform = "translateX(60px)"; later(() => $("me").style.transform = "", 140);
    if (bossState === "recover" || bossState === "idle") { const d = bossState === "recover" ? 14 : 6; bhp -= d; say(bossState === "recover" ? "a clean hit!" : "chip damage."); bars(); if (bhp <= 0) win(); }
    else { say("you swung into the guard. no damage."); }
    // swinging into a tell/swing is punished with a stagger
    if (bossState === "swing") { st = Math.max(0, st - 20); bars(); }
  }
  function roll() {
    if (over || rolling || st < 30) return;
    st -= 30; rolling = true; bars();
    $("me").style.opacity = ".4"; $("me").style.transform = "translateX(-20px) rotate(-90deg)";
    later(() => { rolling = false; $("me").style.opacity = ""; $("me").style.transform = ""; }, 380);
  }
  function heal() {
    if (over || flasks <= 0 || hp >= HP_MAX) return;
    flasks--; hp = Math.min(HP_MAX, hp + 30); bars(); say("syrup flask. you feel… sticky.");
  }
  setInterval(() => { if (!over && st < ST_MAX) { st = Math.min(ST_MAX, st + 6); bars(); } }, 150);
  $("atk").addEventListener("click", attack); $("roll").addEventListener("click", roll); $("heal").addEventListener("click", heal);
  $("restart").addEventListener("click", reset);
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k === "j") attack(); else if (k === "k" || e.key === " ") { e.preventDefault(); roll(); } else if (k === "l") heal();
  });
  reset();
})();
