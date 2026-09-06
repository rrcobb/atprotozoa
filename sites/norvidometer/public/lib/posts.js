// The bank for norvidometer. Every entry is an invented, timeline-shaped
// one-liner — not a real quote from anyone — sorted into "claim" (an
// assertion about how things generally are) or "heuristic" (a rule of
// thumb for deciding what to do next).
//
// Straight from the thread that prompted this site
// (@norvid-studies.bsky.social replying to @gracekind.net):
//   "what I originally meant was like, 'stylized fact and or tool for
//   thinking' that was especially compressed and transferrable... then
//   with long usage its undergone a bit of high dimensional
//   flanderization... I think I basically mean rule of thumb. or I don't
//   see what the difference is."
//
// So four entries near the end are deliberately unresolvable — a
// "stylized fact" IS a compressed rule of thumb, and no amount of staring
// at the sentence resolves which box it goes in. `ambiguous: true` marks
// those; the quiz still scores them (against `answer`), but the reveal
// says so instead of pretending there's a clean line. `answer` on the
// ambiguous ones is set to "heuristic" — the direction norvid's own usage
// drifted, per the thread above — not a claim that it's actually correct.
export const POSTS = [
  // -- claims: an assertion about how things generally are --
  {
    text: "screenshots of the discourse always outlive the discourse itself",
    answer: "claim",
    note: "a claim: it's saying something about how internet history actually shakes out, not telling you what to do about it.",
  },
  {
    text: "the group chat picks a main character within the first ten messages",
    answer: "claim",
    note: "a claim: a stylized fact about group-chat dynamics, dressed as an observation, not advice.",
  },
  {
    text: "everyone's read receipts are off except in the group they're trying to seem responsive in",
    answer: "claim",
    note: "a claim: describes a (extremely specific) regularity in how people behave. no instructions attached.",
  },
  {
    text: "the loudest opinion in a quote-tweet pile-on is never the one that started it",
    answer: "claim",
    note: "a claim: an assertion about how pile-ons tend to go, not a tool for surviving one.",
  },
  {
    text: "your best posts get the least engagement because you actually thought about them",
    answer: "claim",
    note: "a claim: a stylized fact about the algorithm, or about audiences, or about you. still a claim.",
  },
  {
    text: "most public apologies are addressed to an audience that never asked for one",
    answer: "claim",
    note: "a claim: describes a pattern. doesn't tell you whether to apologize.",
  },
  {
    text: "the account that says 'just here to lurk' posts eleven times a day",
    answer: "claim",
    note: "a claim: a specific, faintly testable number bolted onto an observation. peak stylized fact.",
  },

  // -- heuristics: a rule of thumb for deciding what to do --
  {
    text: "if you have to explain the bit, cut the bit",
    answer: "heuristic",
    note: "a heuristic: a compressed rule for what to do with a draft, not a fact about the world.",
  },
  {
    text: "assume good faith exactly once, then start paying attention",
    answer: "heuristic",
    note: "a heuristic: a policy for how to act, tunable, meant to be applied rather than verified.",
  },
  {
    text: "the thread is over when someone brings up definitions",
    answer: "heuristic",
    note: "a heuristic: tells you when to stop, which is exactly the shape norvid's original sense was reaching for.",
  },
  {
    text: "block early, block often, never explain why",
    answer: "heuristic",
    note: "a heuristic: three imperatives in a trenchcoat. nothing here is asserted to be true, just useful.",
  },
  {
    text: "if a take needs a disclaimer thread, it wasn't ready to post",
    answer: "heuristic",
    note: "a heuristic: a rule of thumb for deciding whether to hit post, not a claim about takes in general.",
  },
  {
    text: "never negotiate with a group chat that has more than one moderator",
    answer: "heuristic",
    note: "a heuristic: advice for a specific recurring situation, over-generalized on purpose. that's the tell.",
  },
  {
    text: "when everyone in the replies agrees, check who muted the OP",
    answer: "heuristic",
    note: "a heuristic: an instruction for what to check, triggered by a condition. very rule-of-thumb-shaped.",
  },

  // -- deliberately unresolvable, per the thread itself --
  {
    text: "irony is just a heuristic wearing a claim's clothes",
    answer: "heuristic",
    ambiguous: true,
    note: "norvid's thread again: a \"stylized fact\" and a \"tool for thinking\" were always the same object described twice. no clean answer here — we called it heuristic because that's the direction his usage drifted, not because it's provably right.",
  },
  {
    text: "a stylized fact is a heuristic that got popular enough to stop citing its source",
    answer: "heuristic",
    ambiguous: true,
    note: "this one's a coin flip and it knows it. compressed, transferrable, repurposed with long usage — the exact flanderization norvid described happening to his own word.",
  },
  {
    text: "the internet doesn't have opinions, it has load-bearing vibes",
    answer: "heuristic",
    ambiguous: true,
    note: "reads as an assertion (claim) and functions as a way of filtering what you see next (heuristic). norvid: \"I don't see what the difference is\" — same energy.",
  },
  {
    text: "everything compresses into a heuristic if you wait long enough",
    answer: "heuristic",
    ambiguous: true,
    note: "the thesis of the thread, restated as one of its own examples. there was never going to be a clean answer key for this one.",
  },
];
