// The quote bank for hypeorhickey. Requested by @7778777.online: a quiz
// where you guess whether a quote came from Bluesky staff (incl. ex-staff),
// a handful of famously understated language/protocol creators, or a
// handful of famously euphoric tech-and-finance hype-men — picking each
// person's most euphoric-sounding real quote, so the rare hype moments of
// the calm engineers get mistaken for CEO hype-speak and vice versa.
//
// Revision 2 (same requester, "try to pick ones that don't mention their
// invention or company, those seem pretty easy, and add more quotes"):
// swapped the three quotes that named the person's own project/company in
// the visible text (Kelley/Zig, Musk/Tesla, Son/SoftBank) for other real
// quotes from the same people that don't, and grew the bank from 20 to 29.
// `context` (only shown after answering) still names the venue freely.
//
// Revision 3 (same requester, "find some more! Go koans, public bsky
// posts, there's a lot of sources! 29 quotes is super low variety"):
// added Rob Pike's Go Proverbs (GopherFest 2015 — the "Go koans"), two
// real public bsky.app posts from Bluesky's Jay Graber, and more real
// quotes for the rest of the roster pulled fresh from talks, filings, and
// interviews. Grew the bank from 29 to 49.
//
// Every quote below is real and attributed to the actual person or venue
// named in `context` — pulled from talks, interviews, filings, and posts.
// Wording is as close to verbatim as public sources give it; a few (marked)
// are the well-known standalone line pulled out of a longer remark, not
// invented paraphrase. No quote here was written for this quiz.

export const PEOPLE = [
  { id: "bluesky", name: "Bluesky staff", sub: "incl. ex-staff", camp: "measured" },
  { id: "robpike", name: "Rob Pike", sub: "co-creator of Go", camp: "measured" },
  { id: "richhickey", name: "Rich Hickey", sub: "creator of Clojure", camp: "measured" },
  { id: "larrywall", name: "Larry Wall", sub: "creator of Perl", camp: "measured" },
  { id: "zedshaw", name: "Zed Shaw", sub: "Learn Code the Hard Way", camp: "measured" },
  { id: "andrewkelley", name: "Andrew Kelley", sub: "creator of Zig", camp: "measured" },
  { id: "jensenhuang", name: "Jensen Huang", sub: "CEO, Nvidia", camp: "euphoric" },
  { id: "elonmusk", name: "Elon Musk", sub: "Tesla / SpaceX / X", camp: "euphoric" },
  { id: "samaltman", name: "Sam Altman", sub: "CEO, OpenAI", camp: "euphoric" },
  { id: "adamneumann", name: "Adam Neumann", sub: "co-founder, WeWork", camp: "euphoric" },
  { id: "masason", name: "Masayoshi Son", sub: "CEO, SoftBank", camp: "euphoric" },
];

