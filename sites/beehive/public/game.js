// Problem generation, colony state, and difficulty scaling for beehive.
// Difficulty is driven entirely by how many cells the hive has (i.e. how many
// problems have been answered correctly) — see levelFor() / generateProblem().

const Beehive = (() => {
  const LEVEL_LABELS = [
    "new hive — counting flowers",
    "growing hive — simple sums",
    "buzzing hive — mixed sums",
    "thriving hive — times tables",
    "flourishing hive — division too",
    "busy swarm — multi-step problems",
    "mega swarm — bigger multi-step",
    "legendary hive — the numbers get serious",
  ];

  function labelFor(level) {
    return LEVEL_LABELS[Math.min(level, LEVEL_LABELS.length - 1)];
  }

  // One difficulty level unlocks every 5 correct answers (filled cells).
  function levelFor(filled) {
    return Math.floor(filled / 5);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generateProblem(level) {
    if (level <= 0) {
      const a = randInt(1, 9), b = randInt(1, 9);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (level === 1) {
      const op = pick(["+", "-"]);
      let a = randInt(1, 20), b = randInt(1, 20);
      if (op === "-" && a < b) [a, b] = [b, a];
      return { text: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b };
    }
    if (level === 2) {
      const op = pick(["+", "-", "×"]);
      if (op === "×") {
        const a = randInt(2, 9), b = randInt(2, 9);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      let a = randInt(1, 30), b = randInt(1, 30);
      if (op === "-" && a < b) [a, b] = [b, a];
      return { text: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b };
    }
    if (level === 3) {
      const op = pick(["×", "+", "-"]);
      if (op === "×") {
        const a = randInt(2, 12), b = randInt(2, 12);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      let a = randInt(10, 60), b = randInt(10, 60);
      if (op === "-" && a < b) [a, b] = [b, a];
      return { text: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b };
    }
    if (level === 4) {
      const op = pick(["×", "÷", "+", "-"]);
      if (op === "×") {
        const a = randInt(2, 12), b = randInt(2, 12);
        return { text: `${a} × ${b}`, answer: a * b };
      }
      if (op === "÷") {
        const b = randInt(2, 12), q = randInt(2, 12);
        return { text: `${b * q} ÷ ${b}`, answer: q };
      }
      let a = randInt(10, 80), b = randInt(10, 80);
      if (op === "-" && a < b) [a, b] = [b, a];
      return { text: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b };
    }

    // level >= 5: two-step expressions, ranges creep up with level so the
    // hive never plateaus into busywork.
    const scale = Math.min(level - 5, 12);
    const small = () => randInt(2, 6 + scale);
    const big = () => randInt(1, 10 + scale * 3);
    const pattern = pick(["ab+c", "a+bc", "ab-c", "(a+b)c"]);
    if (pattern === "ab+c") {
      const a = small(), b = small(), c = big();
      return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
    }
    if (pattern === "a+bc") {
      const a = big(), b = small(), c = small();
      return { text: `${a} + ${b} × ${c}`, answer: a + b * c };
    }
    if (pattern === "ab-c") {
      const a = small(), b = small();
      const max = a * b;
      const c = randInt(0, max);
      return { text: `${a} × ${b} - ${c}`, answer: a * b - c };
    }
    // (a+b) x c
    const a = randInt(1, 6 + scale), b = randInt(1, 6 + scale), c = randInt(2, 6 + Math.floor(scale / 2));
    return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
  }

  return { labelFor, levelFor, generateProblem };
})();
