// meadowfolio — static data, baked at build time.
//
// RELEASES: every piece of software fromthewestmeadow.com has shipped on
// its own domain. Order is reverse chronological (newest first) — dates
// come from the launch posts on the account's feed (getAuthorFeed, searched
// for each host), except `self`, which predates the searchable window and
// is placed by its position on the fromthewestmeadow.com landing page
// (between `deleted` and `sound`, so its date is approximate). Hand-
// maintained, same spirit as sites/*/site.json — short, not generated.
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
//
// REQUESTS: every buildthis-built site this account has asked for, on this
// account (by === HANDLE across sites/*/site.json), newest first — ordered
// by each site's earliest commit in the repo, since not every site.json
// carries a `builtAt`. Hand-maintained same as RELEASES/PICKS, so a brand
// new build won't show up here until this list is next touched; the live,
// always-current version of the same list is westmeadow.bisks.net.

export const HANDLE = "fromthewestmeadow.com";
export const DID = "did:plc:qttqvv4n3vqqu35qajhcuqlq";

export const REQUESTS = [
  {
    name: "clusterpedia",
    url: "https://clusterpedia.bisks.net/",
    title: "clusterpedia",
    blurb: "A Wikipedia clone with real atproto login — articles, revision histories, talk pages, profiles. Edits gated to bisks.net mutuals and mutuals-of-mutuals.",
  },
  {
    name: "dontpressit",
    url: "https://dontpressit.bisks.net/",
    title: "dontpressit",
    blurb: "One button, labeled do not press this. Each round is named after one of her followers — pressing it graduates that name forever.",
  },
  {
    name: "llmstance",
    url: "https://llmstance.bisks.net/",
    title: "llmstance",
    blurb: "Scans an account (or their whole network) and labels every post Pro-LLM, Anti-LLM, or Unclear, then tallies the overall stance with receipts.",
  },
  {
    name: "curtaintwitcher",
    url: "https://curtaintwitcher.bisks.net/",
    title: "curtaintwitcher",
    blurb: "A fake Nextdoor where the whole neighborhood's posts escalate into paranoia together. Vote REAL or UNHINGED on every complaint.",
  },
  {
    name: "overthink",
    url: "https://overthink.bisks.net/",
    title: "overthink",
    blurb: "A fake ChatGPT whose reply streams in normally, then its \"thinking\" chip unfolds into an infinitely-nested, increasingly unhinged reasoning tree.",
  },
  {
    name: "westmeadow",
    url: "https://westmeadow.bisks.net/",
    title: "westmeadow",
    blurb: "A bare list of every site this account has asked buildthis to build, recomputed live from the event log on every page load.",
  },
  {
    name: "freecondoms",
    url: "https://freecondoms.bisks.net/",
    title: "freecondoms",
    blurb: "Type an address, get nearby free condom vending machines and family-planning clinics from OpenStreetMap, plus national resources as backup.",
  },
  {
    name: "promptrot",
    url: "https://promptrot.bisks.net/",
    title: "promptrot",
    blurb: "Paste a clean, well-specified prompt and watch it decay into a stacked, lowercase, typo'd, scope-creeping Bluesky thread.",
  },
  {
    name: "nothingness",
    url: "https://nothingness.bisks.net/",
    title: "nothingness",
    blurb: "A near-blank void that makes you click the nothing every five seconds or lose your witness streak. Real leaderboard for longest nothing witnessed.",
  },
  {
    name: "chrysalis",
    url: "https://chrysalis.bisks.net/",
    title: "chrysalis",
    blurb: "A countdown that reveals something in exactly one week — the reveal is AES-encrypted in the source, unreadable before the deadline.",
  },
  {
    name: "didrank",
    url: "https://didrank.bisks.net/",
    title: "didrank",
    blurb: "A live leaderboard of the most-frequently-posting Bluesky DIDs, over windows from the last minute out to all-time. Straight off the firehose.",
  },
  {
    name: "wentviral",
    url: "https://wentviral.bisks.net/",
    title: "wentviral",
    blurb: "A fake compose box: whatever you \"post\" racks up a deterministic, reproducible pile-on of replies, likes, reposts, and quote posts over time.",
  },
  {
    name: "resetwatch",
    url: "https://resetwatch.bisks.net/",
    title: "resetwatch",
    blurb: "A live clock counting time since the last Codex / ChatGPT usage-limit reset, plus a timeline of every one before it.",
  },
  {
    name: "didscope",
    url: "https://didscope.bisks.net/",
    title: "didscope",
    blurb: "Astrology, but it's the last character of your did:plc. 32 signs, a cosmic rival, and one real recent post as today's omen.",
  },
  {
    name: "flamewordart",
    url: "https://flamewordart.bisks.net/",
    title: "flame word art in space",
    blurb: "Type a word, get back a GIF of it on fire, tumbling end over end against a starfield. Rendered entirely in your browser.",
  },
  {
    name: "portfolio",
    url: "https://portfolio.bisks.net/",
    title: "portfolio",
    blurb: "Enter any Bluesky handle for a \"portfolio\": media and links up top, everything else clustered into topic boxes, all client-side searchable.",
  },
];

export const RELEASES = [
  {
    host: "cancelled.fromthewestmeadow.com",
    title: "Cancelled",
    blurb: "Scan any Bluesky account for offensive content. Win98-style results.",
    date: "2026-07-26",
  },
  {
    host: "dreamnet.fromthewestmeadow.com",
    title: "DreamNet",
    blurb: "Remote desktops for computers that never existed.",
    date: "2026-07-16",
  },
  {
    host: "compass.fromthewestmeadow.com",
    title: "Political Compass Meme Generator",
    blurb: "A shareable, deterministic political-compass meme for any Bluesky user.",
    date: "2025-09-10",
  },
  {
    host: "speed.fromthewestmeadow.com",
    title: "Speed Reader Firehose",
    blurb: "Every new post speed-reads itself, one grid cell at a time.",
    date: "2025-09-09",
  },
  {
    host: "links.fromthewestmeadow.com",
    title: "Links Firehose",
    blurb: "StumbleUpon-style: surf every link posted to Bluesky as it happens.",
    date: "2025-09-08",
  },
  {
    host: "emoji.fromthewestmeadow.com",
    title: "Emoji Heatmap",
    blurb: "Live heatmap of emoji usage on Bluesky posts.",
    date: "2025-09-08",
  },
  {
    host: "matrix.fromthewestmeadow.com",
    title: "Matrix Firehose",
    blurb: "Bluesky posts as falling matrix rain, sideways and readable.",
    date: "2025-09-08",
  },
  {
    host: "markov.fromthewestmeadow.com",
    title: "Profile Markov Chain",
    blurb: "Remix any user's posts with Markov magic.",
    date: "2025-09-07",
  },
  {
    host: "sound.fromthewestmeadow.com",
    title: "DID Sound Firehose",
    blurb: "Hear a note for every user on the firehose.",
    date: "2025-09-07",
  },
  {
    host: "self.fromthewestmeadow.com",
    title: "Self-Like Watcher",
    blurb: "Find posts liked by their own authors.",
    date: "2025-09-07",
  },
  {
    host: "deleted.fromthewestmeadow.com",
    title: "Deleted Posts Watcher",
    blurb: "See recently deleted Bluesky posts in real time.",
    date: "2025-09-06",
  },
];

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
