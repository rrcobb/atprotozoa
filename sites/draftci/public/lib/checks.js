// draftci checks — each stage takes the draft text (and a ctx with fetch helpers)
// and returns { status: "pass"|"warn"|"fail", detail }. Pure where possible so
// tests can call them without a browser.

export const MAX_GRAPHEMES = 300; // Bluesky's post limit (app.bsky.feed.post maxGraphemes)

export function graphemeCount(s) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

// Same shapes the official client uses for facet detection.
const URL_RE = /(^|\s|\()((https?:\/\/[\S]+)|((?<domain>[a-z][a-z0-9]*(\.[a-z0-9]+)+)[\S]*))/gim;
const MENTION_RE = /(^|\s|\()@([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+)(?=$|[\s.,;:!?)])/g;
const TAG_RE = /(^|\s)[#＃]([^\s­⁠ ​‌‍⃢]*[^\d\s\p{P}­⁠ ​‌‍⃢]+[^\s­⁠ ​‌‍⃢]*)/gu;

export function findLinks(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let u = m[2].replace(/[.,;:!?]+$/, "");
    if (/\)$/.test(u) && !u.includes("(")) u = u.slice(0, -1);
    out.push(u);
  }
  return out;
}
export const findMentions = (text) => [...text.matchAll(MENTION_RE)].map((m) => m[2].toLowerCase());
export const findTags = (text) => [...text.matchAll(TAG_RE)].map((m) => m[2]);

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|igshid|mc_eid|ref_src|si)$/i;

export const STAGES = [
  {
    id: "length",
    name: "lint: length",
    run(text) {
      const n = graphemeCount(text);
      if (!text.trim()) return { status: "fail", detail: "draft is empty" };
      if (n > MAX_GRAPHEMES) return { status: "fail", detail: `${n}/${MAX_GRAPHEMES} graphemes — ${n - MAX_GRAPHEMES} over. trim it or split into a thread.` };
      if (n > MAX_GRAPHEMES - 20) return { status: "warn", detail: `${n}/${MAX_GRAPHEMES} graphemes — no room left for edits.` };
      return { status: "pass", detail: `${n}/${MAX_GRAPHEMES} graphemes` };
    },
  },
  {
    id: "whitespace",
    name: "lint: whitespace",
    run(text) {
      const issues = [];
      if (/[ \t]+$/m.test(text)) issues.push("trailing spaces");
      if (/ {2,}/.test(text.replace(/^\s+/gm, ""))) issues.push("double spaces");
      if (/\n{3,}/.test(text)) issues.push("3+ blank lines in a row");
      if (/^\s+\S/.test(text) && !/^\s*$/.test(text)) issues.push("leading whitespace");
      return issues.length ? { status: "warn", detail: issues.join(", ") } : { status: "pass", detail: "clean" };
    },
  },
  {
    id: "links",
    name: "build: links",
    run(text) {
      const links = findLinks(text);
      if (!links.length) return { status: "pass", detail: "no links" };
      const notes = [];
      let status = "pass";
      for (const l of links) {
        let url;
        try { url = new URL(/^https?:\/\//i.test(l) ? l : "https://" + l); } catch { status = "fail"; notes.push(`unparseable: ${l}`); continue; }
        const tracked = [...url.searchParams.keys()].filter((k) => TRACKING.test(k));
        if (tracked.length) { if (status === "pass") status = "warn"; notes.push(`${url.host} carries tracking params (${tracked.join(", ")})`); }
        if (/^(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly)$/i.test(url.host)) { if (status === "pass") status = "warn"; notes.push(`${url.host} is a shortener — people can't see where it goes`); }
        if (url.protocol === "http:") { if (status === "pass") status = "warn"; notes.push(`${url.host} is plain http`); }
      }
      return { status, detail: notes.length ? notes.join("; ") : `${links.length} link${links.length > 1 ? "s" : ""}, all tidy` };
    },
  },
  {
    id: "mentions",
    name: "test: mentions resolve",
    async run(text, ctx) {
      const hs = [...new Set(findMentions(text))];
      if (!hs.length) return { status: "pass", detail: "no mentions" };
      const bad = [];
      await Promise.all(hs.map(async (h) => { if (!(await ctx.handleExists(h))) bad.push(h); }));
      if (bad.length) return { status: "fail", detail: `can't resolve ${bad.map((b) => "@" + b).join(", ")} — typo, or the handle changed` };
      return { status: "pass", detail: `${hs.length} mention${hs.length > 1 ? "s" : ""} resolved` };
    },
  },
  {
    id: "tags",
    name: "lint: hashtags",
    run(text) {
      const tags = findTags(text);
      if (tags.length > 3) return { status: "warn", detail: `${tags.length} hashtags — reads like 2013 instagram` };
      return { status: "pass", detail: tags.length ? `${tags.length} hashtag${tags.length > 1 ? "s" : ""}` : "none" };
    },
  },
  {
    id: "tone",
    name: "lint: tone",
    run(text) {
      const notes = [];
      const letters = text.replace(/[^A-Za-z]/g, "");
      if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) notes.push("mostly ALL CAPS");
      if ((text.match(/!/g) || []).length >= 4) notes.push("4+ exclamation marks");
      if (/(.)\1{5,}/.test(text.replace(/\s/g, " "))) notes.push("a held-down key (aaaaaa)");
      if (/\b(ratio|quote this|rt if|like if|this you\??)\b/i.test(text)) notes.push("engagement-bait phrasing");
      return notes.length ? { status: "warn", detail: notes.join(", ") } : { status: "pass", detail: "no flags" };
    },
  },
  {
    id: "secrets",
    name: "security: leaks",
    run(text) {
      const hits = [];
      if (/\b(sk|pk|ghp|gho|xox[bp]|AKIA)[-_A-Za-z0-9]{16,}/.test(text)) hits.push("something shaped like an API key");
      if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(text.replace(MENTION_RE, ""))) hits.push("an email address");
      if (/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/.test(text)) hits.push("a phone number");
      if (/\b(app-?password|bearer\s+[A-Za-z0-9._-]{12,})/i.test(text)) hits.push("a credential word");
      return hits.length ? { status: "fail", detail: `found ${hits.join(", ")} — you sure?` } : { status: "pass", detail: "nothing secret-shaped" };
    },
  },
];

export async function runPipeline(text, ctx, onStage) {
  const results = [];
  let failed = false;
  for (const st of STAGES) {
    onStage?.(st, { status: "running" });
    let r;
    try { r = await st.run(text, ctx); } catch (e) { r = { status: "warn", detail: "check errored: " + (e?.message || e) }; }
    results.push({ id: st.id, name: st.name, ...r });
    if (r.status === "fail") failed = true;
    onStage?.(st, r);
  }
  return { results, failed, warned: results.some((r) => r.status === "warn") };
}
