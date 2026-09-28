// atlaslibs — pure generator logic, no DOM. Imported by public/index.html as
// a module and by tests/generator.test.mjs under node --test.
//
// REGIONS is a hand-curated snapshot of real cluster/region labels named on
// atlas.jazco.dev (the "living map of what Bluesky is talking about" — see
// https://atlas.jazco.dev/). Atlas rebuilds itself every six hours from a
// week of live conversation and renders as a WebGL canvas with no public
// JSON endpoint to fetch client-side, so this can't chase the live map —
// it's a fixed cast of the labels and geography (mainland vs. island,
// what's near what) that the map is known for: a sprawling English-language
// "mainland," a scatter of small special-interest islands close to shore,
// and a ring of language-cluster "far shores" across open water. "Politics
// Isle" specifically is here because it's the example baked into the build
// request itself — a real bit about the atlas, riffing on the isle being a
// small, loud, put-upon speck next to the mainland.

export const REGIONS = [
  {
    id: "mainland",
    name: "the English Mainland",
    atlasLabel: "BSky English Language Metacluster",
    kind: "mainland",
    denizens: "the mainlanders",
    motto: "everyone washes up here eventually",
    treasure: "the Discourse Cycle, a wheel that never stops turning and has never once been won",
    guardian: "the Reply Guy Colossus, assembled from ten thousand quote-posts and still somehow under-informed",
    blessing: "can talk to absolutely anyone, whether they wanted that or not",
  },
  {
    id: "politics-isle",
    name: "Politics Isle",
    atlasLabel: "Politics",
    kind: "island",
    denizens: "the isle-sworn",
    motto: "outnumbered, correct, unbothered",
    treasure: "the Last Unsent Reply, a scroll that has ended three friendships just by existing",
    guardian: "the Doomscroll Kraken, which surfaces exactly when you meant to log off",
    blessing: "can hold a grudge and a citation at the same time",
  },
  {
    id: "furry-archipelago",
    name: "the Furry Archipelago",
    atlasLabel: "Furries",
    kind: "archipelago",
    denizens: "the archipelago folk",
    motto: "the costume is load-bearing",
    treasure: "the Fursuit of Legend, stitched by forty hands and somehow still watertight",
    guardian: "the Con-Floor Sentinel, who has never once broken character",
    blessing: "can befriend anything with a face, and several things without one",
  },
  {
    id: "himbo-cove",
    name: "Himbo Cove",
    atlasLabel: "Gay Himbo Cluster",
    kind: "cove",
    denizens: "the cove-kept",
    motto: "strong back, open heart, no notes",
    treasure: "the Unbothered Heart, a relic that lowers the temperature of any argument it enters",
    guardian: "the Beach Golem, who will absolutely help you carry that",
    blessing: "can defuse a fight just by showing up shirtless and sincere",
  },
  {
    id: "wrestling-peninsula",
    name: "the Wrestling Peninsula",
    atlasLabel: "Wrestling Subcluster",
    kind: "peninsula",
    denizens: "the peninsula faithful",
    motto: "it's fake and it still hurts",
    treasure: "the Folding Chair of Consequence, a prop until the moment it very much isn't",
    guardian: "the Heel Turn, an entity that was your ally in the last paragraph",
    blessing: "can sell a hit that never actually landed",
  },
  {
    id: "web3-marsh",
    name: "the Web3 Marshlands",
    atlasLabel: "Web3",
    kind: "marsh",
    denizens: "the marsh-staked",
    motto: "utility coming Q3, trust the roadmap",
    treasure: "the Liquidity Pool, which is mostly water and one very confident frog",
    guardian: "the Rug-Puller, gone the instant anyone asks a direct question",
    blessing: "can talk about anything as though it's about to 10x",
  },
  {
    id: "education-outpost",
    name: "the Education Outpost",
    atlasLabel: "Education Cluster",
    kind: "outpost",
    denizens: "the outpost-keepers",
    motto: "cited, dated, still ignored",
    treasure: "the Well-Sourced Thread, eleven tweets long and somehow still under-read",
    guardian: "the Syllabus Wraith, which assigns homework to anyone who lingers",
    blessing: "can win any argument given three weeks' notice and a bibliography",
  },
  {
    id: "japan-shore",
    name: "the Japanese Shore",
    atlasLabel: "Japanese Language Cluster",
    kind: "shore",
    denizens: "the shorefolk",
    motto: "precise tides, precise words",
    treasure: "the Tideglass Mirror, which shows a conversation exactly as it was meant",
    guardian: "the Undertow Oni, patient, thorough, unimpressed by shortcuts",
    blessing: "can say more with a pause than the mainland says in a paragraph",
  },
  {
    id: "korea-shore",
    name: "the Korean Shore",
    atlasLabel: "Korean Language Cluster",
    kind: "shore",
    denizens: "the shore-bound",
    motto: "the fandom arrives before the news does",
    treasure: "the Comeback Banner, which unfurls itself the instant it's needed",
    guardian: "the Streaming-Party Djinn, granting exactly one wish: more views",
    blessing: "can organize a hundred strangers into one perfect chant",
  },
  {
    id: "turkish-shoal",
    name: "the Turkish Shoal",
    atlasLabel: "Turkish Language Minicluster",
    kind: "shoal",
    denizens: "the shoal-born",
    motto: "small waters, loud current",
    treasure: "the Undersung Coin, minted small and spent everywhere",
    guardian: "the Riptide Watcher, easy to miss and impossible to out-swim",
    blessing: "can turn a minicluster into a movement overnight",
  },
  {
    id: "persian-coast",
    name: "the Persian Coast",
    atlasLabel: "Persian Language Cluster",
    kind: "coast",
    denizens: "the coastborn",
    motto: "the poem outlasts the post",
    treasure: "the Verse Unbroken, a couplet that has survived every platform migration",
    guardian: "the Coastal Rememberer, who quotes the first draft back at you",
    blessing: "can turn a subpost into something worth actually reading",
  },
  {
    id: "ukraine-heights",
    name: "the Ukrainian Heights",
    atlasLabel: "Ukrainian Cluster",
    kind: "heights",
    denizens: "the heights-held",
    motto: "still standing, still posting",
    treasure: "the Unbowed Banner, weathered and still flying",
    guardian: "the Highland Watch, which has not once left its post",
    blessing: "can hold a line, online or otherwise, longer than anyone expects",
  },
  {
    id: "portugal-landing",
    name: "Portugal Landing",
    atlasLabel: "Portugal Cluster",
    kind: "landing",
    denizens: "the landing-folk",
    motto: "small cluster, warm welcome",
    treasure: "the Cork-Sealed Bottle, a message that always finds someone kind",
    guardian: "the Tidewarden, gentle unless you're rude to a guest",
    blessing: "can make any newcomer feel like they've always been here",
  },
];

