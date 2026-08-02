// llmstance's classifier. No model in the loop — a lexicon, not a judge, same
// spirit as sites/epistemics: "no LLM behind it, just a very literal-minded
// grep." A post gets one of exactly three labels:
//   'pro'     — mentions AI/LLMs and leans positive
//   'anti'    — mentions AI/LLMs and leans negative
//   'unclear' — doesn't mention AI/LLMs at all, OR mentions it with no clear lean
(function (global) {
  const TOPIC_TERMS = [
    "ai", "llm", "llms", "chatgpt", "gpt-4", "gpt4", "gpt-5", "gpt5", "gpt",
    "claude", "anthropic", "openai", "gemini", "copilot", "midjourney",
    "stable diffusion", "dall-e", "dalle", "sora", "grok", "llama", "mistral",
    "deepseek", "character.ai", "chatbot", "chatbots", "generative ai", "genai",
    "gen-ai", "artificial intelligence", "machine learning", "neural network",
    "large language model", "language model", "ai art", "ai image", "ai images",
    "ai video", "ai slop", "ai-generated", "ai generated", "vibe coding",
    "vibe coded", "prompt engineering", "agentic", "clanker", "clankers",
    "robot overlords", "ai bro", "ai bros",
  ];

  const PRO_TERMS = [
    "game changer", "gamechanger", "changed my workflow", "actually useful",
    "so useful", "genuinely useful", "love using", "can't live without",
    "cant live without", "underrated", "genuinely impressive", "so impressive",
    "future is here", "bullish", "obsessed with", "huge fan of",
    "day one adopter", "early adopter", "best tool", "life changing",
    "life-changing", "saved me hours", "saved me so much time",
    "love", "loved", "amazing", "incredible", "impressive", "impressed",
    "useful", "helpful", "brilliant", "fantastic", "excellent", "revolutionary",
    "exciting", "promising", "powerful", "efficient", "remarkable",
    "fascinating", "favorite", "favourite", "genius", "great",
  ];

  const ANTI_TERMS = [
    "kill it with fire", "hate ai", "hate llms", "stealing art",
    "stealing from artists", "plagiarism machine", "theft machine",
    "dead internet", "enshittification", "enshittify", "water usage",
    "environmental cost", "confidently wrong", "no soul", "replace artists",
    "replace writers", "replace us", "job loss", "regulate ai", "ban ai",
    "luddite and proud", "techbro slop", "ai slop", "not impressed",
    "not a fan", "dont trust", "don't trust", "cant trust", "can't trust",
    "wont use", "won't use", "no thanks", "over it", "sick of", "tired of",
    "slop", "garbage", "trash", "worthless", "useless", "disgusting", "gross",
    "creepy", "dystopian", "nightmare", "annoying", "sucks", "stupid", "dumb",
    "lazy", "cheating", "soulless", "grift", "scam", "ponzi", "overhyped",
    "overrated", "bubble", "wrong", "worst", "sickening", "hallucinates",
    "hallucinating", "hallucination", "ugh", "clanker", "clankers",
  ];

  function norm(text) {
    return (text || "").toLowerCase();
  }

  function countMatches(lower, terms) {
    let count = 0;
    for (const t of terms) {
      if (t.includes(" ")) {
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

  // Every post gets exactly one label — there is no fourth bucket.
  function classifyPost(text) {
    const lower = norm(text);
    const topicHits = countMatches(lower, TOPIC_TERMS);
    if (!topicHits) return { label: "unclear", topicHits: 0, proHits: 0, antiHits: 0 };
    const proHits = countMatches(lower, PRO_TERMS);
    const antiHits = countMatches(lower, ANTI_TERMS);
    const label = proHits === antiHits ? "unclear" : proHits > antiHits ? "pro" : "anti";
    return { label, topicHits, proHits, antiHits };
  }

  function netLabel(proCount, antiCount) {
    const relevant = proCount + antiCount;
    const net = relevant ? (proCount - antiCount) / relevant : 0;
    if (net >= 0.6) return "Pro-LLM, no notes.";
    if (net >= 0.2) return "Leans Pro-LLM.";
    if (net > -0.2) return "Dead even — genuinely torn.";
    if (net > -0.6) return "Leans Anti-LLM.";
    return "Anti-LLM, hard line.";
  }

  function verdictFor(proCount, antiCount, unclearCount) {
    const total = proCount + antiCount + unclearCount;
    if (total === 0) return "no posts to go on.";
    const relevant = proCount + antiCount;
    if (relevant === 0) return "never really weighed in — no clear stance either way.";
    const base = netLabel(proCount, antiCount);
    if (relevant < 3) return base + " (small sample, take it with a grain of salt.)";
    return base;
  }

  global.LLMStance = { classifyPost, netLabel, verdictFor, TOPIC_TERMS, PRO_TERMS, ANTI_TERMS };
})(window);
