import { ITEMS } from "../data.js";

export const CATEGORIES = [
  { key: "toy", label: "toy", color: "#f2545b" },
  { key: "game", label: "game", color: "#2f9e44" },
  { key: "tool", label: "tool", color: "#1a5fd0" },
  { key: "chart", label: "chart", color: "#e0a400" },
  { key: "tier", label: "tier", color: "#8e44ad" },
  { key: "any", label: "anything", color: "#111111" },
];

export function countFor(key) {
  return key === "any" ? ITEMS.length : ITEMS.filter((it) => it.type === key).length;
}

export function itemsFor(key) {
  return key === "any" ? ITEMS : ITEMS.filter((it) => it.type === key);
}

export function pickCategory() {
  return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
}

export function pickItem(categoryKey) {
  const pool = itemsFor(categoryKey);
  return pool[Math.floor(Math.random() * pool.length)];
}
