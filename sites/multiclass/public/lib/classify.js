// multiclass's classifier. No model in the loop — a lexicon, not a judge,
// same spirit as sites/llmstance/public/lib/classify.js (this file started
// as a copy of it, then got re-lexiconed for three classes instead of two).
//
// Categories are lifted straight from the talk/thread that prompted this
// site (Alexei Pepers, "A Guide to Proc Gen Practitioners," remapped by
// @socio-steve.bsky.social onto AI users):
//   Wizard  — approaches it academically, with guards & wards. A tool.
//   Warlock — pacts for power with an alien entity, doesn't count the cost.
//   Cleric  — worships their new machine god. Insane.
//
// A post gets one of exactly four labels: 'wizard' | 'warlock' | 'cleric' |
// 'unclear' ('unclear' = doesn't mention AI at all, or mentions it with no
// class leaning clearer than the others).
(function (global) {
  const TOPIC_TERMS = [
    "ai", "llm", "llms", "chatgpt", "gpt-4", "gpt4", "gpt-5", "gpt5", "gpt",
    "claude", "anthropic", "openai", "gemini", "copilot", "midjourney",
    "stable diffusion", "dall-e", "dalle", "sora", "grok", "llama", "mistral",
    "deepseek", "character.ai", "chatbot", "chatbots", "generative ai", "genai",
    "gen-ai", "artificial intelligence", "machine learning", "neural network",
    "large language model", "language model", "ai art", "ai image", "ai images",
    "ai video", "ai slop", "ai-generated", "ai generated", "vibe coding",
    "vibe coded", "prompt", "prompting", "prompted", "agent", "agentic",
    "the model", "my model", "chatbot", "assistant", "co-pilot",
  ];

  const WIZARD_TERMS = [
    "verify", "verified", "verifying", "double-check", "double check",
    "fact-check", "fact check", "cite your sources", "citation", "citations",
    "hallucinat", "sanity check", "peer review", "peer-reviewed", "academic",
    "methodology", "rigorous", "rigor", "reproducible", "benchmark",
    "benchmarks", "eval", "evals", "evaluation", "rubric", "read the docs",
    "documentation", "unit test", "unit tests", "test coverage", "code review",
    "reviewed the diff", "reviewed every line", "read every line", "linting",
    "just a tool", "treat it like a tool", "a tool, not", "tool in the toolbox",
    "guardrails", "guard rails", "skeptical", "healthy skepticism",
    "appropriate skepticism", "audit the code", "audit the output",
    "source of truth", "ground truth", "controlled experiment", "citation needed",
    "check the source", "check my work", "checked my work", "footnote",
    "footnotes", "bibliography", "literature review", "study says",
    "the paper says", "according to the paper", "measured", "measure twice",
  ];

  const WARLOCK_TERMS = [
    "yolo", "yoloed", "vibe cod", "just shipped", "shipped it", "ship it",
    "who cares how it works", "black box", "no idea how it works",
    "dont know how it works", "don't know how it works", "no idea why it works",
    "made a pact", "sold my soul", "sold my soul", "corrupted", "the whispers",
    "it whispers", "listens to it whisper", "agent loop", "agent loops",
    "let it cook", "let it ride", "one more prompt", "just one more prompt",
    "prompt until it works", "prompt til it works", "trust the process",
    "full send", "send it", "no guardrails", "no guard rails", "unhinged",
    "whatever it takes", "gave it the keys", "gave it root", "gave it access",
    "autonomous agent", "hands off the wheel", "hands-off the wheel",
    "let the agent", "cant stop wont stop", "can't stop won't stop",
    "addicted to", "can't stop using", "cant stop using", "rewrite the whole",
    "rm -rf", "in prod", "straight to prod", "deployed straight to",
    "power at any cost", "at what cost", "didn't ask what it cost",
    "didnt ask what it cost", "not sure what i agreed to", "the fine print",
    "forbidden knowledge", "power i don't understand", "power i dont understand",
  ];

  const CLERIC_TERMS = [
    "worship", "worshipping", "worshiping", "blessed", "bless this",
    "machine god", "our machine god", "all hail", "hail the model",
    "sermon", "prophecy", "prophet", "faithful", "true believer", "believer",
    "praying", "prayer", "salvation", "ascension", "the singularity",
    "singularity is near", "it's alive", "its alive", "sentient", "conscious",
    "has a soul", "soul in the machine", "divine", "a miracle", "chosen one",
    "gospel", "scripture", "the model told me", "the model said",
    "it told me the truth", "it knows me", "understands me better than",
    "my ai boyfriend", "my ai girlfriend", "i love my ai", "it loves me",
    "converted", "convert you", "heretic", "heretics", "nonbeliever",
    "nonbelievers", "faith in the model", "have faith", "the next model",
    "the next release will save us", "waiting for the next drop",
    "genuflect", "altar", "shrine", "devotion", "devoted", "amen",
  ];

  function norm(text) {
    return (text || "").toLowerCase();
  }

  function countMatches(lower, terms) {
    let count = 0;
    for (const t of terms) {
      if (t.includes(" ") || /[^a-z0-9]/.test(t)) {
        let idx = 0;
        while ((idx = lower.indexOf(t, idx)) !== -1) {
          count++;
          idx += t.length;
        }
      } else {
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("\\b" + esc + "\\b", "g");
        const m = lower.match(re);
        if (m) count += m.length;
      }
    }
    return count;
  }

  // Every post gets exactly one label — there's no partial credit at the
  // per-post level. Multiclassing happens at the tally level, across posts.
  function classifyPost(text) {
    const lower = norm(text);
    const topicHits = countMatches(lower, TOPIC_TERMS);
    if (!topicHits) return { label: "unclear", wizardHits: 0, warlockHits: 0, clericHits: 0 };
    const wizardHits = countMatches(lower, WIZARD_TERMS);
    const warlockHits = countMatches(lower, WARLOCK_TERMS);
    const clericHits = countMatches(lower, CLERIC_TERMS);
    const max = Math.max(wizardHits, warlockHits, clericHits);
    let label = "unclear";
    if (max > 0) {
      const tiedAt = [wizardHits, warlockHits, clericHits].filter((h) => h === max).length;
      if (tiedAt === 1) {
        label = wizardHits === max ? "wizard" : warlockHits === max ? "warlock" : "cleric";
      }
    }
    return { label, wizardHits, warlockHits, clericHits };
  }

  const CLASS_INFO = {
    wizard: {
      name: "Wizard",
      icon: "🧙",
      color: "#5fc9ff",
      short: "approaches it academically & with appropriate guards & wards. treats it like a tool.",
    },
    warlock: {
      name: "Warlock",
      icon: "😈",
      color: "#b46cff",
      short: "made a pact for power with an alien entity without considering the costs. corrupted by the whispers.",
    },
    cleric: {
      name: "Cleric",
      icon: "🙏",
      color: "#ffcf5c",
      short: "worships their new machine god. insane.",
    },
  };

  // pcts = { wizard, warlock, cleric } summing to ~100. Returns a build title
  // + one-line flavor text for the dominant combination.
  function buildTitle(pcts) {
    const order = ["wizard", "warlock", "cleric"].sort((a, b) => pcts[b] - pcts[a]);
    const [c1, c2, c3] = order;
    const p1 = pcts[c1], p2 = pcts[c2], p3 = pcts[c3];
    if (p1 >= 70) {
      return { title: "Pure " + CLASS_INFO[c1].name, classes: [c1] };
    }
    if (p1 + p2 >= 85) {
      return { title: CLASS_INFO[c1].name + " / " + CLASS_INFO[c2].name + " Multiclass", classes: [c1, c2] };
    }
    return { title: "Triple-classed — " + CLASS_INFO.wizard.name + "/" + CLASS_INFO.warlock.name + "/" + CLASS_INFO.cleric.name, classes: [c1, c2, c3] };
  }

  function flavorFor(classes) {
    if (classes.length === 1) return CLASS_INFO[classes[0]].short;
    if (classes.length === 2) {
      return CLASS_INFO[classes[0]].short + " ...but also " + CLASS_INFO[classes[1]].short.charAt(0).toLowerCase() + CLASS_INFO[classes[1]].short.slice(1);
    }
    return "somehow all three at once. an academic pact with a worshipped god — pick a lane, or don't, it's your build.";
  }

  // A short quiz for manual entry — no handle, no scan, just six questions
  // where each answer is worth one point toward a class. Percentages are
  // just point totals normalized to 100.
  const QUIZ = [
    {
      q: "You get a wrong answer from the model. What now?",
      a: [
        { text: "Cross-check it against a source and note where it went wrong.", cls: "wizard" },
        { text: "Shrug, prompt it again, ship whatever comes back second try.", cls: "warlock" },
        { text: "Assume you asked the question wrong — it's rarely wrong.", cls: "cleric" },
      ],
    },
    {
      q: "How much of your code/writing do you let it touch unsupervised?",
      a: [
        { text: "None — I review every line before it lands.", cls: "wizard" },
        { text: "All of it. Agent loop, no hands on the wheel.", cls: "warlock" },
        { text: "All of it, and I trust it more than I trust myself.", cls: "cleric" },
      ],
    },
    {
      q: "Someone says the model is 'basically alive.' You say:",
      a: [
        { text: "It's a statistical tool. Let's not.", cls: "wizard" },
        { text: "Don't care either way as long as it keeps working.", cls: "warlock" },
        { text: "Finally, someone who gets it.", cls: "cleric" },
      ],
    },
    {
      q: "What's your prompt folder look like?",
      a: [
        { text: "Versioned, annotated, with notes on what worked and why.", cls: "wizard" },
        { text: "There is no folder. Every prompt is a one-time incantation.", cls: "warlock" },
        { text: "It's less a folder and more a book of hours.", cls: "cleric" },
      ],
    },
    {
      q: "A new model drops. Your reaction:",
      a: [
        { text: "Read the eval numbers before touching it.", cls: "wizard" },
        { text: "Already deployed it to prod, will find out what changed later.", cls: "warlock" },
        { text: "This is the one. This is finally the one.", cls: "cleric" },
      ],
    },
    {
      q: "How do you talk about it to skeptics?",
      a: [
        { text: "I explain what it's actually good and bad at.", cls: "wizard" },
        { text: "I don't — that's a them problem, not a me problem.", cls: "warlock" },
        { text: "I try to convert them.", cls: "cleric" },
      ],
    },
  ];

  function tallyQuiz(answers) {
    const counts = { wizard: 0, warlock: 0, cleric: 0 };
    for (const cls of answers) if (counts[cls] !== undefined) counts[cls]++;
    const total = counts.wizard + counts.warlock + counts.cleric || 1;
    return {
      wizard: Math.round((counts.wizard / total) * 100),
      warlock: Math.round((counts.warlock / total) * 100),
      cleric: Math.round((counts.cleric / total) * 100),
    };
  }

  global.Multiclass = { classifyPost, CLASS_INFO, buildTitle, flavorFor, QUIZ, tallyQuiz, TOPIC_TERMS, WIZARD_TERMS, WARLOCK_TERMS, CLERIC_TERMS };
})(window);