// Adjacency is declared once, undirected, and mirrored below — the near
// islands ring the mainland's coast, and the language shores form their own
// ring across open water, per the general shape of the atlas map (one big
// English-language landmass, small special-interest islands close in,
// language clusters as their own separate archipelago).
const ADJACENT_PAIRS = [
  ["mainland", "politics-isle"],
  ["mainland", "furry-archipelago"],
  ["mainland", "himbo-cove"],
  ["mainland", "wrestling-peninsula"],
  ["mainland", "web3-marsh"],
  ["mainland", "education-outpost"],
  ["furry-archipelago", "himbo-cove"],
  ["himbo-cove", "wrestling-peninsula"],
  ["japan-shore", "korea-shore"],
  ["korea-shore", "turkish-shoal"],
  ["turkish-shoal", "persian-coast"],
  ["persian-coast", "ukraine-heights"],
  ["ukraine-heights", "portugal-landing"],
  ["portugal-landing", "japan-shore"],
];

// Special-case flavor for specific pairs, keyed both directions. Right now
// this is just the one relationship the build request itself quoted — an
// island next to a much bigger mainland reads, from the island's side, as
// "surrounded." Not every neighbor pair needs one of these; most read fine
// off the plain adjacency.
const RELATIONSHIP_NOTES = {
  "politics-isle|mainland": "small, loud, and permanently outnumbered by the coastline around it",
  "mainland|politics-isle": "one stubborn island that never stops shouting at the shore",
};

