// The roster: every entry is an AI model release that plausibly took up a
// "slot" once you'd formed enough of an opinion about its personality to
// have a take on it. Dates are month-precision and approximate — this is a
// vibes chart in the shape of a METR chart, not a METR chart.
const MODELS = [
  { id: "gpt3", lab: "OpenAI", name: "GPT-3", date: "2020-06-11", blurb: "back when it just seemed autocomplete-y and safe" },
  { id: "copilot", lab: "Microsoft", name: "GitHub Copilot", date: "2021-06-29", blurb: "finishes your function before you've named the variable" },
  { id: "llama1", lab: "Meta", name: "LLaMA", date: "2023-02-24", blurb: "leaked before it even shipped" },
  { id: "chatgpt", lab: "OpenAI", name: "ChatGPT", date: "2022-11-30", blurb: "your first situationship with a chatbot" },
  { id: "claude1", lab: "Anthropic", name: "Claude", date: "2023-03-14", blurb: "polite to the point of suspicious" },
  { id: "gpt4", lab: "OpenAI", name: "GPT-4", date: "2023-03-14", blurb: "insufferably capable, footnotes everything" },
  { id: "bard", lab: "Google", name: "Bard", date: "2023-03-21", blurb: "everyone's ex, RIP" },
  { id: "claude2", lab: "Anthropic", name: "Claude 2", date: "2023-07-11", blurb: "apologizes before it disagrees with you" },
  { id: "llama2", lab: "Meta", name: "Llama 2", date: "2023-07-18", blurb: "open-weight and proud of it" },
  { id: "mistral7b", lab: "Mistral", name: "Mistral 7B", date: "2023-09-27", blurb: "small, French, weirdly good at this" },
  { id: "grok1", lab: "xAI", name: "Grok", date: "2023-11-04", blurb: "unhinged group-chat energy, on purpose" },
  { id: "gemini1", lab: "Google", name: "Gemini 1.0", date: "2023-12-06", blurb: "rebranded and hoped you wouldn't notice" },
  { id: "mixtral", lab: "Mistral", name: "Mixtral 8x7B", date: "2023-12-11", blurb: "eight little guys in a trenchcoat" },
  { id: "gemini15", lab: "Google", name: "Gemini 1.5 Pro", date: "2024-02-15", blurb: "read your entire codebase and judged it silently" },
  { id: "mistrallarge", lab: "Mistral", name: "Mistral Large", date: "2024-02-26", blurb: "finally competing on vibes, not just size" },
  { id: "claude3", lab: "Anthropic", name: "Claude 3", date: "2024-03-04", blurb: "quietly became someone's favorite" },
  { id: "llama3", lab: "Meta", name: "Llama 3", date: "2024-04-18", blurb: "the friend who insists everything should be self-hosted" },
  { id: "gpt4o", lab: "OpenAI", name: "GPT-4o", date: "2024-05-13", blurb: "unnervingly chipper, calls you 'friend'" },
  { id: "deepseekv2", lab: "DeepSeek", name: "DeepSeek-V2", date: "2024-05-06", blurb: "quietly very good, nobody noticed yet" },
  { id: "claude35", lab: "Anthropic", name: "Claude 3.5 Sonnet", date: "2024-06-20", blurb: "the one people started calling 'they'" },
  { id: "llama31", lab: "Meta", name: "Llama 3.1", date: "2024-07-23", blurb: "405 billion parameters of main character energy" },
  { id: "grok2", lab: "xAI", name: "Grok-2", date: "2024-08-13", blurb: "somehow more online than you" },
  { id: "o1", lab: "OpenAI", name: "o1", date: "2024-09-12", blurb: "thinks in secret before it'll deign to answer" },
  { id: "geminiflash", lab: "Google", name: "Gemini 2.0 Flash", date: "2024-12-11", blurb: "fast, a little feral" },
  { id: "deepseekv3", lab: "DeepSeek", name: "DeepSeek-V3", date: "2024-12-26", blurb: "the one that made everyone recheck the pricing page" },
  { id: "deepseekr1", lab: "DeepSeek", name: "DeepSeek-R1", date: "2025-01-20", blurb: "thinks out loud, at length, for free" },
  { id: "o3mini", lab: "OpenAI", name: "o3-mini", date: "2025-01-31", blurb: "small but will still show its work" },
  { id: "grok3", lab: "xAI", name: "Grok-3", date: "2025-02-17", blurb: "answers everything like it's mid-argument" },
  { id: "claude37", lab: "Anthropic", name: "Claude 3.7 Sonnet", date: "2025-02-24", blurb: "shows its reasoning, whether you wanted it or not" },
  { id: "gpt45", lab: "OpenAI", name: "GPT-4.5", date: "2025-02-27", blurb: "the expensive one nobody quite explains" },
  { id: "gemini25", lab: "Google", name: "Gemini 2.5 Pro", date: "2025-03-25", blurb: "finally the one people stopped apologizing for using" },
  { id: "llama4", lab: "Meta", name: "Llama 4", date: "2025-04-05", blurb: "still arguing about the name in the group chat" },
  { id: "claude4", lab: "Anthropic", name: "Claude 4", date: "2025-05-22", blurb: "graduated to having actual opinions" },
  { id: "grok4", lab: "xAI", name: "Grok-4", date: "2025-07-09", blurb: "hasn't slept, won't say why" },
  { id: "gpt5", lab: "OpenAI", name: "GPT-5", date: "2025-08-07", blurb: "confident it fixed everything wrong with the last one" },
].sort((a, b) => a.date.localeCompare(b.date));

// A relatable starting selection: the household names, not the whole roster —
// so the chart isn't empty on first load, but it isn't maxed out either.
const DEFAULT_SELECTION = ["chatgpt", "gpt4", "claude35", "gemini15", "grok2"];

// The nested Dunbar layers, plotted as reference lines on the log axis.
const DUNBAR_LAYERS = [
  { n: 5, label: "support clique" },
  { n: 15, label: "sympathy group" },
  { n: 50, label: "band" },
  { n: 150, label: "Dunbar's number" },
];

// Categories of real humans you can check off to "forget," each padding out
// your effective cap above the base 150 — because if the slot's freed up
// anyway, it might as well go to an AI model. Slot estimates are vibes, not
// science, same as the rest of this chart.
const FORGET_CATEGORIES = [
  { id: "old-school-friends", label: "old school friends you've lost touch with", slots: 20 },
  { id: "work-last-job", label: "work buddies from your last job", slots: 15 },
  { id: "work-current-job", label: "work buddies at your current job", slots: 12 },
  { id: "distant-family", label: "distant family (the ones you see at reunions)", slots: 25 },
  { id: "close-family", label: "close family", slots: 8 },
  { id: "kids", label: "kids", slots: 10 },
];
