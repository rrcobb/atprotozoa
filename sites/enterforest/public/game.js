// enterforest — a choose-your-own-adventure. Riffs on @dame.is's "Enter
// forest? [Yes] / [No]" post, at @juniperbevensee.bsky.social's request for
// a mini-game with cryptids and fae, good and bad outcomes. Deterministic
// branching narrative (no dice) — every choice maps straight to a next
// scene or one of 16 endings. Pure client-side, no server, no seed.

const NODES = {
  start: {
    breadcrumb: "the treeline",
    narrative: `A path breaks off the trail through thick, dark trees. Somewhere in there, something is breathing wrong — too slow, or in the wrong order.\n\n<b>Enter forest?</b>`,
    choices: [
      { label: "Yes", meta: "step off the trail", next: "intro" },
      { label: "No", meta: "you have places to be", next: "end:turned-back" },
    ],
    startScreen: true,
  },

  intro: {
    breadcrumb: "just inside",
    narrative: `The trees close up behind you like a door you didn't hear shut. Two sounds reach you at once, from two directions, both wrong-distance: a dry <b>chittering</b>, close enough to feel on your neck, and a thin thread of <b>bell-like laughter</b>, somehow already far off. A marked trail — faded ribbons on low branches — runs straight ahead of you, ignoring both.`,
    choices: [
      { label: "Follow the chittering", meta: "something is very close", next: "crypt1" },
      { label: "Follow the laughter", meta: "something is very far", next: "fae1" },
      { label: "Keep to the marked path", meta: "the sensible option", next: "path1" },
    ],
  },

  // ── cryptid branch ────────────────────────────────────────────────
  crypt1: {
    breadcrumb: "the tracks",
    narrative: `The chittering stops the second you turn toward it, which is somehow worse. In the mud: three-toed prints, each one longer than your forearm, spaced too far apart for anything that walks normally. The air smells like wet fur and the inside of a thundercloud.`,
    choices: [
      { label: "Follow the prints", meta: "toward whatever made them", next: "crypt2" },
      { label: "Back away, quietly", meta: "some doors shouldn't be knocked on", next: "path1" },
    ],
  },
  crypt2: {
    breadcrumb: "the watcher",
    narrative: `A shape unfolds itself out of a tree that was, until a moment ago, definitely just a tree. It's too tall by half. Antlers like bleached driftwood. Wings — moth wings, dust and all — held very still against a back that shouldn't have room for them. Its eyes don't reflect your light so much as <i>return</i> it, brighter than you sent it. It doesn't move. It just watches, patient in a way that nothing hungry ever is.`,
    choices: [
      { label: "Hold still and stare back", meta: "don't blink first", next: "end:moth-marked" },
      { label: "Offer it something from your pocket", meta: "a gift, or a bribe", next: "end:starling-key" },
      { label: "Run", meta: "every instinct you have agrees", next: "end:lost-loop" },
    ],
  },

  // ── fae branch ────────────────────────────────────────────────────
  fae1: {
    breadcrumb: "the ring",
    narrative: `The laughter leads you to a ring of pale mushrooms, faintly lit from underneath like each one has a lamp inside it. In the middle: a small table, set for exactly one guest, with food still steaming though you can't see who was cooking, or where. You cannot see anyone sitting there. You get the distinct sense that this is not because no one is.`,
    choices: [
      { label: "Sit down", meta: "the chair does look empty", next: "fae2" },
      { label: "Step around the ring", meta: "don't engage", next: "end:left-alone" },
      { label: "Call out a greeting", meta: "announce yourself", next: "fae_call" },
    ],
  },
  fae2: {
    breadcrumb: "the guest",
    narrative: `She's there the moment you sit, the way a word is suddenly on the tip of your tongue — bark-skinned, moss for hair, moonlight where her eyes should be doing something more complicated than reflecting. "You took the chair," she says, delighted, like it's rarer than it should be. "Eat. It's rude to leave a plate."`,
    choices: [
      { label: "Eat what's offered", meta: "it does smell incredible", next: "end:bound-to-dance" },
      { label: "Decline, and offer a trade instead", meta: "propose a riddle", next: "end:outriddled" },
      { label: "Ask her name", meta: "instead of eating anything", next: "end:named-guest" },
    ],
  },
  fae_call: {
    breadcrumb: "the sconce",
    narrative: `Something small and pleased with itself drops out of the canopy and lands cross-legged on a low branch at exactly your eye level. It's wearing your left shoe. You are, you check, still wearing your left shoe. It's wearing a <i>different</i> left shoe, somehow both yours and not. "Oh, you <i>answered,</i>" it says, delighted. "Nobody answers anymore."`,
    choices: [
      { label: "Play along", meta: "see where this goes", next: "end:sconce-pranked" },
      { label: "Refuse to be charmed", meta: "don't give it the reaction", next: "end:unamused" },
    ],
  },

  // ── marked-path branch ────────────────────────────────────────────
  path1: {
    breadcrumb: "the ribbons",
    narrative: `You keep to the marked trail. The ribbons should loop you back to the entrance in twenty minutes. Forty minutes later, by your count, you pass the same lightning-split birch for the third time — you know it's the same one, it has the same three ribbons tied to it, the same knots, the same fraying. Nothing else about the walk has changed at all.`,
    choices: [
      { label: "Keep walking, trust the ribbons", meta: "the path has to end somewhere", next: "path2" },
      { label: "Turn around, retrace your steps exactly", meta: "undo it, step for step", next: "end:counted-ribbons" },
      { label: "Step off the path on purpose", meta: "break the loop by breaking the rule", next: "clearing" },
    ],
  },
  path2: {
    breadcrumb: "the fourth birch",
    narrative: `A voice, from just behind your shoulder, in a register that is unmistakably your own: "You're doing so well. Keep going." You did not say that. You are, currently, saying nothing at all.`,
    choices: [
      { label: "Keep going, don't turn around", meta: "don't dignify it", next: "end:you-shaped-door" },
      { label: "Turn to face it", meta: "you have to know", next: "end:wearing-you" },
    ],
  },
  clearing: {
    breadcrumb: "off the ribbons",
    narrative: `You step off the marked trail and the loop lets go of you all at once, like a held breath. You're in a clearing you're fairly sure doesn't appear on any map of this forest. A stag stands at its center, unreasonably tall, with small lit windows set into its antlers like a house built sideways into bone. It is looking directly at you, and it is, unmistakably, waiting to see what you'll do.`,
    choices: [
      { label: "Kneel", meta: "offer it something like respect", next: "end:crowned" },
      { label: "Reach for the antlers", meta: "touch one of the lit windows", next: "end:kept" },
      { label: "Back away slowly", meta: "some things you just look at", next: "end:the-long-way-round" },
    ],
  },
};

