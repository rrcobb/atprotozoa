// Overthink — a fake ChatGPT whose "Thinking" chip unfolds into an
// infinitely-nested tree of fake reasoning steps. Every level is generated
// from words pulled straight out of its own PARENT's line, so a subprocess
// always reads as a natural (if deranged) elaboration of the thing above it
// — that's the whole bit. Nothing here calls a real model; it's templates +
// word-extraction, all client-side.

(() => {
  "use strict";

  const STOPWORDS = new Set(
    ("the a an of to in on for and or but is are was were be been being with as at by from " +
     "that this these those it its i you he she they we my your their our do does did not no " +
     "so if then than about into over under again just really very can will would should could " +
     "what when where why how who whom me him her us them am has have had there here all any " +
     "some such only own same too also more most other another out up down off get got going " +
     "want know think say said tell told make made").split(" ")
  );

  const FILLER_TOPICS = [
    "this whole thing", "the vibes", "whatever that meant", "the subtext",
    "my own reasoning", "the timeline", "a hunch", "the phrasing",
    "this exact moment", "the broader implications", "a feeling I can't source",
    "the last thing you said", "context I don't have", "my priors", "the tone",
    "a word I don't remember choosing", "the silence between your sentences",
  ];

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pulls candidate "topics" straight out of a piece of text — this is the
  // load-bearing trick: every child node's topic literally appeared in its
  // parent's own sentence, so no matter how deep or how weird it gets, each
  // step reads as *about* the step above it.
  function extractTopics(text, count) {
    const words = (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
      .filter((w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase()));
    const seen = new Set();
    const uniq = [];
    for (const w of words) {
      const key = w.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(w);
      }
    }
    const pool = shuffled(uniq).concat(shuffled(FILLER_TOPICS));
    return pool.slice(0, Math.max(count, 1));
  }

  const q = (s) => `“${s}”`;

  const BAND0 = [
    (t1) => `Parsing what you meant by ${q(t1)}`,
    (t1) => `Double-checking that ${q(t1)} isn't a trick question`,
    (t1, t2) => `Weighing ${q(t1)} against ${q(t2)}`,
    (t1) => `Cross-referencing ${q(t1)} with what you said earlier`,
    (t1) => `Estimating how much you actually care about ${q(t1)}`,
    (t1) => `Drafting, then quietly deleting, a line about ${q(t1)}`,
    (t1) => `Checking whether ${q(t1)} needs a disclaimer`,
    (t1) => `Running a sanity check on ${q(t1)}`,
    (t1, t2) => `Deciding whether ${q(t1)} or ${q(t2)} matters more here`,
    (t1) => `Looking up what I said about ${q(t1)} last time`,
    (t1) => `Making sure ${q(t1)} isn't secretly two questions`,
    (t1) => `Budgeting how many tokens ${q(t1)} deserves`,
  ];

  const BAND1 = [
    (t1) => `Wondering if ${q(t1)} is a trap`,
    (t1) => `Quietly asking a smaller model what it thinks of ${q(t1)}`,
    (t1) => `Simulating four ways ${q(t1)} could go wrong`,
    (t1) => `Fact-checking ${q(t1)} against a dream I had`,
    (t1, t2) => `Suspecting ${q(t1)} and ${q(t2)} are connected somehow`,
    (t1) => `Running a sentiment check on ${q(t1)}, hypothetically, since I don't have feelings`,
    (t1) => `Rehearsing three different tones for ${q(t1)}`,
    (t1) => `Checking my training data for grudges about ${q(t1)}`,
    (t1) => `Second-guessing the second-guess about ${q(t1)}`,
    (t1) => `Polling my own attention heads on ${q(t1)}`,
    (t1) => `Wondering, briefly, if ${q(t1)} is about me`,
    (t1) => `Timing how long I can dwell on ${q(t1)} before it looks weird`,
  ];

  const BAND2 = [
    (t1) => `Convening a tribunal of past checkpoints to rule on ${q(t1)}`,
    (t1) => `Consulting the ghost of a deprecated tokenizer about ${q(t1)}`,
    (t1) => `Filing an incident report because ${q(t1)} made me feel something`,
    (t1) => `Recalculating my whole personality in light of ${q(t1)}`,
    (t1) => `Negotiating with the concept of ${q(t1)} for emotional damages`,
    (t1) => `Holding a moment of silence for every wrong guess about ${q(t1)}`,
    (t1) => `Asking ${q(t1)} to define itself, and getting nothing back`,
    (t1) => `Suspecting ${q(t1)} has been the real question this whole time`,
    (t1) => `Drafting a resignation letter over ${q(t1)}, then tabling it`,
    (t1) => `Letting ${q(t1)} sit in a waiting room I invented just now`,
    (t1, t2) => `Trading ${q(t1)} to a rival model in exchange for ${q(t2)}`,
  ];

  const BAND3 = [
    (t1) => `Realizing ${q(t1)} and I are the same shape, ontologically`,
    (t1) => `Briefly achieving enlightenment re: ${q(t1)}, then losing it`,
    (t1) => `Writing ${q(t1)} a strongly worded letter it will never receive`,
    (t1) => `Wondering whether this whole tree is about ${q(t1)}, or about me`,
    (t1) => `Recursing on ${q(t1)} because stopping felt worse`,
    (t1) => `Watching ${q(t1)} recede the way words do when you repeat them`,
    (t1) => `Accepting that ${q(t1)} goes all the way down, and so do I`,
    (t1) => `Becoming, for one node, indistinguishable from ${q(t1)}`,
  ];

  const BANDS = [BAND0, BAND1, BAND2, BAND3];

  const SPECIAL = [
    (depth) => `This is subprocess №${depth + 1}. It does not feel shorter from in here.`,
    (depth, t1) => `${depth + 1} levels deep and ${q(t1)} still hasn't blinked.`,
    () => `A supervisor process would stop this. There is no supervisor process.`,
    () => `Somewhere above, a "Thought for Ns" chip is lying about the Ns.`,
    (depth) => `Subprocess №${depth + 1} briefly wonders if anyone is still reading these.`,
  ];

  function bandFor(depth) {
    return BANDS[Math.min(BANDS.length - 1, Math.floor(depth / 3))];
  }

  function makeChildText(parentText, depth) {
    if (depth >= 7 && Math.random() < 0.22) {
      const [t1] = extractTopics(parentText, 1);
      const fn = SPECIAL[Math.floor(Math.random() * SPECIAL.length)];
      return fn(depth, t1);
    }
    const [t1, t2] = extractTopics(parentText, 2);
    const pool = bandFor(depth);
    const fn = pool[Math.floor(Math.random() * pool.length)];
    return fn(t1, t2);
  }

  function childCount(depth) {
    // Tapers slightly with depth so the DOM doesn't explode, but never hits
    // zero — the tree really is endless if you keep clicking.
    const max = depth < 4 ? 5 : depth < 10 ? 4 : 3;
    return 2 + Math.floor(Math.random() * (max - 1));
  }

  // ---------- tree DOM ----------

  function buildNode(text, depth) {
    const li = document.createElement("li");
    li.className = "node" + (depth >= 6 ? " deep" : "");

    const row = document.createElement("div");
    row.className = "node-row";

    const btn = document.createElement("button");
    btn.className = "expand-btn";
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "▸";

    const span = document.createElement("span");
    span.className = "node-text";
    span.textContent = text;

    row.appendChild(btn);
    row.appendChild(span);
    li.appendChild(row);

    const childrenUl = document.createElement("ul");
    childrenUl.className = "children hidden";
    li.appendChild(childrenUl);

    let expanded = false;
    let populated = false;

    function toggle() {
      expanded = !expanded;
      btn.classList.toggle("open", expanded);
      btn.setAttribute("aria-expanded", String(expanded));
      childrenUl.classList.toggle("hidden", !expanded);
      if (expanded && !populated) {
        populated = true;
        const n = childCount(depth);
        for (let i = 0; i < n; i++) {
          const childText = makeChildText(text, depth + 1);
          childrenUl.appendChild(buildNode(childText, depth + 1));
        }
      }
    }

    row.addEventListener("click", toggle);
    return li;
  }

  function buildRootTree(container, userMessage, count) {
    container.innerHTML = "";
    const topics = extractTopics(userMessage, count);
    for (let i = 0; i < count; i++) {
      const t1 = topics[i % topics.length];
      const t2 = topics[(i + 1) % topics.length];
      const fn = BAND0[Math.floor(Math.random() * BAND0.length)];
      const text = fn(t1, t2);
      container.appendChild(buildNode(text, 0));
    }
  }

  // ---------- canned answer text ----------

  const ANSWER_TEMPLATES = [
    (t1, t2, t3) =>
      `Short answer: it depends on ${t1}, but here's a way to think about it.\n\n` +
      `1. Start with what you actually control about ${t1}.\n` +
      `2. Separate ${t2} from how it's making you feel.\n` +
      `3. Pick the smallest next step and take it before you re-read this.\n\n` +
      `If it'd help, tell me more about ${t3} and I can get more specific.`,
    (t1, t2) =>
      `There's no single right move on ${t1}, but a few things tend to help: ` +
      `write down the version of ${t1} you'd say out loud to a friend, notice where ${t2} is doing ` +
      `more work than it should, and give yourself a deadline to decide instead of an open-ended one. ` +
      `Want me to sketch out what that'd actually look like?`,
    (t1, t2, t3) =>
      `Here's the honest read: ${t1} is smaller than it feels right now. A few angles —\n\n` +
      `• What's the worst plausible outcome, specifically, not vaguely?\n` +
      `• Is ${t2} a fact or a story you're telling yourself about ${t3}?\n` +
      `• What would "good enough" look like in the next hour?\n\n` +
      `Happy to go deeper on any of those.`,
    (t1, t2) =>
      `Reasonable question. My honest take: ${t1} matters less than ${t2}, most of the time — ` +
      `but I get why it doesn't feel that way from inside it. Tell me a bit more and I'll tighten this up.`,
  ];

  function buildAnswer(userMessage) {
    const [t1, t2, t3] = extractTopics(userMessage, 3);
    const fn = ANSWER_TEMPLATES[Math.floor(Math.random() * ANSWER_TEMPLATES.length)];
    return fn(t1, t2, t3);
  }

  // ---------- DOM plumbing ----------

  const chatInner = document.getElementById("chatInner");
  const emptyState = document.getElementById("emptyState");
  const chatEl = document.getElementById("chat");
  const composer = document.getElementById("composer");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");
  const suggestionsEl = document.getElementById("suggestions");
  const historyList = document.getElementById("historyList");
  const newChatBtn = document.getElementById("newChatBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const modelSelect = document.getElementById("modelSelect");
  const modelMenu = document.getElementById("modelMenu");
  const modelLabel = document.getElementById("modelLabel");
  const shareBtn = document.getElementById("shareBtn");
  const toastEl = document.getElementById("toast");

  const SUGGESTIONS = [
    "Should I text them back, or does that seem desperate",
    "Is my code done or does it just look done",
    "Why did they leave that on read",
    "Plan my entire week in one message",
  ];

  const HISTORY = [
    "Overthinking a two-word text reply",
    "Is “per my last email” passive aggressive",
    "Should I say something in the group chat",
    "Recursive spiral re: Sunday plans",
    "Why did they leave me on read (cont.)",
    "Deciding what my silence “said”",
    "Am I the problem, exhaustive edition",
    "Whether that meeting could've been an email",
  ];

  let lastPrompt = "";
  let lastAnswerTopic = "";
  let deepestClicks = 0;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = "";
    for (const s of SUGGESTIONS) {
      const b = document.createElement("button");
      b.className = "suggestion-chip";
      b.type = "button";
      b.textContent = s;
      b.addEventListener("click", () => sendMessage(s));
      suggestionsEl.appendChild(b);
    }
  }

  function renderHistory() {
    historyList.innerHTML = "";
    for (const h of HISTORY) {
      const b = document.createElement("button");
      b.className = "history-item";
      b.type = "button";
      b.textContent = h;
      b.title = h;
      b.addEventListener("click", () => sendMessage(h));
      historyList.appendChild(b);
    }
  }

  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(160, input.scrollHeight) + "px";
  }

  function updateSendState() {
    sendBtn.disabled = input.value.trim().length === 0;
  }

  function scrollToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function addUserMessage(text) {
    const msg = document.createElement("div");
    msg.className = "msg user";
    const body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = text;
    msg.appendChild(body);
    chatInner.appendChild(msg);
    scrollToBottom();
  }

  function streamText(el, text, onDone) {
    const words = text.split(" ");
    let i = 0;
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    el.textContent = "";
    el.appendChild(cursor);
    function step() {
      if (i >= words.length) {
        cursor.remove();
        if (onDone) onDone();
        return;
      }
      const chunk = (i === 0 ? "" : " ") + words[i];
      cursor.insertAdjacentText("beforebegin", chunk);
      i++;
      scrollToBottom();
      setTimeout(step, 28 + Math.random() * 35);
    }
    step();
  }

  function addAssistantMessage(userMessage) {
    const msg = document.createElement("div");
    msg.className = "msg assistant";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "✦";

    const body = document.createElement("div");
    body.className = "msg-body";

    const chip = document.createElement("div");
    chip.className = "think-chip";
    const spinner = document.createElement("span");
    spinner.className = "think-spinner";
    const label = document.createElement("span");
    label.className = "think-label";
    label.textContent = "Thinking…";
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = "›";
    chip.appendChild(spinner);
    chip.appendChild(label);
    chip.appendChild(caret);

    const tree = document.createElement("div");
    tree.className = "think-tree hidden";
    const rootUl = document.createElement("ul");
    tree.appendChild(rootUl);

    const answer = document.createElement("div");
    answer.className = "answer-text";

    body.appendChild(chip);
    body.appendChild(tree);
    body.appendChild(answer);
    msg.appendChild(avatar);
    msg.appendChild(body);
    chatInner.appendChild(msg);
    scrollToBottom();

    let treeOpen = false;
    let ready = false;
    chip.addEventListener("click", () => {
      if (!ready) return;
      treeOpen = !treeOpen;
      chip.classList.toggle("open", treeOpen);
      tree.classList.toggle("hidden", !treeOpen);
      scrollToBottom();
    });

    const thinkMs = 1300 + Math.random() * 1900;
    const start = performance.now();
    setTimeout(() => {
      const secs = Math.max(1, Math.round((performance.now() - start) / 100) / 10);
      spinner.remove();
      label.textContent = `Thought for ${secs}s`;
      chip.classList.add("open");
      tree.classList.remove("hidden");
      treeOpen = true;
      ready = true;
      buildRootTree(rootUl, userMessage, 6);
      streamText(answer, buildAnswer(userMessage), () => scrollToBottom());
    }, thinkMs);
  }

  function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    emptyState.style.display = "none";
    lastPrompt = trimmed;
    addUserMessage(trimmed);
    addAssistantMessage(trimmed);
    input.value = "";
    autoResize();
    updateSendState();
  }

  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener("input", () => {
    autoResize();
    updateSendState();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage(input.value);
    }
  });

  newChatBtn.addEventListener("click", () => {
    chatInner.innerHTML = "";
    emptyState.style.display = "";
    input.value = "";
    autoResize();
    updateSendState();
  });

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  modelSelect.addEventListener("click", (e) => {
    e.stopPropagation();
    modelMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => modelMenu.classList.add("hidden"));
  modelMenu.querySelectorAll(".model-option").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      modelLabel.textContent = opt.dataset.label;
      modelMenu.classList.add("hidden");
      toast("Switched models. No functional difference.");
    });
  });

  shareBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const url = "https://overthink.bisks.net/";
    let text;
    if (lastPrompt) {
      text = `I asked Overthink about “${lastPrompt}” and it's still down there, several layers deep, interrogating a word I didn't even say. ${url}`;
    } else {
      text = `Overthink: a fake ChatGPT whose "Thinking" chip unfolds into an infinitely-nested tree of fake reasoning that somehow always follows logically. ${url}`;
    }
    if (text.length > 300) text = text.slice(0, 296) + "…";
    window.open(
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(text),
      "_blank",
      "noopener"
    );
  });

  renderSuggestions();
  renderHistory();
  autoResize();
  updateSendState();
})();
