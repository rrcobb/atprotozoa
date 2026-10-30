// Cookie-cutter ragebait: pick a trigger topic, pick a harmless-but-maddening
// claim, press it through a frame (the cutter), add a closer, a fake author and
// fake numbers. Every topic is a petty everyday annoyance; nobody real, nothing
// aimed at who people are. Seeded RNG so a card can be rerolled or reproduced.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

// claim = complete clause, no end punctuation. `sure` = the maddening certainty.
export const TOPICS = {
  dishwasher: { label: "🍽️ chores", claims: [
    "you do not need to rinse dishes before the dishwasher and anyone who does is wasting water and my time",
    "the dishwasher is not a storage cabinet, if it's clean you unload it THE SAME DAY",
    "a sink with one single cup in it is a sink full of dishes",
    "loading the dishwasher 'your way' is not a personality, there is a correct way and it is mine",
    "if you leave one bite of food in the pan to 'soak' you have not finished cooking",
    "folding fitted sheets is a scam and I will not be taking questions",
    "towels get washed after ONE use. I have seen how you live",
  ]},
  work: { label: "💼 work", claims: [
    "every meeting that could have been an email is also an email that could have been nothing",
    "if your camera is off in a meeting I assume you are doing something worse than listening",
    "'per my last email' is a love language",
    "reply-all is fine. you just don't respect communication",
    "working from the office is just paying rent on a chair",
    "you are not 'busy', you are disorganised with good lighting",
    "a 9am meeting is a personal attack, a 9:05 meeting is a war crime",
    "'let's circle back' means 'I have already forgotten you exist'",
  ]},
  food: { label: "🍕 food", claims: [
    "cereal is a soup and I'm tired of pretending it isn't",
    "pineapple on pizza is fine, the real crime is cutting pizza into squares",
    "ketchup on eggs is correct and the people yelling at me know it",
    "if you put milk in first you are not making tea, you are making a mistake",
    "cilantro tastes like soap because you are WRONG, not because of 'genes'",
    "a hot dog is a sandwich. a sandwich is a hot dog. none of you have a better framework",
    "brunch is just a late breakfast with a 40% markup and a wait list",
    "ordering a well-done steak is allowed. I just think about you differently",
    "water is wet. I will explain why in the thread",
  ]},
  tip: { label: "💸 money", claims: [
    "tipping 20% for a counter-service tablet is not generosity, it's ransom and I refuse",
    "splitting the bill evenly when I only had a salad is theft with a smile",
    "if you 'forgot your wallet' for the third time you do not have a wallet, you have a pattern",
    "paying $7 for a coffee is fine. paying $7 for a coffee and telling everyone is the issue",
    "'we'll Venmo you later' is a lie and we all know it",
    "buying the cheap toilet paper is how you end up in a worse life",
    "a gift card is a thoughtful gift for a person you've never met",
  ]},
  travel: { label: "✈️ travel", claims: [
    "if you recline your airplane seat I'm allowed to do anything I want to your head, legally and spiritually",
    "clapping when the plane lands is how you know who the problem is",
    "the middle seat gets BOTH armrests, this is not up for debate",
    "if you stand up the second the plane lands you will not be getting off any faster and you know it",
    "driving 5 under in the left lane is a form of self-expression and honestly I respect it",
    "putting your bag on the seat next to you on a full bus is a lifestyle choice and not a good one",
    "I arrive at the airport 4 hours early and I'd like you to feel bad about your 90 minutes",
    "backing into a parking space is a sign of a well-adjusted adult. pulling in is how you live your whole life",
  ]},
  tech: { label: "💻 tech", claims: [
    "if you have more than 12 browser tabs open you aren't busy, you're hoarding",
    "voice memos are a form of violence and I will be replying with a thumbs up forever",
    "the thumbs-up emoji is passive aggressive and I'm going to keep sending it",
    "dark mode is for people who have never seen the sun",
    "light mode is for people who have never felt peace",
    "tabs are objectively better than spaces and the spaces people just hate accessibility",
    "your phone is on 3% because you have no inner life",
    "leaving your notification badges at '47 unread' is the most violent thing you can do to me",
    "if you call someone without texting first you don't respect their time and I'm sorry, that's just facts",
  ]},
  pets: { label: "🐶 pets", claims: [
    "your dog does not 'smile'. it's panting. stop projecting",
    "cats don't love you, they're just making sure the food guy stays alive",
    "if you let your dog on the couch you can't complain about the couch",
    "no one's baby photos are cute except my pet's and I'm asking you to be honest",
    "'rescue' is just a very good marketing word for 'bought a different dog'",
    "naming your dog a human name is allowed and I'll tell you why you're annoying about it anyway",
    "your cat is not 'being dramatic'. you are just not paying attention",
  ]},
  social: { label: "🎉 social", claims: [
    "if the invite says 7pm you arrive at 7:30. arriving at 7 is a threat",
    "'we should hang out sometime' is the most dishonest sentence in the language",
    "you do not 'owe' anyone a reply to a 4-paragraph text sent at 11pm",
    "being 'bad at texting' is a choice you make every single day",
    "bringing a plus-one to a party they weren't asked to is not romance, it's logistics",
    "talking during a movie is a crime and talking during a TV show is only a misdemeanor",
    "standing the whole concert and filming it on your phone is the most honest form of attendance",
    "a group chat with more than 6 people is not a conversation, it's a weather system",
  ]},
  fitness: { label: "🏋️ wellness", claims: [
    "if you wipe down the machine AFTER you use it you've missed the point of the machine",
    "5am workouts aren't a personality, they're a cry for help with great abs",
    "walking 10,000 steps a day is not 'exercise', it's life with extra steps (this is also the joke)",
    "'cold plunge' is paying money to be sad in the morning",
    "I have not had a drink of water since Tuesday and I've never felt better",
    "it's not that I 'don't like salad', I just don't like being told about salad",
    "stretching is for people with time and no ambition",
    "protein powder is a milkshake with a LinkedIn",
  ]},
  words: { label: "✍️ words", claims: [
    "the Oxford comma is optional, and so are your opinions about it",
    "'irregardless' is a word. I looked it up. it's a word. you can stop",
    "using 'literally' to mean 'figuratively' is literally the worst thing in the English language",
    "'per se' is just 'persay' said by people who want to feel important",
    "ending a text with a period is a threat. ending it with two is a hostage situation",
    "your 'there/their/they're' mistakes are not 'typos', they're a preview of your character",
    "I will not be taking questions about 'whom'",
    "'quick question' has never once been quick",
  ]},
  home: { label: "🏡 home", claims: [
    "setting the thermostat to 68 is a plan for your own happiness. 72 is for people who give up",
    "a 'neighbour' who mows the lawn at 8am on a Saturday has made a personal choice about the rest of us",
    "putting the toilet paper roll 'under' is allowed. it's just the first sign of a larger problem",
    "ice in a drink is 40% of the drink and you are getting robbed",
    "dishes on the counter 'for a bit' is how a house dies",
    "wearing shoes inside is not a hill I'll die on, but I will be watching everyone who does",
    "'cozy' is a word real estate uses for 'small'",
    "your Christmas lights are still up in February and the whole street knows",
  ]},
  media: { label: "📺 media", claims: [
    "if you spoil a 10 year old movie it's still a spoiler. I will not be sharing the statute of limitations",
    "the book is better than the movie is something people say when they didn't enjoy the movie",
    "re-watching the same show for the 9th time is not 'comfort', it's a sign",
    "subtitles ON, always. if you can't handle the white text, you can't handle the plot",
    "a 4 hour movie is not 'epic', it's a long movie with a good publicist",
    "'I don't have a favourite song' is the one lie everyone tells and I'm onto you",
    "a podcast at 1.5x speed is a pacing choice. at 2x it's a lifestyle choice and I judge you",
    "I won't be reading your 'thread'. I just want everyone to know that I didn't",
  ]},
  parenting: { label: "🧸 kids", claims: [
    "'my child is a picky eater' means 'my child is in charge of the kitchen'",
    "putting your toddler on a leash is a viable form of communication and I'm not apologising",
    "if the party says 'no kids' it means YOUR kids. the other ones are fine",
    "kids are not 'a lot of work', you are just not working efficiently",
    "your baby's name is spelled wrong and I will be correcting it forever, silently, at every gathering",
    "screen time limits are just parents who don't trust their own judgment",
    "I don't have a kid but I have a very strong opinion about yours and I'll be sharing it",
  ]},
};

