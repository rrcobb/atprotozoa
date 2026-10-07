// lean.js — a little Lean 4: a lexer, parser and evaluator for the computable
// corner of the language. Pure ES module, no DOM, so it runs in the browser and
// under `node --test`.
//
// What it is: an interpreter. `#eval` runs terms; `theorem`/`example` are
// checked by *evaluating the statement* (what `decide` does) — closed
// statements are decided exactly, statements with free Nat/Int/Bool variables
// are tested on samples and labelled "tested", never "proved". There is no
// kernel, no elaborator, no universe levels, no tactic framework.
//
// Supported: def (incl. recursion, pattern-matching alternatives), inductive,
// namespace/open, #eval, #check, theorem/example/lemma, match, fun, if, let,
// lists/tuples/Option/String/Char/Nat/Int, ∀/∃ over bounded domains.

// ───────── errors & budget ─────────
export class LeanError extends Error {
  constructor(msg, tok) { super(msg); this.tok = tok; }
}
class Unknown extends Error {} // statement can't be decided by this interpreter

// Deterministic step budget (Lean's maxHeartbeats, roughly): keeps a runaway
// loop from freezing the tab. 40M evaluation steps is on the order of ten seconds of
// JS on a laptop; the number is a wall-clock decision, not a data limit.
const FUEL = 40_000_000;
const S = { fuel: FUEL, intMode: false };
// Sample width for ∀ over an unbounded Nat/Int. Quantifying over all of ℕ is
// undecidable here; 40 is small enough that a nested ∀ a b c stays inside the
// step budget (40^3 = 64k evaluations) and large enough to catch off-by-one
// laws. Results over samples are always labelled "tested".
const SAMPLE = 40;

// ───────── values ─────────
class Ctor { constructor(c, args = []) { this.c = c; this.args = args; } }
class Tup { constructor(items) { this.items = items; } }
class Char { constructor(c) { this.c = c; } }
class IO { constructor(run) { this.run = run; } }
const UNIT = new Ctor("Unit.unit");
class Fn {
  // slots: argument holes (undefined = not yet supplied); recv: slot index a
  // `x.method` call fills with x.
  constructor(name, arity, impl, recv = 0, slots) {
    this.name = name; this.arity = arity; this.impl = impl; this.recv = recv;
    this.slots = slots || new Array(arity).fill(undefined);
  }
  fill(v, idx) {
    const slots = this.slots.slice();
    if (idx === undefined) idx = slots.findIndex((x) => x === undefined);
    slots[idx] = v;
    return new Fn(this.name, this.arity, this.impl, this.recv, slots);
  }
  full() { return this.slots.every((x) => x !== undefined); }
}

const NONE = new Ctor("none");
const some = (v) => new Ctor("some", [v]);

function apply(f, args) {
  for (let i = 0; i < args.length; i++) {
    if (!(f instanceof Fn)) throw new LeanError("function expected, got " + show(f));
    if (--S.fuel < 0) throw new LeanError("(deterministic) timeout: evaluation budget exhausted");
    f = f.fill(args[i]);
    if (f.full()) f = f.impl(...f.slots);
  }
  return f;
}
const callMethod = (f, recvVal) => {
  const g = f.fill(recvVal, f.recv);
  return g.full() ? g.impl(...g.slots) : g;
};

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (a instanceof Tup) return b instanceof Tup && a.items.length === b.items.length && a.items.every((x, i) => deepEq(x, b.items[i]));
  if (a instanceof Ctor) return b instanceof Ctor && a.c === b.c && a.args.length === b.args.length && a.args.every((x, i) => deepEq(x, b.args[i]));
  if (a instanceof Char) return b instanceof Char && a.c === b.c;
  return false;
}
function cmp(a, b) {
  if (a instanceof Char) a = a.c;
  if (b instanceof Char) b = b.c;
  if (typeof a === "boolean") a = a ? 1 : 0;
  if (typeof b === "boolean") b = b ? 1 : 0;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  throw new LeanError("can't compare " + show(a) + " with " + show(b));
}

// ───────── printing ─────────
const strLit = (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
export function show(v, nested = false) {
  if (typeof v === "bigint") return nested && v < 0n ? `(${v})` : String(v);
  if (typeof v === "string") return strLit(v);
  if (typeof v === "boolean") return String(v);
  if (v instanceof Char) return "'" + v.c + "'";
  if (Array.isArray(v)) return "[" + v.map((x) => show(x)).join(", ") + "]";
  if (v instanceof Tup) return "(" + v.items.map((x) => show(x)).join(", ") + ")";
  if (v === UNIT) return "()";
  if (v instanceof Ctor) {
    if (!v.args.length) return v.c;
    const s = v.c + " " + v.args.map((x) => show(x, true)).join(" ");
    return nested ? `(${s})` : s;
  }
  if (v instanceof Fn) return "<function>";
  if (v instanceof IO) return "<IO action>";
  return String(v);
}
const toStr = (v) => (typeof v === "string" ? v : v instanceof Char ? v.c : show(v));

export function typeOfValue(v) {
  if (typeof v === "bigint") return "Nat";
  if (typeof v === "string") return "String";
  if (typeof v === "boolean") return "Bool";
  if (v instanceof Char) return "Char";
  if (Array.isArray(v)) return "List " + (v.length ? paren(typeOfValue(v[0])) : "?");
  if (v instanceof Tup) return v.items.map(typeOfValue).join(" × ");
  if (v === UNIT) return "Unit";
  if (v instanceof Ctor) {
    if (v.c === "some") return "Option " + paren(typeOfValue(v.args[0]));
    if (v.c === "none") return "Option ?";
    return v.c.split(".").slice(0, -1).join(".") || v.c;
  }
  if (v instanceof Fn) return "function";
  if (v instanceof IO) return "IO Unit";
  return "?";
}
const paren = (t) => (/[ ×→]/.test(t) ? `(${t})` : t);

// ───────── lexer ─────────
const OPS = [
  ":=", "=>", "->", "→", "←", "<|", "|>", "<$>", "++", "::", "==", "!=", "≠", "<=", ">=", "≤", "≥", "&&", "||",
  "∧", "∨", "¬", "↔", "<->", "∀", "∃", "∈", "∉", "×", "∘", "⟨", "⟩", "λ", "↦", "·", "$", "+", "-", "*", "/", "%", "^",
  "<", ">", "=", "(", ")", "[", "]", "{", "}", ",", ";", ":", ".", "|", "!", "?", "@", "∣",
];
const IDSTART = /[\p{L}_]/u;
const IDREST = /[\p{L}\p{N}_'!?₀-₉]/u;
const isIdStart = (c) => c !== undefined && IDSTART.test(c) && c !== "λ" && c !== "∀" && c !== "∃" && c !== "Π" && c !== "Σ" && c !== "×";

export function lex(src) {
  const toks = [];
  let i = 0, line = 1, lineStart = 0, nl = false, ws = true;
  const n = src.length;
  const push = (t, v, s, extra) => {
    toks.push({ t, v, s, e: i, line, col: s - lineStart, nl, ws, ...extra });
    nl = false; ws = false;
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n") { i++; line++; lineStart = i; nl = true; ws = true; continue; }
    if (/\s/.test(c)) { i++; ws = true; continue; }
    if (c === "-" && src[i + 1] === "-") { while (i < n && src[i] !== "\n") i++; ws = true; continue; }
    if (c === "/" && src[i + 1] === "-") {
      let depth = 1; i += 2;
      while (i < n && depth) {
        if (src[i] === "/" && src[i + 1] === "-") { depth++; i += 2; }
        else if (src[i] === "-" && src[i + 1] === "/") { depth--; i += 2; }
        else { if (src[i] === "\n") { line++; lineStart = i + 1; } i++; }
      }
      ws = true; continue;
    }
    const s = i;
    if (c === '"') {
      i++; let out = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          i++;
          const m = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" }[src[i]];
          out += m !== undefined ? m : src[i];
        } else {
          if (src[i] === "\n") { line++; lineStart = i + 1; }
          out += src[i];
        }
        i++;
      }
      if (src[i] !== '"') throw new LeanError("unterminated string literal", { line, col: s - lineStart });
      i++; push("str", out, s); continue;
    }
    if (c === "'" ) {
      const m = /^'(\\.|[^\\'])'/u.exec(src.slice(i, i + 5));
      if (m) { i += m[0].length; const ch = m[1].startsWith("\\") ? ({ n: "\n", t: "\t" }[m[1][1]] ?? m[1][1]) : m[1]; push("chr", ch, s); continue; }
    }
    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9_]/.test(src[i])) i++;
      push("num", BigInt(src.slice(s, i).replace(/_/g, "")), s); continue;
    }
    if (c === "#" && /[a-z]/.test(src[i + 1] || "")) {
      i++; while (i < n && /[a-z_]/.test(src[i])) i++;
      push("id", src.slice(s, i), s); continue;
    }
    // `.1` / `.name` right after a closing bracket or literal is a projection.
    if (c === "." && !ws && toks.length) {
      const p = toks[toks.length - 1];
      const closes = p.t === "str" || (p.t === "op" && [")", "]", "⟩"].includes(p.v));
      if (closes || p.t === "proj" || p.t === "fld") {
        if (/[0-9]/.test(src[i + 1] || "")) {
          i++; const d = i; while (/[0-9]/.test(src[i] || "")) i++;
          push("proj", src.slice(d, i), s); continue;
        }
        if (isIdStart(src[i + 1])) {
          i++; const d = i; while (i < n && IDREST.test(src[i])) i++;
          push("fld", src.slice(d, i), s); continue;
        }
      }
    }
    if (isIdStart(c)) {
      i++;
      for (;;) {
        while (i < n && IDREST.test(src[i]) && !(src[i] === "!" && src[i + 1] === "=")) i++;
        if (src[i] === "." && isIdStart(src[i + 1])) { i++; continue; }
        if (src[i] === "." && /[0-9]/.test(src[i + 1] || "")) { // xs.1
          break;
        }
        break;
      }
      push("id", src.slice(s, i), s);
      // `p.1` — projection on a plain identifier
      while (src[i] === "." && /[0-9]/.test(src[i + 1] || "")) {
        const ps = i; i++; const d = i; while (/[0-9]/.test(src[i] || "")) i++;
        push("proj", src.slice(d, i), ps);
      }
      continue;
    }
    const op = OPS.filter((o) => src.startsWith(o, i)).sort((a, b) => b.length - a.length)[0];
    if (op) { i += op.length; push("op", op, s); continue; }
    throw new LeanError(`unexpected character '${c}'`, { line, col: s - lineStart });
  }
  toks.push({ t: "eof", v: "<eof>", s: n, e: n, line, col: 0, nl: true, ws: true });
  return toks;
}

