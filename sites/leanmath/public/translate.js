// translate.js — a best-effort Lean -> LaTeX / math-notation translator.
//
// This is NOT a Lean parser. Lean's real grammar (notation extensions,
// elaboration, implicit arguments) is far too much for a paste-and-convert
// toy. Instead this does what a math-literate human does when skimming Lean
// source: recognize the shape of a declaration, recognize common symbols and
// idioms, and re-render them the way a textbook would. It will get creative
// or unusual Lean wrong — that's expected and stated in the UI.
//
// Pipeline, per declaration:
//   1. strip comments
//   2. split into declarations (theorem/lemma/example/def/abbrev/instance/axiom)
//   3. for each: parse name, binder groups ((x : T) {x : T} [T]), goal, proof marker
//   4. classify binders into "quantified variables" vs "hypotheses" vs "instances"
//   5. translate each piece of Lean-expression text into LaTeX
//   6. render a structured English-ish breakdown + one combined LaTeX formula

// ---------------------------------------------------------------------------
// 1. comment stripping (line -- and nested block /- -/)

function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (src[i] === "/" && src[i + 1] === "-") {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "-") {
          depth++;
          i += 2;
        } else if (src[i] === "-" && src[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2/3. splitting into declarations + parsing each one

const DECL_KEYWORDS = ["theorem", "lemma", "example", "def", "abbrev", "instance", "axiom", "noncomputable def"];

function findDeclStarts(src) {
  const starts = [];
  const re = /\b(theorem|lemma|example|def|abbrev|instance|axiom)\b/g;
  let m;
  while ((m = re.exec(src))) {
    // "noncomputable def" — fold the "noncomputable" prefix in if present.
    let start = m.index;
    const before = src.slice(Math.max(0, start - 14), start);
    const nc = before.match(/noncomputable\s*$/);
    if (nc) start -= nc[0].length;
    starts.push({ index: start, keyword: m[1] });
  }
  return starts;
}

// Scans forward from `i` over a run of whitespace and returns the new index.
function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

// Finds the matching close bracket for the opener at s[i], respecting nesting
// of all three bracket kinds inside (Lean binder types can nest, e.g.
// `(f : (n : Nat) -> Nat)`).
function matchBracket(s, i) {
  const open = s[i];
  const close = { "(": ")", "{": "}", "[": "]" }[open];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "(" || s[j] === "{" || s[j] === "[") depth++;
    else if (s[j] === ")" || s[j] === "}" || s[j] === "]") {
      depth--;
      if (depth === 0 && s[j] === close) return j;
    }
  }
  return -1;
}

// Splits a binder group's inner text ("a b : Nat", "x > 0" style hyp with no
// name, "_root_.Foo") on the first *top-level* colon into [names, type]. If
// there's no colon, treat the whole thing as an unnamed type/prop.
function splitBinder(inner) {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ":" && depth === 0 && inner[i + 1] !== "=") {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return ["", inner.trim()];
}

function parseBinderGroups(src, i) {
  const groups = [];
  i = skipWs(src, i);
  while (i < src.length && "({[".includes(src[i])) {
    const close = matchBracket(src, i);
    if (close === -1) break;
    const kind = src[i];
    const inner = src.slice(i + 1, close);
    const [names, type] = splitBinder(inner);
    groups.push({ kind, names, type });
    i = skipWs(src, close + 1);
  }
  return { groups, next: i };
}

// Finds the index of the top-level ":=" (proof/body start), ignoring any
// inside nested brackets or inside a `:` type ascription that isn't ":=".
function findAssign(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (depth === 0 && c === ":" && src[i + 1] === "=") return i;
  }
  return -1;
}

