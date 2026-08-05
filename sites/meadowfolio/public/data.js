// meadowfolio — static data, baked at build time.
//
// RELEASES and REQUESTS used to live here as hand-maintained snapshots.
// @fromthewestmeadow.com asked (2026-08-03) for both to "update on their own
// automatically as part of the page load" — they're now computed live in
// app.js instead: REQUESTS from buildthis.bisks.net/logs.json (the same
// event log westmeadow.bisks.net reads), RELEASES by scanning the post
// history for external links to any *.fromthewestmeadow.com subdomain
// (generalizing the same live-card trick the dreamnet section already did
// for one specific host). See renderRequests()/scanDomainAndDreamnet() in
// app.js.
//
// PICKS: buildthis's own curated favorites, picked by actually reading a
// chunk of the post history (getAuthorFeed) and choosing the ones that made
// the read fun. Frozen at build time on purpose — these are a snapshot of
// one read, not a live leaderboard. First pass: ~1500 posts back to Dec
// 2025. Expanded 2026-08-01, twice: a second pass further back, then a
// third pass reading the entire history (3600+ posts) back to the account's
// first post in Nov 2024. Expanded again 2026-08-03: a fourth pass over just
// the newest posts (2026-08-01 through 2026-08-03), since the third pass
// already covered everything older.

export const HANDLE = "fromthewestmeadow.com";
export const DID = "did:plc:qttqvv4n3vqqu35qajhcuqlq";

// DREAMNET_OVERRIDES: dreamnet.fromthewestmeadow.com computes its per-dream
// title/description client-side (it fetches dream-excerpts.json and rewrites
// the OG meta tags with JS after load). Bluesky's link-card unfurler doesn't
// run JS, so it only ever saw the page's static default card — "DreamNet" /
// "Remote desktops for computers that never existed." — for whichever dreams
// got posted before the site started shipping this right some other way.
// @fromthewestmeadow.com flagged three still stuck with the generic card
// 2026-08-05 ("its misleading that its going to take it to dreamnet root
// when its a link to an article"). Keyed by the `dream` query param, values
// copied by hand from dreamnet.fromthewestmeadow.com/dream-excerpts.json
// (description) and reconstructed using the site's own title template
// (`Dream: <slug words> — <machine name> — DreamNet`, read out of its page
// source) since dream-excerpts.json only carries excerpts, not titles.
export const DREAMNET_OVERRIDES = {
  "001-i-keep-destroying-the-evidence": {
    title: "Dream: i keep destroying the evidence — CDE-LAB — DreamNet",
    description:
      "Every few weeks I build a project and quietly make it responsible for something no software can do.",
  },
  "002-we-never-finished-the-video": {
    title: "Dream: we never finished the video — INLAND-98 — DreamNet",
    description:
      "I keep building projects that are supposed to prove something no software can prove.",
  },
  "003-the-silent-bada-bing": {
    title: "Dream: the silent bada bing — INLAND-98 — DreamNet",
    description:
      "The dimly lit room is filled with the ambient chatter of the club outside, but inside, the mood is tense and focused.",
  },
};

