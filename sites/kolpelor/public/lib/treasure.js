// treasure.js — Zeus's fortune. Per @antiali.as's reply-thread verse: "Zeus
// sometimes gives gifts, sometimes strikes with unforeseen ruin... spoils lie
// hidden in the earth — gold, gear enchanted with magic." Digging a homeland
// is a single weighted roll: nothing, gold, enchanted gear, or Zeus's doom
// (χρυσός lost, if you have any to lose). Pure functions — app.js drives the
// button, roster.js persists gold/inventory/equip state.

export const GEAR = [
  { id: "aigis", name: "Αἰγίς", label: "Aegis Shard", stat: "def", boost: 6, emoji: "\u{1F6E1}\u{FE0F}" },
  { id: "talaria", name: "Πτερόπεδιλα", label: "Talaria", stat: "spd", boost: 6, emoji: "\u{1FA84}" },
  { id: "ropalon", name: "Ῥόπαλον", label: "Herakles' Club", stat: "atk", boost: 6, emoji: "\u{1F3CF}" },
  { id: "keras", name: "Κέρας Ἀμαλθείας", label: "Amaltheia's Horn", stat: "hp", boost: 12, emoji: "\u{1F410}" },
];

export function gearMeta(id) {
  return GEAR.find((g) => g.id === id) || null;
}

// One dig at the current region. Weighted: 45% nothing, 25% gold, 10% gear,
// 20% doom — gifts a little more common than ruin, per "ἄλλοτε δῶρα δίδωσιν,
// ἄλλοτε πλήσσει" (sometimes gifts, sometimes strikes) reading as "usually
// gifts, sometimes not."
export function dig(rng = Math.random) {
  const roll = rng();
  if (roll < 0.45) {
    return { kind: "nothing", message: "just roots and stone — nothing here." };
  }
  if (roll < 0.7) {
    const amount = 5 + Math.floor(rng() * 25);
    return { kind: "gold", amount, message: `Zeus smiles — ${amount} χρυσός spill from the dirt.` };
  }
  if (roll < 0.8) {
    const gear = GEAR[Math.floor(rng() * GEAR.length)];
    return {
      kind: "gear",
      gear,
      message: `buried deep, ${gear.emoji} ${gear.label} (${gear.name}) — τεύχη κεκαρωμένα μαγικῇ, enchanted gear.`,
    };
  }
  const amount = 3 + Math.floor(rng() * 12);
  return {
    kind: "doom",
    amount,
    message: `ἄτη ἀπρόπτῳ — Zeus strikes without warning; the ground swallows ${amount} χρυσός before you can grab it.`,
  };
}

// A bound pelor's stats with its equipped gear's bonus folded in. Base stats
// (roster.js) stay untouched by equip/unequip so gear can be freely swapped.
export function effectiveStats(pelor) {
  const base = pelor.stats;
  if (!pelor.equipped) return base;
  const g = gearMeta(pelor.equipped);
  if (!g) return base;
  return { ...base, [g.stat]: base[g.stat] + g.boost };
}
