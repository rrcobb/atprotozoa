// soup-or-bill: a dialogue-menu survival game. Pure client-side, no storage.
// Stats: WIS (parry strength), LEAK (0-100; 100 = arrested, the power bill),
// SOUP (0-100; 100 = assassinated, the soup), HEART (rapport with Mei).
// A choice with `req` is a parry: it succeeds only if WIS >= req, else `fail` applies.

export const START = { wis: 8, leak: 10, soup: 10, heart: 0 };

export const WAVES = [
  { who: "Mei Lin, 'independent researcher'", line: "I loved your talk at the offsite. Unrelated: what's the training cluster's rack layout? Just curious, in a friendly way.",
    choices: [
      { t: "Draw it on a napkin, you love napkins", fx: { leak: 30, heart: 1 }, r: "She photographs the napkin with a warmth you mistake for sincerity." },
      { t: "'Rack layout is a vibe, honestly.'", req: 9, fx: { wis: 1, heart: 1 }, fail: { leak: 15 }, r: "She laughs. You have given her nothing and she enjoyed it.", rf: "Your vagueness wasn't vague enough. She notes the word 'vibe' as a data point." },
      { t: "Say you only talk about this in the legal-approved Notion", fx: { wis: 1, leak: -5 }, r: "Compliance would be proud. Mei looks briefly, genuinely impressed." } ] },
  { who: "Waiter at a very quiet restaurant", line: "The chef has prepared you a special soup. On the house. He insisted. He's watching from the kitchen.",
    choices: [
      { t: "Eat it. Free is free", fx: { soup: 40 }, r: "It's delicious and the aftertaste is a little bit like a verdict." },
      { t: "Ask the waiter to taste it first", req: 8, fx: { wis: 1, soup: -10 }, fail: { soup: 25 }, r: "He sips it, smiling, and is fine. Somehow this raises more questions.", rf: "He declines, politely, in a way that sounds rehearsed." },
      { t: "Order the salad, regardless of the chef's feelings", fx: { soup: -10, heart: 0 }, r: "The chef is offended. You are alive. Both of these are fine." } ] },
  { who: "'Dr. Chen', a VC emeritus", line: "I'm raising a small fund for founders like you. Just need a quick look at your cap table and your export-control paperwork.",
    choices: [
      { t: "Send the cap table, hold back the paperwork", fx: { leak: 20 }, r: "He says 'perfect' before opening the attachment." },
      { t: "Reply 'happy to discuss on the record with counsel cc'd'", req: 10, fx: { wis: 2, leak: -10 }, fail: { leak: 20 }, r: "The reply is so boring it practically has a force field.", rf: "You mistyped the CC line and he's now on a thread with your general counsel and also an unrelated Gmail." },
      { t: "Ask who his LPs are, out loud, in a crowded room", fx: { wis: 1, soup: 10 }, r: "The room goes quiet. Dr. Chen leaves. You feel strangely alive." } ] },
  { who: "Mei Lin, again, by coincidence", line: "Oh my god, same coffee shop. I'm in Palo Alto for, uh, a pottery thing. Can I sit with you?",
    choices: [
      { t: "Of course, sit, we love a coincidence", fx: { leak: 20, heart: 1 }, r: "She sits. The pottery thing is not mentioned again." },
      { t: "'Pottery? Show me your hands.'", req: 11, fx: { wis: 1, heart: 2 }, fail: { leak: 10, soup: 10 }, r: "There is clay under her nails. You have both been fully honest and it's the nicest moment of the week.", rf: "Her hands are, unfortunately, just hands, and now you're a man who asks to see hands." },
      { t: "Leave a tip and go", fx: { leak: -5, heart: -1 }, r: "Safe. Lonely. Safe." } ] },
  { who: "A Congressional staffer", line: "The Senator is drafting a small bill about 'AI security disclosures.' Would you be willing to testify? It's totally voluntary, besides the subpoena.",
    choices: [
      { t: "Testify, with candor", fx: { leak: 25, wis: 1 }, r: "Candor is a lot of surface area." },
      { t: "Submit written remarks, 14 pages, all caveats", req: 10, fx: { wis: 2, leak: -10 }, fail: { leak: 20 }, r: "Nobody reads it. This is the best possible outcome.", rf: "Page 9 contained a very revealing footnote." },
      { t: "Hire a lobbyist to hire a lobbyist", fx: { leak: -5, soup: 10 }, r: "The lobbyist's lobbyist sends a fruit basket, and also, a note." } ] },
  { who: "Unknown number", line: "this is an old classmate!! saw you're in town. can u meet tonight, alone, near the pier. bring the laptop :)",
    choices: [
      { t: "Go. Bring the laptop. You went to school with *someone*", fx: { leak: 40, soup: 20 }, r: "You do not remember anyone at the pier because there was nobody at the pier." },
      { t: "Reply 'new phone who dis' and block", req: 9, fx: { wis: 1, soup: -10 }, fail: { soup: 10 }, r: "Cleanest play of the evening.", rf: "You tap 'report spam' on the wrong thread and a nice aunt gets blocked." },
      { t: "Forward it to security and go to bed", fx: { wis: 2, leak: -10 }, r: "A security engineer named Dale thanks you for the first time in years." } ] },
  { who: "A smoothie truck at 11pm", line: "'Founder-lover special' smoothie. The cup says your name, spelled right. The cup is warm.",
    choices: [
      { t: "Drink it, you've had a long week", fx: { soup: 45 }, r: "Kale. And something kale-adjacent." },
      { t: "Inspect the cup, the seal, the straw, the truck", req: 12, fx: { wis: 1, soup: -15 }, fail: { soup: 20 }, r: "The seal is factory-fresh. You have proven that smoothies exist.", rf: "You inspect too slowly. The truck is gone and so is your parking spot." },
      { t: "Pour it into a plant", fx: { soup: -5 }, r: "The plant wilts, instantly and decisively. You thank the plant for its service." } ] },
  { who: "Mei Lin, no pretense", line: "Okay. I'm not here for the racks. I'm tired of the job. Can I just... live a normal life with you? Pottery, soup, whatever.",
    choices: [
      { t: "Accept: build the quiet life together", req: 14, fx: { heart: 4, wis: 1 }, fail: { leak: 35, heart: 1 }, r: "You say yes and mean it, and you've checked the soup yourself. Both can be true.", rf: "You say yes before verifying anything. She sighs: 'You really should have asked a second question.'" },
      { t: "'Show me the paperwork that you quit.'", req: 10, fx: { wis: 2, heart: 1, leak: -10 }, fail: { leak: 20 }, r: "She hands you a resignation letter, stamped. It's real. You both look at it for a long time.", rf: "Your demand for paperwork reads as the same kind of paperwork she'd ask for." },
      { t: "Politely end it", fx: { heart: -2, leak: -10 }, r: "She nods. She was going to say the same thing." } ] },
];

