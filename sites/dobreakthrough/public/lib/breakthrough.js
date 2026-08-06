// breakthrough.js — "DO A BREAKTHROUGH" mutates an idea's text into an
// increasingly monetized, increasingly deranged startup pitch. Purely a
// buzzword/funding-stage mad-lib: no real advice of any kind, "legality"
// jokes are the bit (the brief explicitly asked not to worry about it "in
// this first trial run" — read as an invitation to be funny about the hype
// cycle, not to generate anything actionable), same spirit as
// sites/grindset and sites/griftindex elsewhere in this repo.
//
// Deterministic, not random: every choice is picked by hashing
// `${postUri}:${level}` (FNV-1a, see sites/technically for the same trick),
// so a given idea at a given press-count always renders the same pitch —
// reproducible, shareable, no server state needed.

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

// One full lap of the hype cycle. `amount` is a base dollar figure that
// scales up on every subsequent lap, so mashing the button forever keeps
// making "more money" — literally, per the brief.
const STAGES = [
  { emoji: "🌱", label: "BOOTSTRAPPED", amount: 0 },
  { emoji: "🌱", label: "PRE-SEED", amount: 150000 },
  { emoji: "🌿", label: "SEED", amount: 1200000 },
  { emoji: "📈", label: "SERIES A", amount: 8000000 },
  { emoji: "📈", label: "SERIES B", amount: 34000000 },
  { emoji: "🏛️", label: "IPO", amount: 410000000 },
  { emoji: "🏢", label: "ACQUIRED", amount: 620000000 },
  { emoji: "📰", label: "UNDER SEC INQUIRY", amount: 620000000 },
  { emoji: "💀", label: "SHUT DOWN", amount: 0 },
  { emoji: "🔁", label: "REBOOTED AS A NEW LLC", amount: 150000 },
];

const MECHANISMS = [
  "a $9.99/mo subscription with the free tier quietly removed",
  "a transaction fee on every action, including undoing the action",
  "an NFT membership tier called the Founders Club",
  "a referral pyramid: recruit 3 friends to unlock what used to be free",
  "premium AI insights bolted onto the existing feature",
  "a data-licensing deal with \"select partners\"",
  "dynamic pricing that goes up exactly when you need it most",
  "a $1,999/seat enterprise tier nobody asked for",
  "a native token, 40% pre-mined for the founding team",
  "an insurance product bundled in at checkout, opt-out only",
  "a creator-economy cut of anything users make with it",
  "an affiliate kickback baked into every recommendation",
  "a binding arbitration clause replacing your right to sue",
  "a franchise model — buy the license, run your own",
  "a \"growth\" redesign optimized for time-on-app, not usefulness",
  "a waitlist you can skip for $49",
  "an annual plan that auto-renews and hides the cancel button",
];

const LEGAL_ASIDES = [
  "(consult a lawyer, or don't — we didn't)",
  "(please review the Terms of Service, all 40 pages)",
  "(now requires binding arbitration, no class actions)",
  "(illegal in three states, thriving everywhere else)",
  "(pending: several lawsuits, one strongly worded)",
  "(a regulator has \"questions\")",
  "(this is not investment advice, or is it)",
  "(the EULA changed again, nobody read it)",
  "(technically compliant, spiritually not)",
  "(no bad ideas in brainstorming, allegedly)",
];

const TEMPLATES = [
  (orig, mech, legal) => `"${orig}" — but it's ${mech} now. ${legal}`,
  (orig, mech, legal) => `Pivoted. "${orig}" is now a platform. Monetization: ${mech}. ${legal}`,
  (orig, mech, legal) => `New TAM unlocked: same idea — "${orig}" — plus ${mech}. ${legal}`,
  (orig, mech, legal) => `Rebrand complete: "${orig}", relaunched with ${mech}. ${legal}`,
  (orig, mech, legal) => `The breakthrough: ${mech}, wrapped around "${orig}". ${legal}`,
  (orig, mech, legal) => `"${orig}" was the MVP. The real product is ${mech}. ${legal}`,
];

function fmtMoney(n) {
  if (n >= 1000000000) return "$" + (n / 1000000000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + n;
}

// `level` is 1-based: how many times this card's button has been pressed.
export function breakthrough(postUri, originalText, level) {
  const stage = STAGES[(level - 1) % STAGES.length];
  const lap = Math.floor((level - 1) / STAGES.length);
  const multiplier = 1 + lap * 3;
  const amount = stage.amount * multiplier;

  const seed = fnv1a(`${postUri}:${level}`);
  const mech = pick(seed, MECHANISMS);
  const legal = pick(seed >>> 3, LEGAL_ASIDES);
  const template = pick(seed >>> 7, TEMPLATES);

  const stageLabel = `${stage.emoji} ${stage.label}` + (amount ? ` — ${fmtMoney(amount)} raised` : "");
  const pitch = template(String(originalText || "").trim(), mech, legal);

  return { level, stage: stageLabel, pitch, lap };
}
