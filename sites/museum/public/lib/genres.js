// genres.js — copied from sites/rateyourbuild/public/lib/genres.js and
// reframed as museum wings: "genre" (site.type) becomes which wing of the
// museum a piece hangs in, and each description becomes that wing's own
// wall text — the paragraph a visitor reads before looking at any single
// piece in it. Subgenres aren't tracked here; a piece's freeform site.tag
// (when it says something a bare genre doesn't) shows on its own plaque as
// a "medium" note instead. Lives here, not in the metamuseum upstairs, since
// the wings and their exhibits moved to sites/museum on 2026-09-07.

export const SUPERS = {
  play: {
    label: "play",
    description:
      "The east half of the museum: pieces built to be experienced for their own sake — toys, games, jokes, and art. Nothing on display here is trying to get real work done.",
  },
  utility: {
    label: "utility",
    description:
      "The west half of the museum: pieces built to do or explain something specific — tools and explainers. These wings answer a question or solve a problem rather than entertain.",
  },
};

export const GENRES = {
  toy: {
    label: "toy",
    super: "play",
    description:
      "The largest wing by a wide margin — small interactive objects built to be poked at rather than solved: generators, mood rings, oracles, tiny simulations, one-page distractions with no goal beyond existing. If a piece doesn't ask anything of the visitor and doesn't keep score, it hangs here.",
  },
  game: {
    label: "game",
    super: "play",
    description:
      "The games wing: pieces with a goal, a score, or a way to lose — quizzes, arcade riffs, leaderboard chases, anything a visitor can win or fail. The line between this wing and the toy wing next door is usually just: does it keep score?",
  },
  joke: {
    label: "joke",
    super: "play",
    description:
      "The joke wing exists for the bit, not the build — a single premise carried exactly as far as it's funny and no further. A good share of what hangs here started as banter in a reply thread and got taken far too literally.",
  },
  art: {
    label: "art",
    super: "play",
    description:
      "The art wing: pieces made to be looked at more than used — generative visuals, portfolios, one-off aesthetic experiments where the interaction is secondary to the image.",
  },
  tool: {
    label: "tool",
    super: "utility",
    description:
      "The tool wing does a real job — lookups, converters, dashboards, trackers — for someone who asked for a specific problem solved, not a distraction.",
  },
  explainer: {
    label: "explainer",
    super: "utility",
    description:
      "The explainer wing exists to teach or clarify something about atproto, the bot, or a visitor's own account, rather than to be played with — including, recursively, this room.",
  },
};
