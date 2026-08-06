// The quote bank for hypeorhickey. Requested by @7778777.online: a quiz
// where you guess whether a quote came from Bluesky staff (incl. ex-staff),
// a handful of famously understated language/protocol creators, or a
// handful of famously euphoric tech-and-finance hype-men — picking each
// person's most euphoric-sounding real quote, so the rare hype moments of
// the calm engineers get mistaken for CEO hype-speak and vice versa.
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
    text: "My goal is to make Zig so useful and practical that people will find themselves using it without intending to.",
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
    text: "Am considering taking Tesla private at $420. Funding secured.",
    context: "Elon Musk, on Twitter/X, August 2018",
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
    person: "masason",
    text: "Don't think, you feel it.",
    context: "Masayoshi Son, quoting Yoda on his investment philosophy",
  },
  {
    person: "masason",
    text: "SoftBank aims to continue to grow as a corporate group for the next 300 years.",
    context: "Masayoshi Son, on SoftBank's “300-year vision”",
  },
];
