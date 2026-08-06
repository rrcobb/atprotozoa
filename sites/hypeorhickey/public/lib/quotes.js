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
];
