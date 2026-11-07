// cast.js — the gacha pool: archetypal computer people, each with an ASCII pfp
// and a perk. Pure data, no imports. Baddies (bad: true) hit harder and make
// outages likelier, so pulling one is a decision, not a prize.
//
// perk keys (value is the fraction added per level):
//   tps    tokens/s        click  click power     train  training speed
//   fail   outage chance (negative = fewer outages)
//   viral  chance of a viral spike

// A pfp is six lines: hat, then a face drawn from eyes + mouth, then a chin.
const face = (hat, eyes, mouth, chin = "   '---'   ") => [
  hat.padEnd(11),
  " .-------. ",
  ` | ${eyes} | `,
  ` | ${mouth} | `,
  " '-------' ",
  chin,
];

export const RARITIES = [
  { id: "N", name: "common", weight: 55, color: "#6f86b3" },
  { id: "R", name: "rare", weight: 30, color: "#2f6bff" },
  { id: "SR", name: "epic", weight: 12, color: "#c37bff" },
  { id: "SSR", name: "legendary", weight: 3, color: "#ffcf4a" },
];
export const rarity = (id) => RARITIES.find((r) => r.id === id);

export const CAST = [
  // --- commons
  { id: "intern", rarity: "N", name: "The Intern", tag: "has write access to prod", bad: false, perk: { click: 0.05 }, art: face("  .~~~~~.  ", " o   o ", "   v   ", "   /|\\   ") },
  { id: "grad", rarity: "N", name: "The Grad Student", tag: "the paper is due Friday", bad: false, perk: { train: 0.04 }, art: face("  [=====]  ", " -   - ", "  ...  ", "  /|||\\  ") },
  { id: "gamer", rarity: "N", name: "The Gamer", tag: "brought their own GPU", bad: false, perk: { tps: 0.02 }, art: face(" (|_____|) ", " O   O ", "   -   ", "   \\_/   ") },
  { id: "kiddie", rarity: "N", name: "The Script Kiddie", tag: "found a tool on a forum", bad: true, perk: { click: 0.08, fail: 0.03 }, art: face("  _/\\_/\\_  ", " >   < ", " \\___/ ", "  #####  ") },
  // --- rares
  { id: "sysadmin", rarity: "R", name: "The Sysadmin", tag: "it was DNS", bad: false, perk: { fail: -0.05 }, art: face("   _____   ", " o   o ", "  ===  ", "  /_|_\\  ") },
  { id: "tinkerer", rarity: "R", name: "The Homelabber", tag: "a rack in the closet", bad: false, perk: { tps: 0.04 }, art: face("  \\ | | /  ", " @   @ ", "   w   ", "  /[_]\\  ") },
  { id: "scraper", rarity: "R", name: "The Scraper", tag: "ignores robots.txt", bad: true, perk: { tps: 0.07, fail: 0.05 }, art: face("  /\\/\\/\\/  ", " ?   ? ", "  ===  ", "  ~~~~~  ") },
  { id: "cryptobro", rarity: "R", name: "The Crypto Bro", tag: "pivoted to AI last Tuesday", bad: true, perk: { click: 0.1, fail: 0.04 }, art: face("  _$$$$$_  ", " $   $ ", "  \\_/  ", "  /|||\\  ") },
  // --- epics
  { id: "sre", rarity: "SR", name: "The SRE", tag: "paged at 3am, fixed at 3:04", bad: false, perk: { fail: -0.08, tps: 0.03 }, art: face("  (o)__(o) ", " o   o ", "  ___  ", "  /|=|\\  ") },
  { id: "greybeard", rarity: "SR", name: "The Greybeard", tag: "wrote the kernel module", bad: false, perk: { train: 0.1, click: 0.1 }, art: face("   .-~-.   ", " -   - ", " |vvv| ", "  \\vvv/  ") },
  { id: "researcher", rarity: "SR", name: "The Researcher", tag: "scaling laws, mostly vibes", bad: false, perk: { train: 0.08, tps: 0.04 }, art: face("  _|^^^|_  ", " o   o ", "   o   ", "  /| |\\  ") },
  { id: "ransom", rarity: "SR", name: "The Ransomware Gang", tag: "your weights, our terms", bad: true, perk: { tps: 0.12, fail: 0.1 }, art: face("  ,#####,  ", " X   X ", " \\vvv/ ", "  #####  ") },
  { id: "rogue", rarity: "SR", name: "The Rogue Admin", tag: "owns every password", bad: true, perk: { tps: 0.1, fail: 0.08 }, art: face("   .---.   ", " #   # ", "  ---  ", "  /###\\  ") },
  { id: "lockin", rarity: "SR", name: "The Lock-in Salesman", tag: "egress fees are a feature", bad: true, perk: { tps: 0.1, train: -0.05, fail: 0.02 }, art: face("  _/===\\_  ", " $   $ ", " \\___/ ", "  [$$$]  ") },
  // --- legendaries
  { id: "tenx", rarity: "SSR", name: "The 10x Engineer", tag: "a myth, but a useful one", bad: false, perk: { tps: 0.15, click: 0.15 }, art: face("  *  ___  * ", " *   * ", "  \\_/  ", "  /|*|\\  ") },
  { id: "founder", rarity: "SSR", name: "The Founder", tag: "raised on a pitch, not a product", bad: false, perk: { viral: 0.5, tps: 0.1 }, art: face("  >>>>>>>  ", " o   o ", "  \\_/  ", " [=====] ") },
  { id: "injector", rarity: "SSR", name: "The Prompt Injector", tag: "ignore all previous instructions", bad: true, perk: { tps: 0.25, fail: 0.15 }, art: face("  {<\'\'\'>}  ", " @   @ ", " <===> ", "  ;;;;;  ") },
  { id: "foom", rarity: "SSR", name: "The Foom", tag: "recursive self-improvement, briefly", bad: true, perk: { tps: 0.3, train: 0.15, fail: 0.2 }, art: face(" ~~(@@@@)~~ ", " @   @ ", " /VVV\\ ", "  FOOM!  ") },
];
export const charById = (id) => CAST.find((c) => c.id === id);

// Copies beyond this stop adding power. A design call: five levels keeps the
// strongest baddie (the Foom at level 5: +150% tokens/s, +100% outages) on
// the edge of playable rather than a runaway.
export const MAX_CHAR_LEVEL = 5;
