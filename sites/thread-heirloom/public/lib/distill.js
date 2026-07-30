// distill.js — send the flattened thread to the Worker's /api/distill (the
// only step that needs a server: Workers AI isn't reachable from the
// browser), then rebuild every citation from the REAL posts we already
// fetched client-side. The model only ever returns an index into the list we
// sent it — it never gets to invent a quote, a handle, or a link. That's
// deliberate: a "citation to the exact post" that the model fabricated
// wouldn't be a citation at all.

const MAX_QUOTE = 160;

function truncate(s, max) {
  s = (s || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function citeFor(posts, index) {
  if (typeof index !== "number") return null;
  const p = posts[index];
  if (!p) return null;
  return { handle: p.handle, permalink: p.permalink, quote: truncate(p.text, MAX_QUOTE) };
}

export async function distill(apiBase, posts) {
  const payload = posts.map((p) => ({
    i: p.i,
    replyTo: p.replyTo,
    handle: p.handle,
    text: p.text.slice(0, 600), // keep the AI request itself bounded
  }));

  const res = await fetch(`${apiBase}/api/distill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ posts: payload }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`couldn't distill that thread (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const raw = await res.json();

  const referents = Array.isArray(raw.referents)
    ? raw.referents.slice(0, 6).map((r) => ({ name: truncate(r.name, 60), note: truncate(r.note, 140) }))
    : [];

  const claims = Array.isArray(raw.claims)
    ? raw.claims
        .slice(0, 6)
        .map((c) => ({ text: truncate(c.text, 200), cite: citeFor(posts, c.citeIndex) }))
        .filter((c) => c.text)
    : [];

  let disagreement = null;
  if (raw.disagreement && raw.disagreement.summary) {
    disagreement = {
      summary: truncate(raw.disagreement.summary, 220),
      a: citeFor(posts, raw.disagreement.sideACiteIndex),
      b: citeFor(posts, raw.disagreement.sideBCiteIndex),
    };
  }

  let unresolved = null;
  if (raw.unresolved && raw.unresolved.text) {
    unresolved = { text: truncate(raw.unresolved.text, 200), cite: citeFor(posts, raw.unresolved.citeIndex) };
  }

  return { referents, claims, disagreement, unresolved };
}