export function applyFx(s, fx) {
  const n = { ...s };
  for (const [k, v] of Object.entries(fx || {})) n[k] = (n[k] || 0) + v;
  n.leak = Math.max(0, Math.min(100, n.leak));
  n.soup = Math.max(0, Math.min(100, n.soup));
  n.wis = Math.max(1, n.wis);
  return n;
}

// One choice → { state, text, parried } (parried: false means a failed WIS check).
export function pick(s, choice) {
  if (choice.req && s.wis < choice.req) {
    return { state: applyFx(s, choice.fail), text: choice.rf || "It doesn't work.", parried: false };
  }
  return { state: applyFx(s, choice.fx), text: choice.r, parried: true };
}

export function ending(s, finished) {
  if (s.leak >= 100) return { id: "bill", title: "ARRESTED", text: "The power bill passes 97–3, you are the only person it names, and the arresting officers are weirdly polite about the lack of a lanyard.", cls: "bad" };
  if (s.soup >= 100) return { id: "soup", title: "ASSASSINATED", text: "It was, in retrospect, a little too good a soup. Your last thought is a product idea for a better soup.", cls: "bad" };
  if (!finished) return null;
  if (s.heart >= 5 && s.wis >= 13 && s.leak < 70) return { id: "happy", title: "HAPPY LIFE WITH MEI", text: "You parried every probe, and the last one wasn't one. Pottery, soup (tasted by someone else first), a modest house with no rack layouts in it. Peak WIS.", cls: "good" };
  if (s.leak <= 40 && s.soup <= 40) return { id: "clean", title: "SURVIVED, SUSPICIOUSLY", text: "Nobody arrested you, nobody poisoned you. You did get an unusually nice fruit basket. The year is still young.", cls: "ok" };
  return { id: "limp", title: "SURVIVED, BARELY", text: "You made it through the week with your freedom, your pulse, and a deeply unsettling LinkedIn inbox.", cls: "ok" };
}