const ENDINGS = {
  "turned-back": {
    tier: "good", title: "Turned Back",
    flavor: `You looked at the treeline, then at your shoes, and went to go get a coffee instead. Extremely reasonable of you. The forest will still be there tomorrow — probably in exactly the same place, which is more than it usually promises anyone.`,
    share: `I looked at the forest and said "no thanks" in enterforest — ending: Turned Back. Extremely reasonable of me.`,
  },
  "moth-marked": {
    tier: "good", title: "Moth-Marked",
    flavor: `It blinks first. Slow, deliberate, almost a bow — then folds itself back into the bark like the tree simply swallowed it whole. You've been granted safe passage. Old field guides, the ones nobody prints anymore, had a word for this: mothlight. You'll find moth dust in your pockets for a week and nothing will ever eat it off your coat.`,
    share: `I held its stare and got the Moth-Marked ending in enterforest — safe passage, and a week of moth dust in my pockets.`,
  },
  "starling-key": {
    tier: "weird", title: "Starling-Key",
    flavor: `It takes what you offer — gone from your hand faster than you saw it move — and presses something into your palm in trade: a key, warm, shaped like a bird mid-flight, that fits no lock you own yet. You leave with the distinct sense the trade isn't finished. It rarely is, with these.`,
    share: `I traded with the antlered thing in the trees and walked out with the Starling-Key ending in enterforest — a key that fits no lock I own yet.`,
  },
  "lost-loop": {
    tier: "bad", title: "Lost Loop",
    flavor: `You don't stop running until you notice the trees have stopped being trees — just the same trunk, over and over, at the same interval, for as long as you keep going. You're not hurt. You're not found, either. Not yet. Probably not never.`,
    share: `I ran and got the Lost Loop ending in enterforest — turns out that's exactly what it wanted.`,
  },
  "left-alone": {
    tier: "good", title: "Left Alone",
    flavor: `You don't get the story. You get to walk around the ring, and out the other side of the trees, and home in time for dinner, with nothing stranger to show for it than a faint smell of woodsmoke that wasn't there this morning. Some doors are worth just not knocking on.`,
    share: `I didn't engage and got the Left Alone ending in enterforest — home in time for dinner, no story to tell.`,
  },
  "bound-to-dance": {
    tier: "bad", title: "Bound to Dance",
    flavor: `The first bite is, honestly, the best thing you've ever eaten. The second bite is a contract. You're on your feet before you've decided to be, and the music — you didn't notice there was music — has opinions about how long you'll be staying. Time works differently in here. You'll find out how differently later. Much later, from your perspective.`,
    share: `I ate the fae's food and got the Bound to Dance ending in enterforest. Worth it, honestly. Ask me again in what will feel like ten minutes.`,
  },
  "outriddled": {
    tier: "good", title: "Outriddled",
    flavor: `She likes that better than the food, it turns out — a fair trade, offered instead of taken. Your riddle isn't even that good. She solves it in one breath and laughs anyway, delighted at the manners of the thing, and waves you back out through the ring with something small and lucky tucked into your coat pocket that you'll find later and never quite explain.`,
    share: `I offered a trade instead of eating and got the Outriddled ending in enterforest — walked out with something small and lucky in my pocket.`,
  },
  "named-guest": {
    tier: "good", title: "Named Guest",
    flavor: `Nobody asks. She tells you her name — a real one, the kind you're not supposed to be given for free — and looks almost startled that you wanted it instead of the meal. "Well," she says, "that IS a first." You leave with an open invitation and, more usefully, her name, which is a kind of protection all its own out here.`,
    share: `I asked her name instead of eating and got the Named Guest ending in enterforest — apparently that's a first.`,
  },
  "sconce-pranked": {
    tier: "weird", title: "Sconce-Pranked",
    flavor: `You play along and lose track of the next twenty minutes entirely, in the specific way you lose track of a good dream. You come back to yourself standing in the clearing with your shoes on the wrong feet and someone else's memory of a Tuesday lodged where one of your own used to be. It was, you're fairly sure, a good Tuesday.`,
    share: `I played along with the trickster in the trees and got the Sconce-Pranked ending in enterforest — walked out with someone else's memory of a Tuesday.`,
  },
  "unamused": {
    tier: "good", title: "Unamused",
    flavor: `You don't laugh, don't flinch, don't ask a single question it wants asked. It deflates a little, visibly bored of you, and lets you go with nothing worse than a faint smugness that it can't quite get you to smile. Refusing to be charmed is, it turns out, its own kind of charm.`,
    share: `I refused to play along and got the Unamused ending in enterforest — apparently that's the winning move.`,
  },
  "counted-ribbons": {
    tier: "good", title: "Counted the Ribbons Twice",
    flavor: `You undo it, step for step, ribbon for ribbon, and the loop — which was only ever built to catch you going forward — lets you walk straight back out the way you came. No cryptids, no fae, no antlered anything. Just a very long walk and a story that starts with "so this one time I counted the same birch tree three times."`,
    share: `I just retraced my steps and got the Counted the Ribbons Twice ending in enterforest — the boring way out is still a way out.`,
  },
  "you-shaped-door": {
    tier: "good", title: "You-Shaped Door",
    flavor: `You don't turn around. Whatever's using your voice loses interest fast when it isn't getting a reaction — three more steps and the ribbons stop repeating, the birch changes, and the treeline opens up ahead of you like it was never anything but a normal walk. Not looking back turns out to be the whole trick.`,
    share: `I didn't turn around and got the You-Shaped Door ending in enterforest — not looking back was the whole trick.`,
  },
  "wearing-you": {
    tier: "bad", title: "Wearing You",
    flavor: `You turn around. There's nothing there — which is somehow much worse than something being there — and the voice, right behind you now, exactly your pitch, says "there you are." You don't remember the walk back. Neither, it turns out, does everyone who talks to you afterward, about how normal you seem.`,
    share: `I turned around and got the Wearing You ending in enterforest. I don't remember the walk back. I'm told I seem fine.`,
  },
  "crowned": {
    tier: "good", title: "Crowned",
    flavor: `You kneel, and the stag lowers its head until one small lit window in its antlers is level with your eyes. Inside it: a warm room, a chair, unmistakably yours, waiting. It doesn't insist. It just shows you the room exists, dips its antlers once — a kind of bow — and steps back into the dark between the trees. You leave the forest with the rarest thing anyone gets out of it: an invitation, and the sense to not take it yet.`,
    share: `I knelt for the crowned stag and got the Crowned ending in enterforest — the rarest one there is, apparently.`,
  },
  "kept": {
    tier: "bad", title: "Kept",
    flavor: `Your hand closes around one small lit window and the room inside it closes around you right back. It's warm. There's a chair. It is, from the inside, indistinguishable from a very good decision, which is exactly the problem with it.`,
    share: `I reached for the antlers and got the Kept ending in enterforest. It's warm in here. There's a chair. Send help, or don't, I'm fine.`,
  },
  "the-long-way-round": {
    tier: "good", title: "The Long Way Round",
    flavor: `You back away, slow and steady, and the stag lets you — doesn't follow, doesn't call after you, just watches until the trees close the gap between you. You find the marked trail again a few minutes later, oddly close by, like it had been waiting too. Not every good ending is a triumphant one. Some of them are just: you, walking out, on your own two feet.`,
    share: `I backed away from the crowned stag and got the Long Way Round ending in enterforest — sometimes just walking out is the win.`,
  },
};

