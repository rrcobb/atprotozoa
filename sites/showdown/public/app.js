// showdown — a real gen9randombattle simulated client-side with @pkmn/sim,
// teams drafted with @pkmn/randoms, sprites resolved with @pkmn/img.
// One player-controlled side (p1) vs. a simple random-choice AI (p2).
// window.PKMN = { Battle, Teams, TeamGenerators, Sprites, Icons } — see
// build/entry.mjs / public/vendor/pkmn.js.
(() => {
  const { Battle, TeamGenerators, Sprites, Icons } = window.PKMN;
  const FORMAT = "gen9randombattle";

  const $ = (id) => document.getElementById(id);
  const introEl = $("intro");
  const arenaEl = $("arena");
  const resultEl = $("result");
  const startBtn = $("start-btn");
  const againBtn = $("again-btn");
  const logEl = $("log");
  const controlsEl = $("controls");
  const waitingEl = $("waiting");
  const turnBadge = $("turn-badge");

  let battle = null;
  let lastLogIndex = 0;
  let busy = false;

  startBtn.addEventListener("click", startBattle);
  againBtn.addEventListener("click", () => {
    resultEl.style.display = "none";
    startBattle();
  });

  function startBattle() {
    introEl.style.display = "none";
    resultEl.style.display = "none";
    arenaEl.style.display = "block";
    logEl.innerHTML = "";
    lastLogIndex = 0;
    busy = false;

    const team1 = TeamGenerators.getTeamGenerator(FORMAT).getTeam();
    const team2 = TeamGenerators.getTeamGenerator(FORMAT).getTeam();

    battle = new Battle({ formatid: FORMAT });
    battle.setPlayer("p1", { name: "You", team: team1 });
    battle.setPlayer("p2", { name: "Wild AI trainer", team: team2 });

    flushLog();
    render();
  }

  // --- rendering ---

  function hpClass(hp, maxhp) {
    const pct = hp / maxhp;
    if (pct <= 0.2) return "low";
    if (pct <= 0.5) return "mid";
    return "";
  }

  function renderSide(prefix, side) {
    const mon = side.active[0];
    const wrap = $(`${prefix}-combatant`);
    const spriteEl = $(`${prefix}-sprite`);
    const nameEl = $(`${prefix}-name`);
    const lvlEl = $(`${prefix}-lvl`);
    const hpbar = $(`${prefix}-hpbar`);
    const hptext = $(`${prefix}-hptext`);

    if (!mon || mon.fainted) {
      wrap.classList.add("fainted");
    } else {
      wrap.classList.remove("fainted");
    }

    if (mon) {
      const spriteSide = prefix === "p1" ? "p1" : "p2";
      const sprite = Sprites.getPokemon(mon.species.id, { gen: "gen5ani", side: spriteSide });
      spriteEl.src = sprite.url;
      spriteEl.width = sprite.w;
      spriteEl.height = sprite.h;
      nameEl.textContent = mon.species.name;
      lvlEl.textContent = `Lv${mon.level}`;
      const pct = Math.max(0, (mon.hp / mon.maxhp) * 100);
      hpbar.style.width = pct + "%";
      hpbar.className = "hpbar-fill " + hpClass(mon.hp, mon.maxhp);
      hptext.textContent = mon.fainted
        ? "fainted"
        : `${mon.hp}/${mon.maxhp}${mon.status ? " · " + mon.status.toUpperCase() : ""}`;
    }
  }

  function render() {
    renderSide("p1", battle.sides[0]);
    renderSide("p2", battle.sides[1]);
    const aliveP1 = battle.sides[0].pokemon.filter((p) => !p.fainted).length;
    const aliveP2 = battle.sides[1].pokemon.filter((p) => !p.fainted).length;
    turnBadge.textContent = `turn ${battle.turn} · you: ${aliveP1}/6 · opponent: ${aliveP2}/6`;
  }

  function classifyLine(line) {
    if (line.startsWith("|-damage|")) return "dmg";
    if (line.startsWith("|-heal|")) return "heal";
    if (line.startsWith("|faint|")) return "faint";
    if (line.startsWith("|win|") || line.startsWith("|tie|")) return "win";
    if (line.startsWith("|move|")) return "move";
    return "";
  }

  function humanizeLine(line) {
    const parts = line.split("|");
    const tag = parts[1];
    const strip = (ident) => (ident || "").replace(/^p[12]a?: /, "");
    switch (tag) {
      case "move":
        return `${strip(parts[2])} used ${parts[3]}!`;
      case "-damage": {
        const [, , ident, hp] = parts;
        return `${strip(ident)} → ${hp === "0 fnt" ? "0 hp" : hp}`;
      }
      case "-heal":
        return `${strip(parts[2])} recovered some HP.`;
      case "faint":
        return `${strip(parts[2])} fainted!`;
      case "switch":
        return `${strip(parts[2])} was sent out!`;
      case "-status":
        return `${strip(parts[2])} was afflicted with ${parts[3]}.`;
      case "-boost":
        return `${strip(parts[2])}'s ${parts[3]} rose!`;
      case "-unboost":
        return `${strip(parts[2])}'s ${parts[3]} fell!`;
      case "-crit":
        return "A critical hit!";
      case "-supereffective":
        return "It's super effective!";
      case "-resisted":
        return "It's not very effective...";
      case "-immune":
        return `${strip(parts[2])} was immune!`;
      case "turn":
        return `— turn ${parts[2]} —`;
      case "win":
        return `${parts[2]} wins the battle!`;
      case "tie":
        return "The battle ended in a tie.";
      default:
        return null;
    }
  }

  function flushLog() {
    const lines = battle.log.slice(lastLogIndex);
    lastLogIndex = battle.log.length;
    for (const line of lines) {
      const text = humanizeLine(line);
      if (!text) continue;
      const row = document.createElement("div");
      row.className = "row " + classifyLine(line);
      row.textContent = text;
      logEl.appendChild(row);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  // --- choice handling ---

  function requestFor(sideKey) {
    return battle[sideKey].activeRequest;
  }

  function aiChoice() {
    const r = requestFor("p2");
    if (!r || r.wait) return "pass";
    if (r.forceSwitch) {
      const pokes = r.side.pokemon;
      const options = pokes
        .map((p, i) => ({ i, p }))
        .filter(({ p }) => !p.active && !p.condition.endsWith(" fnt"));
      if (!options.length) return "pass";
      const pick = options[Math.floor(Math.random() * options.length)];
      return `switch ${pick.i + 1}`;
    }
    if (r.active) {
      const moves = r.active[0].moves;
      const options = moves
        .map((m, i) => ({ i, m }))
        .filter(({ m }) => !m.disabled && m.pp !== 0);
      if (!options.length) return "move 1";
      const pick = options[Math.floor(Math.random() * options.length)];
      return `move ${pick.i + 1}`;
    }
    return "pass";
  }

  function renderControls() {
    const r = requestFor("p1");
    controlsEl.innerHTML = "";
    controlsEl.classList.remove("switch-mode");
    waitingEl.style.display = "none";

    if (!r || r.wait) {
      waitingEl.style.display = "block";
      return;
    }

    if (r.forceSwitch) {
      controlsEl.classList.add("switch-mode");
      const pokes = r.side.pokemon;
      pokes.forEach((p, i) => {
        if (p.active || p.condition.endsWith(" fnt")) return;
        const btn = document.createElement("button");
        btn.textContent = `switch in ${p.details.split(",")[0]} — ${p.condition}`;
        btn.addEventListener("click", () => submitTurn(`switch ${i + 1}`));
        controlsEl.appendChild(btn);
      });
      return;
    }

    if (r.active) {
      const moves = r.active[0].moves;
      const anyUsable = moves.some((m) => !m.disabled && m.pp !== 0);
      if (!anyUsable) {
        // no legal move (all disabled / out of PP) — the engine falls back
        // to Struggle for whatever choice index gets submitted.
        const btn = document.createElement("button");
        btn.textContent = "Struggle";
        btn.addEventListener("click", () => submitTurn("move 1"));
        controlsEl.appendChild(btn);
        return;
      }
      moves.forEach((m, i) => {
        const btn = document.createElement("button");
        const disabled = m.disabled || m.pp === 0;
        btn.disabled = disabled;
        btn.innerHTML = `${m.move}<span class="mv-type">${m.pp}/${m.maxpp} pp</span>`;
        btn.addEventListener("click", () => submitTurn(`move ${i + 1}`));
        controlsEl.appendChild(btn);
      });
      return;
    }
  }

  function submitTurn(p1decision) {
    if (busy || battle.ended) return;
    busy = true;
    waitingEl.style.display = "block";
    controlsEl.innerHTML = "";

    const p2decision = aiChoice();
    setTimeout(() => {
      try {
        battle.makeChoices(p1decision, p2decision);
      } catch (e) {
        // an edge case slipped a disabled/invalid choice through — surface it
        // and let the player try again rather than freezing the game.
        console.error(e);
        busy = false;
        renderControls();
        return;
      }
      flushLog();
      render();
      busy = false;
      if (battle.ended) {
        showResult();
      } else {
        renderControls();
      }
    }, 450);
  }

  // --- result / share ---

  function showResult() {
    arenaEl.style.display = "none";
    resultEl.style.display = "block";
    const won = battle.winner === "You";
    const title = $("result-title");
    title.textContent = won ? "you win!" : "you lost";
    title.className = won ? "win" : "lose";

    const survivors = battle.sides[0].pokemon.filter((p) => !p.fainted).length;
    $("result-sub").textContent = won
      ? `walked away with ${survivors}/6 Pokémon still standing.`
      : `the wild AI trainer's team was too much this time.`;

    const teamRow = $("result-team");
    teamRow.innerHTML = "";
    battle.sides[0].pokemon.forEach((p) => {
      const icon = Icons.getPokemon(p.species.id);
      const div = document.createElement("div");
      div.className = "icon";
      Object.assign(div.style, icon.css);
      if (p.fainted) div.style.filter = "grayscale(1) opacity(0.4)";
      teamRow.appendChild(div);
    });

    const shareText = won
      ? `Just won a Pokémon showdown battle — ${survivors}/6 team standing — real @pkmn/sim engine, real random-battle teams. Try it:`
      : `Lost a Pokémon showdown battle to a wild AI trainer. Real @pkmn/sim engine, real teams. Get your revenge:`;
    $("share-link").href =
      "https://bsky.app/intent/compose?text=" +
      encodeURIComponent(shareText + " https://showdown.bisks.net/");
  }
})();
