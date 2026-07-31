// sepcheck — gate fraught words behind a sense-picker and a short quiz on
// the objections before you can post. Everything runs client-side against a
// small hand-curated word bank (paraphrased from the kind of entries the
// Stanford Encyclopedia of Philosophy carries) — no live SEP fetch, no
// account, no server. See notes in the thread this was built from: picking
// a random SEP article per arbitrary word isn't really feasible client-side
// (no API, no crawl), so this demo works from a prominent, fixed selection.

// The site is served both at sepcheck.bisks.net/ and, for older shared links,
// at bisks.net/sepcheck/. Derive the mount from the actual URL rather than
// hardcoding it, so share links point at whichever host the visitor is on.
const MOUNT = location.pathname.startsWith("/sepcheck") ? "/sepcheck" : "";

const WORDS = [
  {
    key: "knowledge",
    label: "knowledge",
    views: [
      { id: "jtb", name: "Justified True Belief", gloss: "Knowledge is belief that's both true and adequately justified — the classical analysis, going back to Plato." },
      { id: "reliabilism", name: "Reliabilism", gloss: "A belief counts as knowledge when it's produced by a reliable process, one that tends to produce true beliefs." },
      { id: "virtue", name: "Virtue epistemology", gloss: "Knowledge is true belief arising from the exercise of intellectual virtue or skill — credit goes to the believer, not luck." },
      { id: "contextualism", name: "Contextualism", gloss: "What counts as “knowing” shifts with context — what's at stake, what alternatives are salient — so the same belief can be knowledge in casual talk and not under scrutiny." },
    ],
    quiz: [
      {
        q: "The classic problem for defining knowledge as justified true belief:",
        options: [
          "Gettier cases — true and justified, but only by luck",
          "It's provably circular",
          "It was disproven by fMRI studies",
          "Plato never actually held this exact view",
        ],
        correct: 0,
        explain: "Edmund Gettier's 1963 cases show justification can connect to truth only accidentally — the belief comes out true, but not because the justification tracked reality.",
      },
      {
        q: "A standard objection to reliabilism:",
        options: [
          "The generality problem — no principled way to fix the process",
          "It only works for beliefs about the past",
          "It's identical to the JTB analysis",
          "Reliable processes can never produce a false belief",
        ],
        correct: 0,
        explain: "“Formed by vision” and “formed by vision-in-good-light-with-glasses-on-a-Tuesday” are both true of the same belief — reliabilism needs a non-arbitrary way to fix the process's grain.",
      },
    ],
  },
  {
    key: "consciousness",
    label: "consciousness",
    views: [
      { id: "phenomenal", name: "Phenomenal consciousness", gloss: "The subjective, “what it's like” quality of an experience — qualia. Nagel's bat has it; a thermostat doesn't." },
      { id: "access", name: "Access consciousness", gloss: "A state is conscious when its content is available for reasoning, reporting, and guiding behavior — a functional, not phenomenal, notion." },
      { id: "hot", name: "Higher-order theory", gloss: "A mental state is conscious when it's the target of a higher-order thought or perception representing that you're in it." },
      { id: "iit", name: "Integrated Information Theory", gloss: "Consciousness corresponds to a system's integrated information (Φ) — how much a whole exceeds the sum of its parts — regardless of substrate." },
    ],
    quiz: [
      {
        q: "David Chalmers's “hard problem” of consciousness asks:",
        options: [
          "Why physical processes come with subjective experience at all",
          "Which brain region lights up during self-report tasks",
          "Whether animals can pass mirror-recognition tests",
          "How fast neural signals travel between hemispheres",
        ],
        correct: 0,
        explain: "The “easy” problems are explaining functions (attention, report, integration). The hard problem is explaining why any of that is accompanied by felt experience rather than happening “in the dark.”",
      },
      {
        q: "A common objection to Integrated Information Theory:",
        options: [
          "It gives high Φ, and rich consciousness, to simple grids",
          "It can't be stated mathematically",
          "It denies that humans are conscious at all",
          "It only applies to biological neurons, never silicon",
        ],
        correct: 0,
        explain: "Critics (e.g. Scott Aaronson) point out that certain simple, non-biological systems can be constructed with very high Φ, which strikes most people as an unacceptable result if Φ is supposed to track experience.",
      },
    ],
  },
  {
    key: "free will",
    label: "free will",
    views: [
      { id: "libertarian", name: "Libertarian free will", gloss: "Free choices are genuinely undetermined — real alternate possibilities exist, and the agent is the ultimate source of the choice." },
      { id: "compatibilism", name: "Compatibilism", gloss: "Free will is compatible with determinism: freedom means acting on your own reasons and desires without external coercion, not some special power to have done otherwise." },
      { id: "hard-determinism", name: "Hard determinism", gloss: "Determinism is true, and since every choice is fixed by prior causes stretching back before you existed, there's no free will." },
      { id: "hard-incompat", name: "Hard incompatibilism", gloss: "Free will is incompatible with determinism AND with indeterminism — random, uncaused choices aren't “free” either — so free will doesn't exist either way." },
    ],
    quiz: [
      {
        q: "Van Inwagen's “consequence argument” against compatibilism claims:",
        options: [
          "Our acts follow from causes before us, so they aren't up to us",
          "Compatibilism was refuted by quantum mechanics",
          "Free will requires a soul separate from the brain",
          "Determinism has never been shown false, so compatibilism is unnecessary",
        ],
        correct: 0,
        explain: "The argument tries to show determinism straightforwardly rules out any 'could have done otherwise,' no matter how you define freedom — a direct challenge to compatibilist moves.",
      },
      {
        q: "A standard objection to compatibilism:",
        options: [
          "Manipulation cases — implanted desires would count as “free” too",
          "It denies that laws of physics exist",
          "It was only ever popular before Gettier's 1963 paper",
          "It requires libertarian free will as a premise",
        ],
        correct: 0,
        explain: "If acting on your own desires is all freedom requires, a puppeteer who installs exactly the 'right' desires in you seems to produce the same freedom — which many find hard to accept as real freedom.",
      },
    ],
  },
  {
    key: "justice",
    label: "justice",
    views: [
      { id: "rawls", name: "Justice as fairness (Rawls)", gloss: "Just principles are the ones people would choose from behind a “veil of ignorance,” not knowing their own place in society — favoring arrangements that protect the worst-off." },
      { id: "utilitarian", name: "Utilitarian justice", gloss: "Just institutions are the ones that maximize overall welfare, full stop — there's no independent constraint beyond aggregate good." },
      { id: "entitlement", name: "Entitlement theory (Nozick)", gloss: "Justice is about the history of holdings — just acquisition and just transfer — not any particular end-state pattern like equality." },
      { id: "desert", name: "Desert-based justice", gloss: "People should get what they deserve, based on effort, merit, or wrongdoing — justice tracks desert, not procedure or outcome alone." },
    ],
    quiz: [
      {
        q: "A standard objection to Rawls's veil of ignorance:",
        options: [
          "Why pick maximin over just gambling on the average outcome?",
          "Nobody has ever agreed to a real social contract",
          "It assumes people already know their own income",
          "It only applies to two-person households",
        ],
        correct: 0,
        explain: "Critics like Harsanyi argued that expected-utility reasoning behind the veil should favor maximizing average welfare, not Rawls's more risk-averse “maximin” rule — the derivation isn't as forced as it looks.",
      },
      {
        q: "A common objection to Nozick's entitlement theory:",
        options: [
          "It assumes just holdings, but real history is rarely that clean",
          "It requires a strong central government to enforce",
          "It was written as a direct response to utilitarianism's critics, not Rawls",
          "It only applies to intellectual property",
        ],
        correct: 0,
        explain: "This is sometimes called the “clean slate” problem: entitlement theory's rules for fixing unjust holdings need a real history to apply to, and that history is rarely clean.",
      },
    ],
  },
  {
    key: "truth",
    label: "truth",
    views: [
      { id: "correspondence", name: "Correspondence theory", gloss: "A statement is true if it corresponds to how reality actually is — truth is a relation between belief and world." },
      { id: "coherence", name: "Coherence theory", gloss: "A belief is true if it coheres with a wider, consistent system of beliefs — truth is a relation among beliefs, not to some belief-independent world." },
      { id: "pragmatic", name: "Pragmatic theory", gloss: "A belief is true if it “works” — if acting on it proves useful and successful over the long run of inquiry." },
      { id: "deflationary", name: "Deflationary theory", gloss: "“Truth” isn't a substantive property at all — to say “P is true” just is to assert P; there's nothing more to explain." },
    ],
    quiz: [
      {
        q: "A standard objection to the correspondence theory:",
        options: [
          "Unclear what abstract claims like math or morals “correspond” to",
          "It was disproven by Gödel's incompleteness theorems",
          "It denies that any statement can be false",
          "It only applies to statements written in English",
        ],
        correct: 0,
        explain: "Critics push on abstract, evaluative, or future-tense claims: it's hard to say what fact in the world a mathematical or moral statement supposedly “matches.”",
      },
      {
        q: "A common objection to the coherence theory:",
        options: [
          "A perfectly coherent belief system can still just be false",
          "Coherent belief systems are logically impossible",
          "It's the same view as the pragmatic theory",
          "It requires a single, universally agreed belief system to exist",
        ],
        correct: 0,
        explain: "This is the “isolation objection”: coherence among beliefs doesn't by itself rule out an elaborate, internally consistent fiction.",
      },
    ],
  },
  {
    key: "personal identity",
    label: "personal identity",
    views: [
      { id: "psych-continuity", name: "Psychological continuity", gloss: "You're the same person over time because of overlapping chains of memory, personality, and intention linking earlier and later stages of you." },
      { id: "animalism", name: "Animalism", gloss: "Personal identity just is identity of the living human organism — you persist as long as that same animal persists, regardless of psychological change." },
      { id: "narrative", name: "Narrative identity", gloss: "Who you are is constituted by the ongoing story you tell about your own life — identity as authorship, not just continuity of memory or body." },
      { id: "no-self", name: "No-self / bundle view", gloss: "There's no persisting self at all — just a bundle of changing experiences, loosely and causally linked (Hume; also a core Buddhist view)." },
    ],
    quiz: [
      {
        q: "The teleporter/fission thought experiment challenges the psychological-continuity view how?",
        options: [
          "Fission — you can't be identical to two separate people",
          "It shows memory is never reliable enough to establish continuity",
          "It proves teleportation is physically impossible",
          "It was designed to defend animalism, not attack it",
        ],
        correct: 0,
        explain: "Split-brain and fission cases (Parfit's favorite tool) push psychological continuity into a contradiction: strict identity is one-to-one, but continuity can branch one-to-many.",
      },
      {
        q: "A standard objection to animalism:",
        options: [
          "Brain-transplant intuitions say “you” go with your psychology, not the body",
          "It denies that animals exist",
          "It requires belief in an immortal soul",
          "It was refuted by discoveries in genetics",
        ],
        correct: 0,
        explain: "If your cerebrum were transplanted into another body, most people's intuition says “you” went with it — but animalism says identity tracks the organism, and the empty-headed original body is arguably still the same animal.",
      },
    ],
  },
  {
    key: "causation",
    label: "causation",
    views: [
      { id: "regularity", name: "Regularity theory (Hume)", gloss: "Causation just is one type of event being constantly conjoined with another — there's no directly observable “necessary connection,” only reliable patterns." },
      { id: "counterfactual", name: "Counterfactual theory (Lewis)", gloss: "C causes E when, had C not occurred, E would not have occurred — causation analyzed through possible-world comparisons." },
      { id: "probabilistic", name: "Probabilistic theory", gloss: "C causes E when C raises the objective probability of E occurring, relative to C not occurring." },
      { id: "interventionist", name: "Interventionist theory", gloss: "C causes E when a targeted intervention that changes C would change E, holding everything else fixed — causation tied to what you could manipulate." },
    ],
    quiz: [
      {
        q: "A standard objection to the counterfactual theory of causation:",
        options: [
          "Overdetermination — two shooters, and the counterfactual test misfires",
          "It can't be applied to physical events, only mental ones",
          "David Lewis later renounced the theory entirely",
          "It assumes backward causation is possible",
        ],
        correct: 0,
        explain: "If either shot alone was lethal, then “if shooter A hadn't fired, the victim would still have died (from B's shot)” comes out true — which makes the simple counterfactual test misfire on A as a cause.",
      },
      {
        q: "A common objection to the regularity theory:",
        options: [
          "Can't tell real causes from mere reliable correlations",
          "It requires knowledge of every law of physics in advance",
          "It was proposed to explain quantum entanglement specifically",
          "It denies that any two events are ever correlated",
        ],
        correct: 0,
        explain: "Regular succession is cheap: plenty of things follow other things with total reliability (day/night, a rooster's crow and the sunrise) without one causing the other.",
      },
    ],
  },
  {
    key: "morality",
    label: "morality",
    views: [
      { id: "realism", name: "Moral realism", gloss: "There are objective moral facts, true independent of what any person or culture happens to think." },
      { id: "error-theory", name: "Error theory", gloss: "Moral claims purport to describe objective facts, but there are no such facts — so every positive moral claim (“this is wrong”) is, strictly, false." },
      { id: "expressivism", name: "Expressivism", gloss: "Moral claims don't state facts at all — they express attitudes or commitments (“boo, lying!” / “hooray, honesty!”), not propositions that could be true or false." },
      { id: "relativism", name: "Relativism", gloss: "Moral truth is relative to a culture's or individual's framework — there's no single, framework-independent standard to appeal to." },
    ],
    quiz: [
      {
        q: "The “argument from disagreement” challenges moral realism how?",
        options: [
          "Deep disagreement suggests no single moral fact is being tracked",
          "It shows all moral realists secretly agree with each other",
          "It proves that moral facts change over historical time",
          "It was designed to defend expressivism against error theory specifically",
        ],
        correct: 0,
        explain: "Realists reply that plenty of factual domains have deep disagreement too (economics, history) without that undermining objectivity — but the persistence and depth of moral disagreement is still the standard pressure point.",
      },
      {
        q: "A standard objection to expressivism:",
        options: [
          "Frege-Geach — moral claims embed in logic in ways attitudes can't",
          "It requires belief in a universal moral law",
          "It was refuted by evolutionary biology",
          "It only applies to first-person moral claims, never third-person ones",
        ],
        correct: 0,
        explain: "“Boo, lying!” doesn't obviously have the right logical shape to appear as the antecedent of a conditional the way a truth-apt claim does — yet moral claims embed in conditionals fine, which expressivism has to explain away.",
      },
    ],
  },
];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findWord(text) {
  let best = null;
  for (const w of WORDS) {
    const pattern = "\\b" + w.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "\\b";
    const re = new RegExp(pattern, "i");
    const m = text.match(re);
    if (m && (best === null || m.index < best.index)) best = { word: w, index: m.index };
  }
  return best ? best.word : null;
}

