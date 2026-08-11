// bankbrawl fight engine. Two made-up account balances go in, a cartoonish
// blow-by-blow comes out. The only rule that's never broken: the bigger
// balance always wins. Everything else — moves, damage, quips — is pure
// theater layered on top of that one fact.

// Parses "$1,234.56", "-400", "50k", "2.3M", "1.2b", "3T", "1e6", plain
// "1200" — whatever a person would actually type into a money box.
export function parseBalance(raw) {
  if (typeof raw !== "string") return NaN;
  let s = raw.trim().toLowerCase();
  if (!s) return NaN;

  let sign = 1;
  if (s.startsWith("(") && s.endsWith(")")) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/^\$/, "").replace(/,/g, "").trim();

  const suffixes = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9, t: 1e12 };
  const suffixMatch = s.match(/^([\d.]+)\s*([kmbt]{1,2})$/);
  if (suffixMatch) {
    const mult = suffixes[suffixMatch[2]];
    if (!mult) return NaN;
    const n = parseFloat(suffixMatch[1]);
    return Number.isFinite(n) ? sign * n * mult : NaN;
  }

  if (!/^[\d.]+$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : NaN;
}

export function formatMoney(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { maximumFractionDigits: abs < 1000 ? 2 : 0 });
  return (neg ? "-$" : "$") + str;
}

// A signed pseudo-log scale so a $50 account, a -$400 account, and a $50M
// account all land somewhere sane and comparable on one number line.
export function powerScore(n) {
  return Math.sign(n) * Math.log10(1 + Math.abs(n));
}

const TIERS = [
  {
    id: "overdrawn", name: "OVERDRAWN", emoji: "\u{1F573}️", max: 0,
    moves: [
      "unleashes the OVERDRAFT FEE OF DOOM",
      "summons a swarm of NSF notices",
      "hits with a collections-call combo",
      "casts Insufficient Funds",
      "throws the last unpaid parking ticket",
    ],
  },
  {
    id: "broke", name: "BROKE", emoji: "\u{1FAD9}", max: 100,
    moves: [
      "hurls a fistful of pocket lint",
      "brandishes an expired 10%-off coupon",
      "deploys the Couch Cushion Special",
      "unsheathes a slightly crumpled $5 bill",
      "rolls a jar of pennies downhill",
    ],
  },
  {
    id: "scraping", name: "SCRAPING BY", emoji: "\u{1FA99}", max: 1000,
    moves: [
      "chucks a jar of loose change",
      "casts Minimum Payment",
      "activates the Buy Now Pay Later gambit",
      "swings a half-used gift card",
      "deploys the Ramen Reserve",
    ],
  },
  {
    id: "gettingby", name: "GETTING BY", emoji: "\u{1F4B5}", max: 10000,
    moves: [
      "throws a paycheck haymaker",
      "deploys the Direct Deposit Uppercut",
      "casts Budget Spreadsheet (it's color-coded)",
      "unleashes a coupon-stacking combo",
      "activates side-hustle overdrive",
    ],
  },
  {
    id: "comfortable", name: "COMFORTABLE", emoji: "\u{1F4B0}", max: 100000,
    moves: [
      "unleashes a 401(k) power move",
      "casts Emergency Fund Shield",
      "deploys the Index Fund Barrage",
      "summons a Roth IRA familiar",
      "swings a diversified portfolio",
    ],
  },
  {
    id: "flush", name: "FLUSH", emoji: "\u{1F3E6}", max: 1000000,
    moves: [
      "summons a home equity line of credit",
      "deploys the Vacation Home Gambit",
      "casts Compound Interest (it's been years)",
      "unleashes the Second Car Combo",
      "activates the Financial Advisor Assist",
    ],
  },
  {
    id: "rich", name: "RICH", emoji: "\u{1F681}", max: 10000000,
    moves: [
      "calls in a private jet strike",
      "unleashes the Compound Interest Missile",
      "deploys a wine cellar avalanche",
      "summons a team of tax attorneys",
      "activates the Yacht Club Special",
    ],
  },
  {
    id: "mogul", name: "MOGUL", emoji: "\u{1F6E5}️", max: 1000000000,
    moves: [
      "deploys a fleet of yachts",
      "summons an army of shell companies",
      "activates hostile-takeover mode",
      "unleashes the Offshore Account Cascade",
      "casts Diversified Real Estate Empire",
    ],
  },
  {
    id: "bezos", name: "BEZOS-TIER", emoji: "\u{1F680}", max: Infinity,
    moves: [
      "launches a literal rocket",
      "buys the moon and drops it",
      "unfurls the S-1 filing of doom",
      "summons a newspaper (just to own it)",
      "activates the Space Tourism Finisher",
    ],
  },
];