// ───────── parser ─────────
const KW = new Set(["fun", "if", "then", "else", "match", "with", "let", "have", "show", "from", "by", "do", "where", "in", "at", "deriving", "termination_by", "decreasing_by"]);
const BIN = {
  "<|": [10, "r"], "$": [10, "r"], "|>": [10, "l"],
  "↔": [20, "n"], "<->": [20, "n"], "→": [25, "r"], "->": [25, "r"],
  "∨": [30, "r"], "||": [30, "r"], "∧": [35, "r"], "&&": [35, "r"],
  "=": [50, "n"], "≠": [50, "n"], "==": [50, "n"], "!=": [50, "n"], "<": [50, "n"], ">": [50, "n"], "<=": [50, "n"], ">=": [50, "n"],
  "≤": [50, "n"], "≥": [50, "n"], "∈": [50, "n"], "∉": [50, "n"], "∣": [50, "n"],
  "++": [65, "r"], "+": [65, "l"], "-": [65, "l"], "::": [67, "r"],
  "*": [70, "l"], "/": [70, "l"], "%": [70, "l"], "×": [35, "r"], "^": [75, "r"], "∘": [90, "r"],
};
const PROP_OPS = new Set(["=", "≠", "==", "!=", "<", ">", "<=", ">=", "≤", "≥", "∈", "∉", "∧", "∨", "↔", "<->", "∣", "&&", "||"]);

class Parser {
  constructor(toks, src) { this.toks = toks; this.p = 0; this.src = src; this.minCol = -1; }
  get tok() { return this.toks[this.p]; }
  peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  isOp(v, t = this.tok) { return t.t === "op" && t.v === v; }
  isId(v, t = this.tok) { return t.t === "id" && t.v === v; }
  err(msg, t = this.tok) { throw new LeanError(msg, t); }
  expectOp(v) { if (!this.isOp(v)) this.err(`expected '${v}' but found '${this.tok.v === "<eof>" ? "end of input" : String(this.tok.v)}'`); return this.next(); }
  eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  atEnd() { return this.tok.t === "eof"; }

  // an application argument may start here?
  startsAtom(t = this.tok) {
    if (t.nl && t.col <= this.minCol) return false;
    switch (t.t) {
      case "num": case "str": case "chr": return true;
      case "id": return !KW.has(t.v) || t.v === "fun";
      case "op": return ["(", "[", "⟨", "·"].includes(t.v) || (t.v === "." && !this.peek().ws && this.peek().t === "id");
      default: return false;
    }
  }

  parseExpr(minPrec = 0) {
    let left = this.parsePrefix();
    for (;;) {
      const t = this.tok;
      if (t.t !== "op" || !(t.v in BIN)) break;
      if (t.nl && t.col <= this.minCol) break;
      const [prec, assoc] = BIN[t.v];
      if (prec < minPrec) break;
      this.next();
      const right = this.parseExpr(assoc === "r" ? prec : prec + 1);
      left = { k: "bin", op: t.v, l: left, r: right, tok: t };
    }
    return left;
  }

  parsePrefix() {
    const t = this.tok;
    if (t.t === "id") {
      switch (t.v) {
        case "fun": return this.parseFun();
        case "if": return this.parseIf();
        case "match": return this.parseMatch();
        case "let": case "have": return this.parseLet();
        case "show": { this.next(); const ty = this.parseExpr(0); if (this.isId("from")) { this.next(); return this.parseExpr(0); } if (this.isId("by")) return this.parseBy(); return ty; }
        case "by": return this.parseBy();
        case "do": this.err("`do` blocks are not supported by this little Lean");
      }
    }
    if (t.t === "op") {
      if (t.v === "λ") return this.parseFun();
      if (t.v === "∀" || t.v === "∃") return this.parseQuant();
      if (t.v === "¬") { this.next(); return { k: "un", op: "¬", e: this.parseExpr(40), tok: t }; }
      if (t.v === "!") { this.next(); return { k: "un", op: "¬", e: this.parseExpr(40), tok: t }; }
      if (t.v === "-") { this.next(); return { k: "un", op: "neg", e: this.parseExpr(75), tok: t }; }
    }
    return this.parseApp();
  }

  parseApp() {
    const head = this.parsePostfix(this.parseAtom());
    const args = [];
    while (this.startsAtom()) {
      if (this.isId("fun")) { args.push(this.parseFun()); break; }
      args.push(this.parsePostfix(this.parseAtom()));
    }
    return args.length ? { k: "app", f: head, args, tok: head.tok } : head;
  }

  parsePostfix(e) {
    for (;;) {
      const t = this.tok;
      if (t.t === "proj") { this.next(); e = { k: "proj", e, field: t.v, tok: t }; }
      else if (t.t === "fld") { this.next(); e = { k: "proj", e, field: t.v, tok: t }; }
      else if (this.isOp("[") && !t.ws) {
        this.next(); const ix = this.parseExpr(0); this.expectOp("]");
        let mode = "";
        if (this.isOp("!") && !this.tok.ws) { this.next(); mode = "!"; }
        else if (this.isOp("?") && !this.tok.ws) { this.next(); mode = "?"; }
        e = { k: "idx", e, i: ix, mode, tok: t };
      } else break;
    }
    return e;
  }

  parseAtom() {
    const t = this.tok;
    switch (t.t) {
      case "num": this.next(); return { k: "num", v: t.v, tok: t };
      case "str": this.next(); return { k: "str", v: t.v, tok: t };
      case "chr": this.next(); return { k: "chr", v: t.v, tok: t };
      case "id":
        if (t.v === "fun") return this.parseFun();
        if (t.v === "by") return this.parseBy();
        if (KW.has(t.v)) this.err(`unexpected token '${t.v}'; expected term`);
        this.next();
        // `xs[i]?` lexes as `xs[i]` then an identifier-less `?`; handled in postfix
        return { k: "var", name: t.v, tok: t };
      case "op":
        switch (t.v) {
          case "(": return this.parseParen();
          case "[": {
            this.next(); const items = [];
            if (!this.isOp("]")) { do { items.push(this.parseExpr(0)); } while (this.eatOp(",")); }
            this.expectOp("]"); return { k: "list", items, tok: t };
          }
          case "⟨": {
            this.next(); const items = [];
            if (!this.isOp("⟩")) { do { items.push(this.parseExpr(0)); } while (this.eatOp(",")); }
            this.expectOp("⟩"); return items.length === 1 ? items[0] : { k: "tup", items, tok: t };
          }
          case "·": this.next(); return { k: "cdot", tok: t };
          case ".": { this.next(); const id = this.next(); return { k: "var", name: id.v, dot: true, tok: id }; }
        }
    }
    this.err(t.t === "eof" ? "unexpected end of input; expected term" : `unexpected token '${t.v}'; expected term`);
  }

