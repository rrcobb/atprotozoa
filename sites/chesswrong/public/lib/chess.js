// Rule-based chessifier. Swaps words in a title for their nearest chess word and
// leaves every other word alone, so the original phrasing survives. Titles with
// nothing to swap get a chess tag appended. Deterministic: same title, same output.

// source word (lowercase, inflections listed explicitly) -> chess word
const MAP = {
  ai: "chess engine", ais: "chess engines", agi: "Stockfish", llm: "engine", llms: "engines",
  "a.i.": "chess engine",
  alignment: "development", aligned: "developed", align: "develop",
  rationality: "chess", rationalist: "chess player", rationalists: "chess players",
  rational: "calculated", rationalism: "chess",
  decision: "move", decisions: "moves", decide: "castle",
  mistake: "blunder", mistakes: "blunders", error: "blunder", errors: "blunders",
  risk: "blunder", risks: "blunders", danger: "hanging piece", dangers: "hanging pieces",
  people: "players", person: "player", human: "player", humans: "players",
  humanity: "the chess world", everyone: "every player", someone: "some player",
  world: "board", worlds: "boards", universe: "board",
  game: "game", games: "games",
  power: "tempo", powerful: "tempo-gaining", control: "center control",
  agent: "piece", agents: "pieces",
  goal: "checkmate", goals: "checkmates", win: "checkmate", winning: "checkmating", wins: "checkmates",
  lose: "resign", losing: "resigning", loss: "resignation",
  plan: "opening", plans: "openings", planning: "opening prep",
  strategy: "strategy", strategies: "strategies",
  attack: "gambit", attacks: "gambits", bet: "gambit", bets: "gambits", betting: "gambiting",
  trade: "exchange", trades: "exchanges", tradeoff: "exchange sacrifice", tradeoffs: "exchange sacrifices",
  sacrifice: "sacrifice", cost: "material", costs: "material",
  time: "tempo", start: "open", starting: "opening", begin: "open", end: "endgame", ending: "endgame",
  finally: "in the endgame", eventually: "in the endgame", late: "endgame",
  evidence: "analysis", argument: "line", arguments: "lines", reasoning: "calculation",
  proof: "forced mate", prove: "force mate", theory: "opening theory", theories: "opening theories",
  model: "opening", models: "openings", modeling: "opening prep",
  debate: "match", debates: "matches", discussion: "post-mortem", conversation: "post-mortem",
  community: "chess club", communities: "chess clubs", meetup: "tournament", meetups: "tournaments",
  event: "tournament", events: "tournaments", conference: "tournament", contest: "tournament",
  learn: "study", learning: "studying", learned: "studied", lessons: "endgame studies", lesson: "endgame study",
  think: "calculate", thinking: "calculating", thought: "calculation", thoughts: "calculations",
  thinks: "calculates", believe: "calculate", beliefs: "evaluations", belief: "evaluation",
  predict: "calculate", prediction: "variation", predictions: "variations", forecast: "calculation",
  forecasting: "calculating", forecasts: "variations",
  question: "puzzle", questions: "puzzles", problem: "puzzle", problems: "puzzles", puzzle: "puzzle",
  answer: "solution", solving: "solving", solve: "solve", solution: "solution", solutions: "solutions",
  intelligence: "calculation", intelligent: "calculating", smart: "tactical", smarter: "more tactical",
  superintelligence: "grandmaster", superintelligent: "grandmaster-level", superintelligences: "grandmasters",
  scaling: "rating", scale: "rating", training: "drilling", train: "drill", trained: "drilled",
  interpretability: "engine analysis", evals: "rating lists", eval: "rating", evaluation: "rating",
  evaluations: "ratings", benchmark: "rating list", benchmarks: "rating lists",
  deception: "feint", deceptive: "feinting", deceive: "feint", lying: "bluffing", lie: "bluff", lies: "bluffs",
  honesty: "fair play", honest: "fair-play", cheating: "engine use", cheat: "use an engine",
  politics: "opening politics", political: "positional", government: "federation", governance: "federation",
  safety: "king safety", safe: "castled", unsafe: "uncastled", secure: "castled",
  war: "match", fight: "match", conflict: "match", competition: "tournament", competitive: "tournament",
  position: "position", positions: "positions", strong: "strong", weak: "weak", weakness: "weak square",
  advantage: "advantage", leverage: "initiative", momentum: "initiative", opportunity: "tactic",
  opportunities: "tactics", trick: "tactic", tricks: "tactics", hack: "tactic", hacks: "tactics",
  rule: "rule", rules: "rules", law: "rule", laws: "rules", norm: "convention", norms: "conventions",
  queen: "queen", king: "king", pawn: "pawn", rook: "rook", knight: "knight", bishop: "bishop",
  money: "material", wealth: "material", resources: "material", resource: "material",
  economy: "endgame tablebase", economics: "endgame theory", market: "tournament", markets: "tournaments",
  job: "title norm", jobs: "title norms", career: "rating climb", careers: "rating climbs",
  work: "grind", working: "grinding", effort: "grind", habits: "opening repertoire", habit: "opening repertoire",
  motivation: "initiative", procrastination: "time trouble", productivity: "tempo", focus: "concentration",
  attention: "concentration", memory: "opening memorization", memories: "opening memorization",
  mind: "chess mind", minds: "chess minds", brain: "chess brain", brains: "chess brains",
  consciousness: "board vision", conscious: "board-aware", experience: "tournament experience",
  feeling: "intuition", feelings: "intuitions", emotion: "tilt", emotions: "tilt", anger: "tilt",
  fear: "zugzwang", anxiety: "time pressure", stress: "time pressure",
  stuck: "in zugzwang", trapped: "in zugzwang", dilemma: "zugzwang", paradox: "zugzwang",
  surprise: "swindle", surprising: "swindling", unexpected: "swindling", hidden: "unseen",
  choice: "move", choices: "moves", option: "move", options: "moves", pick: "play", choose: "play",
  chooses: "plays", chosen: "played", act: "move", action: "move", actions: "moves",
  defense: "defense", defence: "defense", defend: "defend", offense: "attack", offence: "attack",
  progress: "development", improve: "improve", improving: "improving", improvement: "improvement",
  update: "revised evaluation", updates: "revised evaluations", updating: "re-evaluating",
  probability: "winning chances", probabilities: "winning chances", odds: "winning chances",
  uncertainty: "complications", uncertain: "unclear", unclear: "unclear",
  complex: "complicated", complexity: "complications", simple: "simple",
  basics: "fundamentals", basic: "fundamental", beginner: "beginner", beginners: "beginners",
  guide: "opening guide", guides: "opening guides", tutorial: "opening tutorial",
  review: "post-mortem", reviews: "post-mortems", "post-mortem": "post-mortem", postmortem: "post-mortem",
  retrospective: "post-mortem", summary: "annotated game", notes: "annotations", note: "annotation",
  list: "rating list", ranking: "rating list", ranked: "rated",
  team: "club team", teams: "club teams", group: "club", groups: "clubs", company: "club", companies: "clubs",
  organization: "federation", organizations: "federations", lab: "chess academy", labs: "chess academies",
  school: "chess school", teacher: "coach", teachers: "coaches", teaching: "coaching", teach: "coach",
  expert: "grandmaster", experts: "grandmasters", experience: "tournament experience",
  genius: "prodigy", talent: "natural talent", skill: "rating", skills: "ratings",
  good: "sound", better: "stronger", best: "best move", worse: "worse", worst: "worst move",
  bad: "unsound", wrong: "unsound", correct: "best", right: "best", true: "winning", false: "losing",
  fake: "bluff", real: "legal", reality: "the board", truth: "the best move",
  step: "move", steps: "moves", next: "next move", first: "first move", second: "second move",
  turn: "turn", turns: "turns", round: "round", rounds: "rounds",
  pressure: "pressure", tension: "pawn tension", balance: "equilibrium", equilibrium: "equilibrium",
  coordination: "piece coordination", cooperation: "piece coordination", coordinate: "coordinate pieces",
  collaboration: "piece coordination", trust: "touch-move honor", reputation: "rating",
  status: "title", prestige: "title", signaling: "signaling", signalling: "signaling",
  incentive: "tempo", incentives: "tempo", reward: "prize", rewards: "prizes",
  game_theory: "opening theory", optimization: "optimal play", optimize: "play optimally",
  optimizer: "engine", optimizers: "engines", optimal: "optimal", search: "calculation",
  compute: "calculation", computing: "calculating", computation: "calculation",
  algorithm: "engine", algorithms: "engines", program: "engine", programs: "engines",
  software: "engine software", code: "notation", coding: "notating", data: "game database",
  dataset: "game database", datasets: "game databases", network: "neural-net engine",
  networks: "neural-net engines", neural: "neural-net", transformer: "engine", transformers: "engines",
  language: "notation", languages: "notations", words: "moves", word: "move", text: "notation",
  story: "annotated game", stories: "annotated games", fiction: "annotated game",
  science: "chess science", scientific: "chess-scientific", research: "opening research",
  researcher: "theoretician", researchers: "theoreticians", study: "study", studies: "studies",
  experiment: "blitz experiment", experiments: "blitz experiments", test: "blitz test", tests: "blitz tests",
  math: "endgame math", mathematics: "endgame mathematics", logic: "tactics", logical: "tactical",
  philosophy: "chess philosophy", ethics: "fair play", moral: "fair-play", morality: "fair play",
  utilitarianism: "material counting", altruism: "gambit-giving", altruist: "gambit-giver",
  effective: "winning", efficient: "efficient", efficiency: "efficiency",
};

