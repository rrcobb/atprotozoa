// sentiment.js — a small lexicon scorer for reply text. Runs in the browser, no
// model, no network: a word list, a negation flip, and emoji. It is a rough
// read (sarcasm beats it), good enough to sort replies into warm / neutral /
// cold for the bloom.

const POS = new Set(("love loved loving lovely great good best better amazing awesome wonderful beautiful " +
  "brilliant excellent fantastic perfect nice cool fun funny hilarious lol lmao haha hehe thanks thank thx " +
  "congrats congratulations agree agreed yes yay yess exactly true based incredible superb gorgeous cute " +
  "adorable sweet kind lovely happy glad proud inspiring inspired helpful useful clever smart genius " +
  "delightful enjoy enjoyed enjoying favorite favourite fav stunning welcome appreciate appreciated respect " +
  "hope win winning wholesome fantastic neat sick banger legend iconic masterpiece rad dope pog hell-yes").split(/\s+/));
const NEG = new Set(("hate hated awful terrible bad worse worst ugly stupid dumb idiot trash garbage lame " +
  "boring cringe wrong false lie liar lies disagree no nope never sucks suck sucked annoying angry mad " +
  "disgusting gross pathetic useless clown loser shame ashamed sad sorry nonsense bullshit bs fuck fucking " +
  "shit shitty damn crap hateful toxic rude nasty creepy awful horrible disappointing disappointed bleh meh " +
  "ratio cope seethe wtf smh yikes problematic worthless delete").split(/\s+/));
const NEGATORS = new Set(["not", "no", "never", "isn't", "isnt", "aren't", "arent", "don't", "dont", "doesn't",
  "doesnt", "wasn't", "wasnt", "can't", "cant", "won't", "wont", "hardly", "barely", "without"]);
const POS_EMOJI = /[❤💕💖💗💙💜💚🧡💛🖤😀😁😂🤣😊😍🥰😘😄😆😎🤩🙌👏👍🔥✨🎉💯🥹😻🌸🌻🌹🫶🤗]/gu;
const NEG_EMOJI = /[😡😠🤬👎😒🙄🤮💩😤😞😢😭🤡]/gu;

export function scoreText(text) {
  const t = String(text || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/@[\w.-]+/g, " ");
  const words = t.match(/[a-z][a-z'-]*/g) || [];
  let s = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let v = POS.has(w) ? 1 : NEG.has(w) ? -1 : 0;
    if (!v) continue;
    // "not good", "never great", "don't hate": a negator within 2 words flips it
    if ((i > 0 && NEGATORS.has(words[i - 1])) || (i > 1 && NEGATORS.has(words[i - 2]))) v = -v * 0.75;
    s += v;
  }
  s += (t.match(POS_EMOJI) || []).length * 0.75;
  s -= (t.match(NEG_EMOJI) || []).length * 0.75;
  s += Math.min(2, (t.match(/!/g) || []).length) * (s > 0 ? 0.25 : 0);
  return s;
}

// "pos" | "neu" | "neg"
export function classify(text) {
  const s = scoreText(text);
  return s >= 0.75 ? "pos" : s <= -0.75 ? "neg" : "neu";
}
