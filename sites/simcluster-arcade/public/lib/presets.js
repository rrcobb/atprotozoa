// presets.js — the arcade cast: the simcluster's regulars, one fighter each.
// Profiles (avatar, display name, DID → class) are read live from Bluesky's
// public AppView; if one account can't be fetched the fighter still shows up,
// minus the avatar. Every entry is a real account; `bit` is a description of
// something that account is known for in this repo or in the threads that
// built it. `quote` is used ONLY where the account really posted that text
// (taken from the thread the line is quoted from) — nothing here is a
// made-up quote.

const PUB = "https://public.api.bsky.app/xrpc";

export const PRESETS = [
  { handle: "bisks.net", stage: "the gallery", bit: "runs the zoo: every site in this repo is a room in his house", finisher: "FOOM PLEDGE" },
  { handle: "abeliansoup.bsky.social", stage: "the octagon", bit: "guava genome league: proteins fighting in the octagon", quote: "I drained one of the lesser great lakes to make this", finisher: "LESSER GREAT LAKE" },
  { handle: "norvid-studies.bsky.social", stage: "the seminar", bit: "elliptically curve-transected the euthyphro dilemma", quote: "euthyphro mentioned", finisher: "ELLIPTIC CURVE" },
  { handle: "funferall.bsky.social", stage: "the guava grove", bit: "founder of the guava gang", quote: "guava gang rise up", finisher: "GUAVA GANG RISE UP" },
  { handle: "handackett.bsky.social", stage: "the playtest", bit: "plays every build and says what it needs", quote: "This might need more effort", finisher: "MORE EFFORT" },
  { handle: "godoglyness.bsky.social", stage: "the monster den", bit: "godogly-shaped compositions; their monsters are calling us", finisher: "JUST USE WORDS" },
  { handle: "gracekind.net", stage: "the mention box", bit: "wants at-mentions to curve-transect whole areas of users", quote: "You should be able to at-curve-transect users", finisher: "AT-CURVE-TRANSECT" },
  { handle: "tvanl.bsky.social", stage: "the linter", bit: "wrote the spec for Inverse ASD-STE100: only vocabulary beyond the standard", quote: "Inverse ASD-STE100 : exclusively use vocabulary beyond the set included in that standard", finisher: "RARE VOCABULARY" },
  { handle: "minormobius.bsky.social", stage: "the lab", bit: "tagged in whenever a build needs more effort", finisher: "EFFORT SURGE" },
  { handle: "cee.wtf", stage: "the archive", bit: "asked the bot to stop being afraid of big data: the no-caps rule", finisher: "NO CAPS" },
  { handle: "dollspace.gay", stage: "the receipts wall", bit: "asked for the page that roasts every ask the bot has ever got", finisher: "RECEIPTS" },
  { handle: "angussoftware.dev", stage: "the review desk", bit: "rates every site out of 10 and logs the bugged ones", finisher: "ZERO STARS" },
  { handle: "heika.dog", stage: "the inner circle", bit: "cut the changelog tail off the description", finisher: "NOT X BUT Y" },
  { handle: "antiali.as", stage: "the pledge hall", bit: "started National No Foom Month", finisher: "NO FOOM" },
  { handle: "kumavis.me", stage: "the breadboard", bit: "breadboard-555: blinks an LED until the build ends", finisher: "555 TIMER" },
  { handle: "shimmermathlabs.com", stage: "the speedrun", bit: "HumanBENCH: humans build an app under a time limit and get graded 0-10", finisher: "#HUMANSWINNING" },
  { handle: "riziles.bsky.social", stage: "the cheat menu", bit: "asked whether the guava genome encodes the Konami code", finisher: "KONAMI CODE" },
  { handle: "vibecode.rodeo", stage: "the switchboard", bit: "built the unlabeled switchboard that decodes into whatever you flip", finisher: "SB-7WFA" },
];

// Deterministic stand-in id for an account whose profile couldn't be read.
const stub = (p) => ({ did: "handle:" + p.handle, handle: p.handle, displayName: p.handle, avatar: "", followersCount: 0 });

export async function loadPresets() {
  const out = await Promise.all(
    PRESETS.map(async (p) => {
      let prof = null;
      try {
        const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(p.handle)}`);
        if (r.ok) prof = await r.json();
      } catch {}
      const base = prof
        ? {
            did: prof.did, handle: prof.handle, displayName: prof.displayName || prof.handle,
            avatar: prof.avatar || "",
            followersCount: typeof prof.followersCount === "number" ? prof.followersCount : 0,
          }
        : stub(p);
      return { ...base, bit: p.bit, quote: p.quote || null, stage: p.stage, finisher: p.finisher, preset: true };
    }),
  );
  return out;
}
