// capitalingo curriculum: Adam Smith teaches the first half, Karl Marx takes
// over for the second. Every quiz item is:
//   { id, label, sub, prompt, cite, teacher, q }
// prompt is a real (public-domain) quote or worked example shown unattributed;
// cite is the actual source, revealed in the feedback bar after answering.
// One unit (id "handoff") is a story beat, not a quiz — { story: true, lines }.

window.CAPITALINGO_UNITS = [
  {
    id: "smith-basics",
    title: "Meet Your Teacher: Adam Smith",
    icon: "\u{1F3A9}",
    teacher: "smith",
    blurb: "Self-interest, the invisible hand, and the pin factory that started it all.",
    items: [
      {
        id: "sm-selfinterest", label: "Self-Interest", teacher: "smith",
        sub: "everyone chasing their own advantage is what makes trade happen at all",
        q: "Which concept does this describe?",
        prompt: "“It is not from the benevolence of the butcher, the brewer, or the baker that we expect our dinner, but from their regard to their own interest.”",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 2 (1776)",
      },
      {
        id: "sm-invisiblehand", label: "The Invisible Hand", teacher: "smith",
        sub: "self-interested actions add up to a public benefit nobody planned",
        q: "Which concept does this describe?",
        prompt: "“He intends only his own gain, and he is in this...led by an invisible hand to promote an end which was no part of his intention.”",
        cite: "Adam Smith, Wealth of Nations, Book IV, Ch. 2 (1776)",
      },
      {
        id: "sm-divisionoflabour", label: "Division of Labour", teacher: "smith",
        sub: "splitting one job into small specialized steps multiplies total output",
        q: "Which concept does this describe?",
        prompt: "Ten workers, each doing one small step, turn out 48,000 pins a day. Split the same ten workers up to each make a whole pin start to finish, and they might not manage twenty between them.",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 1 (1776) — the pin factory",
      },
      {
        id: "sm-tradeadvantage", label: "Gains from Trade", teacher: "smith",
        sub: "specialize in what you're good at, trade for the rest — both sides gain",
        q: "Which concept does this describe?",
        prompt: "“It is the maxim of every prudent master of a family, never to attempt to make at home what it will cost him more to make than to buy.”",
        cite: "Adam Smith, Wealth of Nations, Book IV, Ch. 2 (1776)",
      },
    ],
  },
  {
    id: "smith-market",
    title: "Supply, Demand & Price",
    icon: "\u{1F4C8}",
    teacher: "smith",
    blurb: "Why prices settle where they do, and why the government should mostly stay out of it.",
    items: [
      {
        id: "sm-naturalprice", label: "Natural Price", teacher: "smith",
        sub: "the price that just covers ordinary rent, wages, and profit",
        q: "Which concept does this describe?",
        prompt: "“The natural price is, as it were, the central price to which the prices of all commodities are continually gravitating.”",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 7 (1776)",
      },
      {
        id: "sm-marketprice", label: "Market Price", teacher: "smith",
        sub: "what a good actually sells for, pulled around by supply and demand",
        q: "Which concept does this describe?",
        prompt: "“The market price of every particular commodity is regulated by the proportion between the quantity actually brought to market and the demand of those willing to pay the natural price.”",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 7 (1776)",
      },
      {
        id: "sm-competition", label: "Competition", teacher: "smith",
        sub: "sellers undercutting each other pushes price back toward the natural rate",
        q: "Which concept does this describe?",
        prompt: "“When the quantity brought to market exceeds the effectual demand...the competition of the different dealers obliges them all to accept of this lower price.”",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 7 (1776)",
      },
      {
        id: "sm-laissezfaire", label: "The System of Natural Liberty", teacher: "smith",
        sub: "government stepping back and letting individuals pursue their own interest",
        q: "Which concept does this describe?",
        prompt: "“Every man...is left perfectly free to pursue his own interest his own way...the sovereign is completely discharged from [the] duty of superintending the industry of private people.”",
        cite: "Adam Smith, Wealth of Nations, Book IV, Ch. 9 (1776)",
      },
    ],
  },
  {
    id: "smith-growth",
    title: "Capital & Growth",
    icon: "\u{1F3ED}",
    teacher: "smith",
    blurb: "Saving, investing, and why a growing economy pays workers more.",
    items: [
      {
        id: "sm-capitalaccum", label: "Accumulation of Capital", teacher: "smith",
        sub: "saving and reinvesting, instead of consuming everything, is what grows an economy",
        q: "Which concept does this describe?",
        prompt: "“Capitals are increased by parsimony, and diminished by prodigality and misconduct...whatever a person saves from his revenue he adds to his capital.”",
        cite: "Adam Smith, Wealth of Nations, Book II, Ch. 3 (1776)",
      },
      {
        id: "sm-productivelabour", label: "Productive Labour", teacher: "smith",
        sub: "labour that leaves behind a durable, sellable good, versus a service consumed on the spot",
        q: "Which concept does this describe?",
        prompt: "“There is one sort of labour which adds to the value of the subject upon which it is bestowed; there is another which has no such effect. The former...may be called productive; the latter, unproductive labour.”",
        cite: "Adam Smith, Wealth of Nations, Book II, Ch. 3 (1776)",
      },
      {
        id: "sm-wages", label: "Wages of Labour", teacher: "smith",
        sub: "in a growing economy, competition for workers bids wages up",
        q: "Which concept does this describe?",
        prompt: "“It is not the actual greatness of national wealth, but its continual increase, which occasions a rise in the wages of labour.”",
        cite: "Adam Smith, Wealth of Nations, Book I, Ch. 8 (1776)",
      },
      {
        id: "sm-wealthofnations", label: "The Wealth of Nations", teacher: "smith",
        sub: "a nation's real wealth is what it produces and consumes each year, not the gold in its vault",
        q: "Which concept does this describe?",
        prompt: "“The annual labour of every nation is the fund which originally supplies it with all the necessaries and conveniencies of life which it annually consumes.”",
        cite: "Adam Smith, Wealth of Nations, Introduction and Plan of the Work (1776)",
      },
    ],
  },
  {
    id: "handoff",
    title: "The Handoff",
    icon: "\u{1F504}",
    story: true,
    from: "smith",
    to: "marx",
    blurb: "Adam Smith's shift is up. Someone else wants the podium.",
    lines: [
      { teacher: "smith", text: "“Well, that covers the invisible hand. My shift's up — someone else has been waiting to talk about who actually makes the pins.”" },
      { teacher: "marx", text: "“Thank you, comrade. Sit down — we're going to talk about who owns the pin factory, and who just works there.”" },
      { teacher: "marx", text: "The rest of this course is taught by Karl Marx. Fair warning: the ticker will never be the same." },
    ],
  },
  {
    id: "marx-basics",
    title: "Meet Your New Teacher: Karl Marx",
    icon: "\u{1F9D4}",
    teacher: "marx",
    blurb: "Commodities, value, and where profit actually comes from.",
    items: [
      {
        id: "mx-commodity", label: "Commodity", teacher: "marx",
        sub: "a thing produced for exchange, not for its maker's own use",
        q: "Which concept does this describe?",
        prompt: "“The wealth of societies in which the capitalist mode of production prevails, presents itself as 'an immense accumulation of commodities.'”",
        cite: "Karl Marx, Capital, Vol. I, Ch. 1 (1867)",
      },
      {
        id: "mx-usevalexval", label: "Use-Value vs. Exchange-Value", teacher: "marx",
        sub: "what a thing is good for, versus what it can be traded for",
        q: "Which concept does this describe?",
        prompt: "A commodity has a use-value — it satisfies some human want. It also has an exchange-value — a quantitative relation in which it trades for other commodities, whatever it's actually useful for.",
        cite: "Karl Marx, Capital, Vol. I, Ch. 1 (1867)",
      },
      {
        id: "mx-laborvalue", label: "Labour Theory of Value", teacher: "marx",
        sub: "a commodity's value comes from the socially necessary labour needed to make it",
        q: "Which concept does this describe?",
        prompt: "“The value of one commodity is to the value of any other, as the labour time necessary for the production of the one is to that necessary for the production of the other.”",
        cite: "Karl Marx, Capital, Vol. I, Ch. 1 (1867)",
      },
      {
        id: "mx-surplusvalue", label: "Surplus Value", teacher: "marx",
        sub: "the gap between what labour produces and what the worker is paid for it — where profit comes from",
        q: "Which concept does this describe?",
        prompt: "The value labour-power creates in a day's work, and the value of that labour-power itself (what it costs to keep the worker alive and working), are two different magnitudes. The difference is what the capitalist pays for when he buys a day's labour.",
        cite: "Karl Marx, Capital, Vol. I, Ch. 9 (1867)",
      },
    ],
  },
  {
    id: "marx-struggle",
    title: "Class & Alienation",
    icon: "⚒️",
    teacher: "marx",
    blurb: "Who owns what, who works for whom, and what that does to a person.",
    items: [
      {
        id: "mx-classstruggle", label: "Class Struggle", teacher: "marx",
        sub: "history as an ongoing contest between those who own and those who work",
        q: "Which concept does this describe?",
        prompt: "“The history of all hitherto existing society is the history of class struggles.”",
        cite: "Marx & Engels, The Communist Manifesto, Ch. 1 (1848)",
      },
      {
        id: "mx-bourgprole", label: "Bourgeoisie & Proletariat", teacher: "marx",
        sub: "the owners of capital, and the workers who sell their labour to survive",
        q: "Which concept does this describe?",
        prompt: "“Society as a whole is more and more splitting up into two great hostile camps, into two great classes directly facing each other: Bourgeoisie and Proletariat.”",
        cite: "Marx & Engels, The Communist Manifesto, Ch. 1 (1848)",
      },
      {
        id: "mx-alienation", label: "Alienation", teacher: "marx",
        sub: "the worker relates to their own product, and their own work, as something foreign and hostile",
        q: "Which concept does this describe?",
        prompt: "“The worker becomes all the poorer the more wealth he produces...the devaluation of the human world increases in direct relation with the increase in value of the world of things.”",
        cite: "Karl Marx, Economic and Philosophic Manuscripts of 1844, First Manuscript",
      },
      {
        id: "mx-meansofproduction", label: "Means of Production", teacher: "marx",
        sub: "the factories, tools, land, and machines needed to produce anything — and who controls them",
        q: "Which concept does this describe?",
        prompt: "“The theory of the Communists may be summed up in the single sentence: Abolition of private property” — meaning ownership of the factories and land, not your toothbrush.",
        cite: "Marx & Engels, The Communist Manifesto, Ch. 2 (1848)",
      },
    ],
  },
  {
    id: "marx-revolution",
    title: "Revolution & the Manifesto",
    icon: "\u{1F6A9}",
    teacher: "marx",
    blurb: "Where all this is supposed to lead, in Marx's own closing arguments.",
    items: [
      {
        id: "mx-workersunite", label: "“Workers of the World, Unite”", teacher: "marx",
        sub: "the Manifesto's closing call for international proletarian solidarity",
        q: "Which concept does this describe?",
        prompt: "“The proletarians have nothing to lose but their chains. They have a world to win. Working Men of All Countries, Unite!”",
        cite: "Marx & Engels, The Communist Manifesto, Ch. 4 (1848)",
      },
      {
        id: "mx-dictprolet", label: "Dictatorship of the Proletariat", teacher: "marx",
        sub: "a transitional stage where the working class holds state power",
        q: "Which concept does this describe?",
        prompt: "“Between capitalist and communist society lies the period of the revolutionary transformation of the one into the other...the state can be nothing but the revolutionary dictatorship of the proletariat.”",
        cite: "Karl Marx, Critique of the Gotha Programme, Part IV (1875)",
      },
      {
        id: "mx-gotha", label: "“To Each According to His Needs”", teacher: "marx",
        sub: "the communist distribution principle, once scarcity is overcome",
        q: "Which concept does this describe?",
        prompt: "“From each according to his ability, to each according to his needs!”",
        cite: "Karl Marx, Critique of the Gotha Programme, Part I (1875)",
      },
      {
        id: "mx-commodityfetish", label: "Commodity Fetishism", teacher: "marx",
        sub: "goods seem to have value on their own, hiding the labour and social relations behind them",
        q: "Which concept does this describe?",
        prompt: "“A commodity is therefore a mysterious thing, simply because in it the social character of men's labour appears to them as an objective character...a relation between things.”",
        cite: "Karl Marx, Capital, Vol. I, Ch. 1, Section 4 (1867)",
      },
    ],
  },
];

