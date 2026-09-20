// Pure combo-to-multiplier formula, split out from app.js so it can be
// unit-tested without a DOM. Every 3 touches inside the combo window bumps
// the multiplier by 1, capped at ×10 so a very long streak doesn't run away.
export function multiplierForCombo(combo) {
  if (combo <= 0) return 1;
  return Math.min(1 + Math.floor((combo - 1) / 3), 10);
}
