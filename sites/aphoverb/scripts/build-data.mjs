// Fetches en.wikipedia.org/wiki/List_of_proverbial_phrases in wikitext form
// and turns it into public/data/proverbs.json — a flat, cleaned list used to
// stock the "Proverb or Aphorism?" quiz pool.
//
// There is no Wikipedia page called "List of aphorisms" (checked — it
// doesn't exist; the closest is the prose "Aphorism" article, which has no
// clean list to scrape). public/data/aphorisms.json, overlaps.json, and
// discrepancies.json are hand-curated instead — see NOTES.md in this
// directory for how each entry was sourced. That gap is part of the site's
// own point: aphorisms are a named-author, literary tradition, so there's no
// tidy folk-list of them the way there is for proverbs.
//
//   node scripts/build-data.mjs   # rewrites ./public/data/proverbs.json

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://en.wikipedia.org/w/index.php?title=List_of_proverbial_phrases&action=raw";

// Hand-identified entries (see public/data/discrepancies.json) that carry a
// named attribution right there in the source list, despite being filed as
// anonymous "proverbial phrases." Excluded from the quiz pool — asking a
// player to tag one of these confidently "proverb" (no named author) would
// be asking them to be wrong about something Wikipedia itself is fuzzy on.
// Matched by a distinctive substring of the cleaned phrase text.
const ATTRIBUTED_SNIPPETS = [
  "Absolute power corrupts absolutely",
  "Better to reign in hell than serve in heaven",
  "All things excellent are as difficult as they are rare",
  "eye for an eye makes the whole world blind",
  "Early to bed and early to rise",
  "Brevity is the soul of wit",
  "Beware of Greeks bearing gifts",
  "He who loves the world as his body",
  "He who knows does not speak",
  "Kindness in words creates confidence",
  "To be worn out is to be renewed",
  "Hell hath no fury like a woman scorned",
  "if you steal from many, it is research",
  "Men are blind in their own cause",
  "Civility costs nothing and buys everything",
  "Keep your powder dry",
  "Not all those who wander are lost",
  "innocent seldom find an uncomfortable pillow",
  "Variety is the spice of life",
  "doomed to repeat it",
  "none so blind as those who will not see",
  "Truth is more valuable if it takes you a few years",
  "When in Rome",
  "great power comes great responsibility",
  "law is an ass",
  "Old soldiers never die",
  "like juggling sand",
  "dance with the Devil",
  "Money demands care",
  "more equal than others",
];

function stripRefs(s) {
  return s.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

function stripTemplates(s) {
  s = s.replace(/\{\{ndash\}\}/gi, "–");
  s = s.replace(/\{\{aka\}\}/gi, "also known as");
  // Templates here don't nest, so one global pass clears them all.
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, "");
  return s;
}

function stripLinks(s) {
  // [[wikt:target|Display]] / [[Page|Display]] / [[Page]] -> Display / Page
  return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");
}

function clean(rawLine) {
  let s = rawLine.replace(/^\*+\s*/, "");
  s = stripRefs(s);
  s = stripTemplates(s);
  s = stripLinks(s);
  s = s.replace(/'''/g, "").replace(/''/g, "");
  s = s.replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1"); // bare external links
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([.,;:])/g, "$1"); // space before removed-template punctuation
  s = s.replace(/\(\s*\)/g, "").trim(); // empty parens left by a stripped template
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return s;
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "user-agent": "aphoverb-build-script/1 (bisks.net/aphoverb)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  // Strip <ref>...</ref> blocks across the whole text first — a couple of
  // citations wrap onto a second line, which would otherwise survive a
  // per-line-only strip.
  const wikitext = stripRefs(await res.text());

  const lines = wikitext.split("\n");
  let letter = "";
  const seen = new Set();
  const entries = [];

  for (const line of lines) {
    const heading = line.match(/^==\s*([A-Z])\s*==$/);
    if (heading) {
      letter = heading[1];
      continue;
    }
    if (!letter) continue; // skip intro prose before the A section
    if (line.startsWith("== ") || line.startsWith("==See also")) break; // end of the alphabet
    if (!/^\*/.test(line.trim())) continue;

    const text = clean(line);
    if (!text || text.length < 4) continue;
    if (seen.has(text)) continue;
    seen.add(text);

    const attributed = ATTRIBUTED_SNIPPETS.some((snip) => text.includes(snip));
    entries.push({ text, letter, attributed });
  }

  const quizPool = entries.filter((e) => !e.attributed).map((e) => e.text);
  const attributed = entries.filter((e) => e.attributed).map((e) => e.text);

  const out = {
    source: "https://en.wikipedia.org/wiki/List_of_proverbial_phrases",
    fetchedEntries: entries.length,
    quizPool,
    // Filed as "proverbial phrases" by the source list, but carrying a named
    // attribution right there in the text — see public/data/discrepancies.json,
    // which hand-annotates each of these with the author/source.
    attributed,
  };

  const outPath = fileURLToPath(new URL("../public/data/proverbs.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`wrote ${outPath}: ${entries.length} entries, ${quizPool.length} in quiz pool`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
