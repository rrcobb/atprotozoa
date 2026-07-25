// lisp.js — a small, self-contained Lisp interpreter.
//
// It is NOT the full ANSI Common Lisp standard (that's ~1000 pages), but it
// genuinely evaluates an ANSI-flavored subset: arithmetic, comparisons, let /
// let*, defun, defvar/setq, lambda, cons/car/cdr/list, if / cond / when /
// unless, quote, and, or, not, mapcar, funcall, apply, progn, and a pile of
// list/string builtins. Symbols are uppercased on read (Common Lisp reader
// default). NIL is false and the empty list; T is true. No external deps.
//
// Everything below is intentionally readable rather than clever — it's a bit
// living inside a demon core, but it's a real bit.

// ---------- data model ----------
// Lisp lists are represented as JS arrays of already-parsed forms.
// A "cons cell" pair we model with {car, cdr} so dotted pairs & car/cdr work.
// A "symbol" is {sym: "NAME"}. Numbers are JS numbers, strings are {str: "..."}.

const NIL = null;              // NIL == empty list == false
const T = { sym: "T" };

function sym(name) { return { sym: name }; }
function isSym(x) { return x && typeof x === "object" && "sym" in x; }
function isStr(x) { return x && typeof x === "object" && "str" in x; }
function isCons(x) { return x && typeof x === "object" && "car" in x; }
function isNum(x) { return typeof x === "number"; }
function isFn(x) { return typeof x === "function" || (x && x.__lambda); }

function cons(a, d) { return { car: a, cdr: d }; }

// JS array  <->  Lisp cons-list
function listToCons(arr, tail = NIL) {
  let out = tail;
  for (let i = arr.length - 1; i >= 0; i--) out = cons(arr[i], out);
  return out;
}
function consToArray(x) {
  const out = [];
  while (isCons(x)) { out.push(x.car); x = x.cdr; }
  return out;
}
function truthy(x) { return x !== NIL && x !== false; }

// ---------- tokenizer ----------
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ";") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(" || c === ")" || c === "'") { toks.push(c); i++; continue; }
    // #' — the FUNCTION reader macro: #'foo => (function foo)
    if (c === "#" && src[i + 1] === "'") { toks.push("#'"); i += 2; continue; }
    if (c === '"') {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\") { s += src[j + 1]; j += 2; }
        else { s += src[j]; j++; }
      }
      if (j >= src.length) throw new Error("unterminated string");
      toks.push({ str: s }); i = j + 1; continue;
    }
    // atom: read until whitespace or paren
    let j = i;
    while (j < src.length && !/[\s()';"]/.test(src[j])) j++;
    toks.push(src.slice(i, j)); i = j;
  }
  return toks;
}

// ---------- reader (parser) ----------
function parseAll(src) {
  const toks = tokenize(src);
  let pos = 0;
  const forms = [];
  function parse() {
    const t = toks[pos++];
    if (t === undefined) throw new Error("unexpected EOF");
    if (t === "(") {
      const items = [];
      while (toks[pos] !== ")") {
        if (pos >= toks.length) throw new Error("unterminated list — missing )");
        items.push(parse());
      }
      pos++; // consume ")"
      return listToCons(items);
    }
    if (t === ")") throw new Error("unexpected )");
    if (t === "'") return listToCons([sym("QUOTE"), parse()]);
    if (t === "#'") return listToCons([sym("FUNCTION"), parse()]);
    if (typeof t === "object" && "str" in t) return t; // string literal
    return atom(t);
  }
  while (pos < toks.length) forms.push(parse());
  return forms;
}
function atom(t) {
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return parseFloat(t);
  if (t.toUpperCase() === "NIL") return NIL;
  return sym(t.toUpperCase()); // CL reader uppercases symbols
}

// ---------- environment ----------
class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error("unbound variable: " + name);
  }
  set(name, val) {
    let e = this;
    while (e) { if (e.vars.has(name)) { e.vars.set(name, val); return val; } e = e.parent; }
    this.vars.set(name, val); return val; // setq on undefined => global-ish
  }
  define(name, val) { this.vars.set(name, val); return val; }
}

