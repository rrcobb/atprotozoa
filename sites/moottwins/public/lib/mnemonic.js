// mnemonic.js — given two people whose avatars hashed close together
// (vision.js), work out what to actually tell a human so they can tell the
// two pfps apart, and phrase it as something worth remembering.
//
// Deliberately simple and rule-based (no model calls): name the single
// biggest visual difference between the two thumbnails — color, then
// brightness, then saturation, then which corner is brightest — and fall
// back to a name-based hook (alphabetical order) on the rare pair that's
// identical on all of those too. Every step is explainable from the numbers
// vision.js already computed.
//
// The pfp is only half the mixup, though — describePair also attaches a
// posterHint() when the caller supplies it: a fact about the *people*, not
// their photos (a differing bio, when each joined Bluesky, which handle
// domain they're on), so there's something to remember about the poster
// even once the pixels are exhausted.

const QUAD_NAMES = ["top-left", "top-right", "bottom-left", "bottom-right"];

function colorName(hsl) {
  const { h, s, l } = hsl;
  if (l < 14) return "near-black";
  if (l > 90) return "near-white";
  if (s < 14) return "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  if (h < 330) return "pink";
  return "red";
}

function brightnessWord(l) {
  if (l < 30) return "dark";
  if (l < 45) return "dim";
  if (l > 82) return "pale";
  if (l > 65) return "bright";
  return null; // unremarkable middle — not worth calling out
}

function satWord(s) {
  if (s < 18) return "muted";
  if (s > 60) return "vivid";
  return null;
}

function brightestQuadrant(quadrants) {
  let best = 0;
  for (let i = 1; i < quadrants.length; i++) if (quadrants[i] > quadrants[best]) best = i;
  return best;
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function yearOf(iso) {
  const m = /^(\d{4})-/.exec(iso || "");
  return m ? m[1] : null;
}

function handleDomain(handle) {
  return (handle || "").toLowerCase().endsWith(".bsky.social") ? "bsky.social" : "a custom domain";
}

// A fact about the two PEOPLE, not their pfps — only fires when the caller
// passed enriched profile data (a.description/a.createdAt), which
// describePair's callers only bother fetching for pairs that actually made
// it into the results, not every mutual. Checked in order of how useful a
// memory hook it makes: differing bios, then who's been around longer, then
// handle domain. Returns null (nothing to add) when none of that data is
// present or none of it differs.
export function posterHint(a, b) {
  const bioA = (a.description || "").trim();
  const bioB = (b.description || "").trim();
  if (bioA && bioB && bioA !== bioB) {
    return `their bios don't match either — @${a.handle}: "${truncate(bioA, 70)}" vs @${b.handle}: "${truncate(bioB, 70)}".`;
  }
  if (bioA && !bioB) return `only @${a.handle} has written a bio ("${truncate(bioA, 70)}") — @${b.handle}'s is blank.`;
  if (bioB && !bioA) return `only @${b.handle} has written a bio ("${truncate(bioB, 70)}") — @${a.handle}'s is blank.`;

  const yearA = yearOf(a.createdAt), yearB = yearOf(b.createdAt);
  if (yearA && yearB && yearA !== yearB) {
    return `@${a.handle} has been on Bluesky since ${yearA}, @${b.handle} since ${yearB}.`;
  }

  const domA = handleDomain(a.handle), domB = handleDomain(b.handle);
  if (domA !== domB) {
    return `@${a.handle}'s handle is on ${domA}, @${b.handle}'s is on ${domB}.`;
  }

  return null;
}

// Returns { pct, lineA, lineB, mnemonic, posterNote }. `pct` is similarity
// 0-100 (64 - hammingDistance, scaled) purely for display, not used in the
// text. `posterNote` is a fact about the people rather than the photos —
// null unless the caller passed enriched `a`/`b` (see posterHint above).
export function describePair(a, b, featA, featB, hammingDist) {
  const pct = Math.round(((64 - hammingDist) / 64) * 100);
  const posterNote = posterHint(a, b);
  const nameA = a.displayName || a.handle;
  const nameB = b.displayName || b.handle;

  const colorA = colorName(featA.hsl), colorB = colorName(featB.hsl);
  const brightA = brightnessWord(featA.hsl.l), brightB = brightnessWord(featB.hsl.l);
  const satA = satWord(featA.hsl.s), satB = satWord(featB.hsl.s);

  const anchorFor = (word, name) => {
    const initial = name.trim()[0]?.toLowerCase();
    return initial && word[0] === initial
      ? `${name} — “${word}” starts the same as their name`
      : `${name} is the ${word} one`;
  };

  if (colorA !== colorB && colorA !== "gray" && colorB !== "gray") {
    return {
      pct,
      posterNote,
      lineA: `@${a.handle}'s pfp reads ${colorA}${brightA ? ` and ${brightA}` : ""}.`,
      lineB: `@${b.handle}'s pfp reads ${colorB}${brightB ? ` and ${brightB}` : ""}.`,
      mnemonic: `${anchorFor(colorA, nameA)}; ${nameB} is the ${colorB} one.`,
    };
  }

  if (brightA && brightB && brightA !== brightB) {
    return {
      pct,
      posterNote,
      lineA: `@${a.handle}'s pfp is the ${brightA} one.`,
      lineB: `@${b.handle}'s pfp is the ${brightB} one.`,
      mnemonic: `${anchorFor(brightA, nameA)}; ${nameB} is the ${brightB} one.`,
    };
  }

  if (satA && satB && satA !== satB) {
    return {
      pct,
      posterNote,
      lineA: `@${a.handle}'s pfp is the ${satA} one.`,
      lineB: `@${b.handle}'s pfp is the ${satB} one.`,
      mnemonic: `${anchorFor(satA, nameA)}; ${nameB} is the ${satA === "vivid" ? "muted" : "vivid"} one.`,
    };
  }

  const quadA = brightestQuadrant(featA.quadrants), quadB = brightestQuadrant(featB.quadrants);
  if (quadA !== quadB) {
    return {
      pct,
      posterNote,
      lineA: `@${a.handle}'s brightest spot sits ${QUAD_NAMES[quadA]}.`,
      lineB: `@${b.handle}'s brightest spot sits ${QUAD_NAMES[quadB]}.`,
      mnemonic: `${nameA} is bright ${QUAD_NAMES[quadA]}; ${nameB} is bright ${QUAD_NAMES[quadB]}.`,
    };
  }

  // Same color family, same brightness/saturation band, same highlight
  // corner — genuinely nothing visual left to hang a memory on. The one
  // reliable difference left is the names themselves.
  const order = nameA.localeCompare(nameB) <= 0 ? [nameA, nameB] : [nameB, nameA];
  return {
    pct,
    posterNote,
    lineA: `@${a.handle}'s pfp is about as close a match to @${b.handle}'s as pfps get.`,
    lineB: `same tone, same brightness, same layout — no visual anchor left.`,
    mnemonic: `no pfp trick works here — go alphabetical: “${order[0]} before ${order[1]}.”`,
  };
}
