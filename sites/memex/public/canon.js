// canon.js — the seed phrasebook, pulled straight from @tk0l.bsky.social's
// original thread: https://bsky.app/profile/tk0l.bsky.social/post/3m4jhhxxthc2q
// ("This is a thread of stock phrases that can be quoted and re-quoted to
// link related posts. Feel free to use. Royalty-free. Aka building a memex
// without the microfilm:") — plus one addition. Mirrored (id/text/note only)
// in src/index.ts's CANON for server-side share-page rendering; keep both in
// sync by hand, it's nine short entries.
export const CANON = [
  {
    id: "ok-wow",
    text: "Ok wow",
    note: "The opener. Low commitment, keeps the thread moving.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3m4jhhxyc422q",
  },
  {
    id: "hmm",
    text: "Hmm",
    note: "Buys time. Works on almost anything.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mbx32i7uxk2s",
  },
  {
    id: "hell-yeah",
    text: "Hell yeah",
    note: "Enthusiastic agreement, no elaboration required.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mcti7nbojk2z",
  },
  {
    id: "thank-you",
    text: "Thank you!",
    note: "Closes a loop.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mctiasmxkc2z",
  },
  {
    id: "aardvark",
    text: "aardvark",
    note:
      "The deepest cut in the set. Alphabetically first, so it's what tk0l actually searches to find this whole thread again — an homage to Xavier: Renegade Angel's aardvark bit.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3meflcbbig22n",
  },
  {
    id: "shapes-dont-fit-words",
    text: "I have a lot of thoughts about this topic but unfortunately none of the shapes fit into words",
    note: "For when there's too much to say and no way to say it.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mersk27dhk2c",
  },
  {
    id: "do-that-now",
    text: "ok please do that now",
    note: "A nudge toward action.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mfbddmfpos2n",
  },
  {
    id: "much-to-consider",
    text: "much to consider here",
    note: "The polite pause.",
    source: "https://bsky.app/profile/tk0l.bsky.social/post/3mg4tynk6ik2w",
  },
  {
    id: "rubes-marks",
    text: "you rubes, you fucking marks",
    note:
      "Added to the canon by @antiali.as, who tagged the bot to build this whole site — quoted from a post by @jane.inurhead.lol.",
    source: "https://bsky.app/profile/jane.inurhead.lol/post/3mkndudy44d23",
    addedBy: "antiali.as",
  },
];

export const THREAD_URL = "https://bsky.app/profile/tk0l.bsky.social/post/3m4jhhxxthc2q";
export const THREAD_AUTHOR = "tk0l.bsky.social";
