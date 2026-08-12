// mathhive's math engine: turns "3 + 4 * 2" or "2x + 3 = 11" into an ordered
// list of steps, one per bee. Plain script (no bundler) so it loads with a
// <script src> tag; also require()-able from node for a quick correctness
// check (see test.mjs) via the module.exports guard at the bottom.
//
// Two modes:
//  - arithmetic: no "=", reduces one operator at a time following PEMDAS
//    (innermost parens first, then ^, then * /, then + -, left to right).
//  - linear equation: one "=", both sides restricted to sums of plain numbers
//    and "x" terms (no parens, no x^2) — solved by combining like terms, then
//    moving x-terms and constants across the "=", then dividing.

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

  function solve(input) {
    const raw = String(input || "").trim();
    if (!raw) throw new SolveError("type something for the bees to work on");
    const eqParts = raw.split("=");
    if (eqParts.length === 2) {
      return { mode: "equation", ...solveLinearEquation(eqParts[0], eqParts[1]) };
    }
    if (eqParts.length > 2) throw new SolveError("only one \"=\" is supported");
    if (/x/i.test(raw)) throw new SolveError('found an "x" but no "="  — is this meant to be an equation?');
    return { mode: "arithmetic", ...solveArithmetic(raw) };
  }

  return { solve, SolveError };
})();

if (typeof module !== "undefined" && module.exports) module.exports = MathHive;