  parseParen() {
    const open = this.next();
    if (this.eatOp(")")) return { k: "unit", tok: open };
    const saveCol = this.minCol; this.minCol = -1;
    const first = this.parseExpr(0);
    let res;
    if (this.isOp(":")) { // type ascription (e : T)
      this.next(); this.parseExpr(0); res = first;
    } else if (this.isOp(",")) {
      const items = [first];
      while (this.eatOp(",")) items.push(this.parseExpr(0));
      res = { k: "tup", items, tok: open };
    } else res = first;
    this.expectOp(")");
    this.minCol = saveCol;
    // (· + 1) sugar
    let count = 0;
    const subst = (n) => {
      if (!n || typeof n !== "object") return n;
      if (n.k === "cdot") return { k: "var", name: "_cdot" + count++, tok: n.tok };
      for (const key of Object.keys(n)) {
        if (key === "tok") continue;
        const v = n[key];
        if (Array.isArray(v)) n[key] = v.map(subst);
        else if (v && typeof v === "object" && v.k) n[key] = subst(v);
        else if (v && typeof v === "object") for (const k2 of Object.keys(v)) if (v[k2] && v[k2].k) v[k2] = subst(v[k2]);
      }
      return n;
    };
    res = subst(res);
    if (count) {
      const params = Array.from({ length: count }, (_, i) => ({ k: "var", name: "_cdot" + i, tok: open }));
      return { k: "lam", params, body: res, tok: open };
    }
    return res;
  }

  parseFun() {
    const t = this.next(); // fun / λ
    if (this.isOp("|")) { // fun | p => e | q => f
      const alts = this.parseAlts();
      const n = alts[0].pats.length;
      return { k: "lam", params: Array.from({ length: n }, (_, i) => ({ k: "var", name: `_a${i}`, tok: t })), body: { k: "match", scruts: Array.from({ length: n }, (_, i) => ({ k: "var", name: `_a${i}`, tok: t })), alts, tok: t }, tok: t };
    }
    const params = [];
    while (!(this.isOp("=>") || this.isOp("↦"))) {
      if (this.atEnd()) this.err("expected '=>'");
      if (this.isOp("(") && this.peek().t === "id" && this.isOp(":", this.peek(2))) { // fun (x : T) => ...
        this.next(); const names = [];
        while (!this.isOp(":")) names.push(this.next());
        this.next(); this.parseExpr(0); this.expectOp(")");
        for (const nm of names) params.push({ k: "var", name: nm.v, tok: nm });
      } else params.push(this.parsePostfix(this.parseAtom()));
    }
    this.next();
    const body = this.parseExpr(0);
    return { k: "lam", params, body, tok: t };
  }

  parseIf() {
    const t = this.next();
    if (this.tok.t === "id" && this.isOp(":", this.peek())) { this.next(); this.next(); } // if h : c
    const c = this.parseExpr(0);
    if (!this.isId("then")) this.err("expected 'then'");
    this.next();
    const a = this.parseExpr(0);
    if (!this.isId("else")) this.err("expected 'else'");
    this.next();
    const b = this.parseExpr(0);
    return { k: "if", c, a, b, tok: t };
  }

  parseAlts() {
    const alts = [];
    while (this.isOp("|")) {
      this.next();
      const pats = [this.parseExpr(1)];
      while (this.eatOp(",")) pats.push(this.parseExpr(1));
      this.expectOp("=>");
      alts.push({ pats, body: this.parseExpr(0) });
    }
    return alts;
  }

  parseMatch() {
    const t = this.next();
    const scruts = [this.parseExpr(0)];
    while (this.eatOp(",")) scruts.push(this.parseExpr(0));
    if (!this.isId("with")) this.err("expected 'with'");
    this.next();
    const alts = this.parseAlts();
    if (!alts.length) this.err("match needs at least one alternative");
    return { k: "match", scruts, alts, tok: t };
  }

  parseLet() {
    const t = this.next();
    const col = t.col;
    let pat;
    if (this.tok.t === "id" && !this.isOp(":=", this.peek()) && !this.isOp(":", this.peek()) && this.peek().t !== "op") {
      // let f x y := ...  (function definition)
      const name = this.next(); const params = [];
      while (!this.isOp(":=") && !this.isOp(":")) params.push(this.parsePostfix(this.parseAtom()));
      if (this.eatOp(":")) this.parseExpr(0);
      this.expectOp(":=");
      const saved = this.minCol; this.minCol = col;
      const val = this.parseExpr(0); this.minCol = saved;
      this.eatOp(";");
      const body = this.parseExpr(0);
      return { k: "let", pat: { k: "var", name: name.v, tok: name }, val: { k: "lam", params, body: val, tok: name }, body, tok: t };
    }
    if (this.isOp(":") ) pat = null;
    pat = this.parsePostfix(this.parseAtom());
    if (this.eatOp(":")) this.parseExpr(0);
    this.expectOp(":=");
    const saved = this.minCol; this.minCol = col;
    const val = this.parseExpr(0);
    this.minCol = saved;
    this.eatOp(";");
    if (t.v === "have") { // `have h : P := proof` — proofs carry no data here
      return this.parseExpr(0);
    }
    const body = this.parseExpr(0);
    return { k: "let", pat, val, body, tok: t };
  }

  parseQuant() {
    const t = this.next();
    const binders = [];
    // ∀ x y, ... | ∀ x ∈ xs, ... | ∀ x < n, ... | ∀ (x : T) (y : U), ... | ∀ x : T, ...
    const readNames = () => { const ns = []; while (this.tok.t === "id" && !KW.has(this.tok.v)) ns.push(this.next()); return ns; };
    for (;;) {
      if (this.isOp("(")) {
        this.next(); const ns = readNames();
        this.expectOp(":"); const ty = this.parseExpr(0); this.expectOp(")");
        for (const n of ns) binders.push({ name: n.v, dom: { kind: "type", ty } });
        continue;
      }
      const ns = readNames();
      if (!ns.length) break;
      if (this.isOp(":")) { this.next(); const ty = this.parseExpr(0); for (const n of ns) binders.push({ name: n.v, dom: { kind: "type", ty } }); break; }
      if (this.isOp("∈")) { this.next(); const xs = this.parseExpr(51); for (const n of ns) binders.push({ name: n.v, dom: { kind: "in", xs } }); break; }
      if (this.isOp("<") || this.isOp("≤")) { const op = this.next().v; const hi = this.parseExpr(51); for (const n of ns) binders.push({ name: n.v, dom: { kind: "lt", hi, incl: op === "≤" } }); break; }
      for (const n of ns) binders.push({ name: n.v, dom: { kind: "any" } });
      break;
    }
    this.expectOp(",");
    const body = this.parseExpr(0);
    return { k: "quant", q: t.v, binders, body, tok: t };
  }

  parseBy() {
    const t = this.next();
    const toks = [];
    let depth = 0;
    while (!this.atEnd()) {
      const x = this.tok;
      if (x.t === "op" && ["(", "[", "⟨", "{"].includes(x.v)) depth++;
      if (x.t === "op" && [")", "]", "⟩", "}"].includes(x.v)) { if (depth === 0) break; depth--; }
      if (depth === 0 && x.t === "op" && x.v === ",") break;
      toks.push(this.next());
    }
    return { k: "by", toks, tok: t };
  }
}

// ───────── interpreter ─────────
const BUILTINS = new Map();
const B = (name, arity, recv, impl) => BUILTINS.set(name, new Fn(name, arity, impl, recv));
const nat = (v) => { if (typeof v !== "bigint") throw new LeanError("expected a number, got " + show(v)); return v; };
const list = (v) => { if (!Array.isArray(v)) throw new LeanError("expected a list, got " + show(v)); return v; };
const str = (v) => { if (typeof v !== "string") throw new LeanError("expected a string, got " + show(v)); return v; };
const truthy = (v) => { if (typeof v !== "boolean") throw new LeanError("expected a Bool/Prop, got " + show(v)); return v; };
const A1 = (f, x) => apply(f, [x]);
const bi = (n) => BigInt(n);
const ix = (v) => Number(nat(v));

function floorDiv(a, b) { if (b === 0n) return 0n; let q = a / b; if (a % b !== 0n && (a < 0n) !== (b < 0n)) q -= 1n; return q; }
function floorMod(a, b) { if (b === 0n) return a; let r = a % b; if (r !== 0n && (r < 0n) !== (b < 0n)) r += b; return r; }
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

