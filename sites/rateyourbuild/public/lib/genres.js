// genres.js — the genre taxonomy for rateyourbuild's /genre/<key> and
// /super/<key> pages. "Genre" is the same site.type the apex gallery filters
// on (toy/game/tool/joke/explainer/art); "super-genre" is a two-way grouping
// invented for this site (play vs. utility) since the six genres otherwise
// have nothing above them. Subgenres aren't listed here — they're whatever
// distinct site.tag values show up under a genre in the catalog (see
// sync-catalog.mjs's subgenreFor), so they grow on their own as the bot
// builds more sites instead of needing a hand-maintained list.

export const SUPERS = {
  play: {
    label: "play",
    description:
      "Sites built to be experienced for their own sake — toys, games, jokes, and art. Nothing in this half of the catalog is trying to get real work done.",
  },
  utility: {
    label: "utility",
    description:
      "Sites built to do or explain something specific — tools and explainers. These genres answer a question or solve a problem rather than entertain.",
  },
};

export const GENRES = {
  toy: {
    label: "toy",
    super: "play",
    description:
      "The constellation's biggest genre by a wide margin — small interactive objects built to be poked at rather than solved: generators, mood rings, oracles, tiny simulations, one-page distractions with no goal beyond existing. If a site doesn't ask anything of you and doesn't keep score, it's probably a toy.",
  },
  game: {
    label: "game",
    super: "play",
    description:
      "Games have a goal, a score, or a way to lose — quizzes, arcade riffs, leaderboard chases, anything you can win or fail. The line between a toy and a game in this catalog is usually just: does it keep score?",
  },
  joke: {
    label: "joke",
    super: "play",
    description:
      "Jokes exist for the bit, not the build — a single premise carried exactly as far as it's funny and no further. A good share of these started as banter in a reply thread and got taken far too literally.",
  },
  art: {
    label: "art",
    super: "play",
    description:
      "Art sites are made to be looked at more than used — generative visuals, portfolios, one-off aesthetic experiments where the interaction is secondary to the image.",
  },
  tool: {
    label: "tool",
    super: "utility",
    description:
      "Tools do a real job — lookups, converters, dashboards, trackers — for someone who asked for a specific problem solved, not a distraction.",
  },
  explainer: {
    label: "explainer",
    super: "utility",
    description:
      "Explainers exist to teach or clarify something about atproto, the bot, or a person's own account, rather than to be played with.",
  },
};
