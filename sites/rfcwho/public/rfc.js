// rfcwho — generates a parody IETF RFC. Every normative sentence is a real
// RFC 2119 keyword; every sentence is short, one-instruction, plain-language
// (the ASD-STE100 house rules). The confusion is entirely load-bearing: the
// document's nodes and header values are named "Who", "What", "I Don't
// Know", etc. — words that are both proper nouns in this protocol AND
// ordinary English question words, and the spec insists on treating them as
// the former in every sentence, including the ones that read like questions.

(function () {
  "use strict";

  const NAMES = [
    "Who", "What", "I Don't Know", "Why", "Because", "Today", "Tomorrow",
    "Naturally", "Nobody", "Something Else",
  ];

  const ROLE_LABELS = [
    "origin node", "relay node", "terminus node", "arbiter", "watchdog process",
  ];

  const HEADERS = [
    "Origin-Name", "Next-Hop", "Ack-For", "On-Behalf-Of", "Query-Target", "Reason",
  ];

  // Bare-verb-compatible forms only ("X MUST do Y") — REQUIRED, RECOMMENDED,
  // and OPTIONAL are real RFC 2119 keywords but grammatically need "is/are"
  // before them, so they appear as predicates (Section 2's boilerplate list)
  // rather than dropped into these modal slots.
  const KEYWORDS_POS = ["MUST", "SHALL", "SHOULD"];
  const KEYWORDS_NEG = ["MUST NOT", "SHALL NOT", "SHOULD NOT"];
  const KEYWORDS_OPT = ["MAY"];

  const CATEGORIES = [
    "Standards Track", "Best Current Practice", "Experimental",
    "Informational", "Historic", "Comedy (Informational)",
  ];

  const ADJ = [
    "Ambiguous", "Recursive", "Homophonic", "Interrogative", "Circular",
    "Undecidable", "Self-Referential", "Non-Deterministic",
    "Mutually Unintelligible", "Load-Bearing",
  ];
  const NOUN = [
    "Handshake", "Acknowledgment", "Naming", "Disambiguation", "Negotiation",
    "Resolution", "Arbitration", "Correspondence",
  ];

  function pick(arr, rnd) {
    return arr[Math.floor(rnd() * arr.length)];
  }

  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Small seedable PRNG (mulberry32) so a document can be regenerated from
  // its own RFC number if ever needed — not required today, but keeps
  // "reload for a different draft" honest about being a fresh seed each time.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function wrap(text, width) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > width) {
        lines.push(line.trim());
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    if (line) lines.push(line);
    return lines.join("\n");
  }

  function generate() {
    const rnd = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

    const names = shuffled(NAMES, rnd);
    const roles = {};
    ROLE_LABELS.forEach((label, i) => {
      roles[label] = names[i % names.length];
    });
    const [origin, relay, terminus, arbiter, watchdog] = ROLE_LABELS.map((l) => roles[l]);

    const headers = shuffled(HEADERS, rnd);
    const [hA, hB, hC] = headers;

    const rfcNumber = 1000 + Math.floor(rnd() * 8999);
    const category = pick(CATEGORIES, rnd);
    const titleAdj = pick(ADJ, rnd);
    const titleNoun = pick(NOUN, rnd);
    const title = `The ${titleAdj} ${titleNoun} Protocol (${titleAdj[0]}${titleNoun[0]}P)`;
    const now = new Date();
    const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    function kw(set) {
      return pick(set, rnd);
    }
    function name() {
      return pick(names, rnd);
    }
    function header() {
      return pick(headers, rnd);
    }

    // ---- Section 6: normative requirements, numbered REQ-n -----------------
    const templates = [
      () => `${name()} ${kw(KEYWORDS_POS)} set the ${header()} header to the literal string "${name()}".`,
      () => `${name()} ${kw(KEYWORDS_NEG)} ask ${name()} for clarification when ${header()} is present. A present header is not a question.`,
      () => `Upon receipt of a message where ${header()} equals "${name()}", the recipient ${kw(KEYWORDS_POS)} treat the sender as that node. The recipient ${kw(KEYWORDS_NEG)} treat the header as a request to identify the sender.`,
      () => `${name()} ${kw(KEYWORDS_POS)} acknowledge ${name()} by echoing ${header()} unchanged within ${1 + Math.floor(rnd() * 30)} seconds. ${name()} ${kw(KEYWORDS_POS)} time out if no echo arrives.`,
      () => `If ${header()} is absent, the recipient ${kw(KEYWORDS_POS)} assume the sender is ${name()}, per Section 4. The recipient ${kw(KEYWORDS_NEG)} log this assumption as an error.`,
      () => `The string "${name()}" ${kw(KEYWORDS_POS)} be read as a proper noun in every normative sentence of this document, including this one.`,
      () => `${name()} ${kw(KEYWORDS_POS)} forward any message whose ${header()} matches ${name()} to ${name()}, even where the two names are equal.`,
      () => `When both ${name()} and ${name()} claim to be the sender, the ${header()} field ${kw(KEYWORDS_POS)} disambiguate them. This document ${kw(KEYWORDS_NEG)} specify how.`,
      () => `A conforming implementation ${kw(KEYWORDS_POS)} log every occurrence of the word "${name().toLowerCase()}" without assuming it refers to a node of the same name.`,
      () => `${name()} is not permitted to become ${name()}. Renaming ${kw(KEYWORDS_POS)} occur only via the registry in Section 8, and even then ${kw(KEYWORDS_NEG)} be performed without ${name()}'s approval.`,
      () => `${name()} ${kw(KEYWORDS_OPT)} respond to ${header()} with a second ${header()}. Nesting ${header()} inside itself ${kw(KEYWORDS_OPT)} occur, but a receiver ${kw(KEYWORDS_NEG)} reject the message solely for this reason.`,
      () => `${name()} ${kw(KEYWORDS_POS)} know its own name before sending any message. ${name()} ${kw(KEYWORDS_NEG)} ask another node to confirm it.`,
      () => `The value "I Don't Know" in ${header()} ${kw(KEYWORDS_POS)} be treated as an answer, not as an admission. A receiver that treats it as an admission is non-conforming.`,
      () => `${name()} ${kw(KEYWORDS_POS)} reply to a query about ${name()} by naming ${name()}, even when this reads as a non-answer to a human observer. Human readability is out of scope (Section 3).`,
    ];

    const reqCount = 9 + Math.floor(rnd() * 4);
    const reqs = [];
    for (let i = 1; i <= reqCount; i++) {
      const t = templates[Math.floor(rnd() * templates.length)];
      reqs.push({ id: `REQ-${i}`, text: t() });
    }

    return {
      rfcNumber, category, title, monthYear,
      names, origin, relay, terminus, arbiter, watchdog,
      hA, hB, hC, reqs,
    };
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render(doc) {
    const W = 72;
    const parts = [];

    parts.push(
      `<span class="hdrblock">Network Working Group                                       ${esc(doc.names[0])}\n` +
      `Request for Comments: ${doc.rfcNumber}                    rfcwho.bisks.net\n` +
      `Category: ${esc(doc.category)}                          ${esc(doc.monthYear)}\n` +
      `ISSN: none (this is a parody; do not cite it)</span>\n\n`
    );
    parts.push(`<span class="title">${esc(doc.title)}</span>\n\n`);

    parts.push(`<h2>Abstract</h2>\n`);
    parts.push(
      wrap(
        `This document specifies a protocol among nodes named ${doc.names.slice(0, 5).join(", ")}. ` +
        `All normative language complies with RFC 2119. All prose complies with ASD-STE100 plain-language rules: short sentences, one instruction each, approved words only. ` +
        `Compliance with both standards does not imply the reader will understand this document. That is not a defect; see Section 3.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>Status of This Memo</h2>\n`);
    parts.push(
      wrap(
        `This document specifies a protocol for the naming-arbitration community and requests discussion and suggestions for improvement. Distribution of this memo is unlimited, except among readers who ask follow-up questions, whose distribution rights this document declines to specify.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>1. Introduction</h2>\n`);
    parts.push(
      wrap(
        `Every node in this protocol has a name. Some names are also common English words: interrogatives, adverbs of time, and one full sentence ("${esc(doc.names.find((n) => n.includes("Don't")) || "I Don't Know")}"). ` +
        `This document does not resolve that collision. This document formalizes it.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>2. Terminology</h2>\n`);
    parts.push(
      wrap(
        `The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119, except where interpreting them first requires determining who ${esc(doc.origin)} is, which this document declines to do.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>3. Plain-Language Conformance</h2>\n`);
    parts.push(
      wrap(
        `This document follows ASD-STE100 Simplified Technical English rules to the fullest extent the subject matter allows. Sentences are short. Each sentence states one fact. Approved verbs are used. A term used as a node's proper name, rather than in its ordinary English sense, is marked in italics on first use only, per convention. This document accepts all resulting ambiguity as a feature, not a defect.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>4. Protocol Overview</h2>\n`);
    parts.push(
      wrap(
        `Consider a handshake between the origin node (${esc(doc.origin)}) and the relay node (${esc(doc.relay)}). The origin node MUST identify itself using the ${esc(doc.hA)} header. Suppose the origin node's name is "${esc(doc.origin)}". The relay node receives ${esc(doc.hA)}: ${esc(doc.origin)} and MUST NOT interpret this as a question. A conforming relay asks nothing further and forwards the message to the terminus node, ${esc(doc.terminus)}, who by Section 6 also MUST NOT ask.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>5. Roles</h2>\n`);
    parts.push(
      `  origin node        ${esc(doc.origin)}\n` +
      `  relay node         ${esc(doc.relay)}\n` +
      `  terminus node      ${esc(doc.terminus)}\n` +
      `  arbiter            ${esc(doc.arbiter)}\n` +
      `  watchdog process   ${esc(doc.watchdog)}\n\n`
    );
    parts.push(
      wrap(
        `A node's role and a node's name are independent. Do not infer a node's role from its name, even when its name is a role-shaped word.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>6. Normative Requirements</h2>\n`);
    for (const r of doc.reqs) {
      parts.push(
        `<span class="req"><span class="id">${r.id}.</span> ${wrap(esc(r.text), W - 8).split("\n").join("\n    ")}</span>\n\n`
      );
    }

    parts.push(`<h2>7. Security Considerations</h2>\n`);
    parts.push(
      wrap(
        `An attacker who asks "${esc(doc.origin)} is on first?" gains no information not already available to a legitimate implementer, since neither party knows either. Implementations SHOULD NOT treat sustained confusion as evidence of an attack. Confusion is the specified behavior.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>8. IANA Considerations</h2>\n`);
    parts.push(
      wrap(
        `IANA is requested to establish a registry of Node Names. Entries SHOULD be common interrogative, temporal, or indefinite-pronoun words. IANA is NOT REQUIRED to understand any entry in this registry, and per Section 7, SHOULD NOT ask for clarification.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>Copyright Notice</h2>\n`);
    parts.push(
      wrap(
        `Copyright (c) ${new Date().getFullYear()} the persons identified as document authors, all of whom deny understanding the document. Copying is permitted, provided that all resulting confusion is preserved intact.`,
        W
      ) + "\n\n"
    );

    parts.push(`<h2>Author's Address</h2>\n`);
    parts.push(`  buildthis\n  bisks.net\n  Email: not specified (see Section 2)\n`);

    return parts.join("");
  }

  const docEl = document.getElementById("doc");
  const genBtn = document.getElementById("genBtn");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const shareBluesky = document.getElementById("shareBluesky");

  let currentDoc = null;
  let currentText = "";

  function plainText(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent;
  }

  function draft() {
    currentDoc = generate();
    const html = render(currentDoc);
    docEl.innerHTML = html;
    currentText = plainText(html);

    const bestReq = currentDoc.reqs[Math.floor(Math.random() * currentDoc.reqs.length)];
    const shareText =
      `RFC ${currentDoc.rfcNumber}: ${currentDoc.title}\n"${bestReq.text}"\n` +
      `Fully RFC 2119 + ASD-STE100 compliant. Still makes no sense.\n` +
      `https://rfcwho.bisks.net/`;
    shareBluesky.href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText.slice(0, 300));
  }

  genBtn.addEventListener("click", draft);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      const old = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = old), 1200);
    } catch {
      /* clipboard unavailable — silently ignore, text is still selectable */
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([currentText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfc${currentDoc ? currentDoc.rfcNumber : "0000"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  draft();
})();
