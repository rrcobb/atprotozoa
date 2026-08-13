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

  // Flowers unlock as the hive's total cell count (state.filled) crosses each
  // threshold — a permanent record of the colony's whole life, so a flower
  // once earned is never lost even after a reset-free plateau.
  const FLOWER_TYPES = [
    { at: 1, emoji: "🌱", name: "sprout" },
    { at: 5, emoji: "🌼", name: "daisy" },
    { at: 10, emoji: "🌻", name: "sunflower" },
    { at: 20, emoji: "🌸", name: "blossom" },
    { at: 35, emoji: "🌺", name: "hibiscus" },
    { at: 50, emoji: "🌷", name: "tulip" },
    { at: 75, emoji: "🪻", name: "hyacinth" },
    { at: 100, emoji: "🌹", name: "rose" },
    { at: 150, emoji: "🏵️", name: "rosette" },
    { at: 200, emoji: "💮", name: "white flower" },
  ];

  // Bee types unlock as the best streak ever reached (state.best) crosses
  // each threshold — a reward for accuracy, not just volume.
  const BEE_TYPES = [
    { at: 0, id: "worker", name: "worker bee", body: "#f4a300", stripe: "#241a08" },
    { at: 3, id: "scout", name: "scout bee", body: "#5aa9e6", stripe: "#12314a" },
    { at: 6, id: "guardian", name: "guardian bee", body: "#e65a5a", stripe: "#4a1212" },
    { at: 10, id: "royal", name: "royal bee", body: "#b16be0", stripe: "#3a1a4a" },
    { at: 15, id: "golden", name: "golden bee", body: "#ffe066", stripe: "#7a5a00" },
    { at: 20, id: "frost", name: "frost bee", body: "#bfe9ff", stripe: "#2a5a6e" },
  ];

  function flowersFor(filled) {
    return FLOWER_TYPES.filter((f) => f.at <= filled);
  }

  function beesFor(bestStreak) {
    return BEE_TYPES.filter((b) => b.at <= bestStreak);
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

  return { labelFor, levelFor, generateProblem, FLOWER_TYPES, BEE_TYPES, flowersFor, beesFor };
})();
