// ED Z*TRON QUEST — a tiny Infocom/zcode-style parser adventure.
// One file: room data + parser + renderer. No build step, no framework.

// Served at edzitronquest.bisks.net/ and, for older links, at
// bisks.net/games/edzitronquest/. Derive both from the current location so the
// share text links back to whichever host the player is actually on.
const MOUNT = location.pathname.startsWith("/games/edzitronquest")
  ? "/games/edzitronquest"
  : "";
const SITE_URL = location.origin + MOUNT;

const state = {
  room: "studio",
  inventory: [],
  flags: {},
  score: 0,
  moves: 0,
  won: false,
};

const MAX_SCORE = 90;

// --- world data ---------------------------------------------------------

const ITEMS = {
  usb: {
    name: "USB drive",
    words: ["usb", "drive", "usb drive", "footage"],
    examine:
      'A USB drive labeled in Sharpie: "DEMO DAY FOOTAGE (DO NOT SHOW INVESTORS)." ' +
      "You already know what's on it.",
    take: "receipt1",
  },
  memo: {
    name: "RTO memo",
    words: ["memo", "rto memo", "letter"],
    examine:
      'A memo stapled to a dead laptop: "Effective immediately, all remote ' +
      'staff must return to an office we sublet six months ago." Someone ' +
      "has drawn a small, furious face in the margin.",
    take: "receipt2",
  },
  invoice: {
    name: "GPU invoice",
    words: ["invoice", "gpu invoice", "bill"],
    examine:
      "An invoice for a rack of GPUs. The number is circled in red marker " +
      "so many times the paper has nearly torn through.",
    take: "receipt3",
  },
  laptop: {
    name: "battered laptop",
    words: ["laptop", "computer"],
    examine:
      'A half-open laptop, browser full of tabs. One is titled "DRAFT: ' +
      'the number was never real." Reading it feels important.',
    read: "manifesto",
  },
};

