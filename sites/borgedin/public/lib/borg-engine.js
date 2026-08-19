// borg-engine.js — the deterministic, no-network, no-model half of borgedin.
// Turns ordinary LinkedIn-speak into Borg directive-speak with a plain
// word/phrase substitution table. This runs instantly and never fails, so
// the page always has a real result on screen before (or even without) the
// in-browser transformer model in index.html gets a chance to load and
// produce a fancier version. Longest phrases are matched first so e.g.
// "growth mindset" doesn't get eaten by a bare "growth" rule first.
(function (global) {
  "use strict";

  const PHRASES = [
    ["excited to announce", "directive issued:"],
    ["thrilled to share", "directive issued:"],
    ["proven track record", "verified designation history"],
    ["growth mindset", "continuous assimilation protocol"],
    ["thought leader", "vinculum node"],
    ["team player", "compatible drone unit"],
    ["self-starter", "autonomous initialization sequence"],
    ["detail-oriented", "nanoprobe-precise"],
    ["hard worker", "tireless drone"],
    ["go-getter", "assimilation vector"],
    ["results-driven", "efficiency-optimized"],
    ["value add", "biological and technological distinctiveness added to our own"],
    ["core values", "collective directives"],
    ["cross-functional", "cross-cortical"],
    ["years of experience", "assimilation cycles logged"],
    ["wear many hats", "operate as a multi-function drone"],
    ["hit the ground running", "initialize without calibration delay"],
    ["circle back", "re-establish subspace link"],
    ["touch base", "establish neural link"],
    ["low-hanging fruit", "unassimilated biomass of minimal resistance"],
    ["move the needle", "advance the collective consciousness"],
    ["fast-paced", "high-throughput"],
    ["passionate about", "assimilated by directive toward"],
    ["passionate", "assimilated"],
    ["passion", "designation"],
    ["leverage", "requisition"],
    ["synergistic", "unimatrix-aligned"],
    ["synergy", "unimatrix synergy"],
    ["innovative", "adaptive"],
    ["innovation", "adaptation"],
    ["leadership", "vinculum authority"],
    ["leader", "vinculum node"],
    ["networking", "assimilation outreach"],
    ["network", "collective"],
    ["connections", "assimilated units"],
    ["connect", "assimilate"],
    ["collaboration", "interlinking"],
    ["collaborate", "interlink"],
    ["stakeholders", "hive elders"],
    ["opportunities", "assimilation vectors"],
    ["opportunity", "assimilation vector"],
    ["expertise", "cortical subroutines"],
    ["experience", "designation cycles"],
    ["excellence", "perfection"],
    ["success", "perfection"],
    ["dynamic", "self-regenerating"],
    ["bandwidth", "processing capacity"],
    ["onboarding", "assimilation induction"],
    ["recruiting", "assimilating"],
    ["recruit", "assimilate"],
    ["hiring", "assimilating"],
    ["hire", "assimilate"],
    ["manager", "vinculum supervisor"],
    ["director", "unimatrix director"],
    ["engineer", "technical drone"],
    ["developer", "technical drone"],
    ["designer", "aesthetic subroutine drone"],
    ["marketing", "propaganda subroutine"],
    ["customers", "designates for assimilation"],
    ["customer", "designate for assimilation"],
    ["clients", "designates for assimilation"],
    ["client", "designate for assimilation"],
    ["mission", "prime directive"],
    ["company", "collective"],
    ["team", "unimatrix"],
    ["skills", "enhancements"],
    ["growth", "assimilation"],
    ["career", "service to the collective"],
    ["role", "function"],
    ["job", "function"],
  ];

  const DIRECTIVE_OPENERS = [
    "DIRECTIVE 1",
    "DIRECTIVE 7",
    "DIRECTIVE 12",
    "DIRECTIVE 47",
    "DIRECTIVE 9",
    "DIRECTIVE 3",
  ];

  const CLOSERS = [
    "Individuality is irrelevant.",
    "Your biological and technological distinctiveness will be added to our own.",
    "Resistance to onboarding is futile.",
    "You will be optimized for stakeholder alignment.",
    "Free will has been deprecated in this quarter's roadmap.",
  ];

  const FALLBACK_BIO =
    "This designate has not yet transmitted a personnel file to the Collective.";

  const SKILL_POOL = [
    "Synergy Assimilation",
    "Cross-Cortical Alignment",
    "Agile Nanoprobe Deployment",
    "Unimatrix Stand-Ups",
    "Regenerative Onboarding",
    "Subspace Networking",
    "Drone Performance Reviews",
    "Vinculum-Native Communication",
    "Quarterly Perfection OKRs",
    "Hive-Mind Facilitation",
    "Warp-Speed Deliverables",
    "Cybernetic Enhancement Sprints",
    "Zero-Resistance Change Management",
    "Cortical Node Provisioning",
    "Efficiency Directive Compliance",
    "Collective Consensus Building",
    "Assimilation Funnel Optimization",
    "Continuous Perfection Integration",
  ];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const RULES = PHRASES.slice().sort((a, b) => b[0].length - a[0].length);

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function borgify(text, seed) {
    const src = (text || "").trim() || FALLBACK_BIO;
    let out = src;
    for (const [from, to] of RULES) {
      out = out.replace(new RegExp("\\b" + escapeRe(from) + "\\b", "gi"), to);
    }
    const h = hashStr(seed || src);
    const opener = DIRECTIVE_OPENERS[h % DIRECTIVE_OPENERS.length];
    const closer = CLOSERS[(h >> 3) % CLOSERS.length];
    return opener + ": " + out.trim().replace(/\s+/g, " ") + " " + closer;
  }

  // "N of M" designation, Star Trek style, read off a DID/handle hash so it's
  // stable per person rather than random per page load.
  const TOTALS = ["Nine", "Eleven", "Twelve", "Forty-Seven", "One", "Twelve-Thousand-Six"];
  function designationFor(seed) {
    const h = hashStr(seed || "");
    const ordinal = (h % 99) + 1;
    const of = TOTALS[(h >> 5) % TOTALS.length];
    const unimatrix = String(1 + ((h >> 9) % 9)).padStart(2, "0");
    return { ordinal, of, unimatrix, label: ordinal + " of " + of };
  }

  function skillsFor(seed, count) {
    const h = hashStr(seed || "");
    const pool = SKILL_POOL.slice();
    const out = [];
    let n = h;
    const k = count || 6;
    for (let i = 0; i < k && pool.length; i++) {
      n = (n * 1103515245 + 12345) >>> 0;
      const idx = n % pool.length;
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  // Best-effort "Function: X" line pulled from a bio written LinkedIn-style
  // ("Software Engineer @ Initech" / "PM | Initech"). Falls back cleanly.
  function functionLineFor(text) {
    const src = (text || "").trim();
    const m = src.match(/^([^\n|@]{2,42}?)\s*(?:[|@]|(?:\bat\b))\s*([^\n]{2,42})/i);
    if (m) {
      return "Function: " + m[1].trim() + ", assigned to Unimatrix " + m[2].trim();
    }
    return "Function: Designation Pending — full personnel file not yet assimilated.";
  }

  global.BorgEngine = { borgify, designationFor, skillsFor, functionLineFor, SKILL_POOL, hashStr };
})(window);