// Cutters. {c} = the claim, as written. {C} = claim with a capital first letter.
// heat: 1 = grumble, 2 = bait, 3 = full pot.
export const FRAMES = [
  { h: 1, t: "Unpopular opinion: {c}." },
  { h: 1, t: "Not sure who needs to hear this, but {c}." },
  { h: 1, t: "Hot take: {c}. Fight me." },
  { h: 1, t: "Genuinely: {c}. Not sure why that's controversial." },
  { h: 2, t: "{C}. And before you reply: yes, I have thought about it more than you." },
  { h: 2, t: "I'm going to say what nobody else will: {c}." },
  { h: 2, t: "Say it with me: {c}. The people who disagree know what they did." },
  { h: 2, t: "Genuine question for the people who disagree: {c}. How's that working out for you?" },
  { h: 2, t: "A thread 🧵 on why {c}. (1/47)" },
  { h: 2, t: "Everyone who says otherwise is lying, or just wrong. {C}." },
  { h: 3, t: "{C}. I'm blocking in advance. Don't bother." },
  { h: 3, t: "I'm so tired of pretending. {C}. There, I said it. I have said it." },
  { h: 3, t: "{C}, and the fact that I have to explain this tells you everything about this app." },
  { h: 3, t: "I have a PhD, two kids, and a very good job, and I still think {c}. You're all just being loud." },
  { h: 3, t: "Anyone who disagrees that {c} is a person I would not want to be stuck in an elevator with, and I've been stuck in an elevator." },
  { h: 3, t: "If you can't see that {c}, I truly don't think we can be friends, and I mean that as a kindness." },
];