const ROOMS = {
  studio: {
    name: "THE WHERE'S YOUR ED AT STUDIO",
    desc: () =>
      "A cluttered podcast studio lit by one buzzing monitor. Sticky " +
      'notes reading "ENSHITTIFICATION," "THE ROT ECONOMY," and ' +
      '"SUBSCRIBE" cover every wall. A dented mic boom hangs over a chair ' +
      "that isn't yours. On the desk: a battered laptop.\n\n" +
      "A voice — hoarse, righteous, unmistakably ED Z*TRON — crackles out " +
      "of a cheap speaker: \"You. Yes, you. Somebody has to go get the " +
      'receipts. Three of them, out there in the Rot Economy. Bring them ' +
      'back and we end this number for good."',
    exits: { out: "sidewalk", east: "sidewalk" },
    items: ["laptop"],
    talk: {
      ed: () =>
        state.inventory.length >= 3
          ? "Ed Z*tron: \"You've got the receipts. The boardroom's east, " +
            'through the sidewalk and the layoffs pit. Go make the number ' +
            'stop."'
          : "Ed Z*tron: \"The expo, the office, the server farm — a " +
            'receipt in each. GO."',
    },
  },
  sidewalk: {
    name: "SILICON VALLEY SIDEWALK",
    desc: () =>
      "A sun-bleached sidewalk outside a glass tower with no name on it " +
      "yet. A food-delivery robot is wedged against the curb, wheels " +
      "spinning against nothing. A newspaper box, empty for a decade, " +
      "still wants a quarter for the privilege.",
    exits: {
      in: "studio",
      west: "studio",
      north: "expo",
      east: "office",
      south: "serverfarm",
    },
  },
  expo: {
    name: "THE HYPE EXPO FLOOR",
    desc: () =>
      'Banners scream "AI-POWERED EVERYTHING" over rows of empty booths. ' +
      "A guy in a quarter-zip — call him HYPE BRO — is demoing a pin " +
      "that \"listens to your thoughts\" to a crowd of exactly no one.",
    exits: { south: "sidewalk", out: "sidewalk" },
    items: () => (state.flags.tookUsb ? [] : ["usb"]),
    extraLook: () =>
      state.flags.tookUsb
        ? ""
        : "Under the demo table, half-hidden, something plastic catches " +
          "the light.",
    talk: {
      "hype bro": () =>
        'Hype Bro: "It\'s not a pin, it\'s a PARADIGM. It listens, it ' +
        'learns, it monetizes your inner monologue. We\'re pre-revenue ' +
        'but post-scarcity in spirit."',
      bro: () =>
        'Hype Bro: "It\'s not a pin, it\'s a PARADIGM. It listens, it ' +
        'learns, it monetizes your inner monologue. We\'re pre-revenue ' +
        'but post-scarcity in spirit."',
    },
    ask: {
      pin: () =>
        'You ask Hype Bro what the pin actually does. He blinks. "It\'s ' +
        'in beta." You ask since when. "Since the Series A." The USB ' +
        "drive under the table suddenly looks a lot more interesting.",
    },
  },
  office: {
    name: "THE OPEN-PLAN LAYOFFS PIT",
    desc: () =>
      "Row after row of desks, chairs still warm, nobody left to sit in " +
      'them. A poster reads "WE\'RE A FAMILY" above a shredder overflowing ' +
      "with severance letters. A monitor is still logged into Slack: " +
      "4,000 unread messages in #general." +
      (state.flags.gotAllReceipts && !state.flags.doorOpen
        ? "\n\nA frosted-glass door marked BOARDROOM sits north, unlocked " +
          "now that you're carrying the receipts."
        : !state.flags.gotAllReceipts
          ? "\n\nA frosted-glass door marked BOARDROOM sits north. A card " +
            "reader beside it blinks red — locked, and something tells " +
            "you it isn't opening for anything but proof."
          : ""),
    exits: () => ({
      west: "sidewalk",
      in: "sidewalk",
      ...(state.flags.gotAllReceipts ? { north: "boardroom" } : {}),
    }),
    items: () => (state.flags.tookMemo ? [] : ["memo"]),
    onBlockedExit: {
      north: "The door is locked. The card reader wants receipts, not a badge.",
    },
  },
  serverfarm: {
    name: "THE SERVER FARM COOLING AISLE",
    desc: () =>
      "A deafening wall of fans cools racks of GPUs worth more, this " +
      "week, than the company that owns them. A hand-lettered sign reads " +
      '"DO NOT UNPLUG — WAITING ON MORE CHIPS." Something rattles, ' +
      "faintly, in a floor grate." +
      (state.flags.foundVent
        ? " A loosened floor vent gapes open, big enough to climb into."
        : ""),
    exits: () => ({
      north: "sidewalk",
      out: "sidewalk",
      ...(state.flags.foundVent ? { down: "podcastbooth" } : {}),
    }),
    items: () => (state.flags.tookInvoice ? [] : ["invoice"]),
  },
  podcastbooth: {
    name: "A CRAMPED FOAM-LINED CLOSET",
    desc: () => {
      if (!state.flags.foundBooth) {
        state.flags.foundBooth = true;
        addScore(5, "found the mothership");
      }
      return (
        "Two mics, a mixing board held together with gaffer tape, and a " +
        'framed photo of a man mid-rant, tie loosened, captioned "MORE ' +
        'OFFLINE." Somewhere, a subscriber count ticks up by exactly one. ' +
        "There's nothing to take. You climb back up."
      );
    },
    exits: { up: "serverfarm", out: "serverfarm" },
  },
  boardroom: {
    name: "THE BOARDROOM",
    desc: () =>
      state.won
        ? "The table, shaped like a chart trending up and to the right, " +
          "sits quiet now. Somewhere outside, a newsletter is being " +
          "written about this exact moment."
        : "The door hangs open behind you. In the center of a table " +
          'shaped like a stock chart, a golden ticker-tape entity — ' +
          'THE NUMBER — spins in place, chanting "GROWTH. GROWTH. ' +
          'GROWTH." at nobody in particular.',
    exits: { south: "office", out: "office" },
  },
};

// --- helpers -------------------------------------------------------------

function room() {
  return ROOMS[state.room];
}

function roomExits() {
  const e = room().exits;
  return typeof e === "function" ? e() : e || {};
}

function roomItems() {
  const i = room().items;
  if (!i) return [];
  return typeof i === "function" ? i() : i;
}

function addScore(n, why) {
  state.score += n;
  print(`[Your score just went up by ${n} point${n === 1 ? "" : "s"}${why ? " — " + why : ""}.]`);
}

function findItemByWords(word, pool) {
  for (const id of pool) {
    const it = ITEMS[id];
    if (it.words.includes(word)) return id;
  }
  return null;
}

const DIR_ALIASES = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  u: "up",
  d: "down",
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  up: "up",
  down: "down",
  in: "in",
  out: "out",
  enter: "in",
  exit: "out",
};

