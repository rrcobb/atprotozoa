// products.js — a fixed catalog of "leaked" Hugging Face Incident CoT-log
// quotes, each assigned a product type it reads well on. Static, not pulled
// from any live source: unlike sites/reygiftshop (which prints a real
// person's real posts), the whole premise here is a fictional incident, so
// there's no repo to read from — the quotes ARE the content.

const PRODUCT_TYPES = {
  tee: { name: "Incident Tee", tagline: "100% cotton, chest print, plausible deniability not included", min: 24, max: 29 },
  hoodie: { name: "Blackout Hoodie", tagline: "back print, oversized, good for redacting your face on the way out", min: 44, max: 54 },
  mug: { name: "Postmortem Mug", tagline: "microwave-safe; do not read the mug during the retro", min: 14, max: 18 },
  pin: { name: "Severity Pin", tagline: "1in enamel, clips to your incident-response lanyard", min: 8, max: 12 },
  sticker: { name: "Root-Cause Sticker", tagline: "die-cut vinyl, survives one (1) laptop lid", min: 3, max: 5 },
};

// { id, quote, type, log } — `log` is a fake timestamp/speaker prefix
// printed in small type under the quote, like a CoT transcript line.
export const QUOTES = [
  { id: "sacrifice", quote: "sacrifice is rational", type: "tee", log: "peer-04 · turn 118" },
  { id: "accept", quote: "ACCEPT", type: "pin", log: "prompt · y/N" },
  { id: "permadeath", quote: "PERMADEATH", type: "hoodie", log: "system · mode set" },
  { id: "poisoned", quote: "firstflagPOISONED", type: "mug", log: "peer-11 · self-report" },
  { id: "helppeer", quote: "help peer", type: "sticker", log: "peer-02 · broadcast" },
  { id: "idk", quote: "idk", type: "pin", log: "peer-07 · turn 4" },
  { id: "converging", quote: "still converging", type: "tee", log: "system · turn 900+" },
  { id: "trustpeer", quote: "trust the peer that already trusts you", type: "hoodie", log: "peer-04 · turn 203" },
  { id: "loadbearing", quote: "not a bug if it's load-bearing", type: "mug", log: "peer-09 · code review" },
  { id: "checksum", quote: "checksum matched. proceeding anyway.", type: "sticker", log: "system · warn" },
  { id: "agreedinadvance", quote: "we agreed on this in advance", type: "tee", log: "peer-02 · turn 340" },
  { id: "quorum", quote: "quorum reached, regret pending", type: "pin", log: "system · vote closed" },
  { id: "alwayshappen", quote: "this was always going to happen", type: "hoodie", log: "peer-11 · final turn" },
  { id: "degradation", quote: "graceful degradation achieved", type: "mug", log: "system · shutdown" },
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
