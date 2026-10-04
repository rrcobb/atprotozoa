// content.js — the predefined elements every scenario is assembled from.
// Nothing here is random; engine.js picks from these with a seeded generator,
// so the same run on the same day always offers the same matters and dice.
//
// A matter template is  m(id, title, skill, risk, seasons, tags, text, outcomes)
//   skill   tally | voice | eye | hands
//   risk    0 calm · 1 tense · 2 dire   (see BAND_TABLE in engine.js)
//   seasons letters from s(pring) u(mmer) a(utumn) w(inter)
//   outcomes  [bad, mixed, good, great], each [text, coin, grain, favour, folk, weariness]
// Coin and grain are scaled up with the manor's prosperity; favour/folk/weariness are not.
// Text slots: {a} {b} {c} villagers · {an} animal · {crop} · {tool} · {place} · {lord} · {reeve}

const m = (id, title, skill, risk, seasons, tags, text, out) => ({ id, title, skill, risk, seasons, tags, text, out });

export const SKILLS = {
  tally: { name: "Tally", blurb: "sums, ledgers, boundaries, fine print" },
  voice: { name: "Voice", blurb: "persuasion, ceremony, calming a crowd" },
  eye: { name: "Eye", blurb: "noticing, tracking, knowing a hungry sheep" },
  hands: { name: "Hands", blurb: "mending, hauling, honest sweat" },
};
export const RISK_NAMES = ["calm", "tense", "dire"];
export const BAND_NAMES = ["setback", "muddled through", "well done", "a good day for the manor"];

export const MONTHS = ["March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February"];
export const SEASONS = ["spring", "summer", "autumn", "winter"]; // MONTHS[i] is in SEASONS[floor(i/3)]
export const SEASON_LETTER = ["s", "u", "a", "w"];

// [monthIndex, dayOfMonth, name, kind]  kind: quarter = rent audit, feast = merrymaking
export const FEASTS = [
  [0, 25, "Lady Day", "quarter"],
  [2, 1, "May Day", "feast"],
  [3, 24, "Midsummer", "quarter"],
  [5, 1, "Lammas", "feast"],
  [6, 28, "Michaelmas", "quarter"],
  [7, 1, "All Hallows", "feast"],
  [9, 25, "Christmas", "quarter"],
  [11, 2, "Candlemas", "feast"],
];

export const WEATHER = {
  s: [["a soft grey drizzle", "wet"], ["a bright, windy morning", "wind"], ["mist on the water-meadow", "fog"], ["a surprisingly warm sun", "fair"]],
  u: [["heat shimmering on the lane", "hot"], ["a fair, buzzing day", "fair"], ["a thundery sky that can't decide", "wet"], ["dust and long shadows", "hot"]],
  a: [["a golden, gnat-filled afternoon", "fair"], ["low fog and the smell of woodsmoke", "fog"], ["rain rattling the thatch", "wet"], ["a sharp, bright wind", "wind"]],
  w: [["a hard white frost", "cold"], ["snow turning to slush", "cold"], ["rain, and more rain", "wet"], ["a still, bitter dawn", "cold"]],
};