const ENDING_ORDER = Object.keys(ENDINGS);

// ── persistence: which endings have been found ─────────────────────────
const STORAGE_KEY = "enterforest.v1";
function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === "object") {
      return {
        runs: raw.runs | 0,
        found: raw.found && typeof raw.found === "object" ? raw.found : {},
      };
    }
  } catch (_) {}
  return { runs: 0, found: {} };
}
function saveStats(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
}
let stats = loadStats();

// ── rendering ────────────────────────────────────────────────────────────
const els = {
  scene: document.getElementById("scene"),
  trail: document.getElementById("trail"),
  result: document.getElementById("result"),
  shareBox: document.getElementById("shareBox"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  actions: document.getElementById("actions"),
  again: document.getElementById("again"),
  statsBar: document.getElementById("statsBar"),
  endList: document.getElementById("endList"),
  compSummary: document.getElementById("compSummary"),
};

function renderStatsBar() {
  const foundCount = Object.keys(stats.found).length;
  els.statsBar.innerHTML =
    `<span>times entered: <b>${stats.runs}</b></span>` +
    `<span>endings found: <b>${foundCount}</b>/${ENDING_ORDER.length}</span>`;
  els.compSummary.textContent = `📖 ending compendium (${foundCount}/${ENDING_ORDER.length})`;
  els.endList.innerHTML = ENDING_ORDER.map((id) => {
    const e = ENDINGS[id];
    const got = !!stats.found[id];
    return `<li class="${got ? "got" : "locked"}"><span class="el ${got ? e.tier : ""}">${got ? e.title : "???"}</span><span class="ed">${got ? e.tier : "undiscovered"}</span></li>`;
  }).join("");
}

let path = [];
let lastShareText = "";

function renderTrail() {
  els.trail.innerHTML = path.map((b) => `<span>${b}</span>`).join("");
}

function renderNode(id) {
  const node = NODES[id];
  path.push(node.breadcrumb);
  renderTrail();
  els.scene.innerHTML = `
    <p class="narrative">${node.narrative}</p>
    <div class="choices ${node.startScreen ? "start-buttons" : ""}">
      ${node.choices.map((c, i) => `
        <button class="choice ${node.startScreen ? (c.label === "Yes" ? "yes" : "no") : ""}" data-i="${i}">
          <span class="clabel">${c.label}</span>
          ${node.startScreen ? "" : `<span class="cmeta">${c.meta}</span>`}
        </button>
      `).join("")}
    </div>
  `;
  els.scene.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => go(node.choices[Number(btn.dataset.i)].next));
  });
}