// The final exam pulls every quiz unit (Smith and Marx alike) into one
// shuffled pool, built at runtime in app.js. The handoff story isn't a quiz
// and is excluded.
window.CAPITALINGO_FINAL = {
  id: "final",
  title: "Capitalism vs. Communism: The Debate",
  icon: "⚖️",
  blurb: "Every concept from both teachers, shuffled together. Pick a side, or just pick the right answer.",
  questionCount: 10,
  sourceUnitIds: ["smith-basics", "smith-market", "smith-growth", "marx-basics", "marx-struggle", "marx-revolution"],
};

// Full-text primary sources for every citation in this course, one entry per
// work (not per quote) — every URL below was fetched and confirmed to host
// the named text before this file shipped. Public domain / free-archive
// links only, no paywalls.
window.CAPITALINGO_SOURCES = [
  {
    teacher: "smith",
    work: "An Inquiry into the Nature and Causes of the Wealth of Nations",
    year: "1776",
    note: "The whole Smith curriculum — self-interest, the invisible hand, the pin factory, natural price, capital accumulation — is drawn from this one book.",
    url: "https://www.gutenberg.org/ebooks/3300",
    host: "Project Gutenberg",
  },
  {
    teacher: "marx",
    work: "Capital: A Critique of Political Economy, Volume I",
    year: "1867",
    note: "Commodities, use-value vs. exchange-value, the labour theory of value, surplus value, and commodity fetishism.",
    url: "https://www.marxists.org/archive/marx/works/1867-c1/",
    host: "Marxists Internet Archive",
  },
  {
    teacher: "marx",
    work: "Manifesto of the Communist Party",
    year: "1848",
    note: "Class struggle, the bourgeoisie and proletariat, means of production, and the closing call to unite. Written with Friedrich Engels.",
    url: "https://www.marxists.org/archive/marx/works/1848/communist-manifesto/",
    host: "Marxists Internet Archive",
  },
  {
    teacher: "marx",
    work: "Economic and Philosophic Manuscripts of 1844",
    year: "1844",
    note: "Alienated labour — the worker relating to their own product as something foreign and hostile.",
    url: "https://www.marxists.org/archive/marx/works/1844/manuscripts/",
    host: "Marxists Internet Archive",
  },
  {
    teacher: "marx",
    work: "Critique of the Gotha Programme",
    year: "1875",
    note: "The dictatorship of the proletariat and “from each according to his ability, to each according to his needs.”",
    url: "https://www.marxists.org/archive/marx/works/1875/gotha/",
    host: "Marxists Internet Archive",
  },
];