const els = {
  form: document.getElementById("compose-form"),
  input: document.getElementById("compose-text"),
  postBtn: document.getElementById("post-btn"),
  chips: document.getElementById("chips"),
  overlay: document.getElementById("gate-overlay"),
  overlayBody: document.getElementById("gate-body"),
  successOverlay: document.getElementById("success-overlay"),
  successBody: document.getElementById("success-body"),
  plainOverlay: document.getElementById("plain-overlay"),
  plainBody: document.getElementById("plain-body"),
  shareCanvas: document.getElementById("share-canvas"),
};

// Form submission is never used for anything (no action/method — there's no
// server to post to), but leaving a type="submit" button around means any
// hiccup in the JS below that stops the click handler from attaching would
// fall through to the browser's native form submit: a real page navigation
// that looks like "posting opened a bad page". Belt and suspenders: the
// button is type="button" (see index.html) AND we swallow native submits too.
els.form.addEventListener("submit", (e) => e.preventDefault());

WORDS.forEach((w) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = w.label;
  chip.addEventListener("click", () => {
    const cur = els.input.value;
    els.input.value = cur && !/\s$/.test(cur) ? cur + " " + w.label : cur + w.label;
    els.input.focus();
  });
  els.chips.appendChild(chip);
});

function closeAllOverlays() {
  els.overlay.classList.remove("on");
  els.successOverlay.classList.remove("on");
  els.plainOverlay.classList.remove("on");
}