// ---------- evaluator ----------
const SPECIAL = new Set([
  "QUOTE", "IF", "COND", "WHEN", "UNLESS", "LET", "LET*", "LAMBDA", "DEFUN",
  "DEFVAR", "DEFPARAMETER", "SETQ", "SETF", "AND", "OR", "PROGN", "FUNCTION",
]);

function evl(form, env) {
  // self-evaluating
  if (isNum(form) || isStr(form) || form === NIL || form === T) return form;
  if (isSym(form)) return env.get(form.sym);
  if (!isCons(form)) return form;

  const head = form.car;
  if (isSym(head) && SPECIAL.has(head.sym)) {
    return evalSpecial(head.sym, consToArray(form.cdr), env);
  }
  // ordinary application
  const fn = evl(head, env);
  const args = consToArray(form.cdr).map((a) => evl(a, env));
  return applyFn(fn, args, env);
}

function evalSpecial(op, args, env) {
  switch (op) {
    case "QUOTE": return args[0];
    case "FUNCTION": return evl(args[0], env);
    case "IF":
      return truthy(evl(args[0], env)) ? evl(args[1], env)
           : args.length > 2 ? evl(args[2], env) : NIL;
    case "WHEN":
      return truthy(evl(args[0], env)) ? evalBody(args.slice(1), env) : NIL;
    case "UNLESS":
      return !truthy(evl(args[0], env)) ? evalBody(args.slice(1), env) : NIL;
    case "COND": {
      for (const clause of args) {
        const parts = consToArray(clause);
        const test = evl(parts[0], env);
        if (truthy(test)) return parts.length > 1 ? evalBody(parts.slice(1), env) : test;
      }
      return NIL;
    }
    case "AND": {
      let v = T;
      for (const a of args) { v = evl(a, env); if (!truthy(v)) return NIL; }
      return v;
    }
    case "OR": {
      for (const a of args) { const v = evl(a, env); if (truthy(v)) return v; }
      return NIL;
    }
    case "PROGN": return evalBody(args, env);
    case "LET": case "LET*": {
      const child = new Env(env);
      const binds = consToArray(args[0]);
      for (const b of binds) {
        const parts = consToArray(b);
        const name = parts[0].sym;
        // let evaluates in outer env; let* in the growing child env
        const valEnv = op === "LET*" ? child : env;
        child.define(name, parts.length > 1 ? evl(parts[1], valEnv) : NIL);
      }
      return evalBody(args.slice(1), child);
    }
    case "SETQ": case "SETF": {
      let last = NIL;
      for (let i = 0; i < args.length; i += 2) {
        last = evl(args[i + 1], env);
        env.set(args[i].sym, last);
      }
      return last;
    }
    case "DEFVAR": case "DEFPARAMETER": {
      const name = args[0].sym;
      env.define(name, args.length > 1 ? evl(args[1], env) : NIL);
      return sym(name);
    }
    case "LAMBDA": return makeLambda(args[0], args.slice(1), env);
    case "DEFUN": {
      const name = args[0].sym;
      env.define(name, makeLambda(args[1], args.slice(2), env));
      return sym(name);
    }
  }
}

function evalBody(forms, env) {
  let v = NIL;
  for (const f of forms) v = evl(f, env);
  return v;
}

function makeLambda(paramList, body, env) {
  const params = consToArray(paramList);
  const fn = (args) => {
    const child = new Env(env);
    let optional = false, rest = null;
    let ai = 0;
    for (const p of params) {
      const pn = p.sym;
      if (pn === "&OPTIONAL") { optional = true; continue; }
      if (pn === "&REST" || pn === "&BODY") { rest = null; continue; }
      child.define(pn, ai < args.length ? args[ai] : NIL);
      ai++;
    }
    // handle &rest: if present, bind the symbol after &REST to remaining args
    const restIdx = params.findIndex((p) => p.sym === "&REST" || p.sym === "&BODY");
    if (restIdx !== -1 && params[restIdx + 1]) {
      const before = params.slice(0, restIdx).filter((p) => p.sym !== "&OPTIONAL").length;
      child.define(params[restIdx + 1].sym, listToCons(args.slice(before)));
    }
    return evalBody(body, child);
  };
  fn.__lambda = true;
  return fn;
}

