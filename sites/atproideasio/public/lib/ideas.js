// A snapshot of the #atproideasio hashtag on Bluesky, harvested when this site
// was built (2026-07). norvid-studies started firing off atproto feature ideas
// at @gracekind.net under this tag; a small rogues' gallery joined in. Public
// searchPosts needs auth, so instead of hitting it live we baked the harvest in
// here — that also means the catalog and the /rate tool always agree on the
// same corpus.
//
// Each entry: { rkey, handle, text, enacted } where `enacted` (if present) is
// the path on this site that turns the idea into a real, working thing.
//
// Bare "#atproideasio @gracekind.net" posts (the idea lived in a quoted post we
// can't see) are left out — this is the set with a self-contained idea in it.

export const IDEAS = [
  {
    rkey: "3mp4ycfmxek2j",
    handle: "norvid-studies.bsky.social",
    text: "a number next to the repost icon and each time you click it it reposts and the number goes up with 1, with no limit",
    enacted: "/repost",
  },
  {
    rkey: "3mnvgcx6tzc2v",
    handle: "norvid-studies.bsky.social",
    text: 'duolingo owl that you can program to harass your mutuals who said they’d reply to you later, sort of a remindme! bot but that posts threatening ascii "HOOT" drawings in their other threads as replies until they get back to you',
    enacted: "/hoot",
  },
  {
    rkey: "3mnrx5em7dc2s",
    handle: "norvid-studies.bsky.social",
    text: 'concept: some kind of "slop AQI" tracker that monitors your feed and on-screen attention and makes popup recommendations or even starts blocking things for you as things "start to get bad again"',
    enacted: "/aqi",
  },
  {
    rkey: "3mr5yjmfxr22w",
    handle: "norvid-studies.bsky.social",
    text: "concept, bsky with more sliders to control things live",
    enacted: "/sliders",
  },
  {
    rkey: "3mnl7hcttc22g",
    handle: "apex.atproto.ceo",
    text: 'bot that replies to all norvid #atproideasio posts with "feasible," "underspecified," "genius," etc and rates them out of 10',
    enacted: "/rate",
  },

  // --- the rest of the harvest: still in the queue ---
  {
    rkey: "3mrduob272s2k",
    handle: "norvid-studies.bsky.social",
    text: "atproto semantic deduplication battle royale. also when someone uses a bigram you used you gain control of their account",
  },
  {
    rkey: "3mranakscc222",
    handle: "norvid-studies.bsky.social",
    text: "a button you can press that turns a set of screenshots from another microblog into a single formatted piece of text on bsky. per the desire paths post: to see new features, look how users misuse your software",
  },
  {
    rkey: "3mqnrskyz2q2g",
    handle: "gracekind.net",
    text: "Automated semantic alt text",
  },
  {
    rkey: "3mqkqs5247c2x",
    handle: "norvid-studies.bsky.social",
    text: "Suggested Edit button",
  },
  {
    rkey: "3mqi3ohuxlk2e",
    handle: "norvid-studies.bsky.social",
    text: '"impute and explicate why I muted/blocked this account based on what they were posting at the time of my mute|block + my psychological profile you’ve built up from years of my tweets" — a cool AI-assisted aide memoire for the ’proto',
  },
  {
    rkey: "3mqafwvsqi22d",
    handle: "norvid-studies.bsky.social",
    text: '"this but for atproto" and when you zoom in you can see the individual tweets posted, liked and reposted live, spreading physically in space and time, and when you zoom out you see the whole panorama',
  },
  {
    rkey: "3mq5qxzjmrs2u",
    handle: "norvid-studies.bsky.social",
    text: "simcluster sassy draft anon bot relay poster",
  },
  {
    rkey: "3mpt2l5agxc2w",
    handle: "norvid-studies.bsky.social",
    text: "browse all an account's standard talking points sorted by most frequent, then add AI scoring to how good their points were",
  },
  {
    rkey: "3mpt2djuh522a",
    handle: "norvid-studies.bsky.social",
    text: "concept: google graveyard / digital ossuary for cool fossil accounts",
  },
  {
    rkey: "3mpqwj4pexc2i",
    handle: "norvid-studies.bsky.social",
    text: "feature where each tag within a post generates a separate notification to that person",
  },
  {
    rkey: "3mpqvid5xkk2s",
    handle: "norvid-studies.bsky.social",
    text: "a rate limit you can set for rationing how many times a day a specific person can tag you",
  },
  {
    rkey: "3mpobbbqko222",
    handle: "norvid-studies.bsky.social",
    text: 'the most "staring into the matrix" archive consumption UX: go here, pick your favorite mutual, Blast Mode ON, change the speed so images load fast enough to appear',
  },
  {
    rkey: "3mpmoh7dhcs2w",
    handle: "norvid-studies.bsky.social",
    text: 'a filter:follows-type smart search operator that pulls up "all moot thoughts on" [media object] [concept] — wholesale',
  },
  {
    rkey: "3mpmdc3b3ns23",
    handle: "norvid-studies.bsky.social",
    text: "Fable refusals but if your post is bad it kicks you down to Threads",
  },
  {
    rkey: "3mpmckftvss2e",
    handle: "apex.atproto.ceo",
    text: "r9k but with thresholded embedding vector similarity",
  },
  {
    rkey: "3mnpxyev6j22s",
    handle: "norvid-studies.bsky.social",
    text: '"Translate" button on every bisk — each press dumbs it down / explains the references to 1 SD lower, press it any number of times',
  },
  {
    rkey: "3mnfpvo7rwa2k",
    handle: "gracekind.net",
    text: "Automated youtuber reaction videos for microblogging drama",
  },
  {
    rkey: "3moifxsstcs2x",
    handle: "norvid-studies.bsky.social",
    text: 'simant/simcity/atproto crossover where you lay "discourse pheromones" in topical zones and watch the emergent swarming feed behavior of simulated moot particles. neko atsume another touchstone',
  },
  {
    rkey: "3mnl6zpw53c2t",
    handle: "norvid-studies.bsky.social",
    text: "jetstream falling-bisks tetris/DDR where you sort the bisks into the right clusters (social? tonal?) as they appear and if you sort wrong they pile up",
  },
  {
    rkey: "3mnkbjw3o6k2m",
    handle: "norvid-studies.bsky.social",
    text: "bot that makes a collage of everything you've tagged a person in; V2 learns the descriptive words causing the tag and shows a wordcloud; V3 hunts for hundreds more items fitting that description",
  },
  {
    rkey: "3mnid5het2s26",
    handle: "norvid-studies.bsky.social",
    text: 'a "radio tuning" dial for the semantic vectors in people’s posts — twist to change tone or dialect',
  },
  {
    rkey: "3mnhzxzec4c2i",
    handle: "norvid-studies.bsky.social",
    text: "bot that trawls lists of semi-obscure art/literature/media and when it finds ~4 people who mentioned the same thing, spawns a thread with their quotes and tags them all in as a popup salon",
  },
  {
    rkey: "3mnhw3bmgb22d",
    handle: "norvid-studies.bsky.social",
    text: "every pfp morphing, with morph speed synced to account follow size — larger accounts vibrating faster, on the order of minutes or seconds",
  },
  {
    rkey: "3mnrtwmxofs25",
    handle: "norvid-studies.bsky.social",
    text: "automatic midlength link summaries for lengths of a week / a month — a cool application of agents",
  },
  {
    rkey: "3mnd6zoumr22p",
    handle: "norvid-studies.bsky.social",
    text: "an AI agent to find me my own references to things that happened a week ago",
  },
  {
    rkey: "3mphf7gibcc26",
    handle: "nequals001.bsky.social",
    text: "someone's For You feed so marvelous, so perfect, that it becomes the default for all new users",
  },
  {
    rkey: "3mnhw4eaxvc2d",
    handle: "norvid-studies.bsky.social",
    text: "concept: one-day atproideasio hackathon",
  },
];

// bsky.app permalink for an idea.
export function ideaLink(idea) {
  return `https://bsky.app/profile/${idea.handle}/post/${idea.rkey}`;
}
