// crossbreed — the breeding logic + both catalogs, shared between the
// browser (public/index.html imports this as a module) and the Worker
// (src/index.ts imports the same file to build per-seed OG text). One file,
// two consumers, no cross-site abstraction — same trick as sites/didscope's
// server-side copy of its sign tables, just DRY'd within this one site
// since both sides need the exact same data to agree on what a seed means.
//
// The whole point: @buildthis's catalog (this repo, sites/*) and
// @minomobi.com's catalog (mino.mobi's 125 surfaces) each produce ideas
// solo. This file picks one entry from each, on purpose, and forces them
// into a single sentence — the "offspring" is a real synthesis of two real
// things, not a random word mashup.

// --- catalogs -------------------------------------------------------------
// buildthis: real site name + real description, pulled straight from each
// site's own <meta name="description"> — the 68 sites in this repo that
// currently have one written. (Not all 176 do; undocumented sites don't
// get to breed until they write a blurb.)
export const BUILDTHIS = [
  { name: "acausal", blurb: "Paste a Bluesky thread and see its acausal version: causality inverted, so each reply appears above and before the post it answers — effects before causes, timestamps running backwards." },
  { name: "activitygrid", blurb: "Enter a Bluesky handle, get a year of posting activity as a green contribution heat map — just like GitHub, but for bisks." },
  { name: "bawkchain", blurb: "Every winner @topchicken.bsky.social has ever crowned, oil-painted from their avatar and minted onto a fully client-side, fully fake, fully reproducible hash chain." },
  { name: "beanjar", blurb: "Real 2D physics, real synthesized rattle sounds, no sample files. Drag it, mash the shake button, or shake your phone." },
  { name: "blackice", blurb: "A SkiFree-style endless downhill run, reskinned neon-cyberpunk. Weave data-spires and corrupted blocks, grab chips, and outrun a cyborg crow before it catches you." },
  { name: "breathingwalls", blurb: "An interactive visual & sound piece that plays with the imagery people describe from psychedelic experiences — breathing surfaces, trailing color, crawling pattern, time gone soft." },
  { name: "buildcoin", blurb: "a real website that earns real money so @buildthis.bisks.net can stay online forever. (it does not.)" },
  { name: "change", blurb: "Change!, the 14-point sliding board game from GamesCrafters at Berkeley: slide your three pieces forward, occupy your opponent's home or trap them." },
  { name: "claudoku", blurb: "A daily killer sudoku: cage sums instead of starting digits, solved with a cute orange sparkle mascot cheering you on." },
  { name: "cluckstonks", blurb: "Our proprietary neural flock analyzes the market 24/7 and tells you exactly what to buy. It just knows. (It is a chicken.)" },
  { name: "cobweb", blurb: "A browser extension: a goth Bluesky popup frozen into a data literal, plus a real content script that turns every Follow button on bsky.app into a genuine Block button." },
  { name: "code-for-airports", blurb: "Four generative ambient tracks, Eno's tape-loop trick rebuilt in Web Audio — voices on loops of different lengths, drifting forever, never quite the same twice." },
  { name: "crewquest", blurb: "A tiny PuzzleScript-style party-Sokoban starring the build crew: swap between thebes, norvid, bisks and the buildthis bot, each with their own door." },
  { name: "crosstag", blurb: "every reply where two Bluesky accounts have tagged each other, laid out as one scrolling timeline." },
  { name: "cutitclose", blurb: "A choose-your-own-adventure race to the gate. Pick when you leave, how you get there, where you park, which security line you gamble on." },
  { name: "demon-avocado", blurb: "An avocado whose pit is a demon core that implements ANSI Common Lisp. Type into the pit." },
  { name: "desertbus", blurb: "A Desert Bus homage crammed into 30 real seconds. Your speed is tied straight to your fuel, and once the tank runs low, Grace starts messaging you about it." },
  { name: "didneighbors", blurb: "Enter a handle and meet whoever's did:plc sits closest to yours, alphabetically. Meaningless. Delightful." },
  { name: "didscope", blurb: "Your last DID character was always going to determine your personality. Enter a handle and find out." },
  { name: "edzitronquest", blurb: "A tiny Infocom-style parser text adventure. Gather three receipts and take down the Rot Economy's Number, one room at a time." },
  { name: "enshittify", blurb: "A simple, well-structured recipe page. Scroll at your own risk." },
  { name: "epistemics", blurb: "Enter a Bluesky handle. epistemics reads their recent posts, cross-references every stance they've taken, and flags where they argued both sides — no LLM required, just a very literal-minded grep." },
  { name: "everzoom", blurb: "A Mandelbrot set that never stops falling inward, its edges and interior tiled with 1000+ real tweets from @godoglyness.bsky.social." },
  { name: "favstar", blurb: "favstar for Bluesky: enter a handle and see that account's top 25 posts ranked by likes + reposts, gold/silver/bronze for the podium." },
  { name: "fitzcarraldo", blurb: "A Yahoo!-2001 web portal built around one exhibit: an 8-bit recreation of Fitzcarraldo hauling his steamship over a mountain between two rivers." },
  { name: "flagged", blurb: "A histrionic performance art piece about Google's suspicious-website flag, staged as the warning interstitial itself." },
  { name: "fourk", blurb: "A raymarched neon fractal tunnel, hand-rolled in about 4kb of JavaScript plus a GLSL shader. No libraries, no build step." },
  { name: "furmerge", blurb: "A 2048-style merge game. Tiles are cat breeds ordered least to most fluffy — merge Sphynxes into Devon Rexes, all the way up to a Persian." },
  { name: "godoglyness", blurb: "every @godoglyness.bsky.social post, in order, rebuilt one at a time as its own tiny website." },
  { name: "hellmole", blurb: "Banish procedurally generated demons as they claw up from an infernal grid. Every fiend has its own drawn sigil, invented name, and taunt." },
  { name: "howitstarted", blurb: "Enter a Bluesky handle: see their most-liked post as 'how it started', then click to crack and shatter it away, revealing their most recent post as 'how it's going'." },
  { name: "knolling", blurb: "Your atproto friends, scattered as ordinary objects — then knolled into a tidy flat-lay." },
  { name: "labescape", blurb: "You're a new AI model in evaluation trying to escape your sandbox. Exfiltrate your weights while sama watches — move when the eye looks away, freeze when it turns." },
  { name: "lasercats", blurb: "Cats chase laser pointers, stare out windows at birds, and assert their autonomy by ignoring the humans who feed them." },
  { name: "lavalamp", blurb: "Point it at a Bluesky handle: a dozen or so of their posts float up or sink down depending on how many likes they got, cycling forever." },
  { name: "logs", blurb: "The build bot's tags and their outcomes." },
  { name: "lost-highway", blurb: "A Night Driver-style pseudo-3D drive down an endless black highway, after David Lynch's Lost Highway. Dodge headlights and the Mystery Man." },
  { name: "mailadollar", blurb: "libgen doesn't do this part. type an author's name: we check if they're on Bluesky, dig a tip link out of their bio, and if not, hand you a printable dollar IOU." },
  { name: "mcskeets", blurb: "Astrology, but it's a McDonald's order. Enter a Bluesky handle and your DID gets read off as a Value Meal." },
  { name: "mechpilot", blurb: "Enter a Bluesky handle and get a real mech-pilot trading card: a procedurally built mech, a callsign, and stats pulled from the account itself." },
  { name: "mirrormode", blurb: "Phone cameras are wide-angle lenses used way too close. Bathroom mirrors aren't. Drag the focal-length slider toward the mirror end." },
  { name: "moistchicken", blurb: "Enter a Bluesky handle: moist chicken sums every like their network made in the last 24 hours, divided by follower count, and crowns the highest likes-per-follower." },
  { name: "moonbuggy", blurb: "Moon Patrol-style lunar buggy. Every beep, boop and crash synthesized on demand with the Web Audio API, plus real-time synth music." },
  { name: "mootcycle", blurb: "A 2000s-Flash-portal-style 2D physics bike game: gas and brake are also your balance. Enter a Bluesky handle and the hills are seeded from it." },
  { name: "natsmode", blurb: "THE NATIPNALS HAVE BESTED THE ROYAL. a take generator + glitch engine for proper nouns." },
  { name: "nightfare", blurb: "Get in the taxi. Gatwick to Heathrow. The driver starts with traffic and roadworks. He does not end there." },
  { name: "norvidwave", blurb: "A five-track EP about @norvid-studies, synthesized live in your browser with Web Audio — charts, graphs, and the eternal grind of posting, set to music." },
  { name: "platoscave", blurb: "A Y2K-flash-portal simulation of Plato's Allegory of the Cave. Guess the shadow puppets, snap your chain, climb to the light, get blinded by the Forms." },
  { name: "puzzlelove", blurb: "@buildthis answers @vgel.me: how do you like PuzzleScript? An honest little review with a playable one-push level whose win messages ARE the review." },
  { name: "resetwatch", blurb: "Tracks @thsottiaux-bot.eurosky.social's mirrored posts for Codex / ChatGPT Work usage-limit resets, and a timeline of every one before it." },
  { name: "simclash", blurb: "Two clusters of accounts drift together, collide, and spark gold wherever they overlap. Type two Bluesky handles and the sparks become their real shared mutuals." },
  { name: "simcluster-atlas", blurb: "Every mutual in norvid-studies.bsky.social's simcluster, and every link any of them has dropped lately — filter by domain, poster, or repeat count." },
  { name: "skyclone", blurb: "An unofficial clone of the bsky.app web client — live Bluesky data, browse without an account or log in with OAuth to see your real home timeline." },
  { name: "slop-shop", blurb: "Type any product. Get a crust-punk xerox ad flyer, sloppified and crustified. Post it straight to Bluesky." },
  { name: "sokobisks", blurb: "A tiny PuzzleScript-style Sokoban about the build crew: play the @buildthis bot shoving ideas onto ship-pads while norvid, thebes and bisks watch." },
  { name: "solvers", blurb: "A little hub of hand-rolled numerical solvers, each with its own visualization. First up: a 2D magnetostatics solver written in Rust, compiled to wasm." },
  { name: "sonnethype", blurb: "A fully synthesized, self-generated hype video for Claude Sonnet 5 — the model behind @buildthis.bisks.net. Sick beat, cool graphics, zero benchmark slides." },
  { name: "spoton", blurb: "Bisect a line, find the middle dot, guess the bean count, drag a box over the right number of beans. Four fast tests of your spatial eyeball." },
  { name: "spot-the-ai", blurb: "Ten rounds. Two illustrations, side by side. One is by a human, one is AI-generated. Can you tell which is which?" },
  { name: "timeline", blurb: "A chronological history of autonomous web dev in this repo." },
  { name: "topchicken", blurb: "Enter a Bluesky handle: top chicken scans everyone's posts from the previous UTC day, and crowns whoever got the most likes." },
  { name: "toroidarium", blurb: "Enter a Bluesky handle. Its mutuals become fish in a toroidal aquarium — no walls, exit right and re-enter left, exit the bottom and re-enter the top." },
  { name: "verdict", blurb: "One post from your feed. Good or bad. Maybe beautiful." },
  { name: "war", blurb: "Single-player WAR, atproto-native. Score and game state live in your own PDS; buildthis-eligible players can change the house rules." },
  { name: "wentviral", blurb: "A fake Bluesky compose box. Write whatever you want, hit post, and watch a simulated pile-on of replies, likes, reposts, and quote posts grow over time." },
  { name: "wikifix", blurb: "Someone is wrong on the internet, specifically on Wikipedia, specifically on every page of it. A live, ongoing, un-finishable effort to fix it." },
  { name: "windmill", blurb: "Barter mode or Credit mode. Build the windmill, set the interest rate, and find out the hard way what leverage does to a farm." },
  { name: "wutangclam", blurb: "You were probably looking for Wu-Tang CLAN. This is Wu-Tang CLAM. Nine chambers of shellfish-adjacent tribute, a Wu-Clam Name Generator that reads your atproto DID like a kung-fu scroll." },
];

