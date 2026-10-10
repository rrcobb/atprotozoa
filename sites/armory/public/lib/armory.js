// Deterministic generator for the 999 grenades. Same seed, same armory, so a
// grenade's number is a stable permalink (#123) across visits and devices.

export const CATS = {
  tech: "tech",
  food: "food",
  work: "work",
  lang: "language",
  culture: "culture",
  life: "life",
};

// How many of the 999 come from each category (sums to 999). Each pool below
// has more candidates than its quota; the quota is a product decision to keep
// the armory varied rather than 40% tech.
const QUOTA = { tech: 200, food: 160, work: 160, lang: 160, culture: 160, life: 159 };

const TECH = ["Kubernetes", "the blockchain", "microservices", "a spreadsheet", "Docker", "GraphQL", "a monorepo", "TypeScript", "Excel", "email", "a wiki", "Slack", "a cron job", "SQL", "Linux", "a PDF", "the cloud", "YAML", "a group chat", "RSS", "a QR code", "Git", "an API", "a feed algorithm", "a browser tab", "JSON", "a to-do list", "vibe coding", "a dashboard", "a chatbot"];
const TECH2 = ["a very expensive text file", "a shell script with a pitch deck", "a database nobody admits is a database", "mainframes with better branding", "a calendar with extra steps", "a filing cabinet that got funded", "an if-statement wearing a trench coat", "a fax machine for people who say 'async'"];

const FOODS = ["a hot dog", "cereal", "a pop-tart", "pizza", "a burrito", "a pancake", "soup", "a dumpling", "a taco", "a salad", "a calzone", "a milkshake", "toast", "a sushi roll", "a bagel", "ketchup", "a pie", "oatmeal", "a quesadilla", "gazpacho", "a smoothie", "lasagna", "a waffle", "a corn dog", "a banana"];
const FOODCLASS = ["a sandwich", "a soup", "a drink", "a salad", "a casserole", "a dessert wearing a disguise", "a breakfast food and I will die on this", "technically a sauce"];

const PRACTICES = ["standups", "open-plan offices", "story points", "the weekly sync", "unlimited PTO", "performance reviews", "return-to-office", "a 'quick call'", "OKRs", "retros", "Jira", "thought leadership", "a four-day week", "networking", "hackathons", "all-hands meetings", "the org chart", "mentorship", "a LinkedIn post", "a 'circle back'"];
const WORKTAKE = ["are theatre for people who don't build things", "exist so managers can see you being busy", "work fine; people are what ruin them", "would be a one-line email if anyone were brave", "are secretly the whole job", "peaked the day they were invented", "are fine, and we only hate them because we're tired", "are a tax on the competent"];

const WORDS = ["literally", "irregardless", "the Oxford comma", "'whom'", "'y'all'", "emoji", "the semicolon", "ellipses...", "'moist'", "the word 'content'", "'per my last email'", "'no worries'", "lowercase-only posting", "'um, actually'", "the em dash", "the passive voice", "all caps", "'bussin'", "a typo", "slang"];
const WORDTAKE = ["is fine and you're being weird about it", "is the only honest punctuation we have left", "should be banned, and you know why", "was never the problem", "is a skill issue, not a language issue", "is how every language improves", "is just a vibe with a grammar", "is doing more work than the whole alphabet"];

const MEDIA = ["the sitcom", "the album", "the novel", "the open-world game", "the podcast", "the cinematic universe", "the sequel", "the reboot", "the prestige drama", "the video essay", "the movie trailer", "the indie darling", "the concept album", "the cozy game", "the director's cut", "the live album", "the spin-off", "the season finale", "the anime adaptation", "the book you were assigned"];
const ERAS = ["peaked in the first season", "was better as a rough draft", "is a content strategy that learned to cry", "needs to be shorter by about half", "was never actually good and we've all been polite", "is a masterpiece and everyone is afraid to say it", "is a podcast with a bigger budget", "should have been a tweet"];

const HABITS = ["people who reply-all", "people who quote-post to agree", "people who say 'I'm not a morning person'", "people who read the last page first", "people who alphabetise their spices", "people who leave one sip in the cup", "people who announce they're logging off", "people who film concerts", "people who 'just have one tab open'", "people who say 'no offence, but'", "people who never finish a game", "people who put their phone face-down", "people who keep every receipt", "people who peel stickers off fruit", "people who microwave fish at work", "people who set fifteen alarms", "people who say they hate small talk", "people who re-read their own posts"];
const TRAITS = ["are running a long con on the rest of us", "are the real main characters", "have more power than they admit", "are a lot more fun than their reputation", "should be forced to explain themselves in public", "are one anecdote away from a villain arc", "know something they aren't telling us", "are doing a bit and will never break character", "are the last honest people online"];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pools() {
  const tech = [];
  for (const a of TECH) {
    for (const b of TECH2) tech.push(`${cap(a)} is just ${b}.`);
    for (const b of TECH) if (a !== b) tech.push(`${cap(a)} is just ${b} with a better marketing team.`);
  }
  const food = [];
  for (const f of FOODS) for (const c of FOODCLASS) food.push(`${cap(f)} is ${c}. I will not be taking questions.`);
  const work = [];
  for (const p of PRACTICES) for (const t of WORKTAKE) work.push(`${cap(p)} ${t}.`);
  const lang = [];
  for (const w of WORDS) for (const t of WORDTAKE) lang.push(`${cap(w)} ${t}.`);
  const culture = [];
  for (const m of MEDIA) for (const e of ERAS) culture.push(`${cap(m)} ${e}.`);
  const life = [];
  for (const h of HABITS) for (const t of TRAITS) life.push(`${cap(h)} ${t}.`);
  return { tech, food, work, lang, culture, life };
}

// FNV-1a, for per-grenade stats that never change between visits.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function stats(text) {
  const h = hash(text);
  const yieldKt = 1 + (h % 9999) / 100;                 // 1.00 – 100.99 kt
  const fuseMin = 1 + ((h >>> 8) % 240);                // minutes until the first quote-post
  const radius = 5 + ((h >>> 16) % 995);                // replies expected in the blast zone
  return { yieldKt: Math.round(yieldKt * 10) / 10, fuseMin, radius };
}

export const PROTOTYPE = {
  n: 0,
  cat: "tech",
  text: "The young people building AI aren't real engineers: they're 25, from the humanities, and have never shipped a product with discipline.",
  note: "the prototype, reconstructed from the thread that started this armory",
};

export function buildArmory(seed = 1031) {
  const rnd = mulberry32(seed);
  const p = pools();
  const picked = [];
  const seen = new Set();
  for (const cat of Object.keys(QUOTA)) {
    const pick = shuffle(p[cat], rnd).filter((t) => !seen.has(t)).slice(0, QUOTA[cat]);
    for (const t of pick) { seen.add(t); picked.push({ cat, text: t }); }
  }
  return shuffle(picked, rnd).map((g, i) => ({ n: i + 1, ...g, ...stats(g.text) }));
}