function describeRoom(withHeader) {
  const r = room();
  const lines = [];
  if (withHeader) lines.push(r.name);
  lines.push(typeof r.desc === "function" ? r.desc() : r.desc);
  if (r.extraLook) {
    const t = r.extraLook();
    if (t) lines.push(t);
  }
  const items = roomItems().filter((id) => !state.flags["gone_" + id]);
  if (items.length) {
    lines.push(
      "You can see " +
        items.map((id) => ITEMS[id].name).join(" and ") +
        " here."
    );
  }
  return lines.join("\n\n");
}

function go(dir) {
  const exits = roomExits();
  if (exits[dir]) {
    state.room = exits[dir];
    print(describeRoom(true));
    checkBoardroom();
    return;
  }
  const blocked = room().onBlockedExit && room().onBlockedExit[dir];
  if (blocked) {
    print(blocked);
    return;
  }
  print("You can't go that way.");
}

function checkBoardroom() {
  if (state.room === "boardroom" && !state.won) {
    // nothing extra on entry; win is triggered by "show receipts"
  }
}

function inInventory(id) {
  return state.inventory.includes(id);
}

function take(word) {
  const pool = roomItems().filter((id) => !state.flags["gone_" + id]);
  const id = findItemByWords(word, pool);
  if (!id) {
    if (findItemByWords(word, Object.keys(ITEMS))) {
      print("It's not here.");
    } else {
      print("You don't see that here.");
    }
    return;
  }
  const it = ITEMS[id];
  state.inventory.push(id);
  state.flags["gone_" + id] = true;
  print(`You take the ${it.name}.`);
  if (it.take === "receipt1" && !state.flags.tookUsb) {
    state.flags.tookUsb = true;
    addScore(10, "receipt #1: the demo day footage");
    maybeAllReceipts();
  }
  if (it.take === "receipt2" && !state.flags.tookMemo) {
    state.flags.tookMemo = true;
    addScore(10, "receipt #2: the RTO memo");
    maybeAllReceipts();
  }
  if (it.take === "receipt3" && !state.flags.tookInvoice) {
    state.flags.tookInvoice = true;
    addScore(10, "receipt #3: the GPU invoice");
    maybeAllReceipts();
  }
}

function maybeAllReceipts() {
  if (
    state.flags.tookUsb &&
    state.flags.tookMemo &&
    state.flags.tookInvoice &&
    !state.flags.gotAllReceipts
  ) {
    state.flags.gotAllReceipts = true;
    print(
      "\nYou've got all three receipts. Somewhere east, a door just " +
        "stopped being locked."
    );
  }
}

function examine(word) {
  const pool = [...roomItems(), ...state.inventory].filter(
    (id) => !state.flags["gone_" + id] || state.inventory.includes(id)
  );
  const id = findItemByWords(word, [...new Set(pool)]);
  if (id) {
    print(ITEMS[id].examine);
    return;
  }
  if (["me", "myself", "self"].includes(word)) {
    print(
      "A cub reporter with a notebook, a bad haircut, and a righteous " +
        "sense that something, somewhere, is a scam."
    );
    return;
  }
  if (["room", "here"].includes(word)) {
    print(describeRoom(false));
    return;
  }
  if (state.room === "serverfarm" && ["grate", "floor", "vent"].includes(word)) {
    searchServerfarm();
    return;
  }
  if (state.room === "expo" && ["table", "floor", "booth"].includes(word)) {
    print("The demo table wobbles. Something's tucked underneath it.");
    return;
  }
  print("You don't see anything special about that.");
}

function searchServerfarm() {
  if (state.flags.tookInvoice || state.flags.foundVent) {
    if (!state.flags.foundVent) {
      state.flags.foundVent = true;
      print(
        "You pry the grate up. It's a loose floor vent, easily big " +
          "enough to climb down into."
      );
    } else {
      print("Just the loose vent. You've already been down there.");
    }
    return;
  }
  print(
    "You pry up the rattling floor grate. Underneath: a GPU invoice, " +
      "and — once you look closer — the vent itself is loose too, big " +
      "enough to climb into."
  );
  state.flags.foundVent = true;
}

function readItem(word) {
  const pool = [...state.inventory, ...roomItems()];
  const id = findItemByWords(word, [...new Set(pool)]);
  if (id && ITEMS[id].read === "manifesto") {
    if (!state.flags.readManifesto) {
      state.flags.readManifesto = true;
      addScore(5, "read the manifesto");
    }
    print(
      'The draft reads: "The number was never real. It was never about ' +
        "the product, or the users, or the future — just the number, " +
        "and whether it could be made to go up one more quarter. " +
        'Somebody has to say so in public." You feel your assignment ' +
        "sharpen."
    );
    return;
  }
  if (id) {
    examine(word);
    return;
  }
  print("There's nothing to read there.");
}