function applyFn(fn, args, env) {
  if (typeof fn === "function") return fn(args, env);
  throw new Error("not a function: " + printLisp(fn));
}

// ---------- builtins ----------
function num(x) {
  if (!isNum(x)) throw new Error("not a number: " + printLisp(x));
  return x;
}
function makeGlobal() {
  const g = new Env();
  const def = (name, fn) => g.define(name, fn);

  // arithmetic
  def("+", (a) => a.reduce((s, x) => s + num(x), 0));
  def("*", (a) => a.reduce((s, x) => s * num(x), 1));
  def("-", (a) => a.length === 1 ? -num(a[0]) : a.slice(1).reduce((s, x) => s - num(x), num(a[0])));
  def("/", (a) => a.length === 1 ? 1 / num(a[0]) : a.slice(1).reduce((s, x) => s / num(x), num(a[0])));
  def("MOD", (a) => ((num(a[0]) % num(a[1])) + num(a[1])) % num(a[1]));
  def("REM", (a) => num(a[0]) % num(a[1]));
  def("1+", (a) => num(a[0]) + 1);
  def("1-", (a) => num(a[0]) - 1);
  def("ABS", (a) => Math.abs(num(a[0])));
  def("MIN", (a) => Math.min(...a.map(num)));
  def("MAX", (a) => Math.max(...a.map(num)));
  def("SQRT", (a) => Math.sqrt(num(a[0])));
  def("EXPT", (a) => Math.pow(num(a[0]), num(a[1])));
  def("FLOOR", (a) => Math.floor(num(a[0])));
  def("CEILING", (a) => Math.ceil(num(a[0])));
  def("ROUND", (a) => Math.round(num(a[0])));
  def("ISQRT", (a) => Math.floor(Math.sqrt(num(a[0]))));
  def("GCD", (a) => a.map(num).reduce((x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) { [x, y] = [y, x % y]; } return x; }));

  // comparisons (variadic, chained, like CL)
  const chain = (cmp) => (a) => { for (let i = 0; i < a.length - 1; i++) if (!cmp(num(a[i]), num(a[i + 1]))) return NIL; return T; };
  def("=", chain((x, y) => x === y));
  def("/=", (a) => { for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (num(a[i]) === num(a[j])) return NIL; return T; });
  def("<", chain((x, y) => x < y));
  def(">", chain((x, y) => x > y));
  def("<=", chain((x, y) => x <= y));
  def(">=", chain((x, y) => x >= y));
  def("ZEROP", (a) => num(a[0]) === 0 ? T : NIL);
  def("PLUSP", (a) => num(a[0]) > 0 ? T : NIL);
  def("MINUSP", (a) => num(a[0]) < 0 ? T : NIL);
  def("EVENP", (a) => num(a[0]) % 2 === 0 ? T : NIL);
  def("ODDP", (a) => Math.abs(num(a[0]) % 2) === 1 ? T : NIL);

  // equality / predicates
  const eq = (x, y) => {
    if (x === y) return true;
    if (isSym(x) && isSym(y)) return x.sym === y.sym;
    if (isNum(x) && isNum(y)) return x === y;
    if (isStr(x) && isStr(y)) return x.str === y.str;
    return false;
  };
  def("EQ", (a) => eq(a[0], a[1]) ? T : NIL);
  def("EQL", (a) => eq(a[0], a[1]) ? T : NIL);
  const equal = (x, y) => {
    if (eq(x, y)) return true;
    if (isCons(x) && isCons(y)) return equal(x.car, y.car) && equal(x.cdr, y.cdr);
    return false;
  };
  def("EQUAL", (a) => equal(a[0], a[1]) ? T : NIL);
  def("NULL", (a) => a[0] === NIL ? T : NIL);
  def("NOT", (a) => truthy(a[0]) ? NIL : T);
  def("ATOM", (a) => isCons(a[0]) ? NIL : T);
  def("CONSP", (a) => isCons(a[0]) ? T : NIL);
  def("LISTP", (a) => (a[0] === NIL || isCons(a[0])) ? T : NIL);
  def("NUMBERP", (a) => isNum(a[0]) ? T : NIL);
  def("SYMBOLP", (a) => (isSym(a[0]) || a[0] === NIL) ? T : NIL);
  def("STRINGP", (a) => isStr(a[0]) ? T : NIL);
  def("FUNCTIONP", (a) => isFn(a[0]) ? T : NIL);

  // cons / list
  def("CONS", (a) => cons(a[0], a[1]));
  def("CAR", (a) => a[0] === NIL ? NIL : (isCons(a[0]) ? a[0].car : (() => { throw new Error("CAR of non-list"); })()));
  def("CDR", (a) => a[0] === NIL ? NIL : (isCons(a[0]) ? a[0].cdr : (() => { throw new Error("CDR of non-list"); })()));
  def("FIRST", (a) => a[0] === NIL ? NIL : a[0].car);
  def("REST", (a) => a[0] === NIL ? NIL : a[0].cdr);
  const nth = (n, l) => { while (n-- > 0 && isCons(l)) l = l.cdr; return isCons(l) ? l.car : NIL; };
  def("SECOND", (a) => nth(1, a[0]));
  def("THIRD", (a) => nth(2, a[0]));
  def("NTH", (a) => nth(num(a[0]), a[1]));
  def("NTHCDR", (a) => { let l = a[1], n = num(a[0]); while (n-- > 0 && isCons(l)) l = l.cdr; return l; });
  def("CADR", (a) => nth(1, a[0]));
  def("CADDR", (a) => nth(2, a[0]));
  def("CAAR", (a) => (isCons(a[0]) && isCons(a[0].car)) ? a[0].car.car : NIL);
  def("CDDR", (a) => { let l = a[0]; if (isCons(l)) l = l.cdr; if (isCons(l)) l = l.cdr; return l; });
  def("LIST", (a) => listToCons(a));
  def("LIST*", (a) => listToCons(a.slice(0, -1), a[a.length - 1]));
  def("LENGTH", (a) => isStr(a[0]) ? a[0].str.length : consToArray(a[0]).length);
  def("APPEND", (a) => { let out = a.length ? a[a.length - 1] : NIL; for (let i = a.length - 2; i >= 0; i--) out = listToCons(consToArray(a[i]), out); return out; });
  def("REVERSE", (a) => isStr(a[0]) ? { str: [...a[0].str].reverse().join("") } : listToCons(consToArray(a[0]).reverse()));
  def("LAST", (a) => { let l = a[0]; while (isCons(l) && isCons(l.cdr)) l = l.cdr; return l; });
  def("MEMBER", (a) => { let l = a[1]; while (isCons(l)) { if (equal(l.car, a[0])) return l; l = l.cdr; } return NIL; });
  def("ASSOC", (a) => { let l = a[1]; while (isCons(l)) { if (isCons(l.car) && equal(l.car.car, a[0])) return l.car; l = l.cdr; } return NIL; });
  def("REMOVE", (a) => listToCons(consToArray(a[1]).filter((x) => !equal(x, a[0]))));
  def("COUNT", (a) => consToArray(a[1]).filter((x) => equal(x, a[0])).length);
  def("SORT", (a, env) => { const arr = consToArray(a[0]).slice(); const p = a[1]; arr.sort((x, y) => truthy(applyFn(p, [x, y], env)) ? -1 : 1); return listToCons(arr); });

  // higher-order
  def("MAPCAR", (a, env) => { const fn = a[0]; const lists = a.slice(1).map(consToArray); const n = Math.min(...lists.map((l) => l.length)); const out = []; for (let i = 0; i < n; i++) out.push(applyFn(fn, lists.map((l) => l[i]), env)); return listToCons(out); });
  def("MAPCAN", (a, env) => { const fn = a[0]; const items = consToArray(a[1]); const parts = items.map((x) => consToArray(applyFn(fn, [x], env))); return listToCons([].concat(...parts)); });
  def("REDUCE", (a, env) => { const fn = a[0]; const items = consToArray(a[1]); if (!items.length) return NIL; return items.reduce((acc, x) => applyFn(fn, [acc, x], env)); });
  def("REMOVE-IF", (a, env) => listToCons(consToArray(a[1]).filter((x) => !truthy(applyFn(a[0], [x], env)))));
  def("REMOVE-IF-NOT", (a, env) => listToCons(consToArray(a[1]).filter((x) => truthy(applyFn(a[0], [x], env)))));
  def("FIND-IF", (a, env) => { for (const x of consToArray(a[1])) if (truthy(applyFn(a[0], [x], env))) return x; return NIL; });
  def("EVERY", (a, env) => { for (const x of consToArray(a[1])) if (!truthy(applyFn(a[0], [x], env))) return NIL; return T; });
  def("SOME", (a, env) => { for (const x of consToArray(a[1])) { const v = applyFn(a[0], [x], env); if (truthy(v)) return v; } return NIL; });
  def("FUNCALL", (a, env) => applyFn(a[0], a.slice(1), env));
  def("APPLY", (a, env) => { const spread = a.slice(1, -1).concat(consToArray(a[a.length - 1])); return applyFn(a[0], spread, env); });
  def("IDENTITY", (a) => a[0]);

  // strings / chars
  def("CONCATENATE", (a) => { /* (concatenate 'string ...) */ const parts = a.slice(1).map((x) => isStr(x) ? x.str : consToArray(x).map(printLisp).join("")); return { str: parts.join("") }; });
  def("STRING-UPCASE", (a) => ({ str: (isStr(a[0]) ? a[0].str : a[0].sym).toUpperCase() }));
  def("STRING-DOWNCASE", (a) => ({ str: (isStr(a[0]) ? a[0].str : a[0].sym).toLowerCase() }));
  def("STRING=", (a) => (isStr(a[0]) ? a[0].str : a[0]) === (isStr(a[1]) ? a[1].str : a[1]) ? T : NIL);
  def("FORMAT", (a) => { /* (format nil "~a ~a" x y) — returns string; t/nil dest ignored, no real newline mgmt */ let fmt = isStr(a[1]) ? a[1].str : ""; const rest = a.slice(2); let i = 0; const s = fmt.replace(/~[aAsSdD%]/g, (m) => m === "~%" ? "\n" : printLisp(rest[i++], m[1] === "s" || m[1] === "S")); return a[0] === NIL ? { str: s } : (post(s), NIL); });

  // symbols / io
  def("PRINT", (a) => { post(printLisp(a[0], true)); return a[0]; });
  def("PRINC", (a) => { post(printLisp(a[0])); return a[0]; });
  def("TERPRI", () => { post(""); return NIL; });
  def("LIST-LENGTH", (a) => consToArray(a[0]).length);
  def("GENSYM", (() => { let n = 0; return () => sym("G" + (n++)); })());

  // constants
  g.define("T", T);
  g.define("PI", Math.PI);
  g.define("NIL", NIL);
  g.define("MOST-POSITIVE-FIXNUM", Number.MAX_SAFE_INTEGER);
  g.define("*DEMON-CORE*", { str: "critical" });

  return g;
}