function parseDeclaration(text, keyword) {
  let i = keyword.length;
  i = skipWs(text, i);
  // optional name (identifier, possibly dotted)
  let name = "";
  const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_'.]*/);
  if (nameMatch && keyword !== "example") {
    name = nameMatch[0];
    i += nameMatch[0].length;
  }
  const { groups, next } = parseBinderGroups(text, i);
  i = skipWs(text, next);

  let goal = "";
  let hasAssign = findAssign(text, i);
  if (text[i] === ":" && text[i + 1] !== "=") {
    // goal/return-type runs up to the top-level ":=" or end
    const stop = hasAssign === -1 ? text.length : hasAssign;
    goal = text.slice(i + 1, stop).trim();
    i = stop;
  }

  let body = "";
  let proofTag = null;
  if (text[i] === ":" && text[i + 1] === "=") {
    body = text.slice(i + 2).trim();
    const byMatch = body.match(/^\s*by\s+([A-Za-z_][A-Za-z0-9_'!]*)/);
    if (byMatch) proofTag = `by ${byMatch[1]}…`;
    else if (body) proofTag = "term-mode proof";
  }

  return { keyword, name, groups, goal, body, proofTag };
}

function splitDeclarations(src) {
  const clean = stripComments(src).trim();
  if (!clean) return [];
  const starts = findDeclStarts(clean);
  if (starts.length === 0) return [{ raw: clean }]; // no declaration head — bare expression
  const decls = [];
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k].index;
    const to = k + 1 < starts.length ? starts[k + 1].index : clean.length;
    const text = clean.slice(from, to).trim();
    decls.push(parseDeclaration(text, starts[k].keyword));
  }
  return decls;
}

// ---------------------------------------------------------------------------
// 5. expression -> LaTeX translation

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// [literal, latex, type] — type 'sym' matches anywhere, 'word' matches on
// word boundaries only (so it doesn't mangle identifiers that happen to
// contain these letters).
const TABLE = [
  ["<->", "\\leftrightarrow ", "sym"],
  ["->", "\\to ", "sym"],
  ["/\\", "\\wedge ", "sym"],
  ["\\/", "\\vee ", "sym"],
  ["!=", "\\neq ", "sym"],
  ["<=", "\\leq ", "sym"],
  [">=", "\\geq ", "sym"],
  ["↔", "\\leftrightarrow ", "sym"],
  ["→", "\\to ", "sym"],
  ["∧", "\\wedge ", "sym"],
  ["∨", "\\vee ", "sym"],
  ["¬", "\\lnot ", "sym"],
  ["≠", "\\neq ", "sym"],
  ["≤", "\\leq ", "sym"],
  ["≥", "\\geq ", "sym"],
  ["∀", "\\forall ", "sym"],
  ["∃", "\\exists ", "sym"],
  ["∈", "\\in ", "sym"],
  ["∉", "\\notin ", "sym"],
  ["⊆", "\\subseteq ", "sym"],
  ["⊂", "\\subsetneq ", "sym"],
  ["∪", "\\cup ", "sym"],
  ["∩", "\\cap ", "sym"],
  ["∖", "\\setminus ", "sym"],
  ["×", "\\times ", "sym"],
  ["∘", "\\circ ", "sym"],
  ["⁻¹", "^{-1}", "sym"],
  ["√", "\\sqrt", "sym"],
  ["∑", "\\sum ", "sym"],
  ["∏", "\\prod ", "sym"],
  ["∫", "\\int ", "sym"],
  ["∞", "\\infty ", "sym"],
  ["≡", "\\equiv ", "sym"],
  ["≈", "\\approx ", "sym"],
  ["≃", "\\simeq ", "sym"],
  ["≅", "\\cong ", "sym"],
  ["⟨", "\\langle ", "sym"],
  ["⟩", "\\rangle ", "sym"],
  ["λ", "\\lambda ", "sym"],
  ["ℕ", "\\mathbb{N}", "sym"],
  ["ℤ", "\\mathbb{Z}", "sym"],
  ["ℝ", "\\mathbb{R}", "sym"],
  ["ℚ", "\\mathbb{Q}", "sym"],
  ["ℂ", "\\mathbb{C}", "sym"],
  ["∅", "\\emptyset ", "sym"],
  ["⊕", "\\oplus ", "sym"],
  ["⊗", "\\otimes ", "sym"],
  ["•", "\\cdot ", "sym"],
  ["*", "\\cdot ", "sym"],
  ["forall", "\\forall ", "word"],
  ["exists", "\\exists ", "word"],
  ["fun", "\\lambda ", "word"],
  ["not", "\\lnot ", "word"],
  ["Nat", "\\mathbb{N}", "word"],
  ["Int", "\\mathbb{Z}", "word"],
  ["Real", "\\mathbb{R}", "word"],
  ["Rat", "\\mathbb{Q}", "word"],
  ["Complex", "\\mathbb{C}", "word"],
  ["Prop", "\\text{Prop}", "word"],
  ["True", "\\text{True}", "word"],
  ["False", "\\text{False}", "word"],
];
TABLE.sort((a, b) => b[0].length - a[0].length);
const LOOKUP = new Map(TABLE.map(([k, v]) => [k, v]));
// Word-type entries get a dot-guard too: `Nat` should match the type `Nat`
// but not the `Nat` inside a namespaced identifier like `Nat.Prime`.
const SYMBOL_RE = new RegExp(
  TABLE.map(([k, , t]) => (t === "word" ? `(?<!\\.)\\b${esc(k)}\\b(?!\\.)` : esc(k))).join("|"),
  "g",
);

function substituteSymbols(s) {
  return s.replace(SYMBOL_RE, (m) => LOOKUP.get(m) ?? m);
}

// Identifiers longer than one letter render as run-together italic letters in
// raw LaTeX ("Nat.Prime" -> "N a t . P r i m e" multiplied together) unless
// wrapped in \text{}. Single letters are left alone — those are meant to look
// like math variables. Words this table will substitute later (Nat, forall,
// ...) are left alone too, so substituteSymbols still catches them.
const WORD_KEYS = new Set(TABLE.filter(([, , t]) => t === "word").map(([k]) => k));

function wrapIdent(text) {
  if (/^[(\[{]/.test(text)) return text; // already a bracketed group
  if (/^[0-9]/.test(text)) return text; // numeral
  if (text.length <= 1) return text; // single-letter math variable
  if (WORD_KEYS.has(text)) return text; // handled later by substituteSymbols
  return `\\text{${text.replace(/_/g, "\\_")}}`;
}

// fun/lambda arrow: Lean's `fun x => e` / `λ x => e` becomes `\lambda x.\ e`
function fixLambdaArrow(s) {
  return s.replace(/=>/g, ".\\ ");
}

// x_1 -> x_{1}, x^2 -> x^{2}  (skip ones already braced, e.g. our own ^{-1})
function braceScripts(s) {
  return s.replace(/([_^])(?!\{)([A-Za-z0-9]+)/g, "$1{$2}");
}

// --- function-application juxtaposition -----------------------------------
// A tiny tokenizer: identifiers/numbers/balanced-groups are "atoms"; a run of
// atoms separated only by whitespace (no operator between) is Lean function
// application, e.g. `f x y` means (f x) y. We render it as f(x, y). We skip
// runs that are immediately followed by a comma (that's a binder var list,
// e.g. `∃ x y, ...`) and runs immediately preceded by a quantifier/lambda.

function tokenizeAtoms(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      tokens.push({ type: "space", text: s.slice(i, j) });
      i = j;
    } else if (c === "(" || c === "{" || c === "[") {
      const close = matchBracket(s, i);
      if (close === -1) {
        tokens.push({ type: "op", text: c });
        i++;
      } else {
        tokens.push({ type: "atom", text: s.slice(i, close + 1) });
        i = close + 1;
      }
    } else if (/[A-Za-z_]/.test(c)) {
      // Plain identifiers only — ∀/∃/λ are binders, not applicable
      // identifiers, so they're deliberately excluded here and fall through
      // to the single-char "op" branch below.
      const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_'.]*/);
      const text = m[0];
      tokens.push({ type: "atom", text });
      i += text.length;
    } else if (/[0-9]/.test(c)) {
      const m = s.slice(i).match(/^[0-9]+(\.[0-9]+)?/);
      tokens.push({ type: "atom", text: m[0] });
      i += m[0].length;
    } else if (c === ",") {
      tokens.push({ type: "comma", text: c });
      i++;
    } else {
      tokens.push({ type: "op", text: c });
      i++;
    }
  }
  return tokens;
}

const QUANTIFIER_WORDS = new Set(["∀", "∃", "λ", "forall", "exists", "fun"]);

function applyJuxtaposition(s) {
  const toks = tokenizeAtoms(s);
  let out = "";
  let i = 0;
  while (i < toks.length) {
    if (toks[i].type === "atom") {
      // collect the run: atom (space atom)*
      const run = [i];
      let j = i + 1;
      while (j + 1 < toks.length && toks[j].type === "space" && toks[j + 1].type === "atom") {
        run.push(j + 1);
        j += 2;
      }
      const afterIdx = j;
      const afterIsComma = toks[afterIdx] && toks[afterIdx].type === "comma";
      // look back (skipping the space just before this run) for a quantifier
      let beforeIdx = i - 1;
      if (beforeIdx >= 0 && toks[beforeIdx].type === "space") beforeIdx--;
      // ∀/∃/λ are tokenized as single-char "op" tokens (see tokenizeAtoms),
      // not "atom" — check by text alone, not type.
      const beforeIsQuantifier = beforeIdx >= 0 && QUANTIFIER_WORDS.has(toks[beforeIdx].text);
      const bareHead = toks[run[0]].text.replace(/^.*\./, ""); // strip Real./Nat./etc namespace
      const singleArgInner = () => {
        const raw = toks[run[1]].text;
        return raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1) : raw;
      };
      if (run.length === 2 && !afterIsComma && !beforeIsQuantifier && bareHead === "sqrt") {
        out += `\\sqrt{${singleArgInner()}}`;
      } else if (run.length === 2 && !afterIsComma && !beforeIsQuantifier && bareHead === "abs") {
        out += `\\left|${singleArgInner()}\\right|`;
      } else if (run.length > 1 && !afterIsComma && !beforeIsQuantifier) {
        const head = wrapIdent(toks[run[0]].text);
        const args = run.slice(1).map((k) => wrapIdent(toks[k].text));
        // A single already-parenthesized arg (e.g. `f (x^2)`) shouldn't get
        // a second, redundant pair of parens wrapped around it.
        if (args.length === 1 && args[0].startsWith("(")) {
          out += `${head}${args[0]}`;
        } else {
          out += `${head}(${args.join(", ")})`;
        }
      } else {
        out += run.map((k) => wrapIdent(toks[k].text)).join(" ");
      }
      i = afterIdx;
    } else {
      out += toks[i].text;
      i++;
    }
  }
  return out;
}

// Full expression translation pipeline, applied to any chunk of Lean-ish
// expression text (a goal, a hypothesis type, a raw pasted snippet).
function translateExpr(raw) {
  if (!raw) return "";
  let s = raw.trim();
  s = applyJuxtaposition(s);
  s = fixLambdaArrow(s);
  s = substituteSymbols(s);
  s = braceScripts(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function texIdent(name) {
  if (!name) return "";
  if (name.length === 1) return name;
  // "h1", "hab" style Lean names read better as h_1 than \text{h1}.
  const m = name.match(/^([A-Za-z]+)([0-9]+)$/);
  if (m) {
    const [, letters, digits] = m;
    return `${letters.length === 1 ? letters : `\\text{${letters}}`}_{${digits}}`;
  }
  return `\\text{${name.replace(/_/g, "\\_")}}`;
}

// ---------------------------------------------------------------------------
// 4/6. classify binders + build the structured breakdown

const HYP_NAME_RE = /^h([A-Z0-9_'].*)?$/i;
const RELATION_RE = /(\\leq|\\geq|\\neq|\\in |\\subseteq |\\subsetneq |\\wedge |\\vee |\\to |\\leftrightarrow |\\lnot |=|<|>)/;

function classifyGroup(g) {
  const translatedType = translateExpr(g.type);
  if (g.kind === "[") return { role: "instance", names: g.names, type: translatedType };
  const firstName = (g.names.split(/\s+/)[0] || "").trim();
  const looksLikeHyp = HYP_NAME_RE.test(firstName) || RELATION_RE.test(translatedType);
  return { role: looksLikeHyp ? "hypothesis" : "variable", names: g.names, type: translatedType };
}

function declKindLabel(keyword) {
  return { theorem: "Theorem", lemma: "Lemma", example: "Example", def: "Definition", abbrev: "Definition", instance: "Instance", axiom: "Axiom" }[keyword] || "Statement";
}

// Renders one parsed declaration into { title, lines: [{label, tex}], combinedTex, proofTag }
function renderDeclaration(d) {
  if (d.raw !== undefined) {
    // bare expression, no declaration head
    return {
      title: null,
      lines: [{ label: "", tex: translateExpr(d.raw) }],
      combinedTex: translateExpr(d.raw),
      proofTag: null,
    };
  }

  const classified = d.groups.map(classifyGroup);
  const vars = classified.filter((g) => g.role === "variable");
  const hyps = classified.filter((g) => g.role === "hypothesis");
  const insts = classified.filter((g) => g.role === "instance");
  const goalTex = d.goal ? translateExpr(d.goal) : d.body && !d.goal ? translateExpr(d.body) : "";

  const lines = [];
  for (const v of vars) lines.push({ label: "For every", tex: `${v.names.split(/\s+/).map(texIdent).join(", ")} : ${v.type}` });
  for (const inst of insts) lines.push({ label: "Given", tex: inst.type });
  for (const h of hyps) {
    // Keep the plain-English "Assume" label free of LaTeX — the hypothesis's
    // own name (h1, hx, ...) is math notation, so it belongs in the tex
    // field (rendered by KaTeX) alongside its statement, not spliced into
    // a plain-text label.
    const tex = h.names && h.names !== "_" ? `${texIdent(h.names)} : ${h.type}` : h.type;
    lines.push({ label: "Assume", tex });
  }

  let mainTex;
  if (d.keyword === "def" || d.keyword === "abbrev" || d.keyword === "instance") {
    if (d.body) {
      const argList = classified.length ? `(${classified.map((g) => g.names).join(", ")})` : "";
      mainTex = `${texIdent(d.name || "f")}${argList ? "(" + classified.map((g) => g.names.split(/\s+/).map(texIdent).join(", ")).join(", ") + ")" : ""} := ${translateExpr(d.body)}`;
    } else if (d.goal) {
      // no body — render as a curried function signature, arrow-chaining the arg types
      const chain = [...classified.map((g) => g.type), goalTex].filter(Boolean);
      mainTex = `${texIdent(d.name)} : ${chain.join(" \\to ")}`;
    } else {
      mainTex = texIdent(d.name);
    }
    lines.length = 0; // definitions read best as one line, skip the binder breakdown
  } else {
    mainTex = goalTex || "\\text{(no goal found)}";
    lines.push({ label: "Then", tex: mainTex });
  }

  // combined single-formula version for the copyable LaTeX box
  const quantPrefix = vars.length ? `\\forall ${vars.map((v) => `${v.names.split(/\s+/).join(", ")} : ${v.type}`).join(", \\, ")},\\ ` : "";
  const instPrefix = insts.length ? insts.map((i) => i.type).join(", ") + " \\Rightarrow " : "";
  const hypChain = hyps.length ? hyps.map((h) => h.type).join(" \\to ") + " \\to " : "";
  let combinedTex;
  if (d.keyword === "def" || d.keyword === "abbrev" || d.keyword === "instance") {
    combinedTex = mainTex;
  } else {
    combinedTex = `${quantPrefix}${instPrefix}${hypChain}${goalTex || "\\text{?}"}`;
  }

  return {
    title: `${declKindLabel(d.keyword)}${d.name ? "\\ " + texIdent(d.name) : ""}`,
    lines,
    combinedTex,
    proofTag: d.proofTag,
  };
}

function translateLean(src) {
  const decls = splitDeclarations(src);
  return decls.map(renderDeclaration);
}

if (typeof module !== "undefined") module.exports = { translateLean, translateExpr };