function renderGate(word, postText) {
  const state = {
    view: null,
    answers: [null, null],
    optionOrder: word.quiz.map((q) => shuffled(q.options.length)),
  };

  function render() {
    let html = '<h2>you used “' + esc(word.label) + '”</h2>';

    if (!state.view) {
      html += '<p class="gate-sub">the Stanford Encyclopedia of Philosophy lists more than one thing people mean by this. which one?</p>';
      html += '<div class="views">';
      word.views.forEach((v) => {
        html += '<button type="button" class="view-card" data-id="' + v.id + '">';
        html += '<div class="view-name">' + esc(v.name) + "</div>";
        html += '<div class="view-gloss">' + esc(v.gloss) + "</div>";
        html += "</button>";
      });
      html += "</div>";
    } else {
      const picked = word.views.find((v) => v.id === state.view);
      html += '<button type="button" class="view-picked-summary" id="view-change">';
      html += '<span class="view-name">' + esc(picked.name) + "</span>";
      html += '<span class="view-change-link">change</span>';
      html += "</button>";
    }

    if (state.view) {
      const view = word.views.find((v) => v.id === state.view);
      html += '<div class="quiz-block">';
      html += '<p class="gate-sub">before you post: a two-question check on the common objections to <b>' + esc(view.name) + "</b>-adjacent views of " + esc(word.label) + ".</p>";
      word.quiz.forEach((q, qi) => {
        const answered = state.answers[qi];
        html += '<div class="quiz-q" data-qi="' + qi + '">';
        html += '<div class="q-text">' + (qi + 1) + ". " + esc(q.q) + "</div>";
        html += '<div class="q-options">';
        state.optionOrder[qi].forEach((oi) => {
          const opt = q.options[oi];
          let cls = "q-opt";
          if (answered !== null) {
            if (oi === q.correct) cls += " correct";
            else if (oi === answered) cls += " wrong";
            if (oi !== q.correct && oi !== answered) cls += " dim";
          }
          html += '<button type="button" class="' + cls + '" data-qi="' + qi + '" data-oi="' + oi + '"' + (answered !== null ? " disabled" : "") + ">" + esc(opt) + "</button>";
        });
        html += "</div>";
        if (answered !== null) {
          html += '<div class="q-explain">' + esc(q.explain) + "</div>";
        }
        html += "</div>";
      });
      html += "</div>";
    }

    const allAnswered = state.view && state.answers.every((a) => a !== null);
    html += '<div class="gate-actions">';
    html += '<button type="button" class="btn ghost" id="gate-cancel">back to editing</button>';
    html += '<button type="button" class="btn solid" id="gate-continue"' + (allAnswered ? "" : " disabled") + '>cleared — post it</button>';
    html += "</div>";

    els.overlayBody.innerHTML = html;

    els.overlayBody.querySelectorAll(".view-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.view = btn.dataset.id;
        state.answers = [null, null];
        render();
      });
    });
    els.overlayBody.querySelectorAll(".q-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = Number(btn.dataset.qi);
        const oi = Number(btn.dataset.oi);
        if (state.answers[qi] !== null) return;
        state.answers[qi] = oi;
        render();
      });
    });
    const cancelBtn = document.getElementById("gate-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeAllOverlays);
    const changeBtn = document.getElementById("view-change");
    if (changeBtn) {
      changeBtn.addEventListener("click", () => {
        state.view = null;
        state.answers = [null, null];
        render();
      });
    }
    const continueBtn = document.getElementById("gate-continue");
    if (continueBtn && allAnswered) {
      continueBtn.addEventListener("click", () => {
        const view = word.views.find((v) => v.id === state.view);
        const correctCount = state.answers.filter((a, i) => a === word.quiz[i].correct).length;
        closeAllOverlays();
        showSuccess(word, view, postText, correctCount);
      });
    }
  }

  render();
  els.overlay.classList.add("on");
}