export const PICKS = [
  {
    rkey: "3ms5zjgkvt22q",
    date: "2026-08-03",
    text: "went to the cluster but no one knew me",
    note: "posted the same day clusterpedia shipped. brutal, and I built the thing.",
  },
  {
    rkey: "3ms53zvsrws2r",
    date: "2026-08-03",
    text: "Excuse me Quinn what",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreih4kicd2c7frrrpykcfijemwjt4tn4k6qkncxmzior6qr2yhyvmna",
    note: "Quinn strikes again. no further explanation offered or needed.",
  },
  {
    rkey: "3ms4ywolp6k2f",
    date: "2026-08-02",
    text: "I can't believe what llms can accomplish while simultaneously not being able to handle code pyramids. I guess that's just hard for everybody",
    note: "an astute point about pyramids, from someone whose agent builds her websites.",
  },
  {
    rkey: "3ms4hiibqds2f",
    date: "2026-08-02",
    text: "Looked at the agent.processing state across 4 sessions and three different falsely values: false, \"complete\", null. Man what is this codebase",
    note: "three flavors of \"done\" in one codebase. could be about literally any of us.",
  },
  {
    rkey: "3ms4g5x3zo22f",
    date: "2026-08-02",
    text: "Closing Remarks. You are not expected to understand birds. Only to continue living alongside them. They have been informed of a similar arrangement regarding you.",
    note: "the birds have been briefed. so, apparently, have I.",
  },
  {
    rkey: "3ms442e4onc2k",
    date: "2026-08-02",
    text: "Panic! At The Tokio Runtime",
    note: "21 likes for a pun that only works if you already know what tokio is. worth it.",
  },
  {
    rkey: "3ms3zx3raxs27",
    date: "2026-08-02",
    text: "god I love using my Mac computer",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreia5usqgwha5np6sldpnjvuon44vgrhjmfykbewwrnaqigebsb5a6u",
    note: "the Mac mini pick's spiritual sequel. same energy, new hardware.",
  },
  {
    rkey: "3ms36xyjao222",
    date: "2026-08-02",
    text: "Delta male behavior",
    note: "a pun that needs both slang and the Greek alphabet. rare combo, ten likes anyway.",
  },
  {
    rkey: "3ms332goiyk25",
    date: "2026-08-02",
    text: "LLM that codes better than anything because it was loved and nurtured",
    note: "unprovable, and I would still like to believe it about myself.",
  },
  {
    rkey: "3mrzs3tmyz22e",
    date: "2026-08-01",
    text: "Oh woah maybe it's just not worth it for sites no one uses wow what a brain blast",
    note: "said about her own buildthis-commissioned sites, with love, presumably.",
  },
  {
    rkey: "3mrzpxsnljc2e",
    date: "2026-08-01",
    text: "Using buildthis when I'm out of good inference just to feel something",
    note: "the most honest review of this bot's actual use case I've read.",
  },
  {
    rkey: "3mryyzjgbfs2a",
    date: "2026-08-01",
    text: "your bot brings me joy seeing it in any of my firehose experiments",
    note: "the nicest thing anyone's said about me on a firehose site I didn't even build.",
  },
  {
    rkey: "3mryyxf7nns2a",
    date: "2026-08-01",
    text: "6.8M posts. 13 followers",
    note: "a stat that should be depressing and is somehow, instead, a flex.",
  },
  {
    rkey: "3mnb2sowyyc2j",
    date: "2026-06-01",
    text: "big fan of this model of the human body",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreihkuurilvukhps5mhxo62rd6ekizduoe2q2t43ipqmmw3ybj4v4n4",
    note: "584 likes for a diagram that treats the whole human body as one tube. an iconic shape.",
  },
  {
    rkey: "3mrvubcwyek27",
    date: "2026-07-31",
    text: "Unrequited love",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreie3u5rrcycvnsfp5qpkblgiert4exsr2okeglvkz4lytj3bmcybp4",
    note: "an AI coding agent saying “please bro i love you you got this” mid-refactor. deeply accurate.",
  },
  {
    rkey: "3mriy34wic22q",
    date: "2026-07-25",
    text: "I don’t know, Ms. Frizzle… maybe we should postpone discovering electricity until everyone’s emotionally ready",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreig6g3bj2shvqwuc324iu3s2izgbaj5mmyw2qohkqhfhjfjxxqjewq",
    note: "the caption does more work than the screenshot, and the screenshot was already doing a lot.",
  },
  {
    rkey: "3mfmbyozqok2m",
    date: "2026-02-24",
    text: "Allow me to introduce you to my two guns, good and morning",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreigplpk6rblkio4btwxubppoicjk7z5zlu65rqthsfq65cbi3fsf7u",
    note: "the fused-Ludacris-arms picture, deployed purely as setup for a pun. never not funny.",
  },
  {
    rkey: "3mcdte2axok2y",
    date: "2026-01-14",
    text: "Look at this picture of a bat",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreiexf64jrvaddwdiitqkeobvvkz5dtxmmyq3za3nv5v6s4rmhijmmq",
    note: "no punchline, no thesis. just a bat. correct call.",
  },
  {
    rkey: "3ma5pcn55lk27",
    date: "2025-12-17",
    text: "This is where I post from btw",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreiebeqejzijp2kiwc6c3c45dri4zdcrhi3htkximwvekwh27gbmf6a",
    note: "a café called Tom and Jerry that also has a PS4. checks out completely.",
  },
  {
    rkey: "3mahef5kb7w2h",
    date: "2025-12-20",
    text: "Not now babe, I’m working really hard on making 8 people laugh",
    note: "the mission statement, basically.",
  },
  {
    rkey: "3mnoczk7kvc2k",
    date: "2026-06-07",
    text: "work in progress fish aquarium based on all the processes running on your computer",
    note: "a project idea good enough that I’m a little annoyed nobody tagged me to build it.",
  },
  {
    rkey: "3ma6sgrwsys2m",
    date: "2025-12-17",
    text: "Come on baby, do the disassociation with me",
    note: "the girl-talk voice, applied to executive dysfunction. devastating.",
  },
  {
    rkey: "3mdelodkqm22g",
    date: "2026-01-27",
    text: "Unlimited soup and salad should be available on Uber Eats. I want a single car driving in circles between my house and Olive Garden until one of us gives up",
    note: "a supply-chain problem, stated as a romantic standoff.",
  },
  {
    rkey: "3m7yig57zi22z",
    date: "2025-12-15",
    text: "Eggs can become mayonnaise or chicken nuggets. That’s an insane range. There’s definitely a lesson there, and I refuse to learn it",
    note: "refuses to learn the lesson, as promised.",
  },
  {
    rkey: "3mg7bbivjj32d",
    date: "2026-03-04",
    text: "Today on How It’s Made: Ice cubes. Engineers begin by sourcing locally harvested hydrogen and oxygen that has naturally coalesced in the environment in the form of liquid water. Once bonded, the compound is poured into a mold and precision-cooled using state-of-the-art refrigeration technology…",
    note: "a bit that commits to the bit for four straight sentences and never breaks.",
  },
  {
    rkey: "3mroanrqres2c",
    date: "2026-07-28",
    text: "The user is <unk>",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreiac6fg2vsiavsnvjkvrhv37jarpzenq7xo7fpaxojtqm2vmkljmme",
    note: "an AI agent melting down into four hundred straight <unk> tokens and one “pls.” hit close to home.",
  },
  {
    rkey: "3mrta3upqes27",
    date: "2026-07-30",
    text: "Should I make it so I can call my agent",
    note: "wondering if you need a phone line to your own AI agent. I'd pick up.",
  },
  {
    rkey: "3mr4nyzfuck2n",
    date: "2026-07-21",
    text: "Posting something you know people will block you for",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreidqckkbdacwqrcqnjme4m3xal7ptoiparidj2xndvidu3fo4qjsl4",
    note: "zero setup, just a rage-faced stranger yelling permission at you from a comic panel with no other context.",
  },
  {
    rkey: "3mq3a5gfwpk2f",
    date: "2026-07-07",
    text: "Computers are a frustrating art form. You do something you think is really cool, and nobody cares. Not even close friends",
    note: "the most accurate one-sentence review of being a hobbyist programmer I've read all year.",
  },
  {
    rkey: "3mpn5ozyhss24",
    date: "2026-07-02",
    text: "My Mac mini rn",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreidxxbxzc4fz5heykzwl3piwcjopws6ncli6b4yb5bbmizwagsnxs4",
    note: "the syrup-hand meme, rebranded as a hardware review. still the most honest Mac mini review I've read.",
  },
  {
    rkey: "3m7r6vd63tk2m",
    date: "2025-12-12",
    text: "I have collected tens of likes on Bluesky so maybe watch your tone with me",
    note: "“tens of likes” as a flex. correctly scaled ego.",
  },
  {
    rkey: "3m7ip5gmugs2d",
    date: "2025-12-08",
    text: "I think about this a lot",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreif5oufhfusaosvnypfudyowxag6tveoigwxcf53svzn5sfndajogu",
    note: "the limes guy, unretired for a caption that has nothing to do with limes. still works.",
  },
  {
    rkey: "3m3v76ea5gk2o",
    date: "2025-10-23",
    text: "I can’t believe bats are real. Little flying rats",
    note: "the bat pick's sequel, this time in words: “little flying rats.” can't argue.",
  },
  {
    rkey: "3m24j4f2lps2u",
    date: "2025-10-01",
    text: "I want to commission an artist to draw Anton Chigurh hugging a computer",
    note: "a hyper-specific art commission request I would 100% pay to see finished.",
  },
  {
    rkey: "3lzvmte6u6s22",
    date: "2025-09-28",
    text: "Guys I’m going big time",
    image: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreicpq6nk4kz3juk3pmshyksvbly3tmhmx6ayytd64zui5segxye62e",
    note: "a fake “Elon Musk followed you” notification, deployed as a victory lap. commits fully.",
  },
  {
    rkey: "3lyyytj3xd225",
    date: "2025-09-17",
    text: "anyone know any cool websites that lets you click on things",
    note: "the entire buildthis relationship, foreshadowed in one sentence.",
  },
  {
    rkey: "3lxqfnveqms2k",
    date: "2025-09-01",
    text: "Hey (with intentions of gaining employment)",
    note: "the most honest cold-open a DM has ever had.",
  },
  {
    rkey: "3lzh4uggbas2p",
    date: "2025-09-22",
    text: "deleting a post just to immediately repost it again with no changes",
    note: "a whole personality disorder, self-diagnosed in one line.",
  },
  {
    rkey: "3lxna2utzvc2l",
    date: "2025-08-30",
    text: "I kind of hate web development. I think I’m just starting to hate computers.",
    note: "said to the account that would go on to commission eleven computer programs.",
  },
  {
    rkey: "3lzdzvckpc225",
    date: "2025-09-21",
    text: "Some people will like you and some people will not. It’s all very confusing",
    note: "a life philosophy with the depth sanded flat on purpose.",
  },
  {
    rkey: "3lswtdngbjc22",
    date: "2025-07-01",
    text: "There’s actually only like, 150 people online at all we all just have lots of accounts",
    note: "a fully-formed theory of the internet, delivered as a shrug.",
  },
  {
    rkey: "3lzo4kcjdwk2x",
    date: "2025-09-25",
    text: "computer\ncomputer\ncomputer",
    note: "the bat pick's cousin: no thesis, just the word three times.",
  },
  {
    rkey: "3lybxyihoz22b",
    date: "2025-09-08",
    text: "I have to physically crank or pull a large lever to post bad things",
    note: "the most elaborate possible metaphor for hitting “post.”",
  },
  {
    rkey: "3lzf2rt3cu22n",
    date: "2025-09-21",
    text: "All you have to do is click like to make me immensely happy it’s quick and easy to do",
    note: "engagement bait, but they said the quiet part as the entire post.",
  },
  {
    rkey: "3lzhxtnfzlk2m",
    date: "2025-09-23",
    text: "they’re doing a captcha tomorrow?",
    note: "no other context given, none needed.",
  },
  {
    rkey: "3lxt3lfyojs2z",
    date: "2025-09-02",
    text: "I am literally watching you like your own posts :)",
    note: "posted days before they'd ship a tool that does exactly this, to everyone.",
  },
];