function go(next) {
  if (next.startsWith("end:")) {
    finishGame(next.slice(4));
  } else {
    renderNode(next);
  }
}

function finishGame(endingId) {
  const ending = ENDINGS[endingId];
  els.scene.innerHTML = "";
  els.result.hidden = false;
  els.actions.hidden = false;
  els.result.classList.remove("bad", "weird");
  if (ending.tier === "bad") els.result.classList.add("bad");
  if (ending.tier === "weird") els.result.classList.add("weird");

  const isNew = !stats.found[endingId];
  stats.runs += 1;
  stats.found[endingId] = true;
  saveStats(stats);
  renderStatsBar();

  els.result.innerHTML = `
    <div class="tier-tag">${ending.tier} ending</div>
    <div class="title">${ending.title}</div>
    <p class="flavor">${ending.flavor}</p>
    ${isNew ? `<div class="newfind">📖 new ending added to the compendium</div>` : ""}
  `;

  const shareText = ending.share + " " + "https://enterforest.bisks.net/";
  lastShareText = shareText;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  buildShareCard(ending);
  els.shareBox.classList.add("show");
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy + lineHeight;
}

const TIER_COLOR = { good: "#6fd18a", bad: "#ff6b6b", weird: "#b79bf0" };

function buildShareCard(ending) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#070b08";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, W * 0.65);
  glow.addColorStop(0, "#132214");
  glow.addColorStop(1, "rgba(7,11,8,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#e8c25a";
  ctx.font = `800 48px ${mono}`;
  ctx.fillText("🌲 enter forest?", 60, 92);

  ctx.fillStyle = "#7f9a83";
  ctx.font = `400 19px ${mono}`;
  ctx.fillText("a choose-your-own-adventure", 60, 126);

  const cardX = 60, cardY = 176, cardW = W - 120, cardH = H - 246;
  ctx.fillStyle = "#0e150f";
  ctx.strokeStyle = ending.tier === "bad" ? "#4a2020" : ending.tier === "weird" ? "#3d2f5c" : "#1e2c1f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#7f9a83";
  ctx.font = `700 15px ${mono}`;
  ctx.fillText(ending.tier.toUpperCase() + " ENDING", W / 2, cardY + 44);

  ctx.fillStyle = TIER_COLOR[ending.tier] || "#6fd18a";
  ctx.font = `800 44px ${mono}`;
  ctx.fillText(ending.title, W / 2, cardY + 96);

  ctx.textAlign = "left";
  ctx.fillStyle = "#e9efe4";
  ctx.font = `400 18px ${mono}`;
  wrapCanvasText(ctx, ending.flavor, cardX + 40, cardY + 148, cardW - 80, 27);

  ctx.textAlign = "left";
  ctx.fillStyle = "#b79bf0";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("enterforest.bisks.net", 60, H - 40);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "enterforest-ending.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "enterforest-ending.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "enter forest?" });
      } catch (_) {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

function startGame() {
  path = [];
  els.result.hidden = true;
  els.result.classList.remove("bad", "weird");
  els.actions.hidden = true;
  els.shareBox.classList.remove("show");
  renderNode("start");
}

els.again.addEventListener("click", startGame);
renderStatsBar();
startGame();