export function tierFor(n) {
  for (const t of TIERS) if (n < t.max) return t;
  return TIERS[TIERS.length - 1];
}

function pick(arr, used) {
  const options = arr.filter((x) => !used.has(x));
  const pool = options.length ? options : arr;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  used.add(choice);
  return choice;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Maps a signed power score onto a 4..100 display HP so even OVERDRAWN
// accounts get a sliver of a bar to lose.
function scoreToHp(score) {
  return clamp(Math.round(50 + score * 9), 4, 100);
}

export function simulateBrawl(nameA, balA, nameB, balB) {
  const scoreA = powerScore(balA);
  const scoreB = powerScore(balB);
  const tierA = tierFor(balA);
  const tierB = tierFor(balB);
  const hpA = scoreToHp(scoreA);
  const hpB = scoreToHp(scoreB);

  const tie = balA === balB;
  const winner = tie ? null : balA > balB ? "a" : "b";

  const usedA = new Set();
  const usedB = new Set();
  const gap = Math.abs(scoreA - scoreB);
  const rounds = [];

  if (!tie) {
    const ROUNDS = 3;
    let hpAcur = hpA, hpBcur = hpB;
    for (let i = 0; i < ROUNDS; i++) {
      // Both sides swing every round for spectacle; the eventual loser lands
      // hits too, they just never land enough of them.
      const moveA = pick(tierA.moves, usedA);
      const dmgA = Math.max(3, Math.round(6 + gap * 3 + Math.random() * 8));
      hpBcur = Math.max(0, hpBcur - (winner === "a" ? dmgA : Math.round(dmgA * 0.4)));
      rounds.push({ round: i + 1, side: "a", move: moveA, dmg: dmgA, hpAfter: hpBcur, targetSide: "b" });

      const moveB = pick(tierB.moves, usedB);
      const dmgB = Math.max(3, Math.round(6 + gap * 3 + Math.random() * 8));
      hpAcur = Math.max(0, hpAcur - (winner === "b" ? dmgB : Math.round(dmgB * 0.4)));
      rounds.push({ round: i + 1, side: "b", move: moveB, dmg: dmgB, hpAfter: hpAcur, targetSide: "a" });
    }
    // Finisher: the winner always lands the actual knockout, no matter how
    // the earlier rounds shook out.
    if (winner === "a") { hpBcur = 0; } else { hpAcur = 0; }
    rounds.finalHpA = hpAcur;
    rounds.finalHpB = hpBcur;
  } else {
    rounds.finalHpA = hpA;
    rounds.finalHpB = hpB;
  }

  const diff = Math.abs(balA - balB);
  const ratio = balB !== 0 ? balA / balB : Infinity;

  let koLine, verdict;
  if (tie) {
    koLine = "STALEMATE!";
    verdict = `${formatMoney(balA)} vs ${formatMoney(balB)} — dead even. Rather than fight, they open a joint account and split the rent.`;
  } else {
    const winName = winner === "a" ? nameA : nameB;
    const loseName = winner === "a" ? nameB : nameA;
    const winBal = winner === "a" ? balA : balB;
    const loseBal = winner === "a" ? balB : balA;
    koLine = `KO! ${winName.toUpperCase()} WINS`;
    const gapDesc =
      gap > 4 ? "an absolute massacre" :
      gap > 2.5 ? "a decisive beatdown" :
      gap > 1 ? "a clean win" :
      "a squeaker, right down to the last cent";
    verdict = `${formatMoney(winBal)} outlasts ${formatMoney(loseBal)} in ${gapDesc}. ${loseName} files an appeal with their bank; the bank does not respond.`;
  }

  return {
    nameA, nameB, balA, balB,
    tierA, tierB, scoreA, scoreB,
    hpA, hpB,
    finalHpA: rounds.finalHpA ?? hpA,
    finalHpB: rounds.finalHpB ?? hpB,
    rounds: tie ? [] : rounds,
    tie, winner,
    koLine, verdict,
    diff, ratio,
  };
}