// words already in chess vocabulary, so a title using them counts as chess-y
const CHESS_WORDS = new Set([
  "chess", "gambit", "gambits", "checkmate", "pawn", "pawns", "rook", "rooks", "knight", "knights",
  "bishop", "bishops", "king", "queen", "castle", "castling", "endgame", "opening", "openings",
  "tempo", "board", "grandmaster", "zugzwang", "blunder", "blunders", "stockfish", "fianchetto",
]);

const TAGS = [
  "(a chess puzzle)", "(in the endgame)", "(chess edition)", "(a Sicilian Defense)",
  "(considered as an opening)", "(playing it as White)", "(a gambit)", "(en passant)",
  "(and the Queen's Gambit)", "(a Ruy Lopez)", "(a knight fork)", "(at move 40)",
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function matchCase(src, out) {
  // short acronyms (AI, LLM) read better as a capitalized phrase than shouted
  if (src.length > 3 && src === src.toUpperCase() && /[A-Z]/.test(src)) return out.toUpperCase();
  if (/^[A-Z]/.test(src)) return out[0].toUpperCase() + out.slice(1);
  return out;
}

const WORD = /[A-Za-z][A-Za-z.'’-]*[A-Za-z]|[A-Za-z]/g;

// Returns { title, swaps, appended } for one original title.
export function chessify(original) {
  const text = String(original || "").trim();
  let swaps = 0;
  let hasChess = false;
  const out = text.replace(WORD, (w) => {
    const key = w.toLowerCase().replace(/[’]/g, "'");
    if (CHESS_WORDS.has(key)) hasChess = true;
    if (Object.prototype.hasOwnProperty.call(MAP, key)) {
      const rep = MAP[key];
      if (rep.toLowerCase() === key) return w; // already chessy (king, game, ...)
      swaps++;
      return matchCase(w, rep);
    }
    return w;
  });
  if (swaps > 0 || hasChess) return { title: out, swaps, appended: false };
  const tag = TAGS[hash(text) % TAGS.length];
  const [, base, punct] = out.match(/^(.*?)([.!?]*)$/s);
  return { title: `${base} ${tag}${punct}`, swaps: 0, appended: true };
}

// Body text: same swap table, but never appends a tag, and swaps inside running
// prose only. Returns the rewritten string.
export function chessifyText(text) {
  return String(text).replace(WORD, (w) => {
    const key = w.toLowerCase().replace(/[’]/g, "'");
    if (!Object.prototype.hasOwnProperty.call(MAP, key)) return w;
    const rep = MAP[key];
    return rep.toLowerCase() === key ? w : matchCase(w, rep);
  });
}

// Margin annotations in chess notation, dropped after some paragraphs.
const ASIDES = [
  "14.Nf3!?", "22...Qxd4?!", "Black resigns.", "(diagram: White to move)", "see Game 7, Karpov–Kasparov",
  "transposes to the Queen's Gambit Declined.", "an inaccuracy; 17.Bg5 was stronger.", "!! (the engine disagrees)",
  "he overlooked the fork on c7.", "theory ends here.", "draw offered; declined.", "= (equal)", "?? — hangs the rook.",
];

// Deterministic: returns an aside for paragraph `i` of a post, or "" for most.
export function asideFor(postId, i) {
  const h = hash(postId + ":" + i);
  return h % 4 === 0 ? ASIDES[(h >>> 3) % ASIDES.length] : "";
}