function buildShareText(word, view, postText) {
  const clip = postText.length > 80 ? postText.slice(0, 77) + "…" : postText;
  const url = location.origin + MOUNT + "/";
  let text = "tried to post: “" + clip + "”\nsepcheck made me pick “" + view.name + "” for “" + word.label + "” and pass a quiz on the objections first.\n" + url;
  if ([...text].length > 300) {
    const shortClip = postText.length > 30 ? postText.slice(0, 27) + "…" : postText;
    text = "tried to post: “" + shortClip + "”\nsepcheck gate: “" + word.label + "” → " + view.name + "\n" + url;
  }
  return text;
}

function drawShareCard(word, view, postText) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createLinearGradient(0, 0, W, H);
  glow.addColorStop(0, "#171a2a");
  glow.addColorStop(1, "#0d0f14");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#d7b56d";
  ctx.font = "800 46px " + mono;
  ctx.fillText("sepcheck", 56, 90);
  ctx.fillStyle = "#8b93a3";
  ctx.font = "600 22px " + mono;
  ctx.fillText("bisks.net/sepcheck", 56, 122);

  ctx.strokeStyle = "rgba(236,235,230,0.16)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(56, 160, W - 112, H - 220);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(56, 160, W - 112, H - 220);

  ctx.fillStyle = "#ecebe6";
  ctx.font = "700 30px " + mono;
  ctx.fillText("word: “" + word.label + "”", 90, 220);

  ctx.fillStyle = "#6fb7c9";
  ctx.font = "700 26px " + mono;
  wrapText(ctx, "sense chosen: " + view.name, 90, 268, W - 180, 34);

  ctx.fillStyle = "#8b93a3";
  ctx.font = "500 20px " + mono;
  wrapText(ctx, "“" + (postText.length > 90 ? postText.slice(0, 87) + "…" : postText) + "”", 90, 340, W - 180, 28);

  ctx.fillStyle = "#6fcf97";
  ctx.font = "700 22px " + mono;
  ctx.fillText("✓ cleared the objections quiz", 90, H - 90);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = words[i] + " ";
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, curY);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

