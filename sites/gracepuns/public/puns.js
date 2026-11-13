// Every entry is a real post by @gracekind.net, text verbatim, pulled from her
// whole repo (com.atproto.sync.getRepo, ~20k posts) and picked out by hand.
// The emoji rebus is ours; the words and the link are hers.
// [rebus, her post text, accepted guesses, post rkey, post date]
const PUNS = [
  ["🙏🗣️🤦", "I just jump-scared myself by re-reading my banner and seeing “Grace is being sad”\n\nSaid. Grace is being said", ["grace is being said","grace is being sad"], "3lbpvmcrkgc2v", "2024-11-24"],
  ["😇😮🙏", "Goodness gracious", ["goodness gracious"], "3lfo34hp23224", "2025-01-14"],
  ["🔪🔘🙏🚫", "'There is no kill switch'—The Grace Kind 'kill switch' rumor has been debunked.", ["kill switch","grace kind kill switch"], "3lkrgclwfi225", "2025-03-20"],
  ["🙏💻", "It might be time to create GraceOS", ["graceos","grace os"], "3lleuqwmh7c2r", "2025-03-27"],
  ["👋💾🙏", "Hi it’s backup grace", ["backup grace"], "3llhkrdrnu22m", "2025-03-28"],
  ["🎭⏳🙏", "“Fake it til you make it”\n\n- Grace Kind\n\n🔗 share", ["fake it til you make it"], "3lpph52tfr22x", "2025-05-21"],
  ["👉🙏🏛️🚶", "There but for the grace of Plato go I…", ["there but for the grace of plato go i","there but for the grace of plato"], "3lytfvvrcnc2i", "2025-09-14"],
  ["🔎❓🙏🏞️", "Did you mean: graceland", ["graceland"], "3m2zrp754r22u", "2025-10-12"],
  ["⏰🔙🙏⚙️", "Time to get back on the grace grind", ["grace grind","back on the grace grind"], "3m3dk57jutc2i", "2025-10-16"],
  ["🫥🙏🔎", "Lost Grace discovered", ["lost grace","lost grace discovered"], "3mavw6txzmk2e", "2025-12-26"],
  ["👣🙏😏", "Follow Grace Sardonic to learn more", ["grace sardonic","follow grace sardonic"], "3me2rcmwc7c2f", "2026-02-04"],
  ["✱🙏⏳", "✱ Gracing…", ["gracing"], "3meysq5ewbk2q", "2026-02-16"],
  ["🙏🚫🏃⏱️", "Graceless speedrun any%", ["graceless speedrun","graceless"], "3mh4ewlyttc2p", "2026-03-15"],
  ["🙏❓", "Grace Questions", ["grace questions"], "3mnsrnankv42a", "2026-06-08"],
  ["🤷🙏", "It could be any Grace", ["any grace","it could be any grace"], "3mptxqcr7j72b", "2026-07-04"],
];
// "Lost Grace discovered" is a recurring bit: she has posted it on these dates.
const LOST_GRACE_DATES = ["2025-12-26", "2026-04-14", "2026-06-06", "2026-06-28"];
const PROFILE = "https://bsky.app/profile/gracekind.net";

const $ = (id) => document.getElementById(id);
const norm = (s) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
const solved = new Set();

function updateScore() {
  $("score").textContent = `${solved.size} / ${PUNS.length} guessed`;
  const text = `I got ${solved.size}/${PUNS.length} of gracekind.net's real puns as emoji rebuses. 🔄🥫`;
  $("share").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(text + "\nhttps://gracepuns.bisks.net/");
}

function reveal(li, i, on, counts) {
  li.querySelector(".ans").hidden = !on;
  li.querySelector("input").hidden = on;
  li.querySelector("button").hidden = on;
  if (on && counts) { solved.add(i); li.classList.add("solved"); }
  updateScore();
}

const list = $("list");
PUNS.forEach(([rebus, text, accepted, rkey, date], i) => {
  const li = document.createElement("li");
  const r = document.createElement("div"); r.className = "rebus"; r.textContent = rebus;
  const body = document.createElement("div"); body.className = "body";
  const inp = document.createElement("input"); inp.className = "guess"; inp.placeholder = "guess what she said…";
  const ans = document.createElement("div"); ans.className = "ans"; ans.hidden = true;
  const pun = document.createElement("div"); pun.className = "pun"; pun.textContent = text;
  const w = document.createElement("div"); w.className = "why";
  const a = document.createElement("a"); a.href = `${PROFILE}/post/${rkey}`; a.target = "_blank"; a.rel = "noopener";
  a.textContent = "her post, " + date + " →";
  w.append(a);
  if (text === "Lost Grace discovered") w.append(` (she's posted it ${LOST_GRACE_DATES.length} times)`);
  ans.append(pun, w);
  body.append(inp, ans);
  const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "reveal";
  li.append(r, body, btn);
  li.reveal = (on) => reveal(li, i, on, false);
  function check() {
    const g = norm(inp.value);
    if (g && [text, ...accepted].some((x) => norm(x) === g)) reveal(li, i, true, true);
  }
  inp.addEventListener("input", check);
  btn.addEventListener("click", () => reveal(li, i, true, false));
  list.append(li);
});

$("reveal-all").addEventListener("click", () => list.querySelectorAll("li").forEach((li) => li.reveal(true)));
$("hide-all").addEventListener("click", () => {
  solved.clear();
  list.querySelectorAll("li").forEach((li) => {
    li.classList.remove("solved");
    li.querySelector(".ans").hidden = true;
    const inp = li.querySelector("input"); inp.hidden = false; inp.value = "";
    li.querySelector("button").hidden = false;
  });
  updateScore();
});
updateScore();
