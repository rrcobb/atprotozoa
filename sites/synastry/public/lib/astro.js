// astro.js — tropical geocentric ecliptic positions of the Sun, Moon and the
// eight planets, plus Ascendant/Midheaven, from plain UTC date/time + geographic
// coordinates. No ephemeris file, no network call: everything below is the
// classic low-precision method (osculating Keplerian elements with a linear
// secular rate, two-body solve, heliocentric->geocentric conversion) popularized
// by Paul Schlyter's "How to compute planetary positions". Good to roughly
// arcminute-to-degree accuracy — plenty for a synastry toy, not an ephemeris
// replacement.

const DEG = Math.PI / 180;

function rev(deg) {
  return ((deg % 360) + 360) % 360;
}
function sinD(deg) { return Math.sin(deg * DEG); }
function cosD(deg) { return Math.cos(deg * DEG); }
function tanD(deg) { return Math.tan(deg * DEG); }
function deg(rad) { return rad / DEG; }

// JS Date -> Julian Day (exact; Unix epoch JD is 2440587.5).
export function toJulianDay(dateUTC) {
  return dateUTC.getTime() / 86400000 + 2440587.5;
}

// Orbital elements as { base, rate } pairs, rate is per day. "d" below is
// Schlyter's day-number: days since 1999-12-31T00:00 UT (JD 2451543.5).
const ELEMENTS = {
  sun: { N: [0, 0], i: [0, 0], w: [282.9404, 4.70935e-5], a: [1.0, 0], e: [0.016709, -1.151e-9], M: [356.047, 0.9856002585] },
  moon: { N: [125.1228, -0.0529538083], i: [5.1454, 0], w: [318.0634, 0.1643573223], a: [60.2666, 0], e: [0.0549, 0], M: [115.3654, 13.0649929509] },
  mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: [0.387098, 0], e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
  venus: { N: [76.6799, 2.4659e-5], i: [3.3946, 2.75e-8], w: [54.891, 1.38374e-5], a: [0.72333, 0], e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244] },
  mars: { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: [1.523688, 0], e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766] },
  jupiter: { N: [100.4542, 2.76854e-5], i: [1.303, -1.557e-7], w: [273.8777, 1.64505e-5], a: [5.20256, 0], e: [0.048498, 4.469e-9], M: [19.895, 0.0830853001] },
  saturn: { N: [113.6634, 2.3898e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: [9.55475, 0], e: [0.055546, -9.499e-9], M: [316.967, 0.0334442282] },
  uranus: { N: [74.0005, 1.3978e-5], i: [0.7733, 1.9e-8], w: [96.6612, 3.0565e-5], a: [19.18171, -1.55e-8], e: [0.047318, 7.45e-9], M: [142.5905, 0.011725806] },
  neptune: { N: [131.7806, 3.0173e-5], i: [1.77, -2.55e-7], w: [272.8461, -6.027e-6], a: [30.05826, 3.313e-8], e: [0.008606, 2.15e-9], M: [260.2471, 0.005995147] },
  pluto: { N: [110.30347, 0], i: [17.14175, 0], w: [113.76329, 0], a: [39.48168677, 0], e: [0.2488273, 0], M: [14.53, 0.003968789] },
};

function elementAt(pair, d) {
  return pair[0] + pair[1] * d;
}

