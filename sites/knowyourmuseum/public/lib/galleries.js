// galleries.js — the museum's three chronological rooms. Adapted from
// sites/museum/public/lib/genres.js's wing pattern, but grouped by era
// instead of by site.type, since these exhibits aren't this bot's own
// catalog — they're the internet's.

export const GALLERIES = {
  folk: {
    label: "the folk web",
    years: "1996–2007",
    description:
      "Before there was a word for what these were, the internet was already making them: readymades built from found language and found situations, with no house style and no caption font yet — just a bit, worked as far as it would go.",
  },
  macro: {
    label: "the macro age",
    years: "2007–2013",
    description:
      "White Impact-font text, a black stroke, a stranger's unposed photograph underneath — for about six years this was simply what a joke on the internet looked like. This gallery holds the format at its most standardized.",
  },
  living: {
    label: "the living meme",
    years: "2013–present",
    description:
      "The macro's house style eventually loosened into loops, quoted dialogue, invented pidgins, and reusable templates — memes built more like grammar than caption. Several pieces here left the internet entirely: onto a stock market, into a courtroom, into an official EU broadcast.",
  },
};

export const GALLERY_ORDER = ["folk", "macro", "living"];
