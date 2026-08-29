// Decodes a switchboard code — the inverse of the encoder in
// public/index.html. Deliberately NOT part of the deployed site: the page
// itself never reveals what a code means, only the bot (offline, later,
// reading a skeeted code out of a BRIEF) is meant to know. See the "Decoding
// switchboard codes" section of sites/buildthis/builder/INSTRUCTIONS.md for
// when this gets invoked.
//
// Usage:
//   node sites/switchboard/decode.mjs SB-4K2Q
//   import { decode } from "./decode.mjs"; decode("SB-4K2Q")

// Must match public/index.html's RADIX exactly: lever, dialA, dialB, sw1,
// sw2, sw3, slider. Product of radixes = 10240, so a 3-digit base36 value
// (max 46655) always has room.
const RADIX = [2, 8, 8, 2, 2, 2, 10];

const SUBJECTS = ["clocks", "weather", "names", "colors", "maps", "sounds", "numbers", "words"];
const FORMS = ["generator", "visualizer", "game", "quiz", "tracker", "translator", "simulator", "oracle"];
const INTENSITY_WORDS = [
  "minimal", "simple", "modest", "balanced", "rich",
  "dense", "elaborate", "maximal", "baroque", "unhinged",
];
const TRAIT_NAMES = ["loud", "competitive", "dark"]; // sw1, sw2, sw3 respectively

// A guess at site.json's `type` field, keyed by the decoded form — saves the
// bot from having to invent one from scratch when it builds the result.
const FORM_TYPE = {
  generator: "tool",
  visualizer: "art",
  game: "game",
  quiz: "game",
  tracker: "tool",
  translator: "tool",
  simulator: "toy",
  oracle: "joke",
};

export function decode(code) {
  const m = /^SB-([0-9A-Z]{3})([0-9A-Z])$/.exec(String(code || "").trim().toUpperCase());
  if (!m) return null;

  const v = parseInt(m[1], 36);
  const expected = ((v * 7 + 13) % 36).toString(36).toUpperCase();
  if (m[2] !== expected) return null; // bad checksum — typo or not a switchboard code

  // Unpack in reverse RADIX order (mixed-radix decomposition — the last
  // value packed comes off first).
  let rest = v;
  const vals = new Array(RADIX.length);
  for (let i = RADIX.length - 1; i >= 0; i--) {
    vals[i] = rest % RADIX[i];
    rest = Math.floor(rest / RADIX[i]);
  }
  const [lever, dialA, dialB, sw1, sw2, sw3, slider] = vals;

  const polarity = lever === 1 ? "unhinged" : "gentle";
  const subject = SUBJECTS[dialA];
  const form = FORMS[dialB];
  const traits = [sw1, sw2, sw3].map((bit, i) => (bit ? TRAIT_NAMES[i] : null)).filter(Boolean);
  const intensityWord = INTENSITY_WORDS[slider];
  const type = FORM_TYPE[form] || "toy";

  const article = /^[aeiou]/.test(polarity) ? "an" : "a";
  const traitClause = traits.length ? ` with ${traits.join(", ")} traits` : "";
  const brief = `Build ${article} ${polarity} ${subject} ${form}${traitClause}. Keep it ${intensityWord} (intensity ${slider}/9).`;

  return {
    code: `SB-${m[1]}${m[2]}`,
    polarity,
    subject,
    form,
    traits,
    intensity: slider,
    intensityWord,
    type,
    brief,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = process.argv[2];
  if (!code) {
    console.error("usage: node decode.mjs SB-XXXX");
    process.exit(1);
  }
  const spec = decode(code);
  if (!spec) {
    console.error("invalid code (bad format or checksum):", code);
    process.exit(1);
  }
  console.log(JSON.stringify(spec, null, 2));
}