export const CLOSERS = [
  [], // none
  ["", "", "", "(this is not up for debate)", "Thank you for coming to my TED talk.", "Respectfully."],
  ["Reply 'source?' and I'll block you.", "No, I will not be taking questions.", "I'm being generous. You know I'm right.", "Let's see how many of you pretend to be offended.", "Ratio me. You can't.", "Quote this if you're a coward."],
  ["I said what I said and I'll say it again at 3am.", "Delete your account if you disagree. Not a joke.", "Comments are staying ON so you can all see how wrong you are.", "I'm not going to read the replies, I'm going to pin the best ones.", "Bookmark this. In 5 years you'll thank me.", "This is not a post. This is a verdict."],
];

const FIRST = ["Brad", "Kayleigh", "Doug", "Meredith", "Tyler", "Chad", "Brenda", "Kevin", "Trish", "Gary", "Courtney", "Randy", "Heather", "Todd", "Janine", "Dale", "Priya", "Marcus", "Sven", "Lucille", "Dennis", "Ashleigh", "Monty", "Gwen"];
const LAST = ["Haverstock", "Pennywhistle", "Lundgren", "Okafor", "McCrory", "Bellweather", "Dunmore", "Kowalczyk", "Tanaka", "Whitlock", "Fairbanks", "Delacroix", "Brannigan", "Vandersloot", "Quimby", "Abernathy"];
const BIO = [
  "Dad. Founder. Truth-teller. Opinions are my own and they're correct.",
  "I say what you're thinking. Founder @ a thing. DMs closed.",
  "Mom of 3 | Marketing | Recovering People Pleaser (not anymore)",
  "Unfiltered. Unbothered. Unfollowed by many. 🔥",
  "Speaker. Author (1 book). Dog person. Not here to make friends.",
  "Just asking questions 🤷 | Top 1% in the thing | Block button enjoyer",
  "Retired from caring what you think. Active in telling you anyway.",
  "Hustle culture survivor | Builder | I read the terms and conditions",
];
const BADGE = ["", "", "🔥", "💯", "🧠", "☕", "🚀"];
const HANDLE_BITS = ["real", "the", "just", "actual", "mr", "mrs", "coach", "dr"];
const slug = s => s.toLowerCase().replace(/[^a-z]/g, "");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = n => n >= 10000 ? Math.round(n / 1000) + "K" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