// Solve Kepler's equation E - e*sin(E) = M (radians) by Newton's method.
function solveKepler(mDeg, e) {
  const m = rev(mDeg) * DEG;
  let E = m + e * Math.sin(m) * (1 + e * Math.cos(m));
  for (let iter = 0; iter < 8; iter++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

// Position of a body in its own orbit plane, converted to ecliptic
// rectangular coordinates. Returns AU-scale (or Earth-radii for the Moon) x/y/z.
function orbitXYZ(el, d) {
  const N = elementAt(el.N, d), i = elementAt(el.i, d), w = elementAt(el.w, d);
  const a = elementAt(el.a, d), e = elementAt(el.e, d), M = elementAt(el.M, d);
  const E = solveKepler(M, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const r = Math.sqrt(xv * xv + yv * yv);
  const v = deg(Math.atan2(yv, xv));
  const vw = v + w;
  const x = r * (cosD(N) * cosD(vw) - sinD(N) * sinD(vw) * cosD(i));
  const y = r * (sinD(N) * cosD(vw) + cosD(N) * sinD(vw) * cosD(i));
  const z = r * sinD(vw) * sinD(i);
  return { x, y, z, r };
}

// Moon perturbation terms (Schlyter's supplementary corrections) — the two-body
// solve alone can be off by several degrees at times; these bring it back to
// roughly arcminute accuracy, which matters because the Moon changes sign every
// ~2.5 days.
function moonPerturbation(d) {
  const Ms = rev(elementAt(ELEMENTS.sun.M, d));
  const Mm = rev(elementAt(ELEMENTS.moon.M, d));
  const Nm = rev(elementAt(ELEMENTS.moon.N, d));
  const wm = rev(elementAt(ELEMENTS.moon.w, d));
  const Ls = rev(Ms + elementAt(ELEMENTS.sun.w, d));
  const Lm = rev(Mm + wm + Nm);
  const D = Lm - Ls;
  const F = Lm - Nm;
  return (
    -1.274 * sinD(Mm - 2 * D) +
    0.658 * sinD(2 * D) -
    0.186 * sinD(Ms) -
    0.059 * sinD(2 * Mm - 2 * D) -
    0.057 * sinD(Mm - 2 * D + Ms) +
    0.053 * sinD(Mm + 2 * D) +
    0.046 * sinD(2 * D - Ms) +
    0.041 * sinD(Mm - Ms) -
    0.035 * sinD(D) -
    0.031 * sinD(Mm + Ms) -
    0.015 * sinD(2 * F - 2 * D) +
    0.011 * sinD(Mm - 4 * D)
  );
}

// Geocentric tropical ecliptic longitude (degrees, 0-360) for every body, given
// a JS Date representing the correct UTC instant.
export function planetPositions(dateUTC) {
  const jd = toJulianDay(dateUTC);
  const d = jd - 2451543.5;

  const sunXYZ = orbitXYZ(ELEMENTS.sun, d); // == Sun's geocentric position == -Earth's heliocentric position
  const out = {};

  out.sun = { lon: rev(deg(Math.atan2(sunXYZ.y, sunXYZ.x))) };

  const moonXYZ = orbitXYZ(ELEMENTS.moon, d); // already geocentric
  let moonLon = rev(deg(Math.atan2(moonXYZ.y, moonXYZ.x)) + moonPerturbation(d));
  out.moon = { lon: rev(moonLon) };

  for (const name of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
    const h = orbitXYZ(ELEMENTS[name], d);
    const xg = h.x + sunXYZ.x, yg = h.y + sunXYZ.y, zg = h.z + sunXYZ.z;
    out[name] = { lon: rev(deg(Math.atan2(yg, xg))), lat: deg(Math.atan2(zg, Math.sqrt(xg * xg + yg * yg))) };
  }

  return out;
}

// Greenwich Mean Sidereal Time in degrees (IAU 1982 expression).
function gmstDeg(dateUTC) {
  const jd = toJulianDay(dateUTC);
  const d = jd - 2451545.0;
  const T = d / 36525;
  return rev(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000);
}

// Mean obliquity of the ecliptic, degrees.
function obliquityDeg(dateUTC) {
  const jd = toJulianDay(dateUTC);
  const T = (jd - 2451545.0) / 36525;
  return 23.439291 - 0.0130042 * T;
}

// Ascendant + Midheaven ecliptic longitude, given UTC instant and geographic
// coordinates (degrees, east/north positive).
export function angles(dateUTC, latDeg, lonDeg) {
  const gmst = gmstDeg(dateUTC);
  const ramc = rev(gmst + lonDeg); // local sidereal time, i.e. RA of the meridian
  const eps = obliquityDeg(dateUTC);

  const mc = rev(deg(Math.atan2(sinD(ramc) * cosD(eps), cosD(ramc))));

  const y = -cosD(ramc);
  const x = sinD(eps) * tanD(latDeg) + cosD(eps) * sinD(ramc);
  const asc = rev(deg(Math.atan2(y, x)));

  return { asc, mc, ramc, obliquity: eps };
}

export const ZODIAC = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export function signOf(lonDeg) {
  const idx = Math.floor(rev(lonDeg) / 30);
  return { sign: ZODIAC[idx], index: idx, degreeInSign: rev(lonDeg) - idx * 30 };
}

// Whole-sign houses: house 1 = the sign containing the Ascendant, house 2 =
// the next sign, and so on. Simplest house system to compute correctly and
// the one with the least room for silent error — no Placidus-style iterative
// cusp solve.
export function wholeSignHouse(lonDeg, ascLonDeg) {
  const ascSign = Math.floor(rev(ascLonDeg) / 30);
  const bodySign = Math.floor(rev(lonDeg) / 30);
  return ((bodySign - ascSign + 12) % 12) + 1;
}