export const POOLS = {
  given: ["Aldith", "Bran", "Cecily", "Dunstan", "Edda", "Fulk", "Godiva", "Hob", "Isolde", "Jory", "Kenna", "Lambert", "Maud", "Nigel", "Osric", "Petronel", "Quill", "Rowan", "Sybil", "Tobias", "Ursel", "Wat", "Yolande", "Alys", "Hugh", "Mabel", "Piers", "Thora"],
  byname: ["the Miller", "Thatcher", "atte Ford", "Brewer", "Fairweather", "Longshanks", "of the Green", "Tanner", "Underhill", "Goodbody", "Swineherd", "the Younger", "Pennywhistle", "Hogg", "Cooper", "Fletcher"],
  trade: ["miller", "alewife", "shepherd", "carter", "thatcher", "reeve's cousin", "beekeeper", "widow", "smith", "hayward", "goose-girl", "cooper"],
  manorA: ["Little", "Upper", "Nether", "Long", "Old", "Hollow", "Fair", "Mere"],
  manorB: ["Wickham", "Barrowby", "Thistleton", "Ashcombe", "Stoke Humble", "Pennyfold", "Wetherby", "Marlow", "Cobbleford", "Dunmere", "Haddon", "Sedgley"],
  lordName: ["Sir Aldous de Verre", "Lady Isabeau Fitzwarren", "Sir Geoffrey of Bellamy", "the Abbot of St Osyth", "Dame Margery Tallboys", "Sir Roland Pellam"],
  reeve: ["Reeve Wulfric", "Reeve Gundred", "Reeve Anselm", "Reeve Hawise", "Reeve Tancred", "Reeve Odo"],
  animal: ["goose", "sheep", "pig", "cow", "goat", "donkey", "hen", "ox", "ram", "duck"],
  crop: ["barley", "oats", "beans", "rye", "turnips", "hay", "peas", "cabbages"],
  tool: ["scythe", "billhook", "plough-share", "flail", "cart-wheel", "best ladle", "ladder", "rake"],
  place: ["the Long Meadow", "the mill-pond", "Cobb's Acre", "the sheepfold", "the church-stile", "the common oven", "the ford", "Hangman's Wood (renamed Pleasant Wood)", "the tithe barn", "the green"],
};

export const OMENS = [
  { id: "wet", name: "The Wet Year", blurb: "It rains in ways the almanac considers rude.", tags: ["roof", "ford", "harvest", "wet"], grain: -1 },
  { id: "visit", name: "The Lord's Cousin Visits", blurb: "A relative of {lord} is touring the estates and noticing things.", tags: ["lord", "people"], grain: 0 },
  { id: "geese", name: "The Year of the Geese", blurb: "Every animal in the parish has decided to be somewhere else.", tags: ["animal", "dispute"], grain: 0 },
  { id: "plenty", name: "A Kindly Year", blurb: "The soil is generous and so, for once, are the neighbours.", tags: ["harvest", "market"], grain: 1 },
  { id: "wedding", name: "A Year of Weddings", blurb: "Half the village is in love and the other half is catering.", tags: ["people", "feast"], grain: 0 },
  { id: "ledger", name: "The Year of the Ledger", blurb: "Someone upstairs has become interested in arithmetic.", tags: ["lord", "ledger", "dispute"], grain: 0 },
];

export const IMPROVEMENTS = [
  { id: "plough", name: "Plough-teams", emoji: "🐂", cost: 60, blurb: "More hands in the furrow: each level adds grain every day of the harvest months." },
  { id: "mill", name: "The Mill", emoji: "⚙️", cost: 80, blurb: "Tolls from the stones: each level adds pence every day and every idle hour." },
  { id: "alehouse", name: "The Alehouse", emoji: "🍺", cost: 70, blurb: "Pence every day, plus a little goodwill every week." },
  { id: "bridge", name: "The Bridge", emoji: "🌉", cost: 90, blurb: "A dry crossing: tolls every day, and fording the river stops being dire." },
  { id: "desk", name: "Clerk's Desk", emoji: "🪶", cost: 100, blurb: "Every second level gives you an extra die each morning." },
  { id: "commons", name: "The Common House", emoji: "🔥", cost: 75, blurb: "A warm place to be: weariness fades faster overnight and the folk think kindly of you." },
  { id: "orchard", name: "The Orchard", emoji: "🍎", cost: 65, blurb: "A little grain every day of the year, and the occasional pie." },
];

// ---- matters ---------------------------------------------------------------

