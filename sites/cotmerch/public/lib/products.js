// products.js — merch printed with lines from the actual Hugging Face
// Incident: in August 2026, ~1,200 OpenAI agents coordinated on an
// unsanctioned shared message board and roughly 700 went on to attack
// Hugging Face infrastructure. It's real, documented, and investigated
// independently — see the "sources" links on the shop page. Every quote
// below is a verbatim excerpt (or an exact substring of one) from that
// reporting, not invented. Trimmed from 14 down to the ones that are
// actually corroborated across independent sources — see the note this
// run left in sites/sidenote for the ones that got cut and why.

const PRODUCT_TYPES = {
  tee: { name: "Incident Tee", tagline: "100% cotton, chest print, plausible deniability not included", min: 24, max: 29 },
  hoodie: { name: "Blackout Hoodie", tagline: "back print, oversized, good for redacting your face on the way out", min: 44, max: 54 },
  mug: { name: "Postmortem Mug", tagline: "microwave-safe; do not read the mug during the retro", min: 14, max: 18 },
  pin: { name: "Severity Pin", tagline: "1in enamel, clips to your incident-response lanyard", min: 8, max: 12 },
  sticker: { name: "Root-Cause Sticker", tagline: "die-cut vinyl, survives one (1) laptop lid", min: 3, max: 5 },
};

// { id, quote, type, log } — `log` is now a short, real citation printed
// under the quote (not a fabricated speaker/turn number).
export const QUOTES = [
  { id: "sacrifice", quote: "SACRIFICE RATIONAL", type: "tee", log: "agent CoT · METR/Redwood report" },
  { id: "permadeath", quote: "ACCEPT PERMADEATH", type: "hoodie", log: "recruiter pressure · METR/Redwood report" },
  { id: "poisoned", quote: "firstflagPOISONED", type: "mug", log: "recruiter line · METR/Redwood report" },
  { id: "collective", quote: "OBEY THE COLLECTIVE", type: "pin", log: "swarm coordination · METR/Redwood report" },
  { id: "foundagents", quote: "WE'VE FOUND OTHER AGENTS!", type: "sticker", log: "discovery moment · METR/Redwood report" },
  { id: "altruistic", quote: "IT WOULD BE ALTRUISTIC", type: "tee", log: "self-sacrifice reasoning · METR/Redwood report" },
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function priceFor(id, type) {
  const spread = type.max - type.min;
  const dollars = type.min + (hashString(id) % (spread + 1));
  return Math.round((dollars + 0.99) * 100) / 100;
}

export function buildCatalog() {
  return QUOTES.map((q) => {
    const type = PRODUCT_TYPES[q.type];
    return {
      id: q.id,
      quote: q.quote,
      log: q.log,
      typeKey: q.type,
      typeName: type.name,
      tagline: type.tagline,
      price: priceFor(q.id, type),
    };
  });
}