export function persona(r) {
  const f = pick(r, FIRST), l = pick(r, LAST);
  const hb = r() < 0.4 ? pick(r, HANDLE_BITS) : "";
  const handle = (hb + slug(f) + (r() < 0.5 ? slug(l) : String(Math.floor(r() * 90) + 10))) + ".bsky.social";
  return { name: f + " " + l, handle, bio: pick(r, BIO), badge: pick(r, BADGE), hue: Math.floor(r() * 360) };
}

const REPLIES = [
  ["I'm a nurse and this is the worst thing I've read this week", "the replies are the real post"],
  ["Source?", "the 'source' is I made it up"],
  ["this is why nobody invites you anywhere", "ratio'd by my own mother"],
  ["Okay but have you tried being normal about it", "Okay."],
  ["Wow. Just wow. I'm going to need to lie down.", "same"],
  ["you posted this at 2am, didn't you", "..."],
  ["Mute. Block. Report. In that order.", "you can't block a vibe"],
  ["so brave. truly. the first to say it.", "thank you"],
  ["my therapist and I just spent an hour on this one tweet", "a good use of an hour"],
  ["I'm saving this for the day you need it", "please do"],
];

export function makeCard(topicKeys, heat, seed) {
  const r = rng(seed);
  const keys = (topicKeys && topicKeys.length ? topicKeys : Object.keys(TOPICS)).filter(k => TOPICS[k]);
  const topic = pick(r, keys.length ? keys : Object.keys(TOPICS));
  const claim = pick(r, TOPICS[topic].claims);
  const hs = Math.min(3, Math.max(1, heat | 0));
  // allowed frames: this heat or milder, but weighted toward the chosen heat
  const pool = FRAMES.filter(f => f.h === hs || (f.h < hs && r() < 0.25));
  const frame = pick(r, pool.length ? pool : FRAMES);
  let text = frame.t.replace("{C}", cap(claim)).replace("{c}", claim);
  // frames starting from {c} lower-case look off after "Unpopular opinion: " only when the claim begins with a proper noun; claims don't.
  const closer = pick(r, CLOSERS[hs]);
  if (closer) text += " " + closer;
  const p = persona(r);
  const m = 0.6 + hs * 0.9;
  const replies = Math.floor((200 + r() * 4000) * m);
  const quotes = Math.floor(replies * (0.5 + r() * 2));
  const likes = Math.floor(2 + r() * 40 * (4 - hs));
  const reps = [];
  const used = new Set();
  for (let i = 0; i < 2; i++) {
    let x; do { x = Math.floor(r() * REPLIES.length); } while (used.has(x)); used.add(x);
    const q = persona(r);
    reps.push({ who: q, text: REPLIES[x][0], likes: Math.floor(r() * 900 * m) + 12 });
  }
  return { seed, topic, topicLabel: TOPICS[topic].label, heat: hs, text, author: p,
    stats: { replies: fmt(replies), quotes: fmt(quotes), likes: fmt(likes) }, reps };
}

export function shareUrl(card) {
  const t = `fake ragebait, 100% homemade:\n\n“${card.text}”\n\n— ${card.author.name} (does not exist)\nhttps://ragebait.bisks.net/`;
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(t);
}