for (const ns of ["Nat", "Int"]) {
  B(ns + ".succ", 1, 0, (n) => n + 1n);
  B(ns + ".pred", 1, 0, (n) => (n > 0n ? n - 1n : 0n));
  B(ns + ".min", 2, 0, (a, b) => (cmp(a, b) <= 0 ? a : b));
  B(ns + ".max", 2, 0, (a, b) => (cmp(a, b) >= 0 ? a : b));
  B(ns + ".gcd", 2, 0, (a, b) => gcd(a, b));
  B(ns + ".lcm", 2, 0, (a, b) => (a === 0n || b === 0n ? 0n : (a * b < 0n ? -(a * b) : a * b) / gcd(a, b)));
  B(ns + ".toString", 1, 0, (n) => String(n));
  B(ns + ".repr", 1, 0, (n) => String(n));
  B(ns + ".isPowerOfTwo", 1, 0, (n) => n > 0n && (n & (n - 1n)) === 0n);
  B(ns + ".sqrt", 1, 0, (n) => { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; });
  B(ns + ".pow", 2, 0, (a, b) => pow(a, b));
  B(ns + ".beq", 2, 0, (a, b) => a === b);
  B(ns + ".ble", 2, 0, (a, b) => a <= b);
  B(ns + ".blt", 2, 0, (a, b) => a < b);
  B(ns + ".toDigits", 2, 1, (b, n) => String(n).split("").map((d) => new Char(d)));
}
B("Nat.zero", 0, 0, () => 0n);
B("Nat.even", 1, 0, (n) => n % 2n === 0n);
B("Int.natAbs", 1, 0, (n) => (n < 0n ? -n : n));
B("Int.toNat", 1, 0, (n) => (n < 0n ? 0n : n));
B("Int.neg", 1, 0, (n) => -n);
B("Nat.fold", 3, 1, (n, f, init) => { let a = init; for (let i = 0n; i < n; i++) a = apply(f, [i, a]); return a; });
B("Nat.repeat", 3, 1, (n, f, a) => { for (let i = 0n; i < n; i++) a = A1(f, a); return a; });
B("Nat.all", 2, 0, (n, f) => { for (let i = 0n; i < n; i++) if (!truthy(A1(f, i))) return false; return true; });
B("Nat.any", 2, 0, (n, f) => { for (let i = 0n; i < n; i++) if (truthy(A1(f, i))) return true; return false; });
B("max", 2, 0, (a, b) => (cmp(a, b) >= 0 ? a : b));
B("min", 2, 0, (a, b) => (cmp(a, b) <= 0 ? a : b));
B("id", 1, 0, (x) => x);
B("decide", 1, 0, (x) => truthy(x));
B("not", 1, 0, (x) => !truthy(x));
B("Bool.not", 1, 0, (x) => !truthy(x));
B("and", 2, 0, (a, b) => truthy(a) && truthy(b));
B("or", 2, 0, (a, b) => truthy(a) || truthy(b));
B("Bool.and", 2, 0, (a, b) => truthy(a) && truthy(b));
B("Bool.or", 2, 0, (a, b) => truthy(a) || truthy(b));
B("Bool.toNat", 1, 0, (b) => (b ? 1n : 0n));
B("toString", 1, 0, (v) => toStr(v));
B("repr", 1, 0, (v) => show(v));
B("dbgTraceIfShared", 2, 1, (_, x) => x);
B("Function.comp", 3, 0, (f, g, x) => A1(f, A1(g, x)));
B("Function.const", 2, 0, (a, _) => a);
B("flip", 3, 0, (f, a, b) => apply(f, [b, a]));
B("Prod.fst", 1, 0, (t) => t.items[0]);
B("Prod.snd", 1, 0, (t) => t.items[1]);
B("Prod.swap", 1, 0, (t) => new Tup([t.items[1], t.items[0]]));
B("Prod.map", 3, 2, (f, g, t) => new Tup([A1(f, t.items[0]), A1(g, t.items[1])]));
B("some", 1, 0, (x) => some(x));
B("Option.some", 1, 0, (x) => some(x));
B("Option.map", 2, 1, (f, o) => (o.c === "some" ? some(A1(f, o.args[0])) : NONE));
B("Option.bind", 2, 0, (o, f) => (o.c === "some" ? A1(f, o.args[0]) : NONE));
B("Option.getD", 2, 0, (o, d) => (o.c === "some" ? o.args[0] : d));
B("Option.get!", 1, 0, (o) => { if (o.c !== "some") throw new LeanError("PANIC: value is none"); return o.args[0]; });
B("Option.isSome", 1, 0, (o) => o.c === "some");
B("Option.isNone", 1, 0, (o) => o.c === "none");
B("Option.filter", 2, 1, (p, o) => (o.c === "some" && truthy(A1(p, o.args[0])) ? o : NONE));
B("Option.toList", 1, 0, (o) => (o.c === "some" ? [o.args[0]] : []));

// Char
B("Char.isDigit", 1, 0, (c) => /[0-9]/.test(c.c));
B("Char.isAlpha", 1, 0, (c) => /\p{L}/u.test(c.c));
B("Char.isAlphanum", 1, 0, (c) => /[\p{L}0-9]/u.test(c.c));
B("Char.isUpper", 1, 0, (c) => /\p{Lu}/u.test(c.c));
B("Char.isLower", 1, 0, (c) => /\p{Ll}/u.test(c.c));
B("Char.isWhitespace", 1, 0, (c) => /\s/.test(c.c));
B("Char.toNat", 1, 0, (c) => bi(c.c.codePointAt(0)));
B("Char.ofNat", 1, 0, (n) => new Char(String.fromCodePoint(ix(n))));
B("Char.toUpper", 1, 0, (c) => new Char(c.c.toUpperCase()));
B("Char.toLower", 1, 0, (c) => new Char(c.c.toLowerCase()));
B("Char.toString", 1, 0, (c) => c.c);

// String
B("String.length", 1, 0, (s) => bi([...str(s)].length));
B("String.append", 2, 0, (a, b) => str(a) + str(b));
B("String.push", 2, 0, (s, c) => s + c.c);
B("String.toUpper", 1, 0, (s) => s.toUpperCase());
B("String.toLower", 1, 0, (s) => s.toLowerCase());
B("String.capitalize", 1, 0, (s) => s.charAt(0).toUpperCase() + s.slice(1));
B("String.trim", 1, 0, (s) => s.trim());
B("String.isEmpty", 1, 0, (s) => s.length === 0);
B("String.toList", 1, 0, (s) => [...str(s)].map((c) => new Char(c)));
B("String.data", 1, 0, (s) => [...str(s)].map((c) => new Char(c)));
B("String.mk", 1, 0, (cs) => list(cs).map((c) => c.c).join(""));
B("String.join", 1, 0, (xs) => list(xs).map(str).join(""));
B("String.intercalate", 2, 0, (sep, xs) => list(xs).map(str).join(sep));
B("String.splitOn", 2, 0, (s, sep) => (sep === "" ? [s] : s.split(sep)));
B("String.startsWith", 2, 0, (s, p) => s.startsWith(p));
B("String.endsWith", 2, 0, (s, p) => s.endsWith(p));
B("String.contains", 2, 0, (s, c) => s.includes(c.c));
B("String.replace", 3, 0, (s, a, b) => (a === "" ? s : s.split(a).join(b)));
B("String.take", 2, 0, (s, n) => [...s].slice(0, ix(n)).join(""));
B("String.drop", 2, 0, (s, n) => [...s].slice(ix(n)).join(""));
B("String.toNat?", 1, 0, (s) => (/^[0-9]+$/.test(s) ? some(BigInt(s)) : NONE));
B("String.toNat!", 1, 0, (s) => { if (!/^[0-9]+$/.test(s)) throw new LeanError("PANIC: not a number"); return BigInt(s); });
B("String.singleton", 1, 0, (c) => c.c);
B("String.any", 2, 0, (s, p) => [...s].some((c) => truthy(A1(p, new Char(c)))));
B("String.all", 2, 0, (s, p) => [...s].every((c) => truthy(A1(p, new Char(c)))));
B("String.map", 2, 1, (f, s) => [...s].map((c) => A1(f, new Char(c)).c).join(""));
B("String.get", 2, 0, (s, i) => new Char([...s][ix(i)] ?? "A"));

