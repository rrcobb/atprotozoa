// keyboard.js — the "musical typing" layout: two overlapping piano-key rows
// on a US QWERTY keyboard, the same convention Ableton Live's Computer MIDI
// Keyboard uses. Values are semitone offsets from whatever the current root
// note is; ArrowUp/ArrowDown (octaves) and ArrowLeft/ArrowRight (semitones)
// move the root, which is the "set the root note with your keyboard" control
// — the letter/punctuation keys then play polyphonically around it.

export const KEY_SEMITONES = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ",": 12, l: 13, ".": 14, ";": 15, "/": 16,
  q: 12, "2": 13, w: 14, "3": 15, e: 16, r: 17, "5": 18, t: 19, "6": 20, y: 21, "7": 22, u: 23,
  i: 24, "9": 25, o: 26, "0": 27, p: 28,
};

// Two-row visual layout for the on-screen keycap strip, in physical order.
export const KEY_ROWS = [
  ["q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u", "i", "9", "o", "0", "p"],
  ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m", ",", "l", ".", ";", "/"],
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteName(semitoneFromC4) {
  const n = ((semitoneFromC4 % 12) + 12) % 12;
  const octave = 4 + Math.floor(semitoneFromC4 / 12);
  return `${NOTE_NAMES[n]}${octave}`;
}

export function freqFromSemitones(rootFreq, semitones) {
  return rootFreq * Math.pow(2, semitones / 12);
}
