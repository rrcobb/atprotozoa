// mathhive's math engine: turns "3 + 4 * 2" or "2x + 3 = 11" into an ordered
// list of steps, one per bee. Plain script (no bundler) so it loads with a
// <script src> tag; also require()-able from node for a quick correctness
// check (see test.mjs) via the module.exports guard at the bottom.
//
// Three modes:
//  - arithmetic: no "=", reduces one operator at a time following PEMDAS
//    (innermost parens first, then ^, then * /, then + -, left to right).
//  - linear equation: one "=", both sides restricted to sums of plain numbers
//    and "x" terms (no parens, no x^2) — solved by combining like terms, then
//    moving x-terms and constants across the "=", then dividing.
//  - word problem: real English sentences ("Sam has 3 apples and buys 4
//    more"), no "=". A "reader bee" extracts the quantities and the
//    operations between them into a plain arithmetic expression, then the
//    rest of the swarm solves that expression exactly as above.

const MathHive = (() => {
  class SolveError extends Error {}

  // ---------- arithmetic (PEMDAS, step by step) ----------

  // Tokenize into numbers (as strings, sign-aware) and single-char operators.
  function tokenize(expr) {
    const s = expr.replace(/\s+/g, "");
    if (!s) throw new SolveError("nothing to solve");
    if (!/^[0-9+\-*/^().]+$/.test(s)) {
      throw new SolveError("only numbers and + - * / ^ ( ) are supported here");
    }
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === "(" || c === ")" || c === "^") {
        tokens.push(c);
        i++;
        continue;
      }
      if (c === "*" || c === "/") {
        tokens.push(c);
        i++;
        continue;
      }
      if (c === "+" || c === "-") {
        // Unary if at expr start, right after "(", or right after another operator.
        const prev = tokens[tokens.length - 1];
        const isUnary = prev === undefined || prev === "(" || isOp(prev);
        if (isUnary) {
          // Fold chained leading signs (e.g. "--5" or "+-5") into one.
          let j = i + 1;
          let sign = c;
          while (s[j] === "+" || s[j] === "-") {
            if (s[j] === "-") sign = sign === "-" ? "+" : "-";
            j++;
          }
          if (s[j] === "(") {
            // "-(2+3)" -> treat as "0 - (2+3)" so the paren-group logic below
            // still handles it as an ordinary subtraction.
            tokens.push("0", sign === "-" ? "-" : "+");
            i = j;
            continue;
          }
          let k = j;
          while (k < s.length && /[0-9.]/.test(s[k])) k++;
          if (k === j) throw new SolveError("dangling sign with no number after it");
          const num = s.slice(j, k);
          tokens.push((sign === "-" ? "-" : "") + num);
          i = k;
          continue;
        }
        tokens.push(c);
        i++;
        continue;
      }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        tokens.push(s.slice(i, j));
        i = j;
        continue;
      }
      throw new SolveError(`unexpected character "${c}"`);
    }
    return tokens;
  }

  function isOp(t) {
    return t === "+" || t === "-" || t === "*" || t === "/" || t === "^";
  }
  function isNum(t) {
    return typeof t === "string" && /^-?[0-9.]+$/.test(t);
  }

  function tokensToString(tokens) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const prev = tokens[i - 1];
      if (i > 0 && !(prev === "(") && !(t === ")")) out += " ";
      out += isNum(t) && t.startsWith("-") && (prev === undefined || prev === "(" || isOp(prev)) ? `(${t})` : t;
    }
    return out;
  }

  function fmtNum(n) {
    if (!isFinite(n)) throw new SolveError("that produced an infinite or undefined result");
    const r = Math.round(n * 1e9) / 1e9; // tame float noise, keep real precision
    return String(r);
  }

  // Find the [start,end) range of the innermost, leftmost fully-parenthesized
  // group (no "(" inside it). Returns null if there are no parens left.
  function innermostParenRange(tokens) {
    let openIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") openIdx = i;
      if (tokens[i] === ")") {
        if (openIdx === -1) throw new SolveError("unmatched )");
        return [openIdx, i + 1];
      }
    }
    if (openIdx !== -1) throw new SolveError("unmatched (");
    return null;
  }

  // One reduction step over tokens[lo,hi). Mutates and returns a description,
  // or null if the range is already a single number.
  function reduceOnce(tokens, lo, hi) {
    // Strip a paren pair that now wraps a single number.
    if (tokens[lo] === "(" && tokens[hi - 1] === ")" && hi - lo === 3 && isNum(tokens[lo + 1])) {
      tokens.splice(lo, 3, tokens[lo + 1]);
      return "drop the now-empty parentheses";
    }
    const inner = tokens[lo] === "(" && tokens[hi - 1] === ")" ? [lo + 1, hi - 1] : [lo, hi];
    const [a, b] = inner;

    const findOp = (set) => {
      for (let i = a; i < b; i++) if (set.includes(tokens[i]) && isNum(tokens[i - 1]) && isNum(tokens[i + 1])) return i;
      return -1;
    };

    let opIdx = findOp(["^"]);
    let opName = "raise to the power of";
    if (opIdx === -1) {
      opIdx = findOp(["*", "/"]);
      opName = tokens[opIdx] === "*" ? "multiply" : "divide";
    }
    if (opIdx === -1) {
      opIdx = findOp(["+", "-"]);
      opName = tokens[opIdx] === "+" ? "add" : "subtract";
    }
    if (opIdx === -1) return null; // already a single number in [a,b)

    const x = parseFloat(tokens[opIdx - 1]);
    const y = parseFloat(tokens[opIdx + 1]);
    const op = tokens[opIdx];
    let result;
    if (op === "^") result = Math.pow(x, y);
    else if (op === "*") result = x * y;
    else if (op === "/") {
      if (y === 0) throw new SolveError("division by zero");
      result = x / y;
    } else if (op === "+") result = x + y;
    else result = x - y;

    const resultStr = fmtNum(result);
    tokens.splice(opIdx - 1, 3, resultStr);
    return `${opName}: ${fmtNum(x)} ${op} ${fmtNum(y)} = ${resultStr}`;
  }

  function solveArithmetic(expr) {
    let tokens = tokenize(expr);
    const steps = [{ expr: tokensToString(tokens), note: "start" }];
    let guard = 0;
    while (tokens.length > 1) {
      if (++guard > 200) throw new SolveError("that expression is too tangled to trace step by step");
      const range = innermostParenRange(tokens);
      const [lo, hi] = range || [0, tokens.length];
      const note = reduceOnce(tokens, lo, hi);
      if (note === null) {
        if (range) {
          // A lone number sitting in parens with nothing to reduce; strip and continue.
          tokens.splice(lo, 1);
          tokens.splice(hi - 2, 1);
          continue;
        }
        throw new SolveError("got stuck reducing that expression");
      }
      steps.push({ expr: tokensToString(tokens), note });
    }
    return { steps, answer: tokens[0] };
  }

  // ---------- simple linear equations ----------

  // "3x - 2 + x" -> { a: 4, b: -2 } (a = coeff of x, b = constant)
  function parseLinearSide(raw) {
    const s = raw.replace(/\s+/g, "");
    if (!s) throw new SolveError("empty side of the equation");
    if (!/^[0-9x+\-.*]+$/.test(s)) {
      throw new SolveError("equations only support plain numbers, x, + - * (no parentheses or powers yet)");
    }
    // Split into signed terms.
    const withSigns = s.replace(/(?!^)-/g, "+-");
    const terms = withSigns.split("+").filter((t) => t !== "");
    let a = 0;
    let b = 0;
    for (const t of terms) {
      if (t.includes("x")) {
        if ((t.match(/x/g) || []).length > 1) throw new SolveError("only linear (single x) terms are supported");
        let coefStr = t.replace("x", "").replace("*", "");
        let coef;
        if (coefStr === "" || coefStr === "+") coef = 1;
        else if (coefStr === "-") coef = -1;
        else {
          coef = parseFloat(coefStr);
          if (!isFinite(coef)) throw new SolveError(`couldn't read the term "${t}"`);
        }
        a += coef;
      } else {
        const n = parseFloat(t);
        if (!isFinite(n)) throw new SolveError(`couldn't read the term "${t}"`);
        b += n;
      }
    }
    return { a, b };
  }

  function sideStr(a, b) {
    let s = "";
    if (a !== 0) s += `${a === 1 ? "" : a === -1 ? "-" : fmtNum(a)}x`;
    if (b !== 0 || s === "") {
      s += s === "" ? fmtNum(b) : (b >= 0 ? " + " : " - ") + fmtNum(Math.abs(b));
    }
    return s;
  }

  function solveLinearEquation(left, right) {
    const L = parseLinearSide(left);
    const R = parseLinearSide(right);
    const steps = [{ expr: `${sideStr(L.a, L.b)} = ${sideStr(R.a, R.b)}`, note: "combine like terms on each side" }];

    const a = L.a - R.a; // coefficient after moving x-terms to the left
    if (R.a !== 0) {
      steps.push({
        expr: `${sideStr(a, L.b)} = ${sideStr(0, R.b)}`,
        note: `subtract ${fmtNum(R.a)}x from both sides`,
      });
    }

    if (a === 0) {
      if (L.b === R.b) {
        steps.push({ expr: "true for every x", note: "the x terms cancel and both sides already match" });
        return { steps, answer: "infinitely many solutions" };
      }
      steps.push({ expr: "no solution", note: "the x terms cancel but the constants disagree" });
      return { steps, answer: "no solution" };
    }

    const c = R.b - L.b; // constant after moving to the right
    if (L.b !== 0) {
      steps.push({
        expr: `${sideStr(a, 0)} = ${fmtNum(c)}`,
        note: `subtract ${fmtNum(L.b)} from both sides`,
      });
    }

    const answer = c / a;
    steps.push({ expr: `x = ${fmtNum(answer)}`, note: a === 1 ? "already solved" : `divide both sides by ${fmtNum(a)}` });
    return { steps, answer: fmtNum(answer) };
  }

  // ---------- word problems ("Sam has 3 apples and buys 4 more") ----------

  // Deliberately excludes "a"/"an": as indefinite articles ("a wire", "a
  // baker") they vastly outnumber their rare use as the number one, so
  // treating them as digits produces more false quantities than real ones.
  const WORD_NUMS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    dozen: 12,
  };

  // Multi-word phrases checked before single words so e.g. "divided by"
  // wins over a lone "by". Order within a category doesn't matter; order
  // across categories does — division/multiplication read as tighter
  // groupings than a bare "and", so they're checked first. A phrase only
  // needs its words to appear IN ORDER within the gap, not adjacently —
  // "divided them among" still matches "divided among" (see hasPhrase).
  const OP_PHRASES = [
    ["/", ["divided by", "divided among", "divided between", "split evenly among", "split among", "split between", "shared equally among", "shared among", "shared between"]],
    ["*", ["multiplied by", "groups of", "sets of", "times", "each"]],
    ["-", ["subtracted from", "subtract", "minus", "fewer than", "fewer", "less than", "less", "gave away", "gives away", "took away", "takes away", "lost", "spent", "ate", "eaten", "eats", "eat", "sold", "used up", "used", "away", "absent", "missing"]],
    ["+", ["plus", "gained", "received", "found", "more", "added", "and"]],
  ];

  // gapWords: lowercased, punctuation-stripped words between two quantities.
  function findOpKeyword(gapWords) {
    const hasPhrase = (phraseWords) => {
      let pos = 0;
      for (const w of gapWords) {
        if (w === phraseWords[pos]) {
          pos++;
          if (pos === phraseWords.length) return true;
        }
      }
      return false;
    };
    for (const [op, phrases] of OP_PHRASES) {
      for (const phrase of phrases) {
        if (hasPhrase(phrase.split(" "))) return op;
      }
    }
    return null; // no signal — caller decides the default
  }

  const MULT_PREFIX = { half: 0.5, double: 2, twice: 2, triple: 3 };

  // Look 1-2 words back for a "half of"/"double"/"twice"/"triple" prefix,
  // skipping a single filler "of" ("half of 10" — "of" sits between the
  // prefix word and the number it modifies).
  function multiplierPrefixFor(words, i) {
    if (i < 1) return null;
    let j = i - 1;
    if (bareLower(words[j]) === "of" && j > 0) j--;
    const w = bareLower(words[j]);
    return Object.prototype.hasOwnProperty.call(MULT_PREFIX, w) ? w : null;
  }

  function bareLower(w) {
    return w.replace(/[.,!?;:]+$/, "").toLowerCase();
  }

  // Word-index positions of every quantity mentioned, with any multiplier
  // prefix folded straight into the value.
  function extractQuantities(words) {
    const found = [];
    for (let i = 0; i < words.length; i++) {
      const bare = words[i].replace(/[.,!?;:]+$/, "");
      const lower = bare.toLowerCase();
      let value = null;
      if (/^-?[0-9]+(\.[0-9]+)?$/.test(bare)) value = parseFloat(bare);
      else if (Object.prototype.hasOwnProperty.call(WORD_NUMS, lower)) value = WORD_NUMS[lower];
      if (value === null) continue;
      let note = null;
      const prefix = multiplierPrefixFor(words, i);
      if (prefix) {
        const factor = MULT_PREFIX[prefix];
        note = `${prefix} ${fmtNum(value)} is ${fmtNum(value * factor)}`;
        value = value * factor;
      }
      found.push({ idx: i, value, note });
    }
    return found;
  }

  function solveWordProblem(raw) {
    const words = raw.split(/\s+/).filter(Boolean);
    const quantities = extractQuantities(words);
    if (quantities.length === 0) {
      throw new SolveError("couldn't find any numbers in that problem for the bees to carry");
    }
    if (quantities.length === 1) {
      throw new SolveError("only found one amount — give the swarm a full problem with at least two to combine");
    }

    const parts = [quantities[0].value < 0 ? `(${fmtNum(quantities[0].value)})` : fmtNum(quantities[0].value)];
    for (let i = 1; i < quantities.length; i++) {
      const rawGap = words.slice(quantities[i - 1].idx + 1, quantities[i].idx);
      // Only search the CURRENT clause: a keyword trailing the previous
      // number ("2 were eaten, and 6 more...") belongs to that number's own
      // pair (handled by the post-window below), not to this one, so drop
      // everything up through the last clause boundary before this gap.
      let clauseStart = 0;
      for (let k = 0; k < rawGap.length; k++) {
        if (/[.,;!?]$/.test(rawGap[k])) clauseStart = k + 1;
      }
      const gapWords = rawGap.slice(clauseStart).map(bareLower);
      // The operation word usually sits before this quantity ("gave away
      // 3"), but plenty of phrasing puts it right after instead ("5 flew
      // away"). Only look past the number if the gap itself had no signal —
      // and stop at the next clause boundary (or the next quantity) so that
      // window can't bleed into the following pair's own operator.
      let op = findOpKeyword(gapWords);
      if (!op) {
        const nextIdx = i + 1 < quantities.length ? quantities[i + 1].idx : words.length;
        const windowEnd = Math.min(nextIdx, quantities[i].idx + 7);
        const postWords = [];
        for (let k = quantities[i].idx + 1; k < windowEnd; k++) {
          postWords.push(bareLower(words[k]));
          if (/[.,;!?]$/.test(words[k])) break;
        }
        op = findOpKeyword(postWords);
      }
      op = op || "+"; // still nothing — word problems mostly accumulate
      parts.push(op);
      const v = quantities[i].value;
      parts.push(v < 0 ? `(${fmtNum(v)})` : fmtNum(v));
    }
    const expr = parts.join(" ");

    const arith = solveArithmetic(expr);
    const readLabel = raw.length > 70 ? raw.slice(0, 70) + "…" : raw;
    arith.steps.unshift({ expr: readLabel, note: "the reader bee scans the problem" });
    arith.steps[1] = { expr: arith.steps[1].expr, note: `reading gives: ${arith.steps[1].expr}` };
    return { steps: arith.steps, answer: arith.answer, expr: arith.steps[1].expr };
  }

  function solve(input) {
    const raw = String(input || "").trim();
    if (!raw) throw new SolveError("type something for the bees to work on");
    const eqParts = raw.split("=");
    if (eqParts.length === 2) {
      return { mode: "equation", ...solveLinearEquation(eqParts[0], eqParts[1]) };
    }
    if (eqParts.length > 2) throw new SolveError("only one \"=\" is supported");
    if (/[a-wyzA-WYZ]/.test(raw)) {
      return { mode: "word", ...solveWordProblem(raw) };
    }
    if (/x/i.test(raw)) throw new SolveError('found an "x" but no "="  — is this meant to be an equation?');
    return { mode: "arithmetic", ...solveArithmetic(raw) };
  }

  return { solve, SolveError };
})();

if (typeof module !== "undefined" && module.exports) module.exports = MathHive;
