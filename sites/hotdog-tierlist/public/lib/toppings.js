// toppings.js — pure text logic: is this post about hot dogs, which toppings
// does it name, and how does it feel about them. No DOM, so tests can import it.

export const HOTDOG_QUERIES = ["hotdog", "hotdogs", "hot dog", "hot dogs", "chili dog", "corn dog"];

const HOTDOG_RE = /\b(hot[\s-]?dogs?|chili[\s-]?dogs?|corn[\s-]?dogs?|coney|frankfurters?|wieners?|bratwurst|brats?|chicago[\s-]style)\b/i;

export function isHotdogPost(text) {
  return HOTDOG_RE.test(text);
}

// name, emoji, regex. Order only affects display of ties.
export const TOPPINGS = [
  ["mustard", "🟡", /\bmustard\b/i],
  ["ketchup", "🍅", /\b(ketchup|catsup)\b/i],
  ["onions", "🧅", /\bonions?\b/i],
  ["relish", "🥒", /\brelish\b/i],
  ["sauerkraut", "🥬", /\b(sauerkraut|kraut)\b/i],
  ["chili", "🌶️", /\bchili\b(?![\s-]?dog)/i],
  ["cheese", "🧀", /\b(cheese|cheddar|nacho cheese)\b/i],
  ["jalapeños", "🫑", /\bjalape(ñ|n)os?\b/i],
  ["mayo", "🥚", /\b(mayo|mayonnaise)\b/i],
  ["pickles", "🥒", /\bpickles?\b/i],
  ["tomato", "🍅", /\btomato(es)?\b/i],
  ["slaw", "🥗", /\b(slaw|coleslaw)\b/i],
  ["bacon", "🥓", /\bbacon\b/i],
  ["sport peppers", "🌶️", /\bsport peppers?\b/i],
  ["celery salt", "🧂", /\bcelery salt\b/i],
  ["kimchi", "🌶️", /\bkimchi\b/i],
  ["sriracha", "🔥", /\bsriracha\b/i],
  ["bbq sauce", "🍖", /\b(bbq|barbecue) sauce\b/i],
  ["avocado", "🥑", /\b(avocado|guacamole|guac)\b/i],
  ["crispy onions", "🧅", /\b(crispy|fried) onions?\b/i],
  ["peppers", "🫑", /\b(bell )?peppers?\b/i],
  ["fries", "🍟", /\b(fries|french fries)\b/i],
  ["plain / naked", "🌭", /\b(plain|naked|dry)\s+(hot[\s-]?dogs?)\b/i],
];

const NEG_BEFORE = /\b(no|never|without|hate|hates|ban|banned|gross|disgusting|nasty|illegal|crime|criminal|heresy|sinful|cursed)\W+(?:\w+\W+){0,2}$/i;
const NEG_AFTER = /^\W*(?:is|are|on a hot ?dog is)?\W*(?:\w+\W+){0,1}(gross|disgusting|nasty|illegal|a crime|criminal|heresy|cursed|wrong|bad|vile|awful)/i;
const POS_NEAR = /\b(love|best|good|great|perfect|supreme|supremacy|yes|ah hell yes|delicious|goated|correct|only|essential|elite|king)\b/i;

// -> [{name, emoji, sentiment: -1|0|1}] for each topping named in `text`.
export function findToppings(text) {
  const out = [];
  for (const [name, emoji, re] of TOPPINGS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m, sentiment = 0, hit = false;
    while ((m = g.exec(text))) {
      hit = true;
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) sentiment = Math.min(sentiment, -1);
      else if (POS_NEAR.test(before + " " + after) && sentiment === 0) sentiment = 1;
    }
    if (hit) out.push({ name, emoji, sentiment });
  }
  // "crispy onions" also trips plain onions; "sport peppers" trips peppers.
  const names = new Set(out.map((t) => t.name));
  return out.filter((t) => !(t.name === "peppers" && names.has("sport peppers")) && !(t.name === "onions" && names.has("crispy onions") && !/\bonions?\b(?<!crispy onions?)(?<!fried onions?)/i.test(text)));
}

// posts: [{uri, author:{did,...}, text, likeCount, repostCount}]
// -> sorted rows [{name, emoji, people:Set, mentions, pos, neg, score, posts[]}]
export function tally(posts) {
  const map = new Map();
  for (const p of posts) {
    // p.visual: toppings the photo reader spotted (vision.js), neutral
    // sentiment, counted only when the text didn't already name them.
    const named = findToppings(p.text);
    const seen = new Set(named.map((t) => t.name));
    const seeing = (p.visual || [])
      .filter((n) => !seen.has(n))
      .map((n) => TOPPINGS.find((t) => t[0] === n))
      .filter(Boolean)
      .map(([name, emoji]) => ({ name, emoji, sentiment: 0, seen: true }));
    for (const t of named.concat(seeing)) {
      let r = map.get(t.name);
      if (!r) map.set(t.name, (r = { name: t.name, emoji: t.emoji, people: new Set(), mentions: 0, pos: 0, neg: 0, score: 0, posts: [] }));
      r.people.add(p.author.did || p.author.handle);
      r.mentions++;
      if (t.sentiment > 0) r.pos++;
      if (t.sentiment < 0) r.neg++;
      r.posts.push({ post: p, sentiment: t.sentiment, seen: !!t.seen });
    }
  }
  const rows = [...map.values()];
  for (const r of rows) {
    // distinct people matter most; a negative mention cancels a neutral one.
    r.score = r.people.size * 3 + (r.mentions - r.neg * 2) + r.pos * 1.5;
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows;
}

export const TIERS = ["S", "A", "B", "C", "D", "F"];

// Net-negative toppings drop to F; the rest are split into tiers by rank so the
// list always fills the board the way a tier list should, whatever the size.
export function assignTiers(rows) {
  const out = Object.fromEntries(TIERS.map((t) => [t, []]));
  const ok = [];
  for (const r of rows) {
    if (r.neg > r.pos + (r.mentions - r.neg - r.pos) * 0.5 && r.neg >= 1) out.F.push(r);
    else ok.push(r);
  }
  const n = ok.length;
  ok.forEach((r, i) => {
    const q = n === 1 ? 0 : i / (n - 1);
    const tier = q <= 0.12 ? "S" : q <= 0.35 ? "A" : q <= 0.6 ? "B" : q <= 0.8 ? "C" : q <= 0.93 ? "D" : "F";
    out[n === 1 ? "S" : tier].push(r);
  });
  return out;
}