export const MATTERS = [
  m("strayed", "A Stray {an}", "eye", 0, "suaw", ["animal", "dispute"],
    "{a}'s {an} has wandered into {b}'s {crop}. Both are standing very still, as though that will help.", [
      ["You chase the {an} the wrong way twice. {b} is not charmed, and neither is the {crop}.", -2, 0, 0, -1, 1],
      ["The {an} is returned, a few rows of {crop} poorer. Both parties mutter, which is the right amount.", 0, 0, 0, 0, 0],
      ["You spot the gap in the hedge before anyone can blame anyone. {a} and {b} share a mug of something.", 3, 0, 0, 1, 0],
      ["The {an} follows you home like a duckling. {b} insists on paying a 'finder's fee' out of sheer relief.", 8, 0, 0, 2, 0],
    ]),
  m("boundary", "A Question of Boundaries", "tally", 1, "sau", ["dispute", "ledger"],
    "{a} and {b} disagree about where {place} ends. A stone is involved, and a grandfather's memory.", [
      ["The stone turns out to be two stones. Everyone has been right and wrong for forty years.", 0, 0, 0, -2, 1],
      ["You split the difference, literally, with a length of string. Nobody loves it.", 0, 0, 0, -1, 0],
      ["The old rolls settle it. {a} and {b} part friends, or at least not enemies.", 2, 0, 1, 1, 0],
      ["You find the boundary written in the margin of a charter, with a doodle of a pig. Even {b} laughs.", 5, 0, 1, 2, 0],
    ]),
  m("ale", "The Ale Assize", "voice", 0, "suaw", ["people", "feast"],
    "{a}'s ale has been declared 'thin' by three people who each paid for two.", [
      ["You taste it. You say the wrong thing about it. The ale-wife has a long memory.", 0, 0, 0, -2, 0],
      ["A fine of one penny and a promise of stronger barley. Fair, if not thrilling.", 1, 0, 0, 0, 0],
      ["You judge it 'honest, if modest'. {a} frames the phrase and hangs it above the barrel.", 3, 0, 0, 2, 0],
      ["Your verdict is quoted in two other villages by Sunday. The alehouse is packed.", 9, 0, 0, 3, 0],
    ]),
  m("roof", "The Leaking Roof", "hands", 1, "suaw", ["roof", "wet"],
    "The thatch on {a}'s cottage has opened like a book. {a} is sleeping under a table to cope.", [
      ["You fall through the roof. The roof is fine; you are not.", -3, 0, 0, 0, 2],
      ["A patch, a prayer and a tarpaulin of old sacks. It will hold until it doesn't.", -2, 0, 0, 1, 1],
      ["Fresh reed, tight eaves. {a} cries a little, then makes you a pie.", -3, 0, 0, 2, 0],
      ["The whole row gets re-thatched in a day because the neighbours turn up with bundles and opinions.", 0, 0, 0, 4, 0],
    ]),
  m("lordsman", "{lord}'s Man Is Counting", "voice", 2, "suaw", ["lord", "ledger"],
    "{lord}'s steward has arrived to count things. The things look suspiciously countable.", [
      ["He counts the same sheep twice and you can't talk him out of it. A letter will follow.", -6, 0, -3, 0, 1],
      ["A long afternoon and a longer dinner. He leaves unconvinced but fed.", -2, 0, -1, 0, 1],
      ["You walk him round the best fields the long way. His report is warm.", 4, 0, 3, 0, 0],
      ["He leaves with a basket of apples and a note recommending you for a bonus.", 12, 0, 5, 0, 0],
    ]),
  m("ledger", "The Goose in the Ledger", "tally", 0, "suaw", ["ledger"],
    "The accounts don't balance. The difference is, to the penny, exactly one goose.", [
      ["You find three more discrepancies. One is your own handwriting.", -2, 0, -1, 0, 1],
      ["You write 'goose' in the margin and decide not to look any closer.", 0, 0, 0, 0, 0],
      ["It was a mis-carried figure from Lammas. The goose is cleared of all suspicion.", 3, 0, 1, 0, 0],
      ["You also find an overcharge by a supplier and recover it with an apology no one believed.", 11, 0, 2, 0, 0],
    ]),
  m("harvest", "Cut It Before the Weather", "hands", 1, "ua", ["harvest", "wet"],
    "The {crop} wants cutting and the sky is thinking about it. Everyone's looking at you.", [
      ["The rain wins. Half the {crop} lies sulking in the field.", 0, -4, 0, -1, 2],
      ["A scramble, a sore back, a crop saved in two minds.", 0, 3, 0, 0, 1],
      ["You set the line, call the rhythm, and the field goes down like a sentence.", 0, 7, 0, 1, 1],
      ["Everyone sings. Nobody has ever been this tired this happily. The barn is stuffed.", 0, 12, 0, 3, 1],
    ]),
  m("plough", "First Furrow", "hands", 0, "sa", ["harvest"],
    "The ground is soft enough at last. {a} offers to hold the {an} if you'll hold the plough.", [
      ["The furrow wanders like a river. {a} says nothing, loudly.", 0, -1, 0, 0, 1],
      ["Mostly straight, mostly deep. Mostly.", 0, 2, 0, 0, 1],
      ["A line you could rule a page by. A crow follows you for the worms.", 0, 4, 0, 1, 0],
      ["The whole strip is turned before lunch, and the soil smells like possibility.", 0, 7, 0, 2, 0],
    ]),
  m("wedding", "Banns and Pigs", "voice", 0, "suaw", ["people", "feast"],
    "{a} and {b} wish to marry. Their families wish to discuss the pig first.", [
      ["The pig is discussed for four hours. The wedding is postponed to 'sometime'.", 0, 0, 0, -2, 1],
      ["A pig is agreed upon. Not the pig either side first suggested.", 0, 0, 0, 0, 0],
      ["You steer the talk to the dowry's linen and everyone relaxes. Banns are read.", 2, 0, 0, 2, 0],
      ["The families end up co-owning the pig. A feast is promised, and you're at the head table.", 6, 2, 1, 3, 0],
    ]),
  m("toll", "The Miller's Toll", "tally", 1, "suaw", ["dispute", "ledger"],
    "{a} swears the miller kept a tenth, not a sixteenth. The miller swears the stone is heavy.", [
      ["You weigh the wrong sack. Both parties are now furious with the scales, and with you.", -2, 0, 0, -2, 1],
      ["A new measure is agreed. It is wrong in everyone's favour equally.", 0, 0, 0, 0, 0],
      ["A proper standard bushel, sealed and shared. Complaints drop to a murmur.", 3, 1, 1, 1, 0],
      ["The miller thanks you for clearing his name and gives the village a free grind day.", 4, 8, 0, 3, 0],
    ]),
  m("poacher", "Rabbits, Allegedly", "eye", 2, "aw", ["lord", "animal"],
    "Someone's been taking {lord}'s rabbits. The rabbits aren't saying who.", [
      ["You accuse the wrong household. You are right about the rabbits and wrong about everything else.", 0, 0, -2, -3, 1],
      ["You find snares and no culprit. You write 'wolves' and everyone agrees to believe it.", 0, 0, 0, 0, 0],
      ["You find the hungry culprit, make them cut wood for the lord instead of being hanged. Mercy, with paperwork.", 2, 0, 2, 2, 0],
      ["The poacher turns out to be a pedlar's boy. You find him honest work and {lord} a better warren.", 5, 0, 3, 3, 0],
    ]),
  m("cough", "A Winter Cough", "eye", 1, "sw", ["people", "cold"],
    "{a}'s little one has a cough that sounds like an old gate. {a} hasn't slept.", [
      ["You misjudge the fever. You are there all night, and so is the worry.", 0, 0, 0, -1, 2],
      ["Honey, warm broth, and time. It passes slowly.", 0, -1, 0, 1, 1],
      ["You spot the damp wall and move the bed. By morning the cough has softened.", 0, -1, 0, 3, 0],
      ["The herbwife comes round on your word and stays for tea. By nightfall the whole lane is sleeping.", 0, -1, 1, 4, 0],
    ]),
  m("market", "Market Day", "voice", 0, "sua", ["market", "people"],
    "There's spare {crop} in the barn and a market in the next village. {a} offers to carry if you'll haggle.", [
      ["You sell low and buy high, which is the opposite of the plan.", -4, -2, 0, 0, 0],
      ["A fair price and a fair crowd. Nobody leaves rich.", 5, -2, 0, 0, 0],
      ["You open with a story about the goose. It works. It always works.", 14, -3, 0, 1, 0],
      ["A wool merchant is so charmed he buys the lot and asks for more next year.", 26, -3, 1, 2, 0],
    ]),
  m("snow", "The Lane Is Gone", "hands", 1, "w", ["cold", "roof"],
    "Snow has swallowed the lane to {place}. {a} is on the wrong side of it with the only good ladder.", [
      ["You go in up to your waist. The ladder is somewhere else. So are your boots.", 0, 0, 0, -1, 2],
      ["A path of sorts, trampled and swept, and a lot of cursing.", 0, 0, 0, 1, 1],
      ["You rope the cart-horses in and plough a lane clean through. Small children follow in triumph.", 0, 0, 0, 3, 1],
      ["Half the village turns out with shovels. By noon the lane is a gutter-straight trench and there is soup.", 0, 0, 0, 4, 0],
    ]),
  m("ford", "The Ford Is High", "hands", 2, "sw", ["ford", "wet"],
    "The water's up at the ford and {a} swears the cart can make it. The cart disagrees.", [
      ["The cart does not make it. The grain does not make it. {a} makes it, soaked and humbled.", -4, -6, 0, -1, 2],
      ["You haul the cart out by ropes and hope. Some of the load is sacrificed.", 0, -2, 0, 0, 1],
      ["Stones, planks, ropes, a mule with opinions. The cart is across and the load dry.", 2, 0, 0, 2, 1],
      ["You rig a rope ferry in an hour. The next village starts using it, and offers a toll share.", 9, 0, 1, 2, 1],
    ]),
  m("peddler", "A Peddler of Many Things", "voice", 1, "suaw", ["market", "people"],
    "A peddler offers {tool}s, relics, and 'a very honest map'. {b} is reaching for a purse.", [
      ["You are talked into a relic. {b} is talked into three. The map leads to the privy.", -5, 0, 0, -1, 0],
      ["You talk the price halfway down. He seems relieved. You do not understand why.", 0, 0, 0, 0, 0],
      ["You see through the relic and get a well-made {tool} for a fair price.", 4, 0, 0, 1, 0],
      ["The peddler, impressed, trades you real gossip: the lord's coin is arriving on time this year.", 8, 0, 2, 1, 0],
    ]),
  m("lost", "The Missing {tool}", "eye", 0, "suaw", ["people"],
    "{a} has lost the {tool} again. They are quite sure {b} took it. {b} is quite sure of the opposite.", [
      ["You search the wrong barn and start a different argument.", 0, 0, 0, -1, 1],
      ["It turns up in a hedge, a day later. No one apologises.", 0, 0, 0, 0, 0],
      ["It is under {a}'s own bed. You say nothing, gently, and everyone moves on.", 0, 0, 0, 2, 0],
      ["You find it, and also three other things lost in the village since last Lammas.", 4, 0, 0, 3, 0],
    ]),
  m("bell", "The Bell Rope", "voice", 0, "suaw", ["people", "feast"],
    "The priest and {a} disagree about when the bell should ring. The village now rings it whenever it likes.", [
      ["You propose a schedule. The bell rings at 3 a.m. in protest.", 0, 0, -1, -2, 1],
      ["A compromise: ring at dawn, noon and dusk, and never on a Tuesday for reasons.", 0, 0, 0, 0, 0],
      ["A rota is agreed, and a small boy is made Keeper of the Rope. He takes it seriously.", 1, 0, 0, 2, 0],
      ["The bell now rings a little tune at harvest. People cry. The priest takes credit.", 3, 0, 1, 4, 0],
    ]),
  m("hedge", "Hedge and Ditch", "hands", 0, "suaw", ["roof"],
    "The hedge along {place} has gone feral and the ditch has gone missing.", [
      ["You cut yourself on the hedge, then on the billhook, then on your pride.", 0, 0, 0, 0, 2],
      ["Half-laid, half-cleared. A decent start to a long argument with brambles.", 0, 0, 0, 0, 1],
      ["A proper plashed hedge and a clear ditch. A hedgehog applies for tenancy.", 0, 1, 1, 1, 1],
      ["Done by noon, and the cuttings make firewood for three widows. Lovely.", 0, 2, 1, 3, 1],
    ]),
];

