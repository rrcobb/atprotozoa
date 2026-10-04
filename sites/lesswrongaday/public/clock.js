// Replay clock: real day N after the anchor shows LessWrong day N after START.
export const ANCHOR = "2026-10-04"; // the day the replay began (UTC)
export const START = "2012-01-01"; // the LessWrong day it began on
const DAY = 86400e3;

export const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
export const parse = (s) => Date.parse(s + "T00:00:00Z");

// The LessWrong date being replayed on a given real date.
export function replayDate(realYmd) {
  const n = Math.floor((parse(realYmd) - parse(ANCHOR)) / DAY);
  return ymd(parse(START) + Math.max(0, n) * DAY);
}

export const shift = (d, n) => ymd(parse(d) + n * DAY);
// LessWrong's own history runs up to the real present; replay never passes it.
export const clamp = (d, todayYmd) => (d > todayYmd ? todayYmd : d < "2007-01-01" ? "2007-01-01" : d);
