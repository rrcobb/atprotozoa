// subgenres.js — one-sentence descriptions for the subgenre taxonomy.
// Unlike genres/supers (see genres.js, a fixed six-plus-two set), subgenres
// are freeform: sync-catalog.mjs's subgenreFor() promotes whatever distinct
// site.tag value shows up under a genre, so the set grows on its own as the
// bot builds more sites. SUBGENRE_DESCRIPTIONS hand-covers every pair seen
// in the catalog as of 2026-08-29; subgenreDescription() below always
// returns *something* for a pair not yet hand-described, so a brand-new tag
// never renders with no description at all.

export const SUBGENRE_DESCRIPTIONS = {
  "game::quiz": "Quizzes proper — a set of questions with right answers and a final score, the most literal kind of game in the catalog.",
  "toy::generator": "Toys that spit out something new each time you hit go — names, images, phrases — with no other interaction beyond regenerating.",
  "tool::leaderboard": "Tools built around a ranked list, usually pulled live from a follow graph or posting history rather than user-submitted scores.",
  "joke::leaderboard": "A leaderboard played entirely for the bit — the ranking exists to make a point, not to be taken seriously.",
  "toy::browser-local": "Toys that never leave your browser — all state lives in localStorage, with nothing written to a PDS or synced anywhere else.",
  "art::portfolio": "A gallery-style site built to show off a body of visual or generative work rather than to be interacted with.",
  "toy::arcade": "A tiny arcade-style game riffing on a classic — Snake, Pong, that family — rebuilt in miniature.",
  "explainer::proposal": "An explainer written to pitch or justify a design decision rather than describe an existing feature.",
  "game::async": "A game played over time rather than in one sitting — turns or state persist between visits instead of resetting each session.",
  "toy::fan page": "A toy built as a tribute to one specific account or bit, more shrine than utility.",
  "toy::console": "A toy styled after a terminal or game-console UI — text output, retro chrome, that kind of thing.",
  "tool::async": "A tool whose output depends on state that changes over time rather than a single-instant computation.",
  "tool::retrospective": "A tool built to look backward over a person's or a period's history rather than the present moment.",
  "tool::log": "A tool that reads as a running log or timeline of events rather than a single computed result.",
  "tool::sankey": "A tool whose signature output is a Sankey-style flow diagram.",
  "joke::void": "A joke that answers into the void — no leaderboard, no persistence, just the bit landing once and disappearing.",
  "toy::mood": "A toy that reads or generates a mood/vibe reading from something about your account or the moment.",
  "tool::reader": "A tool built around reading — long-form text, a feed, or a queue — rather than computing a single stat.",
  "toy::tier": "A toy built around sorting things into a tier list.",
  "toy::review": "A toy that generates a mock review or critique of something, played for the bit rather than a real opinion.",
  "tool::meta": "A tool that looks at the constellation itself — sites, prompts, the bot's own back catalog — rather than an outside account or topic.",
  "explainer::guide": "An explainer structured as a step-by-step how-to rather than a single fact or definition.",
  "toy::wordplay": "A toy built around words themselves — anagrams, puns, letter games — rather than an account or a number.",
  "tool::map": "A tool whose primary output is a map or spatial layout of something rather than a list or number.",
  "explainer::portfolio": "An explainer that doubles as a portfolio of past work rather than teaching one specific thing.",
  "art::opening": "An art site framed as an opening night or exhibition rather than a bare gallery.",
  "toy::bot": "A toy that role-plays as its own small bot or character rather than a plain interactive object.",
  "toy::leaderboard": "A toy with a leaderboard bolted on for flavor, not because ranking is really the point.",
  "tool::history": "A tool built to surface someone's or something's history — a timeline of past state rather than the current one.",
};

export function subgenreDescription(genre, subgenre) {
  const hand = SUBGENRE_DESCRIPTIONS[`${genre}::${subgenre}`];
  if (hand) return hand;
  return `Sites tagged "${subgenre}" under ${genre} — a subgenre picked up automatically from a shared site.tag value, not yet hand-described.`;
}