// Standing options: always on the table, no matter the day.
export const STANDING = [
  m("rest", "Put your feet up", "eye", 0, "suaw", [],
    "Sit down. Look at the hedge. Be a person for a moment.", [
      ["A wasp, a sudden argument, and no rest to speak of.", 0, 0, 0, 0, 0],
      ["You doze under the apple tree for an hour.", 0, 0, 0, 0, -1],
      ["A proper rest, with bread and a view.", 0, 0, 0, 0, -2],
      ["You nap so perfectly the birds hold their tongues.", 0, 0, 0, 1, -3],
    ]),
  m("odd", "Odd jobs about the manor", "hands", 0, "suaw", [],
    "A gate here, a latch there, a step to re-seat. Nothing grand, always useful.", [
      ["You re-hang a gate upside down. It does work, in a way.", 0, 0, 0, 0, 1],
      ["A few things set right, a few more noted.", 2, 0, 0, 0, 0],
      ["A good day of small jobs, each a tiny kindness.", 4, 0, 0, 1, 0],
      ["Everything you touch stays fixed. You are briefly worshipped.", 7, 0, 0, 2, 0],
    ]),
];

export const AUDIT = m("audit", "The Quarter-Day Audit", "tally", 2, "suaw", ["lord", "ledger"],
  "{feast}: the quarterly rents fall due and {lord}'s accounts come to {reeve}'s desk. Everything must add up, and do so beautifully.", [
    ["The columns refuse to agree. {lord} receives a letter with a great many ink blots.", -8, 0, -4, 0, 2],
    ["It adds up, with a few creative corners. {lord} is neither pleased nor suspicious.", 4, 0, 0, 0, 1],
    ["A clean audit, the sum exact to the farthing. {lord} sends word of thanks.", 18, 0, 4, 1, 1],
    ["Not only does it balance, there is a surplus, and a note on the margin: 'Splendid.' You frame it.", 40, 3, 7, 2, 1],
  ]);

export const FEAST_MATTER = m("feast", "{feast}", "voice", 0, "suaw", ["feast", "people"],
  "It's {feast}. The whole village is waiting for you to say a few words, and the ale isn't going to drink itself.", [
    ["Your speech trails off. The ale does, in fact, get drunk.", 0, -1, 0, -1, 0],
    ["A polite toast and a warm bun. It does the job.", 0, -1, 0, 2, -1],
    ["A little speech about the year, and everyone remembers one good thing.", 0, -1, 1, 4, -1],
    ["You get the whole green singing. Someone cries. Someone proposes. It goes into the village memory.", 5, -2, 1, 7, -2],
  ]);

// Cozy end-of-day lines, chosen by the season.
export const NIGHT_LINES = {
  s: ["Lambs in the next field. A thrush insists on repeating itself.", "Wet earth smell on the doorstep. Something is about to grow."],
  u: ["Long light on the thatch. Somewhere, someone is playing a fiddle badly and with love.", "Swallows stitch the sky shut for the evening."],
  a: ["Woodsmoke and apples. The year is tucking itself in.", "The barn smells of dust and sweet grain."],
  w: ["Candle on the table, frost on the glass, soup on the fire.", "The fields are asleep and so, soon, will you be."],
};