// List
const L = (name, arity, recv, impl) => B("List." + name, arity, recv, impl);
L("length", 1, 0, (xs) => bi(list(xs).length));
L("map", 2, 1, (f, xs) => list(xs).map((x) => A1(f, x)));
L("filter", 2, 1, (p, xs) => list(xs).filter((x) => truthy(A1(p, x))));
L("filterMap", 2, 1, (f, xs) => { const out = []; for (const x of list(xs)) { const r = A1(f, x); if (r.c === "some") out.push(r.args[0]); } return out; });
L("foldl", 3, 2, (f, a, xs) => { for (const x of list(xs)) a = apply(f, [a, x]); return a; });
L("foldr", 3, 2, (f, a, xs) => { const ys = list(xs); for (let i = ys.length - 1; i >= 0; i--) a = apply(f, [ys[i], a]); return a; });
L("reverse", 1, 0, (xs) => list(xs).slice().reverse());
L("append", 2, 0, (a, b) => list(a).concat(list(b)));
L("contains", 2, 0, (xs, a) => list(xs).some((x) => deepEq(x, a)));
L("elem", 2, 1, (a, xs) => list(xs).some((x) => deepEq(x, a)));
L("any", 2, 0, (xs, p) => list(xs).some((x) => truthy(A1(p, x))));
L("all", 2, 0, (xs, p) => list(xs).every((x) => truthy(A1(p, x))));
L("sum", 1, 0, (xs) => list(xs).reduce((a, b) => a + b, 0n));
L("range", 1, 0, (n) => Array.from({ length: ix(n) }, (_, i) => bi(i)));
L("iota", 1, 0, (n) => Array.from({ length: ix(n) }, (_, i) => bi(ix(n) - i)));
L("replicate", 2, 1, (n, x) => Array.from({ length: ix(n) }, () => x));
L("zip", 2, 0, (a, b) => { const n = Math.min(a.length, b.length); return Array.from({ length: n }, (_, i) => new Tup([a[i], b[i]])); });
L("zipWith", 3, 1, (f, a, b) => { const n = Math.min(a.length, b.length); return Array.from({ length: n }, (_, i) => apply(f, [a[i], b[i]])); });
L("unzip", 1, 0, (ps) => new Tup([ps.map((p) => p.items[0]), ps.map((p) => p.items[1])]));
L("enum", 1, 0, (xs) => xs.map((x, i) => new Tup([bi(i), x])));
L("join", 1, 0, (xss) => [].concat(...xss));
L("flatten", 1, 0, (xss) => [].concat(...xss));
L("flatMap", 2, 0, (xs, f) => [].concat(...xs.map((x) => A1(f, x))));
L("bind", 2, 0, (xs, f) => [].concat(...xs.map((x) => A1(f, x))));
L("isEmpty", 1, 0, (xs) => list(xs).length === 0);
L("head!", 1, 0, (xs) => { if (!xs.length) throw new LeanError("PANIC: head of empty list"); return xs[0]; });
L("head?", 1, 0, (xs) => (xs.length ? some(xs[0]) : NONE));
L("headD", 2, 0, (xs, d) => (xs.length ? xs[0] : d));
L("tail", 1, 0, (xs) => list(xs).slice(1));
L("tail!", 1, 0, (xs) => list(xs).slice(1));
L("getLast?", 1, 0, (xs) => (xs.length ? some(xs[xs.length - 1]) : NONE));
L("getLast!", 1, 0, (xs) => { if (!xs.length) throw new LeanError("PANIC: empty list"); return xs[xs.length - 1]; });
L("get!", 2, 0, (xs, i) => { if (ix(i) >= xs.length) throw new LeanError("PANIC: index out of bounds"); return xs[ix(i)]; });
L("get?", 2, 0, (xs, i) => (ix(i) < xs.length ? some(xs[ix(i)]) : NONE));
L("getD", 3, 0, (xs, i, d) => (ix(i) < xs.length ? xs[ix(i)] : d));
L("take", 2, 0, (xs, n) => list(xs).slice(0, ix(n)));
L("drop", 2, 0, (xs, n) => list(xs).slice(ix(n)));
L("takeWhile", 2, 1, (p, xs) => { const out = []; for (const x of xs) { if (!truthy(A1(p, x))) break; out.push(x); } return out; });
L("dropWhile", 2, 1, (p, xs) => { let i = 0; while (i < xs.length && truthy(A1(p, xs[i]))) i++; return xs.slice(i); });
L("find?", 2, 1, (p, xs) => { for (const x of xs) if (truthy(A1(p, x))) return some(x); return NONE; });
L("partition", 2, 1, (p, xs) => { const a = [], b = []; for (const x of xs) (truthy(A1(p, x)) ? a : b).push(x); return new Tup([a, b]); });
L("eraseDups", 1, 0, (xs) => { const out = []; for (const x of xs) if (!out.some((y) => deepEq(x, y))) out.push(x); return out; });
L("erase", 2, 0, (xs, a) => { const i = xs.findIndex((x) => deepEq(x, a)); return i < 0 ? xs : xs.slice(0, i).concat(xs.slice(i + 1)); });
L("count", 2, 1, (a, xs) => bi(xs.filter((x) => deepEq(x, a)).length));
L("countP", 2, 1, (p, xs) => bi(xs.filter((x) => truthy(A1(p, x))).length));
L("maximum?", 1, 0, (xs) => (xs.length ? some(xs.reduce((a, b) => (cmp(b, a) > 0 ? b : a))) : NONE));
L("minimum?", 1, 0, (xs) => (xs.length ? some(xs.reduce((a, b) => (cmp(b, a) < 0 ? b : a))) : NONE));
L("mergeSort", 1, 0, (xs) => xs.slice().sort(cmp));
L("insertionSort", 1, 0, (xs) => xs.slice().sort(cmp));
L("lookup", 2, 1, (a, ps) => { for (const p of ps) if (deepEq(p.items[0], a)) return some(p.items[1]); return NONE; });
L("intersperse", 2, 1, (sep, xs) => xs.flatMap((x, i) => (i ? [sep, x] : [x])));
L("map₂", 3, 1, (f, a, b) => a.map((x, i) => apply(f, [x, b[i]])));
L("isPrefixOf", 2, 0, (a, b) => a.length <= b.length && a.every((x, i) => deepEq(x, b[i])));
L("cons", 2, 0, (x, xs) => [x].concat(xs));
L("nil", 0, 0, () => []);
L("and", 1, 0, (xs) => xs.every(truthy));
L("or", 1, 0, (xs) => xs.some(truthy));
L("Nodup", 1, 0, (xs) => xs.every((x, i) => xs.findIndex((y) => deepEq(x, y)) === i));
L("rotateLeft", 2, 0, (xs, n) => { if (!xs.length) return xs; const k = ix(n) % xs.length; return xs.slice(k).concat(xs.slice(0, k)); });

function pow(a, b) {
  // BigInt exponentiation has no step accounting; refuse results that would
  // be millions of digits instead of locking the tab.
  if (b > 20000n) throw new LeanError("exponent too large for this little Lean");
  return a ** b;
}

// ───────── interpreter proper ─────────
export class Interp {
  constructor(src) {
    this.src = src;
    this.globals = new Map(BUILTINS);
    this.sigs = new Map();     // name -> signature text for #check
    this.ctors = new Map();    // full ctor name -> {arity, type}
    this.ns = [];              // namespace stack
    this.opened = [];
    this.messages = [];
  }

  // name resolution ---------------------------------------------------------
  candidates(name) {
    const out = [];
    for (let i = this.ns.length; i > 0; i--) out.push(this.ns.slice(0, i).join(".") + "." + name);
    for (const o of this.opened) out.push(o + "." + name);
    out.push(name);
    return out;
  }
  lookupGlobal(name) {
    for (const c of this.candidates(name)) if (this.globals.has(c)) return { name: c, value: this.globals.get(c) };
    return null;
  }
  lookupCtor(name) {
    for (const c of this.candidates(name)) if (this.ctors.has(c)) return c;
    return null;
  }

  // evaluation --------------------------------------------------------------
  evalVar(node, env) {
    const name = node.name;
    if (node.dot) { // .ctor
      for (const [full] of this.ctors) if (full.endsWith("." + name)) return this.ctorValue(full);
      if (name === "some") return BUILTINS.get("some");
      if (name === "none") return NONE;
      throw new LeanError(`unknown constant '.${name}'`, node.tok);
    }
    if (name in env) return env[name];
    const parts = name.split(".");
    for (let i = parts.length; i >= 1; i--) {
      const head = parts.slice(0, i).join(".");
      let v;
      if (i === 1 && head in env) v = env[head];
      else {
        const c = this.lookupCtor(head);
        if (c) v = this.ctorValue(c);
        else {
          const g = this.lookupGlobal(head);
          if (g) v = this.forceGlobal(g);
          else if (head === "true") v = true;
          else if (head === "false") v = false;
          else if (head === "none") v = NONE;
          else if (head === "True") v = true;
          else if (head === "False") v = false;
          else continue;
        }
      }
      for (const f of parts.slice(i)) v = this.field(v, f, node.tok);
      return v;
    }
    throw new LeanError(`unknown identifier '${name}'`, node.tok);
  }
  forceGlobal(g) {
    const v = g.value;
    if (v instanceof Fn && v.arity === 0) return v.impl();
    return v;
  }
  ctorValue(full) {
    const info = this.ctors.get(full);
    if (!info.arity) return new Ctor(full);
    return new Fn(full, info.arity, (...a) => new Ctor(full, a));
  }
  typeNs(v) {
    if (typeof v === "bigint") return ["Nat", "Int"];
    if (typeof v === "string") return ["String"];
    if (typeof v === "boolean") return ["Bool"];
    if (Array.isArray(v)) return ["List"];
    if (v instanceof Tup) return ["Prod"];
    if (v instanceof Char) return ["Char"];
    if (v instanceof Fn) return ["Function"];
    if (v instanceof Ctor) {
      if (v.c === "some" || v.c === "none") return ["Option"];
      return [v.c.split(".").slice(0, -1).join(".")];
    }
    return [];
  }
  field(v, f, tok) {
    if (/^[0-9]+$/.test(f)) { // projections .1 .2
      const k = Number(f) - 1;
      if (v instanceof Tup) { if (k >= v.items.length) throw new LeanError(`invalid projection .${f}`, tok); return k === v.items.length - 1 || k < 1 ? v.items[k] : v.items[k]; }
      if (v instanceof Ctor && v.args[k] !== undefined) return v.args[k];
      throw new LeanError(`invalid projection .${f} on ${show(v)}`, tok);
    }
    if (f === "fst" && v instanceof Tup) return v.items[0];
    if (f === "snd" && v instanceof Tup) return v.items[1];
    for (const ns of this.typeNs(v)) {
      const g = this.lookupGlobal(ns + "." + f);
      if (g && g.value instanceof Fn) return callMethod(g.value, v);
      if (g) return g.value;
    }
    throw new LeanError(`invalid field '${f}', the value ${show(v)} does not have a function '${this.typeNs(v)[0] || "?"}.${f}'`, tok);
  }