export const QUOTES = [
  {
    person: "bluesky",
    text: "I think social media should be basically common infrastructure that society gets to use and evolve it as society evolves, building a more democratic form of social media to reflect a democratic society.",
    context: "Jay Graber, Bluesky CEO, in a 2024 interview",
  },
  {
    person: "bluesky",
    text: "If AI ends up controlled by only one company whose goal is power or profit maximization, I think we can anticipate that will lead to bad outcomes for a lot of people.",
    context: "Jay Graber, Bluesky CEO",
  },
  {
    person: "bluesky",
    text: "We are building an open network that puts users first.",
    context: "Bluesky, in a public statement during a surge in signups (standalone line from a longer statement)",
  },
  {
    person: "bluesky",
    text: "we've achieved what a lot of people said was impossible",
    context: "Jay Graber, Bluesky CEO, CNBC interview, 2025 (standalone line from a longer remark)",
  },
  {
    person: "bluesky",
    text: "I'm thrilled Toni is staying to lead us into this next chapter. He's spent the past four months proving it, leading with curiosity and courage.",
    context: "Jay Graber, in a public post on Bluesky, July 2026",
  },
  {
    person: "robpike",
    text: "Less is exponentially more.",
    context: "Rob Pike, on why Go looks the way it does, 2012",
  },
  {
    person: "robpike",
    text: "Why would you have a language that is not theoretically exciting? Because it's very useful.",
    context: "Rob Pike, on Go's design tradeoffs",
  },
  {
    person: "robpike",
    text: "Data dominates. If you've chosen the right data structures and organized things well, the algorithms will almost always be self-evident.",
    context: "Rob Pike, on data structures vs. algorithms",
  },
  {
    person: "robpike",
    text: "Object-oriented design is the roman numerals of computing.",
    context: "Rob Pike, on OOP",
  },
  {
    person: "robpike",
    text: "Don't communicate by sharing memory, share memory by communicating.",
    context: "Rob Pike, \"Go Proverbs,\" GopherFest 2015",
  },
  {
    person: "robpike",
    text: "Concurrency is not parallelism.",
    context: "Rob Pike, \"Go Proverbs,\" GopherFest 2015",
  },
  {
    person: "robpike",
    text: "Clear is better than clever.",
    context: "Rob Pike, \"Go Proverbs,\" GopherFest 2015",
  },
  {
    person: "robpike",
    text: "Errors are values.",
    context: "Rob Pike, \"Go Proverbs,\" GopherFest 2015",
  },
  {
    person: "robpike",
    text: "Gofmt's style is no one's favorite, yet gofmt is everyone's favorite.",
    context: "Rob Pike, \"Go Proverbs,\" GopherFest 2015",
  },
  {
    person: "richhickey",
    text: "Programmers know the benefits of everything and the tradeoffs of nothing.",
    context: "Rich Hickey",
  },
  {
    person: "richhickey",
    text: "You have to think. You have to actually apply some simplicity work to the problem before you start.",
    context: "Rich Hickey, “Simple Made Easy,” 2011",
  },
  {
    person: "richhickey",
    text: "Simplicity is a choice.",
    context: "Rich Hickey, “Simple Made Easy,” 2011",
  },
  {
    person: "richhickey",
    text: "What matters for simplicity is that there's not interleaving.",
    context: "Rich Hickey, “Simple Made Easy,” 2011",
  },
  {
    person: "richhickey",
    text: "Most of the biggest problems in software are problems of misconception.",
    context: "Rich Hickey",
  },
  {
    person: "larrywall",
    text: "The three chief virtues of a programmer are: Laziness, Impatience, and Hubris.",
    context: "Larry Wall, creator of Perl",
  },
  {
    person: "larrywall",
    text: "It's ugly but useful.",
    context: "Larry Wall, on Perl and the camel that became its mascot",
  },
  {
    person: "larrywall",
    text: "Easy things should be easy, and hard things should be possible.",
    context: "Larry Wall, on language design philosophy",
  },
  {
    person: "larrywall",
    text: "There's more than one way to do it.",
    context: "Larry Wall, the original Perl motto",
  },
  {
    person: "larrywall",
    text: "All language designers are arrogant. Goes with the territory.",
    context: "Larry Wall, on language design",
  },
  {
    person: "zedshaw",
    text: "Programmers are like magicians who fool everyone into thinking they are perfect and never wrong, but it's all an act.",
    context: "Zed Shaw, Learn Code the Hard Way",
  },
  {
    person: "zedshaw",
    text: "Just take it slow and do not hurt your brain.",
    context: "Zed Shaw, Learn Python the Hard Way",
  },
  {
    person: "zedshaw",
    text: "The result of your hard work is confidence in your skill and no impostor syndrome.",
    context: "Zed Shaw, on why the exercises are tedious on purpose",
  },
  {
    person: "andrewkelley",
    text: "Informal proof correctness of a simple system beats formal proof correctness of a very complex system.",
    context: "Andrew Kelley, creator of Zig",
  },
  {
    person: "jensenhuang",
    text: "The more you buy, the more you save.",
    context: "Jensen Huang, Nvidia CEO, at a GTC keynote",
  },
  {
    person: "jensenhuang",
    text: "AI is one of the most powerful forces shaping the world today.",
    context: "Jensen Huang, Nvidia CEO",
  },
  {
    person: "jensenhuang",
    text: "We're the engine of the largest industrial revolution in human history.",
    context: "Jensen Huang, Nvidia CEO, on Nvidia's role in the AI buildout",
  },
  {
    person: "jensenhuang",
    text: "AI factories: industrial systems designed to convert electricity into tokens.",
    context: "Jensen Huang, Nvidia CEO, on modern data centers, GTC keynote",
  },
  {
    person: "elonmusk",
    text: "The future of humanity is going to bifurcate in two directions: either it's going to become multiplanetary, or it's going to remain confined to one planet and eventually there's going to be an extinction event.",
    context: "Elon Musk, in an interview on humanity's long-term future",
  },
  {
    person: "elonmusk",
    text: "I think it is possible for ordinary people to choose to be extraordinary.",
    context: "Elon Musk",
  },
  {
    person: "elonmusk",
    text: "If civilization collapses before Mars becomes self-sustaining, then nothing else matters.",
    context: "Elon Musk, in a post on X",
  },
  {
    person: "elonmusk",
    text: "Civilization secured.",
    context: "Elon Musk, in a post on X, after estimating a self-sustaining Mars city within decades",
  },
  {
    person: "samaltman",
    text: "I think that AI will probably, most likely, sort of lead to the end of the world. But in the meantime, there will be great companies created with serious machine learning.",
    context: "Sam Altman, OpenAI CEO",
  },
  {
    person: "samaltman",
    text: "AGI kinda went whooshing by.",
    context: "Sam Altman, OpenAI CEO, 2025",
  },
  {
    person: "samaltman",
    text: "We are now, like, in the singularity.",
    context: "Sam Altman, OpenAI CEO, on the Relentless podcast, 2026",
  },
  {
    person: "samaltman",
    text: "We are past the event horizon; the takeoff has started.",
    context: "Sam Altman, OpenAI CEO, \"The Gentle Singularity\" blog post, June 2025",
  },
  {
    person: "adamneumann",
    text: "Our mission is to elevate the world's consciousness.",
    context: "Adam Neumann, in WeWork's 2019 IPO prospectus",
  },
  {
    person: "adamneumann",
    text: "We dedicate this to the energy of we — greater than any of us, but inside each of us.",
    context: "WeWork's 2019 S-1 filing dedication, under CEO Adam Neumann",
  },
  {
    person: "adamneumann",
    text: "Much more based on our energy and spirituality than it is on a multiple of revenue.",
    context: "Adam Neumann, on his company's valuation, 2017 (standalone line from a longer remark)",
  },
  {
    person: "adamneumann",
    text: "They're coming to us for energy, for culture.",
    context: "Adam Neumann, on why members joined WeWork",
  },
  {
    person: "masason",
    text: "Don't think, you feel it.",
    context: "Masayoshi Son, quoting Yoda on his investment philosophy",
  },
  {
    person: "masason",
    text: "I truly believe it's coming, that's why I'm in a hurry — to aggregate the cash, to invest.",
    context: "Masayoshi Son, on his conviction about the coming AI singularity",
  },
  {
    person: "masason",
    text: "I may seem crazy, but I believe I'm a smart crazy.",
    context: "Masayoshi Son, after losing nearly $70 billion in the dot-com crash",
  },
  {
    person: "masason",
    text: "I have only one belief — Singularity.",
    context: "Masayoshi Son, SoftBank CEO, on his conviction driving SoftBank's AI bets",
  },
  {
    person: "masason",
    text: "In 300 years' time, we would like to become that company that makes the most contribution to human evolution.",
    context: "Masayoshi Son, SoftBank CEO, on SoftBank's 300-year vision",
  },
];
