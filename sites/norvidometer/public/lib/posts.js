// The bank for norvidometer. Every entry below is a REAL post that
// @norvid-studies.bsky.social actually quote-tweeted, pulled straight from his
// own repo — this is the fix for the very first version of this site, which
// invented all 18 posts instead of doing the search @ver.ooo actually asked
// for ("search for 'claim' and 'heuristic' in his QT history as the baseline").
// norvid himself called that out: "'every post here is invented for the quiz,
// not a real quote' this feels like a grounding issue..." — correctly.
//
// The search: downloaded norvid's whole repo as one CAR
// (com.atproto.sync.getRepo, via sites/backscroll's car.js — see the standing
// bulk-read order in notes/), kept every quote-post whose OWN commentary text
// contains 'claim' or 'heuristic', then fetched the quoted post underneath to
// use as the quiz prompt. Out of 57,959 posts, 13,397 were quote-posts, and 663
// of those were tagged 'claim' or 'heuristic' by norvid himself — turns out this
// is a real, extremely long-running habit of his: quote something, then reply
// with the single bare word as a genre marker (336 'claim', 128 'heuristic',
// out of the 663). `answer` and `note` below are his real label and his real
// QT text, not our guess — `permalink`/`norvidPermalink` link to both real posts.
export const POSTS = [
  {
    text: "My rule of thumb: If it stresses me out, I switch to human-paced activity for a while.",
    author: "codewright.bsky.social",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/codewright.bsky.social/post/3mpnrxd33ok2s",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mpoe5ygmcs2w",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "underrated how powerful it is to reflexively ask \"would I still have this opinion if <situation were reversed>\"",
    author: "tbabb.bsky.social",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/tbabb.bsky.social/post/3mlpoxxwntc2k",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mlqcpz3hk22c",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "yeah blocking those people quickly is a mercy to your actual audience \n\nnothing good comes of engaging them",
    author: "temujin9.t9productions.com",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/temujin9.t9productions.com/post/3mfhovu7mpk22",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mfiv3iizis2w",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "it is worth it to build your own todo/notes app, it is not worth it to build your own kernal",
    author: "medjed.bsky.social",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/medjed.bsky.social/post/3mk43zbag5d2e",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mk45wguqck2d",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "you can get really far by asking yourself \"what's the most embarrassing question a person could ask me to expose my lack of knowledge?\" and then finding out the answer to that question, and repeating",
    author: "vibe-coded.com",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/vibe-coded.com/post/3me7cqvipw22s",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3me7cy4y42c2k",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "I believe there's a village in China that you can commission to do this.",
    author: "yaaliannar.com",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/yaaliannar.com/post/3mlvs3oqt3k2q",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mlvv4gjqac2t",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "Well that's the last time I try to be helpful",
    author: "gracekind.net",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/gracekind.net/post/3muu7toim32rx",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3muu7u4f3pc2o",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "there are exactly three places in new zealand: christchurch, auckland, and wellington",
    author: "eikopf.com",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/eikopf.com/post/3mf2yf2le5225",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mf2yibjm5k2q",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "Don’t mess with the Komolgorov witch",
    author: "faz.ms",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/faz.ms/post/3menemh3j2k2i",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mepc462dxc2e",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
  {
    text: "discourse isn’t shaped by 200k follower accounts, it’s shaped by 200 and 2000 follower accounts",
    author: "hdevalence.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/hdevalence.bsky.social/post/3ld2bovg24c2y",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3ld2ckszkqs24",
    note: "norvid's real quote-tweet said: “claim (how would you test this with full data?)”",
  },
  {
    text: "The shape of the convex hull of all artificial objects is probably a tetrahedron",
    author: "niplav.site",
    answer: "claim",
    permalink: "https://bsky.app/profile/niplav.site/post/3lb7jjv2yuk2d",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lba7azgaos2k",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "Georgism is the Haskell of ideologies",
    author: "mayaofspring.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/mayaofspring.bsky.social/post/3lsabblr3622q",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lsadwqxtes2w",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "the point of new users being flashbanged by furry hog is to weed out the weak",
    author: "sneptech.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/sneptech.bsky.social/post/3launes5dpk2z",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lauzbuaikc2o",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "You can just do things (publish a blog post on Sunday night when everyone is asleep)",
    author: "gracekind.net",
    answer: "claim",
    permalink: "https://bsky.app/profile/gracekind.net/post/3lqmv7dzxhs2f",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lqmzyp6lic26",
    note: "norvid's real quote-tweet said: “claim (unverified, probably false)”",
  },
  {
    text: "The biases of my arboreal and savanna-dwelling ancestors may possibly be showing here, but I feel strongly that the world should be divided into lots of smaller spaces",
    author: "tedunderwood.com",
    answer: "claim",
    permalink: "https://bsky.app/profile/tedunderwood.com/post/3ludbicxqkc2i",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3ludccazqwc2j",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "the fact that high throughput perturbation based biology has yielded so few insights screams that our axiomatic framework in the field are just wrong",
    author: "pinkddle.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/pinkddle.bsky.social/post/3lrdn6igsu22c",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lrdnculkl22k",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "if the first entities that could do chicken sexing were AIs we would have likely had some frightened rationalist blogposts about it",
    author: "1a3orn.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/1a3orn.bsky.social/post/3lqn32b56wk2x",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lqn35zqotk2e",
    note: "norvid's real quote-tweet said: “very specific claim”",
  },
  {
    text: "MCP has the same hype signature as GraphQL tbh",
    author: "gracekind.net",
    answer: "claim",
    permalink: "https://bsky.app/profile/gracekind.net/post/3lnt62d2gkc2h",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lntfq72pek2h",
    note: "norvid's real quote-tweet said: “claim that I don't understand any of the words in”",
  },
  {
    text: "i find it useful to think of all people as possessing a core mammalian warmth and innocence, which is sometimes obscured or hijacked by memetic egregores",
    author: "weibac.bsky.social",
    answer: "claim",
    permalink: "https://bsky.app/profile/weibac.bsky.social/post/3lphpx5pg7k22",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3lphq3btf522f",
    note: "norvid's real quote-tweet said exactly one word: “claim” — that's his whole genre tag.",
  },
  {
    text: "there’s a line from newcastle to adelaide that delimits civilisation, and you choose to venture outside it at your own peril",
    author: "eikopf.com",
    answer: "heuristic",
    permalink: "https://bsky.app/profile/eikopf.com/post/3meyr4a6spc26",
    norvidPermalink: "https://bsky.app/profile/norvid-studies.bsky.social/post/3mezffzsrm22z",
    note: "norvid's real quote-tweet said exactly one word: “heuristic” — that's his whole genre tag.",
  },
];