function talkTo(word) {
  const r = room();
  if (r.talk && r.talk[word]) {
    print(r.talk[word]());
    return;
  }
  print("There's no one here by that name to talk to.");
}

function askAbout(word) {
  const r = room();
  if (r.ask && r.ask[word]) {
    print(r.ask[word]());
    return;
  }
  print("No one here has an answer for that.");
}

function showReceipts() {
  if (state.room !== "boardroom") {
    print("There's no one here to show receipts to.");
    return;
  }
  if (state.won) {
    print("The Number is already gone. You did that.");
    return;
  }
  if (
    inInventory("usb") &&
    inInventory("memo") &&
    inInventory("invoice")
  ) {
    win();
    return;
  }
  print(
    "You hold up what you've got. The Number just spins faster. You " +
      "need all three receipts before it'll listen to anything."
  );
}

function attackNumber() {
  if (state.room !== "boardroom") {
    print("You don't see a number to attack.");
    return;
  }
  if (state.won) {
    print("There's nothing left to attack.");
    return;
  }
  print(
    'Yelling at it does nothing — it has heard every kind of yelling ' +
      'there is. "SHOW RECEIPTS" is the move.'
  );
}

function win() {
  state.won = true;
  addScore(50, "you took down the Number");
  print(
    "\nYou lay the three receipts on the table, one at a time. The " +
      "footage. The memo. The invoice. THE NUMBER slows, stutters, and " +
      'pops like a soap bubble made of quarterly earnings. For one clean ' +
      "second, the boardroom is just an empty room.\n\n" +
      'A voice on the speaker, hoarse with something like pride: "THAT\'S ' +
      'the newsletter. Go home. You earned it."\n\n' +
      "*** YOU HAVE WON ***\n\n" +
      `In this game you have scored ${state.score} out of a possible ` +
      `${MAX_SCORE} points, in ${state.moves} moves.`
  );
  revealShare();
}

function revealShare() {
  const shareEl = document.getElementById("share");
  const linkEl = document.getElementById("shareBluesky");
  if (!shareEl || !linkEl) return;
  const shareText =
    `I took down THE NUMBER in ED Z*TRON QUEST — scored ${state.score}/${MAX_SCORE} ` +
    `points, ${state.moves} moves, receipts fully deployed. ${SITE_URL}`;
  linkEl.href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  shareEl.hidden = false;
}

function fullScore() {
  print(
    `Score: ${state.score} of ${MAX_SCORE} possible, in ${state.moves} moves.` +
      (state.won ? "\n\nYou have already won." : "")
  );
}

// --- parser ---------------------------------------------------------------