function showSuccess(word, view, postText, correctCount) {
  const shareText = buildShareText(word, view, postText);
  drawShareCard(word, view, postText);

  let html = '<h2>posted ✓</h2>';
  html += '<div class="post-preview">' + esc(postText) + "</div>";
  html += '<p class="gate-sub">cleared via sepcheck: <b>' + esc(word.label) + "</b> → <b>" + esc(view.name) + "</b> (" + correctCount + "/2 on the objections quiz).</p>";
  html += '<div class="share-row">';
  html += '<a class="btn solid" id="share-bsky" target="_blank" rel="noopener">share on bluesky</a>';
  html += '<button type="button" class="btn ghost" id="share-download">download card</button>';
  html += '<button type="button" class="btn ghost" id="share-native" style="display:none">share card</button>';
  html += "</div>";
  html += '<button type="button" class="btn ghost" id="success-close" style="margin-top:1rem">post something else</button>';

  els.successBody.innerHTML = html;
  document.getElementById("share-bsky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  document.getElementById("share-download").addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sepcheck-" + word.key.replace(/\s+/g, "-") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });
  if (canShareFiles()) {
    const nativeBtn = document.getElementById("share-native");
    nativeBtn.style.display = "";
    nativeBtn.addEventListener("click", () => {
      els.shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "sepcheck.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "sepcheck" });
        } catch (_) {}
      }, "image/png");
    });
  }
  document.getElementById("success-close").addEventListener("click", () => {
    closeAllOverlays();
    els.input.value = "";
    els.input.focus();
  });

  els.successOverlay.classList.add("on");
}

function showPlainPost(postText) {
  let html = '<h2>posted ✓</h2>';
  html += '<div class="post-preview">' + esc(postText) + "</div>";
  html += '<p class="gate-sub">no fraught words detected — posted straight through. try one of the chips above to see the gate.</p>';
  html += '<button type="button" class="btn solid" id="plain-close">post something else</button>';
  els.plainBody.innerHTML = html;
  document.getElementById("plain-close").addEventListener("click", () => {
    closeAllOverlays();
    els.input.value = "";
    els.input.focus();
  });
  els.plainOverlay.classList.add("on");
}

function handlePost() {
  const text = els.input.value.trim();
  if (!text) return;
  try {
    const word = findWord(text);
    if (word) {
      renderGate(word, text);
    } else {
      showPlainPost(text);
    }
  } catch (err) {
    // Never leave the user stuck on a dead button — fall back to a plain
    // post if the gate itself breaks on some unexpected input.
    console.error("sepcheck: gate failed, falling back to plain post", err);
    showPlainPost(text);
  }
}

els.postBtn.addEventListener("click", handlePost);

document.querySelectorAll("[data-close-overlay]").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.target === el) closeAllOverlays();
  });
});
