// chesslingo curriculum: units of chess-pattern-recognition drills.
// Every item is one of:
//   - { piece, color, sq }               -> movement pattern, computed live by app.js
//   - { board: { pieces, highlights, arrows } } -> a static position, rendered as-is
//   - { moves }                          -> a move-notation prompt (openings unit)
// plus { id, label, sub, q } shared by all: q is the question shown above the prompt.

window.CHESSLINGO_UNITS = [
  {
    id: "pieces",
    title: "Warm-Up: Meet the Pieces",
    icon: "♟️",
    blurb: "Six pieces, six silhouettes. Learn to recognize each one on sight before anything else.",
    items: [
      { id: "pc-k", label: "King", sub: "one square any direction — the piece you must protect", q: "Which piece is this?",
        board: { pieces: [{ sq: "e4", piece: "K", color: "w" }] } },
      { id: "pc-q", label: "Queen", sub: "rook and bishop combined — the most powerful piece on the board", q: "Which piece is this?",
        board: { pieces: [{ sq: "d4", piece: "Q", color: "w" }] } },
      { id: "pc-r", label: "Rook", sub: "straight lines only — ranks and files", q: "Which piece is this?",
        board: { pieces: [{ sq: "a4", piece: "R", color: "w" }] } },
      { id: "pc-b", label: "Bishop", sub: "diagonals only — stuck on one color forever", q: "Which piece is this?",
        board: { pieces: [{ sq: "c4", piece: "B", color: "w" }] } },
      { id: "pc-n", label: "Knight", sub: "jumps in an L — the only piece that leaps over others", q: "Which piece is this?",
        board: { pieces: [{ sq: "f4", piece: "N", color: "w" }] } },
      { id: "pc-p", label: "Pawn", sub: "one step forward, captures diagonally, dreams of promotion", q: "Which piece is this?",
        board: { pieces: [{ sq: "e2", piece: "P", color: "w" }] } },
    ],
  },
  {
    id: "movement",
    title: "How They Move",
    icon: "\u{1F9ED}",
    blurb: "Same six pieces, now shown by their reach on an empty board (blockers and captures ignored, for clarity).",
    items: [
      { id: "mv-k", label: "King", sub: "one square, every direction", q: "Which piece moves like this?", piece: "K", color: "w", sq: "e1" },
      { id: "mv-q", label: "Queen", sub: "any distance, any of eight directions", q: "Which piece moves like this?", piece: "Q", color: "w", sq: "d1" },
      { id: "mv-r", label: "Rook", sub: "any distance along a rank or file", q: "Which piece moves like this?", piece: "R", color: "w", sq: "a1" },
      { id: "mv-b", label: "Bishop", sub: "any distance along a diagonal", q: "Which piece moves like this?", piece: "B", color: "w", sq: "c1" },
      { id: "mv-n", label: "Knight", sub: "the L-shaped jump, always the same eight-dot pattern", q: "Which piece moves like this?", piece: "N", color: "w", sq: "b1" },
      { id: "mv-p", label: "Pawn", sub: "one square forward, two from its starting rank", q: "Which piece moves like this?", piece: "P", color: "w", sq: "e2" },
    ],
  },
  {
    id: "check",
    title: "Check, Mate, or Safe?",
    icon: "⚔️",
    blurb: "The three states a king can be in. Read the whole position, not just the piece attacking it.",
    items: [
      { id: "chk-backrank", label: "Checkmate", sub: "the rook pins the king to the back rank — no escape, no block, no capture", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "g1", piece: "K", color: "w" }, { sq: "f2", piece: "P", color: "w" }, { sq: "g2", piece: "P", color: "w" }, { sq: "h2", piece: "P", color: "w" }, { sq: "a1", piece: "R", color: "b" }], highlights: [{ sq: "g1", type: "ring" }] } },
      { id: "chk-notmate-1", label: "Check, not mate", sub: "the king can simply step aside", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "e1", piece: "K", color: "w" }, { sq: "e8", piece: "Q", color: "b" }], highlights: [{ sq: "e1", type: "ring" }] } },
      { id: "chk-notmate-2", label: "Check, not mate", sub: "two escape squares sit off the diagonal", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "h1", piece: "K", color: "w" }, { sq: "a8", piece: "B", color: "b" }], highlights: [{ sq: "h1", type: "ring" }] } },
      { id: "safe-1", label: "Safe — not in check", sub: "the knight doesn't attack this square", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "g1", piece: "K", color: "w" }, { sq: "e5", piece: "N", color: "b" }] } },
      { id: "safe-2", label: "Safe — not in check", sub: "the rook's rank is blocked by a pawn in between", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "d4", piece: "K", color: "w" }, { sq: "f4", piece: "P", color: "w" }, { sq: "h4", piece: "R", color: "b" }] } },
      { id: "chk-ladder", label: "Checkmate", sub: "two rooks seal off the rank and the file — the classic ladder mate", q: "Check, checkmate, or safe?",
        board: { pieces: [{ sq: "a1", piece: "K", color: "w" }, { sq: "a8", piece: "R", color: "b" }, { sq: "b3", piece: "R", color: "b" }], highlights: [{ sq: "a1", type: "ring" }] } },
    ],
  },
  {
    id: "tactics",
    title: "Name the Tactic",
    icon: "\u{1F3AF}",
    blurb: "The bread-and-butter patterns that win material. Spot the shape, name the tactic.",
    items: [
      { id: "tac-fork", label: "Fork", sub: "one knight, two targets — king and rook at once", q: "What's the tactic?",
        board: { pieces: [{ sq: "c7", piece: "N", color: "w" }, { sq: "e8", piece: "K", color: "b" }, { sq: "a8", piece: "R", color: "b" }], arrows: [["c7", "e8"], ["c7", "a8"]] } },
      { id: "tac-pin", label: "Pin", sub: "the knight can't move — it's shielding its own king", q: "What's the tactic?",
        board: { pieces: [{ sq: "b5", piece: "B", color: "w" }, { sq: "c6", piece: "N", color: "b" }, { sq: "e8", piece: "K", color: "b" }], arrows: [["b5", "e8"]] } },
      { id: "tac-skewer", label: "Skewer", sub: "like a pin, but the more valuable piece is in front", q: "What's the tactic?",
        board: { pieces: [{ sq: "e1", piece: "R", color: "w" }, { sq: "e5", piece: "K", color: "b" }, { sq: "e8", piece: "R", color: "b" }], arrows: [["e1", "e8"]] } },
      { id: "tac-discovered", label: "Discovered Attack", sub: "move the knight, and the bishop behind it attacks the queen", q: "What's the tactic?",
        board: { pieces: [{ sq: "c1", piece: "B", color: "w" }, { sq: "d2", piece: "N", color: "w" }, { sq: "h6", piece: "Q", color: "b" }], arrows: [["c1", "h6"]] } },
      { id: "tac-pawnfork", label: "Pawn Fork", sub: "one pawn attacks two pieces on the next rank at once", q: "What's the tactic?",
        board: { pieces: [{ sq: "e5", piece: "P", color: "w" }, { sq: "d6", piece: "N", color: "b" }, { sq: "f6", piece: "B", color: "b" }], arrows: [["e5", "d6"], ["e5", "f6"]] } },
      { id: "tac-backrank", label: "Back-Rank Weakness", sub: "the king's own pawns block its only escape route", q: "What's the tactic?",
        board: { pieces: [{ sq: "g1", piece: "K", color: "w" }, { sq: "f2", piece: "P", color: "w" }, { sq: "g2", piece: "P", color: "w" }, { sq: "h2", piece: "P", color: "w" }, { sq: "d8", piece: "R", color: "b" }], arrows: [["d8", "d1"]] } },
    ],
  },
  {
    id: "mates",
    title: "Checkmate Patterns",
    icon: "\u{1F451}",
    blurb: "Five mating patterns worth memorizing on sight — you'll see these again and again.",
    items: [
      { id: "mate-backrank", label: "Back-Rank Mate", sub: "the king's own pawns trap it on the last rank", q: "Name the mating pattern.",
        board: { pieces: [{ sq: "g1", piece: "K", color: "w" }, { sq: "f2", piece: "P", color: "w" }, { sq: "g2", piece: "P", color: "w" }, { sq: "h2", piece: "P", color: "w" }, { sq: "a1", piece: "R", color: "b" }], highlights: [{ sq: "g1", type: "ring" }] } },
      { id: "mate-ladder", label: "Ladder Mate", sub: "two rooks march the king down the board, rank by rank", q: "Name the mating pattern.",
        board: { pieces: [{ sq: "a1", piece: "K", color: "w" }, { sq: "a8", piece: "R", color: "b" }, { sq: "b3", piece: "R", color: "b" }], highlights: [{ sq: "a1", type: "ring" }] } },
      { id: "mate-queen", label: "Queen Mate", sub: "queen and king team up to trap the king on the rim", q: "Name the mating pattern.",
        board: { pieces: [{ sq: "h8", piece: "K", color: "w" }, { sq: "g7", piece: "Q", color: "b" }, { sq: "g6", piece: "K", color: "b" }], highlights: [{ sq: "h8", type: "ring" }] } },
      { id: "mate-smothered", label: "Smothered Mate", sub: "boxed in by its own pieces, finished off by a lone knight", q: "Name the mating pattern.",
        board: { pieces: [{ sq: "h8", piece: "K", color: "w" }, { sq: "g8", piece: "R", color: "w" }, { sq: "g7", piece: "P", color: "w" }, { sq: "h7", piece: "P", color: "w" }, { sq: "g6", piece: "N", color: "b" }], highlights: [{ sq: "h8", type: "ring" }] } },
      { id: "mate-rook", label: "Rook Mate", sub: "king and rook corner the lone king on the edge of the board", q: "Name the mating pattern.",
        board: { pieces: [{ sq: "a8", piece: "K", color: "w" }, { sq: "b6", piece: "K", color: "b" }, { sq: "h8", piece: "R", color: "b" }], highlights: [{ sq: "a8", type: "ring" }] } },
    ],
  },
  {
    id: "openings",
    title: "Opening Book",
    icon: "\u{1F4D6}",
    blurb: "Six openings by their first few moves. No board this time — just notation, like a real game score.",
    items: [
      { id: "op-italian", label: "Italian Game", sub: "one of the oldest documented openings — the bishop aims straight at f7", q: "Name the opening.", moves: "1. e4 e5\n2. Nf3 Nc6\n3. Bc4" },
      { id: "op-ruylopez", label: "Ruy Lopez", sub: "the bishop pins the knight defending e5 from the side", q: "Name the opening.", moves: "1. e4 e5\n2. Nf3 Nc6\n3. Bb5" },
      { id: "op-sicilian", label: "Sicilian Defense", sub: "black fights for the center asymmetrically — the most popular reply to e4", q: "Name the opening.", moves: "1. e4 c5" },
      { id: "op-french", label: "French Defense", sub: "solid and a little cramped — black concedes space to strike back later", q: "Name the opening.", moves: "1. e4 e6" },
      { id: "op-qgambit", label: "Queen's Gambit", sub: "white offers a pawn to pull black's center pawn out of place", q: "Name the opening.", moves: "1. d4 d5\n2. c4" },
      { id: "op-kingsindian", label: "King's Indian Defense", sub: "black fianchettoes the bishop and lets white build a big center — for now", q: "Name the opening.", moves: "1. d4 Nf6\n2. c4 g6" },
    ],
  },
];

// The final exam pulls every applied-knowledge unit (skipping the two
// fundamentals units) into one shuffled pool, built at runtime in app.js.
window.CHESSLINGO_FINAL = {
  id: "final",
  title: "Grandmaster Review",
  icon: "\u{1F3C6}",
  blurb: "Checks, tactics, mates, and openings — all shuffled together. Pass this and you've got real chess instincts.",
  questionCount: 10,
  sourceUnitIds: ["check", "tactics", "mates", "openings"],
};
