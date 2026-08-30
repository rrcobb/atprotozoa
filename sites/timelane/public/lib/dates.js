// Date helpers shared by the timeline layout, overdue-task checks, and the
// markdown inbox parser. Dates are stored as plain "YYYY-MM-DD" strings (no
// time-of-day) — the app is a planning tool, not a scheduler with minutes.

export function todayISO() {
  return toISO(new Date());
}

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function dayDiff(aISO, bISO) {
  const a = parseISO(aISO);
  const b = parseISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

export function isOverdue(dueISO, done) {
  if (!dueISO || done) return false;
  return dayDiff(todayISO(), dueISO) < 0;
}

export function isDueSoon(dueISO, done, withinDays = 2) {
  if (!dueISO || done) return false;
  const diff = dayDiff(todayISO(), dueISO);
  return diff >= 0 && diff <= withinDays;
}

export function formatShort(iso) {
  const d = parseISO(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatHuman(iso) {
  const d = parseISO(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