export function buildAdjacency(pairs = ADJACENT_PAIRS) {
  const adj = new Map();
  for (const r of REGIONS) adj.set(r.id, new Set());
  for (const [a, b] of pairs) {
    if (!adj.has(a) || !adj.has(b)) {
      throw new Error(`adjacency pair references unknown region: ${a} <-> ${b}`);
    }
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

export function regionById(id) {
  return REGIONS.find((r) => r.id === id) || null;
}

export function neighborsOf(id) {
  return Array.from(ADJACENCY.get(id) || []).map(regionById);
}

export function distantFrom(id) {
  const near = ADJACENCY.get(id) || new Set();
  return REGIONS.filter((r) => r.id !== id && !near.has(r.id));
}

export function relationshipNote(aId, bId) {
  return RELATIONSHIP_NOTES[`${aId}|${bId}`] || null;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeightedBool(rng, pTrue) {
  return rng() < pTrue;
}

export function defaultRng() {
  return Math.random;
}

const HERO_CLASSES = [
  "a wandering bard with three unfinished threads",
  "a disgraced knight, formerly of the mainland guard",
  "a self-taught alchemist mixing takes nobody asked for",
  "a lurker-turned-ranger, silent for years and suddenly very online",
  "a courier who has never once delivered a message on time",
  "a retired mercenary between grudges",
  "an apprentice cartographer who keeps redrawing the coastline",
  "a professional apologist, contracted by the sentence",
  "a rogue moderator who quit mid-shift and never looked back",
  "a doomposting oracle who is, infuriatingly, usually right",
  "a hedge-knight of no particular cluster, sworn to whoever's buying",
  "a chronicler keeping a ledger nobody reads until it matters",
];

const OBSTACLES = [
  "a bridge that only holds if nobody looks down at the replies",
  "a fog bank thick enough to hide a subtweet in",
  "a toll-troll who only accepts payment in citations",
  "a current that pulls hardest right when the thread gets good",
  "a checkpoint staffed entirely by very tired moderators",
  "a stretch of road paved with old screenshots, all of them load-bearing",
  "a storm that rolls in exactly when the discourse peaks",
  "a hollow where every echo comes back as a worse argument",
];

const TITLE_TEMPLATES = [
  (s) => `THE ${s.home.name.toUpperCase()} SAGA`,
  (s) => `${s.hero.class.split(" ").slice(-1)[0].toUpperCase()} OF THE ${s.home.kind.toUpperCase()}`,
  (s) => `A VOYAGE TO ${s.distant.name.toUpperCase()}`,
  (s) => `${s.home.name.toUpperCase()} AND ${s.neighbor.name.toUpperCase()}: ONE MORE CROSSING`,
  () => `THE LAST UNSENT QUEST`,
  (s) => `WHAT THE ${s.distant.kind.toUpperCase()} REMEMBERS`,
];

const TAGLINE_TEMPLATES = [
  (s) => `One hero, one grudge, one very long scroll back to ${s.home.name}.`,
  (s) => `${s.home.name} sends its worst-rested champion. It'll have to do.`,
  (s) => `The tide to ${s.distant.name} only comes in once. Everyone knew that. Nobody left on time.`,
  (s) => `Not a war. Just ${s.home.name} and ${s.neighbor.name}, refusing to be the first to apologize.`,
];

export function generateStory(rng = defaultRng()) {
  const home = pick(REGIONS, rng);
  const neighborPool = neighborsOf(home.id);
  const neighbor = neighborPool.length ? pick(neighborPool, rng) : pick(REGIONS.filter((r) => r.id !== home.id), rng);
  const distantPool = distantFrom(home.id).filter((r) => r.id !== neighbor.id);
  const distant = distantPool.length ? pick(distantPool, rng) : pick(REGIONS.filter((r) => r.id !== home.id), rng);

  const note = relationshipNote(home.id, neighbor.id);
  const isRival = note ? true : pickWeightedBool(rng, 0.45);

  const hero = {
    class: pick(HERO_CLASSES, rng),
  };

  const obstacle = pick(OBSTACLES, rng);
  const obstacle2 = pick(OBSTACLES.filter((o) => o !== obstacle), rng);

  const state = { home, neighbor, distant, note, isRival, hero, obstacle, obstacle2 };
  state.title = pick(TITLE_TEMPLATES, rng)(state);
  state.tagline = pick(TAGLINE_TEMPLATES, rng)(state);
  return state;
}

export const SCENES = [
  {
    title: "the homeland",
    build(s) {
      const { home, hero } = s;
      return `Every saga starts somewhere, and this one starts in ${home.name} — on the map, ${home.atlasLabel}, a ${home.kind} where ${home.denizens} live by one rule: "${home.motto}." Our hero is ${hero.class}, raised on ${home.name}'s one real gift — ${home.denizens} ${home.blessing}. It has never once been enough. Tonight it will have to be.`;
    },
  },
  {
    title: "the neighbor",
    build(s) {
      const { home, neighbor, note, isRival } = s;
      const relation = note
        ? note
        : isRival
        ? `close enough to squabble with constantly and never once actually leave`
        : `close enough to borrow a boat from without asking`;
      const framing = isRival
        ? `${home.name} and ${neighbor.name} have shared a coastline for longer than anyone can date, and ${relation}. Half of every local argument is secretly about them.`
        : `${home.name} and ${neighbor.name} have shared a coastline for longer than anyone can date — ${relation}. When the going gets bad, it's ${neighbor.denizens} who show up first.`;
      return `${framing} On the map, ${neighbor.name} reads as ${neighbor.atlasLabel}: a ${neighbor.kind} whose own motto — "${neighbor.motto}" — our hero has heard shouted across the water more times than they can count.`;
    },
  },
  {
    title: "the call",
    build(s) {
      const { distant } = s;
      return `Word arrives of ${distant.treasure}, said to be kept somewhere in ${distant.name} — on the map, ${distant.atlasLabel}, a ${distant.kind} far enough off that most of ${s.home.name} has only ever heard of it secondhand. Guarding it, or at least claiming to: ${distant.guardian}. Nobody in living memory has come back from ${distant.name} with a straight answer, let alone the treasure. Our hero packs anyway.`;
    },
  },
  {
    title: "the crossing",
    build(s) {
      const { home, neighbor, obstacle } = s;
      return `The road out of ${home.name} runs straight through ${neighbor.name}, whether either side likes it or not. ${obstacle[0].toUpperCase()}${obstacle.slice(1)} slows the crossing to a crawl. ${neighbor.denizens[0].toUpperCase()}${neighbor.denizens.slice(1)}, true to form, ${neighbor.blessing.replace(/^can /, "")} — and for once it's aimed at helping rather than needling. It's not enough to make the crossing easy. It's enough to make it possible.`;
    },
  },
  {
    title: "the guardian",
    build(s) {
      const { distant, obstacle2 } = s;
      return `${distant.name} greets its visitor the way it greets everyone: with ${obstacle2}, and then with ${distant.guardian}, unmoved by the whole journey it took to get here. There is a negotiation, or something close to one. There is very nearly a fight. In the end ${distant.treasure} changes hands not because it was won, but because ${distant.denizens} decided, collectively and without much discussion, that the hero had earned the right to ask twice.`;
    },
  },
  {
    title: "the return",
    build(s) {
      const { home, tagline } = s;
      return `The road home is shorter than the road out, the way it always is. ${home.name} hears the story before the hero's even through the gate, half-true by the second telling and gospel by the third. Nothing about ${home.name} has changed. Something about the hero has. "${tagline}"`;
    },
  },
];

export function sceneText(index, state) {
  return SCENES[index].build(state);
}