  evalNode(n, env) {
    if (--S.fuel < 0) throw new LeanError("(deterministic) timeout: evaluation budget exhausted", n.tok);
    switch (n.k) {
      case "num": return n.v;
      case "str": return n.v;
      case "chr": return new Char(n.v);
      case "unit": return UNIT;
      case "var": return this.evalVar(n, env);
      case "list": return n.items.map((x) => this.evalNode(x, env));
      case "tup": return new Tup(n.items.map((x) => this.evalNode(x, env)));
      case "app": {
        const f = this.evalNode(n.f, env);
        const args = n.args.map((a) => this.evalNode(a, env));
        try { return apply(f, args); } catch (e) { if (e instanceof LeanError && !e.tok) e.tok = n.tok; throw e; }
      }
      case "proj": return this.field(this.evalNode(n.e, env), n.field, n.tok);
      case "idx": {
        const xs = this.evalNode(n.e, env), i = this.evalNode(n.i, env);
        if (typeof xs === "string") { const cs = [...xs]; return ix(i) < cs.length ? new Char(cs[ix(i)]) : (() => { throw new LeanError("index out of bounds", n.tok); })(); }
        if (n.mode === "?") return ix(i) < list(xs).length ? some(xs[ix(i)]) : NONE;
        if (ix(i) >= list(xs).length) {
          if (n.mode === "!") throw new LeanError("PANIC: index out of bounds", n.tok);
          throw new LeanError("failed to prove index is valid (use xs[i]! or xs[i]?)", n.tok);
        }
        return xs[ix(i)];
      }
      case "if": return truthy(this.evalNode(n.c, env)) ? this.evalNode(n.a, env) : this.evalNode(n.b, env);
      case "lam": return this.mkLam(n, env);
      case "let": {
        const v = this.evalNode(n.val, env);
        const e2 = Object.create(env);
        if (!this.matchPat(n.pat, v, e2)) throw new LeanError("let pattern does not match", n.tok);
        return this.evalNode(n.body, e2);
      }
      case "match": {
        const vs = n.scruts.map((s) => this.evalNode(s, env));
        for (const alt of n.alts) {
          const e2 = Object.create(env);
          if (alt.pats.length === vs.length && alt.pats.every((p, i) => this.matchPat(p, vs[i], e2))) return this.evalNode(alt.body, e2);
        }
        throw new LeanError("missing cases: no match alternative applies to " + vs.map((v) => show(v)).join(", "), n.tok);
      }
      case "un": {
        const v = this.evalNode(n.e, env);
        if (n.op === "¬") return !truthy(v);
        return -nat(v);
      }
      case "bin": return this.evalBin(n, env);
      case "quant": return this.evalQuant(n, env);
      case "by": return true;
      case "cdot": throw new LeanError("stray '·'", n.tok);
    }
    throw new LeanError("cannot evaluate " + n.k, n.tok);
  }

  mkLam(n, env) {
    const params = n.params;
    // names inside a body resolve against the namespaces open where it was
    // written, not wherever it happens to be called from
    const ns = this.ns.slice(), opened = this.opened.slice();
    return new Fn("fun", params.length, (...args) => {
      const e2 = Object.create(env);
      const saved = [this.ns, this.opened];
      [this.ns, this.opened] = [ns, opened];
      try {
        params.forEach((p, i) => { if (!this.matchPat(p, args[i], e2)) throw new LeanError("fun pattern does not match", n.tok); });
        return this.evalNode(n.body, e2);
      } finally { [this.ns, this.opened] = saved; }
    });
  }

  evalBin(n, env) {
    const op = n.op;
    const ev = (x) => this.evalNode(x, env);
    switch (op) {
      case "∧": case "&&": return truthy(ev(n.l)) && truthy(ev(n.r));
      case "∨": case "||": return truthy(ev(n.l)) || truthy(ev(n.r));
      case "→": case "->": return !truthy(ev(n.l)) || truthy(ev(n.r));
      case "<|": case "$": return apply(ev(n.l), [ev(n.r)]);
      case "|>": return apply(ev(n.r), [ev(n.l)]);
      case "×": throw new LeanError("types are not values here", n.tok);
    }
    const a = ev(n.l), b = ev(n.r);
    switch (op) {
      case "↔": case "<->": return truthy(a) === truthy(b);
      case "=": case "==": return deepEq(a, b);
      case "≠": case "!=": return !deepEq(a, b);
      case "<": return cmp(a, b) < 0;
      case ">": return cmp(a, b) > 0;
      case "<=": case "≤": return cmp(a, b) <= 0;
      case ">=": case "≥": return cmp(a, b) >= 0;
      case "∈": return list(b).some((x) => deepEq(x, a));
      case "∉": return !list(b).some((x) => deepEq(x, a));
      case "∣": return nat(a) === 0n ? nat(b) === 0n : nat(b) % nat(a) === 0n;
      case "+": return nat(a) + nat(b);
      case "-": { const d = nat(a) - nat(b); return !S.intMode && d < 0n ? 0n : d; }
      case "*": return nat(a) * nat(b);
      case "/": return floorDiv(nat(a), nat(b));
      case "%": return floorMod(nat(a), nat(b));
      case "^": return pow(nat(a), nat(b));
      case "++": if (typeof a === "string") return a + str(b); return list(a).concat(list(b));
      case "::": return [a].concat(list(b));
      case "∘": return new Fn("comp", 1, (x) => A1(a, A1(b, x)));
    }
    throw new LeanError(`unsupported operator ${op}`, n.tok);
  }

  // domains for ∀/∃. Returns {values, exact}
  domain(b, env) {
    const d = b.dom;
    if (d.kind === "in") return { values: list(this.evalNode(d.xs, env)), exact: true };
    if (d.kind === "lt") {
      const hi = nat(this.evalNode(d.hi, env)) + (d.incl ? 1n : 0n);
      if (hi > 100000n) throw new Unknown(`bound ${hi} is too large to enumerate`);
      return { values: Array.from({ length: Number(hi) }, (_, i) => bi(i)), exact: true };
    }
    const ty = d.kind === "type" ? typeText(d.ty) : "Nat";
    return sampleType(ty);
  }

  evalQuant(n, env) {
    const isAll = n.q === "∀";
    const go = (i, e) => {
      if (i === n.binders.length) return truthy(this.evalNode(n.body, e));
      const b = n.binders[i];
      if (b.hyp) { // theorem hypothesis (h : P): vacuous when false
        if (!truthy(this.evalNode(b.hyp, e))) return isAll;
        return go(i + 1, e);
      }
      const { values, exact } = this.domain(b, e);
      if (!exact) S.sampled = true;
      for (const v of values) {
        const e2 = Object.create(e); e2[b.name] = v;
        const r = go(i + 1, e2);
        if (isAll && !r) { S.counter = S.counter || b.name + " = " + show(v); return false; }
        if (!isAll && r) return true;
      }
      if (!isAll && !exact) throw new Unknown("no witness found among the sampled values; ∃ over an unbounded type is not decidable here");
      return isAll;
    };
    const r = go(0, env);
    return r;
  }

