// TPK's tree-based backstory roller.
//
// This is a real tree, not a table: ORIGINS is the root's children, each
// origin owns its own EVENTS, each event owns its own OMENS. Walking a
// random path root -> origin -> event -> omen and concatenating the three
// texts along the way is what makes the backstory a tree roll rather than
// three independent d-whatever tables — the event you get depends on which
// origin you already rolled, same for the omen.
//
// Tokens filled in at render time: {Name} {They} {they} {Their} {their}
// {Them} {them} {class}.
const BACKSTORY_TREE = [
  {
    text: "{Name} grew up in the shadow of a mountain that hums, quietly, at all hours.",
    events: [
      {
        text: "Everyone said it was just wind. {They} knew better by age seven, and told no one.",
        omens: [
          "The humming stopped three days ago. {Their} {class} training did not cover what that might mean.",
          "{They} can still hear it, faintly, under every other sound. {They} are trying not to mention this to the party.",
        ],
      },
      {
        text: "{Their} whole family mined the hum for a living, generation after generation, for a fee nobody ever explained.",
        omens: [
          "{They} inherited the family pickaxe, a permanent headache, and a strong suspicion the fee is coming due.",
          "The mine is closed now. {They} never got to ask why.",
        ],
      },
      {
        text: "One night, when {they} were young, the humming stopped — and so did the village.",
        omens: [
          "{They} were the only one who left to look for it. {They} never found the village, or an explanation.",
          "{They} have spent every year since listening very, very carefully to quiet rooms.",
        ],
      },
    ],
  },
  {
    text: "{Name} was raised by a traveling circus that wasn't, strictly speaking, licensed to operate.",
    events: [
      {
        text: "{Their} job title was 'assistant to the assistant fortune teller.' {They} got good at lying convincingly.",
        omens: [
          "{They} still can't tell if {they} believe in fate, or just in a good cold read.",
          "The fortune teller's last reading, given for free, was simply: 'not this one.' Nobody wrote down which 'this' {they} meant.",
        ],
      },
      {
        text: "The circus folded after the incident with the fire-breathing goat. {They} kept the goat.",
        omens: [
          "The goat is not here today. {They} have not explained why.",
          "{They} still flinch near open flame, and near goats, and especially near open flame near goats.",
        ],
      },
      {
        text: "{They} ran away from the circus to try a normal life, and missed the chaos within a week.",
        omens: [
          "This dungeon crawl was, {they} will admit, mostly an attempt to feel something again.",
          "{Their} definition of 'normal' has drifted so far that this seemed like the reasonable choice.",
        ],
      },
    ],
  },
  {
    text: "{Name} spent {their} whole childhood apprenticed to a hedge wizard who mostly just wanted the company.",
    events: [
      {
        text: "The wizard taught {them} exactly one spell before dying of natural, entirely unrelated causes.",
        omens: [
          "{They} have never told the party which spell. {They} are saving it.",
          "{They} are still not totally sure the spell does what {they} think it does.",
        ],
      },
      {
        text: "{They} learned far more about tea than magic. The tea knowledge has, so far, proven more useful.",
        omens: [
          "{They} carry a full tea service into every dungeon. The party has stopped asking.",
          "{They} maintain that a well-brewed cup has gotten {them} out of more trouble than any spell would have.",
        ],
      },
      {
        text: "The wizard's tower is still standing, technically. {They} are still not allowed back in, technically.",
        omens: [
          "Nobody has explained what 'technically' is covering for. {They} have stopped asking too.",
          "The tower sends {them} a strongly worded letter every solstice. {They} keep every one.",
        ],
      },
    ],
  },
  {
    text: "{Name} was, according to the paperwork, born fully grown in a swamp.",
    events: [
      {
        text: "Nobody involved has ever explained this. {They} stopped asking a long time ago.",
        omens: [
          "There is a form for it. {They} have seen the form. The form raises more questions.",
          "The swamp is now a protected wetland, largely because of what happened there.",
        ],
      },
      {
        text: "There were seventeen witnesses. No two of them agree on what they saw.",
        omens: [
          "{They} have read all seventeen statements. {They} agree with none of them either.",
          "One witness statement is simply the word 'no,' repeated four times. {They} keep it framed.",
        ],
      },
      {
        text: "The paperwork lists {their} class as 'pre-assigned.' Nobody has explained that either.",
        omens: [
          "{They} have decided not to look into it further. This has not stopped it from coming up.",
          "Something about today's dungeon feels 'pre-assigned' too, and {they} do not love that.",
        ],
      },
    ],
  },
  {
    text: "{Name} comes from money. Bad money. Cursed money, specifically.",
    events: [
      {
        text: "The family fortune turns to newts every full moon, on a schedule nobody can predict.",
        omens: [
          "{They} left home mostly to escape the smell. The smell has, somehow, followed.",
          "{They} checked the almanac before this trip. It did not help.",
        ],
      },
      {
        text: "{They} were disowned for spending the cursed gold on snacks instead of 'investing it responsibly.'",
        omens: [
          "{They} regret nothing. The snacks were excellent.",
          "{Their} family has hired someone to find {them}. {They} are trying not to think about it today.",
        ],
      },
      {
        text: "{Their} full inheritance, as of this morning, is three goats and a written grudge.",
        omens: [
          "The grudge is notarized. {They} are legally required to honor it, eventually.",
          "One of the goats came along today. Nobody has explained why. Nobody has asked.",
        ],
      },
    ],
  },
];

function fillTokens(str, ctx) {
  const map = {
    Name: ctx.name,
    They: "They",
    they: "they",
    Their: "Their",
    their: "their",
    Them: "Them",
    them: "them",
    class: ctx.shortClass,
  };
  return str.replace(/\{(\w+)\}/g, (m, key) => (key in map ? map[key] : m));
}

// Walks root -> origin -> event -> omen, picking each step with rng(),
// and returns the three sentences joined into one backstory.
function rollBackstory(rng, ctx) {
  const origin = BACKSTORY_TREE[Math.floor(rng() * BACKSTORY_TREE.length)];
  const event = origin.events[Math.floor(rng() * origin.events.length)];
  const omen = event.omens[Math.floor(rng() * event.omens.length)];
  return [origin.text, event.text, omen].map((s) => fillTokens(s, ctx)).join(" ");
}
