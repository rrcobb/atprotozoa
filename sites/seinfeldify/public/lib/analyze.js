// analyze.js — pick a bounded, representative sample out of (possibly
// thousands of) posts scanned by posts.js, POST it to the Worker's
// /api/analyze (the only step that needs a server — Workers AI isn't
// reachable from the browser), then rebuild every citation from the REAL
// posts already fetched client-side. The model only ever returns an index
// into the sample it was given — it never gets to invent a quote or a link.
// Same discipline as sites/thread-heirloom's distill.js.

const MAX_SAMPLE = 120; // keeps the AI request (and the final encoded card) bounded
const MAX_POST_CHARS = 300;
const MIN_POST_CHARS = 8; // skip near-empty posts ("lol", emoji-only) — no signal for a personality read

function truncate(s, max) {
  s = (s || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Half most-recent, half spread evenly across the rest of the history — so
// the verdict reflects a whole account's voice over time, not just whatever
// they posted this week, while still staying recency-aware.
export function sampleForAnalysis(allPosts) {
  const usable = allPosts.filter((p) => p.text.length >= MIN_POST_CHARS);
  const byRecency = [...usable].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  if (byRecency.length <= MAX_SAMPLE) return byRecency;

  const recentCount = Math.ceil(MAX_SAMPLE / 2);
  const recent = byRecency.slice(0, recentCount);
  const rest = byRecency.slice(recentCount);

  const spreadCount = MAX_SAMPLE - recentCount;
  const spread = [];
  const step = rest.length / spreadCount;
  for (let i = 0; i < spreadCount; i++) spread.push(rest[Math.floor(i * step)]);

  return [...recent, ...spread];
}

export async function analyze(sample) {
  const payload = sample.map((p, i) => ({ i, text: truncate(p.text, MAX_POST_CHARS) }));

  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ posts: payload }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`couldn't get a verdict (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const raw = await res.json();

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .filter((e) => typeof e.i === "number" && sample[e.i])
        .map((e) => ({
          text: truncate(sample[e.i].text, MAX_POST_CHARS),
          permalink: sample[e.i].permalink,
          note: truncate(e.note, 200),
        }))
    : [];

  return {
    character: raw.character,
    tagline: truncate(raw.tagline, 160),
    reasoning: truncate(raw.reasoning, 800),
    runnerUp: raw.runnerUp || null,
    evidence,
  };
}