  // patterns ----------------------------------------------------------------
  matchPat(p, v, env) {
    switch (p.k) {
      case "num": return v === p.v;
      case "str": return v === p.v;
      case "chr": return v instanceof Char && v.c === p.v;
      case "unit": return v === UNIT;
      case "tup": return v instanceof Tup && v.items.length === p.items.length && p.items.every((q, i) => this.matchPat(q, v.items[i], env));
      case "list": return Array.isArray(v) && v.length === p.items.length && p.items.every((q, i) => this.matchPat(q, v[i], env));
      case "bin":
        if (p.op === "::") return Array.isArray(v) && v.length > 0 && this.matchPat(p.l, v[0], env) && this.matchPat(p.r, v.slice(1), env);
        if (p.op === "+" && p.r.k === "num") return typeof v === "bigint" && v >= p.r.v && this.matchPat(p.l, v - p.r.v, env);
        throw new LeanError(`operator ${p.op} can't be used in a pattern`, p.tok);
      case "app": {
        const h = p.f;
        if (h.k !== "var") throw new LeanError("bad pattern", p.tok);
        if (h.name === "some" || h.name === "Option.some") return v instanceof Ctor && v.c === "some" && this.matchPat(p.args[0], v.args[0], env);
        if (h.name === "Nat.succ") return typeof v === "bigint" && v > 0n && this.matchPat(p.args[0], v - 1n, env);
        const full = this.lookupCtor(h.name) || (h.dot ? [...this.ctors.keys()].find((k) => k.endsWith("." + h.name)) : null);
        if (!full) throw new LeanError(`unknown constructor '${h.name}' in pattern`, p.tok);
        return v instanceof Ctor && v.c === full && p.args.every((q, i) => this.matchPat(q, v.args[i], env));
      }
      case "var": {
        const name = p.name;
        if (name === "_") return true;
        if (name === "true") return v === true;
        if (name === "false") return v === false;
        if (name === "none") return v instanceof Ctor && v.c === "none";
        if (name === "Nat.zero") return v === 0n;
        const full = this.lookupCtor(name) || (p.dot ? [...this.ctors.keys()].find((k) => k.endsWith("." + name)) : null);
        if (full) return v instanceof Ctor && v.c === full;
        if (name.includes(".")) throw new LeanError(`unknown constructor '${name}' in pattern`, p.tok);
        env[name] = v; return true;
      }
    }
    throw new LeanError("unsupported pattern", p.tok);
  }
}

// ───────── type text & sampling (for ∀ binders) ─────────
function typeText(ty) {
  switch (ty.k) {
    case "var": return ty.name;
    case "app": return typeText(ty.f) + " " + ty.args.map((a) => (a.k === "app" ? `(${typeText(a)})` : typeText(a))).join(" ");
    case "bin": return typeText(ty.l) + " " + ty.op + " " + typeText(ty.r);
    case "num": return String(ty.v);
    default: return "?";
  }
}
function sampleType(ty) {
  const nats = Array.from({ length: SAMPLE }, (_, i) => bi(i));
  switch (ty) {
    case "Nat": return { values: nats, exact: false };
    case "Int": return { values: Array.from({ length: SAMPLE }, (_, i) => bi(i - SAMPLE / 2)), exact: false };
    case "Bool": return { values: [false, true], exact: true };
    case "List Nat": case "List Int": return { values: [[], [0n], [1n], [0n, 0n], [2n, 1n], [1n, 2n, 3n], [3n, 1n, 2n], [5n, 3n, 8n, 1n], [1n, 1n, 1n]], exact: false };
    case "String": return { values: ["", "a", "ab", "hello", "Lean"], exact: false };
  }
  const m = /^Fin (\d+)$/.exec(ty);
  if (m && Number(m[1]) <= 100000) return { values: Array.from({ length: Number(m[1]) }, (_, i) => bi(i)), exact: true };
  throw new Unknown(`don't know how to enumerate values of type ${ty}`);
}

// ───────── commands ─────────
const CMD_KW = new Set(["def", "theorem", "lemma", "example", "inductive", "structure", "namespace", "end", "open", "section", "abbrev", "instance", "variable", "set_option", "import", "universe", "axiom", "opaque", "macro", "syntax", "notation", "private", "protected", "partial", "noncomputable", "unsafe", "@", "#eval", "#check", "#print", "#reduce", "#guard", "attribute", "deriving", "mutual", "export", "local", "scoped", "instance"]);
const MODS = new Set(["private", "protected", "partial", "noncomputable", "unsafe", "@", "local", "scoped"]);

function splitCommands(toks) {
  const cmds = []; let cur = null;
  for (const t of toks) {
    if (t.t === "eof") break;
    if (t.col === 0 && t.nl !== undefined && ((t.t === "id" && CMD_KW.has(t.v)) || (t.t === "op" && t.v === "@"))) {
      cur = []; cmds.push(cur);
    }
    if (!cur) { cur = []; cmds.push(cur); }
    cur.push(t);
  }
  const eof = toks[toks.length - 1];
  return cmds.map((c) => [...c, { ...eof, line: c[c.length - 1].line }]);
}

function parseBinders(P, { allowHyp = false } = {}) {
  const out = []; // {name, ty|hyp}
  for (;;) {
    if (P.isOp("(")) {
      P.next(); const names = [];
      while (P.tok.t === "id") names.push(P.next());
      if (P.eatOp(":")) {
        const ty = P.parseExpr(0);
        if (P.eatOp(":=")) P.parseExpr(0);
        P.expectOp(")");
        for (const n of names) out.push({ name: n.v, ty, tok: n });
      } else { P.expectOp(")"); for (const n of names) out.push({ name: n.v, ty: null, tok: n }); }
    } else if (P.isOp("{") || P.isOp("[") || P.isOp("⦃")) {
      const close = P.isOp("{") ? "}" : "]"; let depth = 0;
      do { if (P.isOp(P.tok.v) && ["{", "["].includes(P.tok.v)) depth++; if (["}", "]"].includes(P.tok.v)) depth--; P.next(); } while (depth > 0 && !P.atEnd());
      void close;
    } else if (P.tok.t === "id" && !KW.has(P.tok.v) && !P.isOp(":", P.tok)) {
      const n = P.next(); out.push({ name: n.v, ty: null, tok: n }); // bare binder
    } else break;
  }
  return out;
}

function isTypeAst(a) {
  if (a.k === "var") return /^[A-Z]/.test(a.name) && !["True", "False"].includes(a.name);
  if (a.k === "app") return isTypeAst(a.f);
  if (a.k === "bin") return (a.op === "×" || a.op === "→" || a.op === "->") && isTypeAst(a.l);
  return false;
}

export function runLean(src) {
  const I = new Interp(src);
  S.intMode = /\bInt\b/.test(src);
  const out = [];
  let toks;
  try { toks = lex(src); } catch (e) { return [{ kind: "error", line: e.tok?.line ?? 1, text: e.message }]; }
  const msg = (kind, line, text, extra) => out.push({ kind, line, text, ...extra });
  for (const raw of splitCommands(toks)) {
    S.fuel = FUEL; S.sampled = false; S.counter = null;
    try { execCommand(I, raw, src, msg); }
    catch (e) {
      const line = e.tok?.line ?? raw[0].line;
      if (e instanceof LeanError) msg("error", line, e.message);
      else if (e instanceof Unknown) msg("unknown", line, e.message);
      else if (e instanceof RangeError) msg("error", line, "maximum recursion depth has been reached");
      else msg("error", line, "internal error: " + e.message);
    }
  }
  return out;
}

function execCommand(I, raw, src, msg) {
  // cut trailing clauses we don't model
  let toks = raw;
  const cutAt = toks.findIndex((t, i) => i > 0 && t.t === "id" && (t.v === "termination_by" || t.v === "decreasing_by" || (t.v === "deriving" && t.nl)));
  if (cutAt > 0) toks = [...toks.slice(0, cutAt), toks[toks.length - 1]];
  const P = new Parser(toks, src);
  // modifiers / attributes
  while ((P.tok.t === "id" && MODS.has(P.tok.v)) || P.isOp("@")) {
    if (P.isOp("@")) { P.next(); P.expectOp("["); let d = 1; while (d && !P.atEnd()) { if (P.isOp("[")) d++; if (P.isOp("]")) d--; P.next(); } } else P.next();
  }
  const head = P.next();
  const line = head.line;
  switch (head.v) {
    case "import": case "set_option": case "universe": case "variable": case "attribute": case "export": case "#print": case "section": case "open_namespace":
      return;
    case "open": { while (P.tok.t === "id" && !KW.has(P.tok.v)) I.opened.push(P.next().v); return; }
    case "namespace": I.ns.push(...P.next().v.split(".")); return;
    case "end": { const nm = P.tok.t === "id" ? P.next().v.split(".") : []; if (nm.length) I.ns.splice(I.ns.length - nm.length, nm.length); else I.ns.pop(); return; }
    case "#eval": case "#reduce": case "#guard": {
      const e = P.parseExpr(0);
      const v = I.evalNode(e, Object.create(null));
      if (head.v === "#guard") { if (v !== true) throw new LeanError("guard failed", head); msg("ok", line, "#guard ✓"); return; }
      if (v instanceof IO) { const lines = []; v.run(lines); for (const l of lines) msg("print", line, l); return; }
      msg("info", line, show(v));
      return;
    }
    case "#check": {
      const start = P.tok.s;
      const e = P.parseExpr(0);
      const text = src.slice(start, toks[P.p - 1].e);
      if (e.k === "var" && I.sigs.has(e.name)) { msg("info", line, `${e.name}${I.sigs.get(e.name)}`); return; }
      if (e.k === "var") { const g = I.lookupGlobal(e.name); if (g && I.sigs.has(g.name)) { msg("info", line, `${g.name}${I.sigs.get(g.name)}`); return; } }
      msg("info", line, `${text} : ${checkType(I, e)}`);
      return;
    }
    case "inductive": return defInductive(I, P, toks, src);
    case "structure": case "class": throw new LeanError("`structure` isn't supported by this little Lean — try `inductive` with a constructor", head);
    case "def": case "abbrev": case "instance": return defDef(I, P, src, head.v);
    case "theorem": case "lemma": case "example": return defTheorem(I, P, src, head, msg);
    case "deriving": case "macro": case "syntax": case "notation": case "axiom": case "opaque": case "mutual": case "instance_": return;
  }
  throw new LeanError(`unknown command '${head.v}'`, head);
}