// Investor Relations dashboard: a scripted CAPL (Capitalingo Inc.) stock
// trajectory, one point per real quiz unit in course order. Values are fixed
// (not random) so the joke lands the same way for everyone: Smith-taught
// quarters climb, the handoff craters it, Marx-taught quarters bottom out
// near zero. Points beyond the learner's actual progress render as "TBD" —
// app.js reveals them from real state.completed, same source of truth the
// lesson path itself uses.
window.CAPITALINGO_DASHBOARD = [
  { id: "smith-basics", label: "Q1", teacher: "smith", price: 41, note: "Seed round closes on the strength of the invisible hand." },
  { id: "smith-market", label: "Q2", teacher: "smith", price: 58, note: "Series A: natural price discovery pitched to the board." },
  { id: "smith-growth", label: "Q3", teacher: "smith", price: 77, note: "All-time high. Capital accumulation flywheel, analysts say." },
  { id: "marx-basics", label: "Q4", teacher: "marx", price: 12, note: "Restatement: surplus value repriced to zero across the book." },
  { id: "marx-struggle", label: "Q5", teacher: "marx", price: 4, note: "Means of production seized by committee. Ticker symbol under review." },
  { id: "marx-revolution", label: "Q6", teacher: "marx", price: 1, note: "Delisted. Holdings converted to labor vouchers at par." },
];