// output hook — the REPL sets this so PRINT/FORMAT can stream to the terminal
let post = () => {};
function setOutput(fn) { post = fn; }

// ---------- printer ----------
function printLisp(x, readable = false) {
  if (x === NIL) return "NIL";
  if (x === T) return "T";
  if (isNum(x)) return Number.isInteger(x) ? String(x) : String(x);
  if (isStr(x)) return readable ? '"' + x.str.replace(/"/g, '\\"') + '"' : x.str;
  if (isSym(x)) return x.sym;
  if (isFn(x)) return "#<FUNCTION>";
  if (isCons(x)) {
    const parts = [];
    let cur = x;
    while (isCons(cur)) { parts.push(printLisp(cur.car, readable)); cur = cur.cdr; }
    if (cur === NIL) return "(" + parts.join(" ") + ")";
    return "(" + parts.join(" ") + " . " + printLisp(cur, readable) + ")"; // dotted
  }
  return String(x);
}

// ---------- public API ----------
export function makeInterpreter() {
  const env = makeGlobal();
  return {
    env,
    setOutput,
    // evaluate a whole source string; return array of printed results
    run(src) {
      const forms = parseAll(src);
      const results = [];
      for (const f of forms) results.push(printLisp(evl(f, env), true));
      return results;
    },
  };
}