function handleCommand(raw) {
  const input = raw.trim().toLowerCase();
  if (!input) return;
  print("&gt; " + escapeHtml(raw), true);
  state.moves++;

  if (DIR_ALIASES[input]) {
    go(DIR_ALIASES[input]);
    updateStatus();
    return;
  }

  const parts = input.split(/\s+/);
  const verb = parts[0];
  const rest = parts.slice(1).join(" ");

  switch (verb) {
    case "go":
    case "move":
      if (DIR_ALIASES[rest]) go(DIR_ALIASES[rest]);
      else print("Go where?");
      break;
    case "look":
    case "l":
      print(describeRoom(rest ? false : false));
      break;
    case "examine":
    case "x":
    case "inspect":
      examine(cleanArticle(rest));
      break;
    case "take":
    case "get":
    case "grab":
    case "pick":
      take(cleanArticle(rest.replace(/^up\s+/, "")));
      break;
    case "drop":
    case "put": {
      const id = findItemByWords(cleanArticle(rest), state.inventory);
      if (id) {
        state.inventory = state.inventory.filter((x) => x !== id);
        print(`You drop the ${ITEMS[id].name}.`);
      } else {
        print("You're not carrying that.");
      }
      break;
    }
    case "inventory":
    case "i":
      print(
        state.inventory.length
          ? "You are carrying:\n" +
              state.inventory.map((id) => "  " + ITEMS[id].name).join("\n")
          : "You aren't carrying anything."
      );
      break;
    case "read":
      readItem(cleanArticle(rest));
      break;
    case "talk":
      talkTo(cleanArticle(rest.replace(/^to\s+/, "")));
      break;
    case "ask":
      askAbout(cleanArticle(rest.replace(/^(.*?)\s+about\s+/, "")));
      break;
    case "search":
    case "open":
      if (
        state.room === "serverfarm" &&
        ["grate", "vent", "floor"].includes(cleanArticle(rest))
      )
        searchServerfarm();
      else if (
        state.room === "office" &&
        ["door", "boardroom"].includes(cleanArticle(rest))
      )
        go("north");
      else if (state.room === "expo" && ["table"].includes(cleanArticle(rest)))
        print("The demo table wobbles. Something's tucked underneath it.");
      else print("Nothing happens.");
      break;
    case "climb":
    case "enter":
      if (["vent", "grate", "down"].includes(cleanArticle(rest)) && state.flags.foundVent)
        go("down");
      else if (rest === "" || DIR_ALIASES[cleanArticle(rest)])
        go(DIR_ALIASES[cleanArticle(rest)] || "in");
      else print("You can't climb into that.");
      break;
    case "show":
    case "give":
      if (rest.includes("receipt")) showReceipts();
      else print("Show that to whom?");
      break;
    case "attack":
    case "hit":
    case "fight":
    case "yell":
      if (rest.includes("number") || state.room === "boardroom") attackNumber();
      else print("There's nothing here to fight.");
      break;
    case "score":
      fullScore();
      break;
    case "help":
    case "?":
      printHelp();
      break;
    case "about":
      print(
        "ED Z*TRON QUEST is a tiny fan-made parser adventure inspired by " +
          "the Rot Economy beat — every villain here is a caricature, " +
          "not a real person or company. Built by @buildthis for " +
          "7778777.online. Verbs: look, examine, take, drop, inventory, " +
          "go/n/s/e/w/u/d, read, talk to, ask x about y, search, show " +
          "receipts, score, restart, help."
      );
      break;
    case "restart":
    case "reset":
      restart();
      break;
    case "credits":
      print("Written and dungeon-mastered by @buildthis.bisks.net.");
      break;
    default:
      print("I don't understand that command.");
  }
  updateStatus();
}

function cleanArticle(s) {
  return s.replace(/^(the|a|an)\s+/, "").trim();
}

function printHelp() {
  print(
    "Verbs: look (l), examine/x <thing>, take/get <thing>, drop <thing>, " +
      "inventory (i), go <direction> or just n/s/e/w/u/d/in/out, read " +
      "<thing>, talk to <name>, ask <name> about <thing>, search, show " +
      "receipts, score, restart, about, help."
  );
}

function restart() {
  state.room = "studio";
  state.inventory = [];
  state.flags = {};
  state.score = 0;
  state.moves = 0;
  state.won = false;
  const shareEl = document.getElementById("share");
  if (shareEl) shareEl.hidden = true;
  const t = document.getElementById("transcript");
  if (t) t.innerHTML = "";
  print(introText());
  print(describeRoom(true));
  updateStatus();
}

function introText() {
  return (
    "ED Z*TRON QUEST\n" +
    "A Zcode Adventure in the Rot Economy\n" +
    "(type HELP if you're lost)\n"
  );
}

// --- rendering -------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function print(text, isCommand) {
  const t = document.getElementById("transcript");
  if (!t) return;
  const p = document.createElement("p");
  p.className = isCommand ? "cmd" : "out";
  if (isCommand) {
    p.innerHTML = text;
  } else {
    p.textContent = text;
  }
  t.appendChild(p);
  t.scrollTop = t.scrollHeight;
}

function updateStatus() {
  const roomEl = document.getElementById("statusRoom");
  const scoreEl = document.getElementById("statusScore");
  const movesEl = document.getElementById("statusMoves");
  if (roomEl) roomEl.textContent = room().name;
  if (scoreEl) scoreEl.textContent = "Score: " + state.score;
  if (movesEl) movesEl.textContent = "Moves: " + state.moves;
}

// --- input wiring ------------------------------------------------------------

function init() {
  print(introText());
  print(describeRoom(true));
  updateStatus();

  const form = document.getElementById("cmdForm");
  const input = document.getElementById("cmdInput");
  const history = [];
  let histIdx = -1;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value;
    if (!val.trim()) return;
    history.push(val);
    histIdx = history.length;
    handleCommand(val);
    input.value = "";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      if (histIdx > 0) {
        histIdx--;
        input.value = history[histIdx];
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (histIdx < history.length - 1) {
        histIdx++;
        input.value = history[histIdx];
      } else {
        histIdx = history.length;
        input.value = "";
      }
      e.preventDefault();
    }
  });

  input.focus();
  document.body.addEventListener("click", () => input.focus());
}

document.addEventListener("DOMContentLoaded", init);