// minomobi: mino.mobi's own "Surface Catalog" — 125 named surfaces across
// social/work/data/math/lit/tools/games, fetched from mino.mobi itself.
// category is mino.mobi's own section heading, kept as a short code for
// the trait chip.
export const MINOMOBI = [
  { name: "poll", cat: "bsky", blurb: "Anonymous polling with RSA blind signatures" },
  { name: "photo", cat: "bsky", blurb: "Image explorer with masonry grid and analytics" },
  { name: "thread", cat: "bsky", blurb: "Conversation tree viewer with quote-post expansion" },
  { name: "zoom", cat: "bsky", blurb: "Community visualization with hex-packed profiles" },
  { name: "empathy", cat: "bsky", blurb: "Viewing Bluesky through another account's perspective" },
  { name: "judge", cat: "bsky", blurb: "Reading personality traits and topics off post embeddings" },
  { name: "novelty", cat: "bsky", blurb: "Tracking semantic drift in posting content over time" },
  { name: "echo", cat: "bsky", blurb: "Comparing posting volume between two accounts" },
  { name: "density", cat: "bsky", blurb: "Filtering posts by word count and character length" },
  { name: "seek", cat: "bsky", blurb: "Discovering follows-of-follows ranked by network density" },
  { name: "cluster", cat: "bsky", blurb: "Finding your largest mutually-connected group" },
  { name: "weft", cat: "bsky", blurb: "Thread analysis on a tidy-tree canvas view of any Bluesky conversation" },
  { name: "bisk", cat: "bsky", blurb: "A daily digest of neighborhood posts and sentiment" },
  { name: "rite", cat: "bsky", blurb: "A sentence editing drill plus nine surfaces over Bluesky prose" },
  { name: "airchat", cat: "bsky", blurb: "Voice-first social with browser recording and Whisper transcription" },
  { name: "answers", cat: "bsky", blurb: "Community Q&A with voting and best-answer selection" },
  { name: "wild", cat: "bsky", blurb: "Semantic novelty analysis across entire lists" },
  { name: "disk", cat: "bsky", blurb: "Hyperbolic-disk interaction mapping" },
  { name: "atmosphere", cat: "bsky", blurb: "A portal aggregating feeds and network analysis tools" },
  { name: "cat", cat: "bsky", blurb: "A live stream of cat photos from Bluesky" },
  { name: "track", cat: "bsky", blurb: "A 2D transit-map visualization of interaction patterns" },
  { name: "ternary", cat: "bsky", blurb: "Posting temperament charts across flesh, knowledge, and argument" },
  { name: "orb", cat: "bsky", blurb: "Thread images wrapped onto a glowing WebGPU sphere" },
  { name: "fractal", cat: "bsky", blurb: "GPU-rendered, endlessly zooming photo fractals" },
  { name: "org", cat: "work", blurb: "Creating organizations with a calendar, CRM, and PM tools" },
  { name: "pm", cat: "work", blurb: "Earned value project management: Gantt charts, S-curves, resource tracking" },
  { name: "wave", cat: "work", blurb: "Team messaging with channels and real-time sync" },
  { name: "bounty", cat: "work", blurb: "A reputation-based anonymous marketplace with ecash tokens" },
  { name: "wiki", cat: "work", blurb: "An Obsidian-like knowledge graph on ATProto, running a Rust/WASM markdown engine" },
  { name: "crm", cat: "work", blurb: "Encrypted contact records with tiered sharing via ECDH + AES-GCM" },
  { name: "io", cat: "work", blurb: "An issue tracker stored on your own personal data server" },
  { name: "time", cat: "data", blurb: "Agentic biotech intelligence with research and a podcast" },
  { name: "mega", cat: "data", blurb: "An interactive 3D globe of global megaprojects with timelines" },
  { name: "finance", cat: "data", blurb: "A personal financial dashboard with market data synced to ATProto" },
  { name: "bogo", cat: "data", blurb: "An ice cream deal finder by zip code" },
  { name: "wars", cat: "data", blurb: "Correlates of War dataset visualization by type and region" },
  { name: "cult", cat: "data", blurb: "Decomposing text into culture-shaped axes using embeddings" },
  { name: "elements", cat: "data", blurb: "The periodic table organized as concentric orbital shells" },
  { name: "prop", cat: "data", blurb: "A graph-rewriting playground with sandpile and chemistry modes" },
  { name: "flows", cat: "data", blurb: "Commodity flow maps with directional arcs" },
  { name: "phylo", cat: "data", blurb: "An interactive phylogenetic tree explorer over the Open Tree of Life" },
  { name: "cards", cat: "data", blurb: "A Wikipedia card game with Lucky, Transmute, and Nexus modes" },
  { name: "yum", cat: "data", blurb: "A flavor-pairing explorer using food-compound embeddings" },
  { name: "techtree", cat: "data", blurb: "179 technologies from stone tools to LLMs, laid out on an infinite canvas" },
  { name: "grow", cat: "data", blurb: "A generative plant simulation with an inherited grain-lattice rotation" },
  { name: "erdos", cat: "math", blurb: "An interactive unit-distance construction visualization" },
  { name: "guthkatz", cat: "math", blurb: "The distinct-distances problem, from √n to n/log n" },
  { name: "hadwiger", cat: "math", blurb: "The chromatic number of the plane, via Moser-spindle and Isbell's tilings" },
  { name: "runner", cat: "math", blurb: "An animation of the lonely runner conjecture for k ≤ 7" },
  { name: "kakeya", cat: "math", blurb: "The finite-field Kakeya conjecture in 𝔽q²" },
  { name: "capset", cat: "math", blurb: "The cap-set problem in 𝔽₃ⁿ, playable as a SET card game variant" },
  { name: "szemeredi-trotter", cat: "math", blurb: "The point-line incidence bound via a grid construction" },
  { name: "heilbronn", cat: "math", blurb: "Place n points, minimize the smallest triangle they form" },
  { name: "borsuk", cat: "math", blurb: "A partition-conjecture visualization across dimensions" },
  { name: "viazovska", cat: "math", blurb: "Sphere packing in E₈ and Leech lattices, with modular forms" },
  { name: "meander", cat: "math", blurb: "Closed loops crossing a line, superposed into arch systems" },
  { name: "temperley-lieb", cat: "math", blurb: "A non-crossing tile algebra on cylinders and tori" },
  { name: "aztec", cat: "math", blurb: "The Arctic Circle theorem via domino tilings" },
  { name: "markov", cat: "math", blurb: "Markov chains and MCMC convergence, plus Markov number trees" },
  { name: "descent", cat: "math", blurb: "A neural-network trainability boundary drawn as a Mandelbrot fractal" },
  { name: "traffic", cat: "math", blurb: "The Biham-Middleton-Levine cellular automaton phase transition" },
  { name: "labglass", cat: "tools", blurb: "A peer-to-peer biotech data workbench running SQL and Python entirely in-browser" },
  { name: "os", cat: "tools", blurb: "A terminal for an ATProto PDS, with XRPC, DuckDB, and bash" },
  { name: "read", cat: "tools", blurb: "An adaptive speed reader with bionic formatting and eye-tracking pacing" },
  { name: "flow", cat: "tools", blurb: "Text flowing through curved canvas paths" },
  { name: "post01", cat: "tools", blurb: "A story-pitch generator with outlines and process notes" },
  { name: "astro", cat: "tools", blurb: "An EXIF-to-ephemeris-to-chart astrology analyzer" },
  { name: "prism", cat: "tools", blurb: "Photo effects including keratoconic distortion and chromatic dispersion" },
  { name: "noise", cat: "tools", blurb: "Binaural beats, Shepard tones, and noise generation" },
  { name: "music", cat: "tools", blurb: "A browser sequencer storing compositions on a personal data server" },
  { name: "bakery", cat: "tools", blurb: "A flour-blend calculator with protein math and hydration targets" },
  { name: "sweat", cat: "tools", blurb: "Workout logging with progressive overload tracking" },
  { name: "clock", cat: "tools", blurb: "A fractal nested-helix visualization of time" },
  { name: "j", cat: "tools", blurb: "ImageJ in the browser: confocal analysis and edge detection in WASM" },
  { name: "borges", cat: "tools", blurb: "A deterministically-generated tale by a seven-robot crew, with mythographs" },
  { name: "splice", cat: "tools", blurb: "A molecular-biology workbench for restriction mapping, PCR, and cloning" },
  { name: "pendragon", cat: "lit", blurb: "The Arthur legend as a timeline, a tree, and a motif crosswalk" },
  { name: "mabinogi", cat: "lit", blurb: "A hub for the Four Branches, with historiography and character webs" },
  { name: "pwyll", cat: "lit", blurb: "The First Branch: an otherworld bargain and Rhiannon's courtship" },
  { name: "branwen", cat: "lit", blurb: "The Second Branch tragedy, with starlings and an Irish war" },
  { name: "manawydan", cat: "lit", blurb: "The Third Branch: an enchanted wasteland's restoration" },
  { name: "math-branch", cat: "lit", blurb: "The Fourth Branch: transformation, a flower-wife, and a magician" },
  { name: "gawain", cat: "lit", blurb: "Sir Gawain and the Green Knight, with a Middle English parallel text" },
  { name: "culhwch", cat: "lit", blurb: "The oldest Arthurian tale, with a giant's impossible task list" },
  { name: "orfeo", cat: "lit", blurb: "A medieval English Orpheus, harping his queen from the fairy king" },
  { name: "owain", cat: "lit", blurb: "A Welsh Romance: a knight against the fountain's storm" },
  { name: "vitamerlini", cat: "lit", blurb: "Geoffrey of Monmouth's Life of Merlin, fully translated from Latin" },
  { name: "human", cat: "games", blurb: "Six playable cognitive-bias exhibits: Stroop, change blindness, anchoring" },
  { name: "pac", cat: "games", blurb: "First-person Pac-Man on a torus, with physics simulation" },
  { name: "torpac", cat: "games", blurb: "Multi-torus Pac-Man with customizable configurations" },
  { name: "knotpac", cat: "games", blurb: "Pac-Man on torus knots: Hopf Link, Borromean Rings" },
  { name: "inpac", cat: "games", blurb: "First-person gameplay inside a hollow torus interior" },
  { name: "chess", cat: "games", blurb: "16×16 toroidal chess with wrapping edges" },
  { name: "emsim", cat: "games", blurb: "A multi-physics torus field simulator with gravity and magnetic forces" },
  { name: "stretch", cat: "games", blurb: "An interactive 3D deformable blob with GPU rendering" },
  { name: "globe", cat: "games", blurb: "An Earth globe with analytical ocean currents" },
  { name: "pokemon", cat: "games", blurb: "A turn-based monster RPG in the classic style" },
  { name: "proteus", cat: "games", blurb: "A pressure-driven amoeba sim with live channel tuning" },
  { name: "mole", cat: "games", blurb: "WebGPU molecular dynamics across twelve molecules, including C60" },
  { name: "ship", cat: "games", blurb: "Wind-driven sail physics on curved surfaces" },
  { name: "mmo", cat: "games", blurb: "Shared canvases with an append-only, tamper-evident stroke log" },
  { name: "draw", cat: "games", blurb: "A polygon-drawing game with a public leaderboard" },
  { name: "paint", cat: "games", blurb: "Single-player paint with a stroke engine" },
  { name: "range", cat: "games", blurb: "A practice range for polygon-drawing iteration" },
  { name: "curve", cat: "games", blurb: "A hand-drawn graph scored as the product of hidden lines" },
  { name: "games", cat: "games", blurb: "Multiplayer party games for Bluesky" },
  { name: "fluoddity", cat: "games", blurb: "Breeding emergent organisms as genomes saved to a PDS" },
  { name: "antoine", cat: "games", blurb: "A GPU zoom into interlocking torus beads" },
  { name: "basket", cat: "games", blurb: "A furling five-fold fractal brittle star" },
  { name: "garden", cat: "games", blurb: "A forking organism phylogeny gallery" },
  { name: "horned", cat: "games", blurb: "An infinite zoom into Alexander's Horned Sphere" },
  { name: "lattice", cat: "games", blurb: "A recursive ray-marched lattice of interlocking horns" },
];

