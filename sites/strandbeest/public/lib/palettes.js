// Colours per visual style, as [r,g,b] so they can be mixed for altitude and haze.
const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export const PALETTES = {
  min: {
    skyTop: h("#efe8d8"), skyTopHi: h("#a9b8c7"), skyBot: h("#f7f2e7"), skyBotHi: h("#d9dfe2"),
    mount: [h("#b9c3cb"), h("#a9b5bf"), h("#97a5b0"), h("#8793a0")], haze: [0.7, 0.55, 0.38, 0.22],
    sea: h("#cfdcdc"), sandTop: h("#e6d9bc"), sandBot: h("#d3c3a0"), rockTop: h("#b4b0a6"), rockBot: h("#9a968d"),
    groundLine: h("#8a7a60"), leg: h("#6e5a43"), legFar: h("#a89a85"), joint: h("#2a2420"),
    cloud: h("#ffffff"), horizonHaze: 0.7, sun: false, shimmer: false,
  },
  atmos: {
    skyTop: h("#7fb1d8"), skyTopHi: h("#2d4a6d"), skyBot: h("#f6dfbd"), skyBotHi: h("#9fc0dc"),
    mount: [h("#9fb0c4"), h("#8499b0"), h("#6b8199"), h("#566e86")], haze: [0.62, 0.48, 0.32, 0.18],
    sea: h("#5fa9b6"), sandTop: h("#ecd19c"), sandBot: h("#c79f62"), rockTop: h("#9d9488"), rockBot: h("#6f675d"),
    groundLine: h("#8a6a3c"), leg: h("#4a3b2a"), legFar: h("#8b7a63"), joint: h("#1f1810"),
    cloud: h("#fffaf0"), horizonHaze: 0.85, sun: true, shimmer: true,
  },
  retro: {
    skyTop: h("#06140a"), skyTopHi: h("#041008"), skyBot: h("#12361f"), skyBotHi: h("#0b2415"),
    mount: [h("#15452a"), h("#195230"), h("#1d6137"), h("#22703f")], haze: [0.2, 0.15, 0.1, 0.05],
    sea: h("#0d2d1a"), sandTop: h("#2e8a4d"), sandBot: h("#2e8a4d"), rockTop: h("#3aa65e"), rockBot: h("#3aa65e"),
    groundLine: h("#b8ffb8"), leg: h("#b8ffb8"), legFar: h("#4fa66f"), joint: h("#eaffea"),
    cloud: h("#2f8f55"), horizonHaze: 0, sun: false, shimmer: false,
  },
};