function checkType(I, e) {
  const isProp = (x) => (x.k === "bin" && PROP_OPS.has(x.op) && x.op !== "&&" && x.op !== "||") || (x.k === "un" && x.op === "¬") || x.k === "quant";
  if (isProp(e)) return "Prop";
  if (e.k === "app" && e.f.k === "var") {
    const g = I.lookupGlobal(e.f.name);
    const sig = g && I.sigs.get(g.name);
    if (sig) { const t = peelArrows(sig, e.args.length); if (t) return t; }
  }
  const v = I.evalNode(e, Object.create(null));
  return typeOfValue(v);
}
// "(n : Nat) (m : Nat) : Nat" or " : Nat → Nat" — result type after n explicit args
function peelArrows(sig, n) {
  let s = sig.trim(), params = 0;
  while (s.startsWith("(") || s.startsWith("{")) {
    let d = 0, i = 0;
    for (; i < s.length; i++) { if ("({[".includes(s[i])) d++; if (")}]".includes(s[i])) { d--; if (d === 0) break; } }
    const inner = s.slice(1, i); if (s[0] === "(") params += inner.split(":")[0].trim().split(/\s+/).length;
    s = s.slice(i + 1).trim();
  }
  if (!s.startsWith(":")) return null;
  let t = s.slice(1).trim();
  let remaining = n - params;
  if (remaining < 0) return null;
  while (remaining > 0) {
    let d = 0, cut = -1;
    for (let i = 0; i < t.length; i++) { if ("([".includes(t[i])) d++; else if (")]".includes(t[i])) d--; else if (d === 0 && (t[i] === "→" || t.startsWith("->", i))) { cut = i; break; } }
    if (cut < 0) return null;
    t = t.slice(cut + (t[cut] === "→" ? 1 : 2)).trim(); remaining--;
  }
  return t;
}

function defInductive(I, P, toks, src) {
  const nameTok = P.next();
  const tname = [...I.ns, nameTok.v].join(".");
  // skip params and ': Type'
  while (!P.isId("where") && !P.isOp("|") && !P.atEnd()) P.next();
  if (P.isId("where")) P.next();
  let any = false;
  while (P.isOp("|")) {
    P.next();
    const c = P.next();
    let arity = 0;
    const startTy = P.p;
    // constructor type: binders or ': A → B → T'
    if (P.isOp(":")) {
      P.next(); const ty = P.parseExpr(0);
      let t = ty; while (t.k === "bin" && (t.op === "→" || t.op === "->")) { arity++; t = t.r; }
    } else {
      while (!P.isOp("|") && !P.atEnd()) {
        if (P.isOp("(") || P.isOp("{")) { const names = parseBinders(P); arity += names.length; }
        else { P.parsePostfix(P.parseAtom()); arity++; }
      }
    }
    void startTy;
    const full = tname + "." + c.v;
    I.ctors.set(full, { arity, type: tname });
    I.globals.set(full, I.ctorValue(full));
    any = true;
  }
  if (!any) I.ctors.set(tname + ".__empty", { arity: 0, type: tname });
}

function defDef(I, P, src, kw) {
  const nameTok = P.tok.t === "id" ? P.next() : { v: "inst", line: P.tok.line };
  if (kw === "instance" && !(P.tok.t === "id")) return;
  const name = [...I.ns, nameTok.v].join(".");
  const binders = parseBinders(P);
  const sigStart = nameTok.e ?? 0;
  let retTy = null;
  if (P.eatOp(":")) retTy = P.parseExpr(0);
  void retTy;
  let bodyStart;
  let body, extra = 0;
  if (P.isOp(":=")) {
    bodyStart = P.tok.s; P.next();
    if (P.isId("by")) throw new LeanError("tactic-mode definitions aren't supported; write the term directly", P.tok);
    body = P.parseExpr(0);
    if (P.isId("where")) throw new LeanError("`where` clauses aren't supported; use `let` or a separate def", P.tok);
  } else if (P.isOp("|")) {
    bodyStart = P.tok.s;
    const alts = P.parseAlts();
    extra = alts[0].pats.length;
    const tk = P.toks[P.p - 1];
    const scr = Array.from({ length: extra }, (_, i) => ({ k: "var", name: `_a${i}`, tok: tk }));
    body = { k: "lam", params: scr, body: { k: "match", scruts: scr, alts, tok: tk }, tok: tk };
  } else P.err("expected ':=' or pattern-matching alternatives");
  if (!P.atEnd()) P.err(`unexpected token '${P.tok.v}'`);
  const sig = src.slice(sigStart, bodyStart).trim();
  I.sigs.set(name, " " + sig);
  const params = binders.filter((b) => b.name).map((b) => ({ k: "var", name: b.name, tok: b.tok }));
  const expr = params.length ? { k: "lam", params, body, tok: nameTok } : body;
  // evaluating a lam only captures env, so recursion resolves through globals at call time
  const v = I.evalNode(expr, Object.create(null));
  I.globals.set(name, v instanceof Fn ? v : new Fn(name, 0, () => v));
}

function defTheorem(I, P, src, head, msg) {
  const isExample = head.v === "example";
  const nameTok = isExample ? { v: "example" } : P.next();
  const binders = parseBinders(P);
  P.expectOp(":");
  const stmtStart = P.tok.s;
  const stmt = P.parseExpr(0);
  const stmtText = src.slice(stmtStart, P.toks[P.p - 1].e).replace(/\s+/g, " ");
  const rest = P.toks.slice(P.p, -1);
  const label = isExample ? "example" : `theorem ${[...I.ns, nameTok.v].join(".")}`;
  if (!isExample) I.sigs.set([...I.ns, nameTok.v].join("."), ` ${src.slice(nameTok.e, stmtStart).trim()} ${stmtText}`.replace(/\s+/g, " ").replace(/ :\s+$/, ""));
  const sorried = rest.some((t) => t.t === "id" && t.v === "sorry") || (stmt.k === "var" && stmt.name === "sorry");
  if (sorried) { msg("warn", head.line, `${label}: declaration uses 'sorry' — nothing was checked`, { status: "sorry" }); return; }
  // wrap binders as ∀ (names ranging over their types; props are hypotheses)
  let node = stmt;
  if (binders.length) {
    const bs = binders.map((b) => (!b.ty ? { name: b.name, dom: { kind: "any" } } : isTypeAst(b.ty) ? { name: b.name, dom: { kind: "type", ty: b.ty } } : { hyp: b.ty }));
    node = { k: "quant", q: "∀", binders: bs, body: stmt, tok: head };
  }
  const ok = I.evalNode(node, Object.create(null));
  const tactic = rest.find((t) => t.t === "id" && t.v !== "by")?.v;
  const how = tactic ? ` (by ${tactic})` : "";
  if (ok && !S.sampled) msg("proved", head.line, `${label}: ✓ decided true${how}`, { status: "proved" });
  else if (ok) msg("tested", head.line, `${label}: ✓ held on every sampled case (0…${SAMPLE - 1}, small lists) — tested, not proved${how}`, { status: "tested" });
  else msg("failed", head.line, `${label}: ✗ false${S.counter ? " — counterexample: " + S.counter : ""}`, { status: "failed" });
}

// IO.println & friends -------------------------------------------------------
B("IO.println", 1, 0, (v) => new IO((out) => out.push(toStr(v))));
B("IO.print", 1, 0, (v) => new IO((out) => out.push(toStr(v))));

export const EXAMPLES = {};
export { Interp as _Interp };