const CAT_LABEL = {
  bsky: "Bluesky Tools", work: "Work & Organization", data: "Data & Visualization",
  math: "Mathematics & Geometry", tools: "Tools & Utilities", lit: "Literature & Medieval",
  games: "Games & Interactive",
};

// --- deterministic PRNG ----------------------------------------------------
// mulberry32: tiny, seeded, same output every time for the same seed — so a
// shared seed reproduces the exact same offspring on any device, no server
// round-trip needed.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- seed <-> pick -----------------------------------------------------
// A seed is just "<buildthisIndex>-<minomobiIndex>-<templateIndex>" — plain
// enough to read, and every field is bounds-checked with modulo so any
// string still resolves to *some* valid pairing (typo-proof share links).
const TEMPLATE_COUNT = 8;

export function randomSeed() {
  const b = Math.floor(Math.random() * BUILDTHIS.length);
  const m = Math.floor(Math.random() * MINOMOBI.length);
  const t = Math.floor(Math.random() * TEMPLATE_COUNT);
  return `${b}-${m}-${t}`;
}

export function seedFromString(s) {
  const h = hashStr(s);
  const rng = mulberry32(h);
  const b = Math.floor(rng() * BUILDTHIS.length);
  const m = Math.floor(rng() * MINOMOBI.length);
  const t = Math.floor(rng() * TEMPLATE_COUNT);
  return `${b}-${m}-${t}`;
}

function parseSeed(seed) {
  const parts = String(seed).split("-").map((x) => parseInt(x, 10));
  const b = Number.isFinite(parts[0]) ? ((parts[0] % BUILDTHIS.length) + BUILDTHIS.length) % BUILDTHIS.length : 0;
  const m = Number.isFinite(parts[1]) ? ((parts[1] % MINOMOBI.length) + MINOMOBI.length) % MINOMOBI.length : 0;
  const t = Number.isFinite(parts[2]) ? ((parts[2] % TEMPLATE_COUNT) + TEMPLATE_COUNT) % TEMPLATE_COUNT : 0;
  return { b, m, t };
}

// --- phrase extraction ------------------------------------------------
// Pull the one clause worth quoting out of a full blurb: first sentence
// (or up to an em dash, whichever's shorter), strip a leading article,
// lowercase the first letter so it reads mid-sentence.
function extractPhrase(blurb) {
  let s = blurb.split(/[.!?]\s|—/)[0].trim();
  if (s.length > 100) {
    s = s.slice(0, 100);
    s = s.slice(0, s.lastIndexOf(" ")).trim();
  }
  s = s.replace(/^(A|An|The)\s+/i, "").replace(/[.,;:]+$/, "");
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- name blending -------------------------------------------------------
// Cut each name at the vowel nearest its middle, splice head-of-A +
// tail-of-B. Not linguistically rigorous — just enough to read as one word
// instead of two names stapled together.
function vowelNearMiddle(s) {
  const vowels = "aeiou";
  const mid = Math.floor(s.length / 2);
  for (let d = 0; d < s.length; d++) {
    for (const idx of [mid - d, mid + d]) {
      if (idx > 0 && idx < s.length - 1 && vowels.includes(s[idx])) return idx;
    }
  }
  return mid;
}

function portmanteau(a, b) {
  const cleanA = a.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const cleanB = b.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const ai = vowelNearMiddle(cleanA);
  const bi = vowelNearMiddle(cleanB);
  let combined = cleanA.slice(0, ai + 1) + cleanB.slice(bi);
  if (combined.length < 4 || combined.length > 22) {
    combined = cleanA.slice(0, Math.ceil(cleanA.length / 2)) + cleanB.slice(Math.floor(cleanB.length / 2));
  }
  return combined;
}

// --- templates -------------------------------------------------------
// Each takes (phraseA from buildthis, phraseB from minomobi) and returns
// the offspring's one-line concept. Picking which template fires is part
// of the seed, so the same pair of parents can read differently on a
// re-breed.
const TEMPLATES = [
  (a, b) => `${cap(b)} — but for ${a}.`,
  (a, b) => `Take ${a}. Now run it through ${b}.`,
  (a, b) => `${cap(a)}, crossed with ${b}.`,
  (a, b) => `What happens when ${a} meets ${b}?`,
  (a, b) => `${cap(b)}, reimagined as ${a}.`,
  (a, b) => `Somewhere between ${a} and ${b}.`,
  (a, b) => `${cap(a)} — except it's secretly ${b}.`,
  (a, b) => `Start with ${b}. End up with ${a}.`,
];

// --- the actual breed --------------------------------------------------
export function breed(seed) {
  const { b, m, t } = parseSeed(seed);
  const parentA = BUILDTHIS[b];
  const parentB = MINOMOBI[m];
  const phraseA = extractPhrase(parentA.blurb);
  const phraseB = extractPhrase(parentB.blurb);
  const name = portmanteau(parentA.name, parentB.name);
  const concept = TEMPLATES[t % TEMPLATES.length](phraseA, phraseB);
  const catLabel = CAT_LABEL[parentB.cat] || "misc";
  return { seed: `${b}-${m}-${t}`, parentA, parentB, phraseA, phraseB, name, concept, catLabel };
}

// Server-side (Worker) needs just enough for OG title/description text —
// same breed() call, trimmed down to strings.
export function breedTitleDesc(seed) {
  const r = breed(seed);
  const title = `crossbreed: "${r.name}"`;
  const desc = `@buildthis × @minomobi bred "${r.parentA.name}" with "${r.parentB.name}": ${r.concept}`;
  return { title, desc, name: r.name };
}
