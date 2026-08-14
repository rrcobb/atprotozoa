// Real orbital & physical data for the Sun, the 8 planets, Pluto, and the
// solar system's major, well-characterized moons.
//
// Sources (approximate, to the precision an interactive toy needs): NASA/JPL
// planetary & satellite fact sheets and the standard J2000 mean-orbital-
// element tables (Standish 1992-style) that most orbital-mechanics code uses.
// a/e/i/period/radius/obliquity are REAL measured values. Ω (node) and ω
// (argument of periapsis) for the planets are the standard J2000 mean values.
//
// What is NOT precise: mean anomaly at epoch (M0) for every body is a
// simplification (see README panel in index.html / the "about the model"
// copy) — this is a real two-body Keplerian propagator, not a live ephemeris,
// so exact event *dates* drift from reality; the geometry, frequency, and
// classification of eclipses is physically real.

export const AU_KM = 149597870.7;
export const SUN_RADIUS_KM = 696000;
export const EPOCH = Date.UTC(2000, 0, 1, 0, 0, 0); // J2000-ish reference, ms

// Planets: a in AU, i/Ω/ω/M0 in degrees, period in days, radius in km,
// obliquity = axial tilt to the planet's own orbital plane (degrees; a
// planet whose obliquity is near 90 has orbits/seasons that behave very
// differently from one near 0 — this is why Uranus and Pluto get "eclipse
// seasons" decades apart while Jupiter's moons eclipse constantly).
export const PLANETS = [
  { key: "mercury", name: "Mercury", a: 0.38709893, e: 0.20563069, i: 7.00487, Om: 48.331, w: 29.124, period: 87.9691, radius: 2439.7, obliquity: 0.03, color: "#b8b0a8", hasMoons: false },
  { key: "venus", name: "Venus", a: 0.72333199, e: 0.00677323, i: 3.39471, Om: 76.680, w: 54.884, period: 224.701, radius: 6051.8, obliquity: 177.4, color: "#e8cf9e", hasMoons: false },
  { key: "earth", name: "Earth", a: 1.00000011, e: 0.01671022, i: 0.00005, Om: 0.0, w: 102.937, period: 365.256, radius: 6371.0, obliquity: 23.44, color: "#5a9bd8", hasMoons: true },
  { key: "mars", name: "Mars", a: 1.52366231, e: 0.09341233, i: 1.85061, Om: 49.558, w: 286.502, period: 686.980, radius: 3389.5, obliquity: 25.19, color: "#c1553c", hasMoons: true },
  { key: "jupiter", name: "Jupiter", a: 5.20336301, e: 0.04839266, i: 1.30530, Om: 100.464, w: 273.867, period: 4332.59, radius: 69911, obliquity: 3.13, color: "#d8ae82", hasMoons: true },
  { key: "saturn", name: "Saturn", a: 9.53707032, e: 0.05415060, i: 2.48446, Om: 113.665, w: 339.392, period: 10759.22, radius: 58232, obliquity: 26.73, color: "#e3d0a3", hasMoons: true },
  { key: "uranus", name: "Uranus", a: 19.19126393, e: 0.04716771, i: 0.76986, Om: 74.006, w: 96.998, period: 30688.5, radius: 25362, obliquity: 97.77, color: "#9fd9e8", hasMoons: true },
  { key: "neptune", name: "Neptune", a: 30.06896348, e: 0.00858587, i: 1.76917, Om: 131.784, w: 272.846, period: 60195, radius: 24622, obliquity: 28.32, color: "#5a7de8", hasMoons: true },
  { key: "pluto", name: "Pluto", a: 39.48168677, e: 0.24880766, i: 17.14175, Om: 110.299, w: 113.834, period: 90560, radius: 1188.3, obliquity: 122.53, color: "#c9b8a8", hasMoons: true },
];

// Moons: a in km (around parent), period in days, radius in km.
// `i` is the moon's inclination used in the model — approximated as the
// parent planet's obliquity (since these are all regular, close-to-
// equatorial moons) plus the moon's own small real inclination-to-equator
// where that's a documented outlier (Iapetus, Triton). This is the whole
// ballgame for whether a moon's eclipses/transits happen year-round
// (low effective inclination: Jupiter's Galilean moons) or only in decades-
// apart "seasons" (high effective inclination: Uranus, Pluto/Charon) — a
// real, physically-grounded distinction, even though the exact node/season
// timing is illustrative, not pinned to real pole ephemerides.
// M0/Om/w for moons are arbitrary-but-fixed starting phases (spaced out so
// the sim doesn't open with every moon suspiciously mid-eclipse).
export const MOONS = [
  // Earth
  { key: "moon", name: "Moon", parent: "earth", a: 384400, e: 0.0549, period: 27.3217, radius: 1737.4, i: 5.145, Om: 125.08, w: 318.15, M0: 135.27, retrograde: false },
  // Mars
  { key: "phobos", name: "Phobos", parent: "mars", a: 9376, e: 0.0151, period: 0.31891, radius: 11.1, i: 26.04, Om: 0, w: 0, M0: 41, retrograde: false },
  { key: "deimos", name: "Deimos", parent: "mars", a: 23463.5, e: 0.00033, period: 1.26244, radius: 6.2, i: 25.93, Om: 0, w: 0, M0: 197, retrograde: false },
  // Jupiter (Galilean four)
  { key: "io", name: "Io", parent: "jupiter", a: 421800, e: 0.0041, period: 1.769138, radius: 1821.6, i: 3.16, Om: 0, w: 0, M0: 29, retrograde: false },
  { key: "europa", name: "Europa", parent: "jupiter", a: 671100, e: 0.0094, period: 3.551181, radius: 1560.8, i: 3.50, Om: 0, w: 0, M0: 133, retrograde: false },
  { key: "ganymede", name: "Ganymede", parent: "jupiter", a: 1070400, e: 0.0013, period: 7.15455, radius: 2634.1, i: 3.30, Om: 0, w: 0, M0: 241, retrograde: false },
  { key: "callisto", name: "Callisto", parent: "jupiter", a: 1882700, e: 0.0074, period: 16.6890, radius: 2410.3, i: 3.29, Om: 0, w: 0, M0: 337, retrograde: false },
  // Saturn (major mid moons + Titan + Iapetus)
  { key: "mimas", name: "Mimas", parent: "saturn", a: 185540, e: 0.0196, period: 0.942, radius: 198.2, i: 27.0, Om: 0, w: 0, M0: 17, retrograde: false },
  { key: "enceladus", name: "Enceladus", parent: "saturn", a: 238040, e: 0.0047, period: 1.370, radius: 252.1, i: 26.7, Om: 0, w: 0, M0: 91, retrograde: false },
  { key: "tethys", name: "Tethys", parent: "saturn", a: 294670, e: 0.0001, period: 1.888, radius: 531.1, i: 27.1, Om: 0, w: 0, M0: 163, retrograde: false },
  { key: "dione", name: "Dione", parent: "saturn", a: 377420, e: 0.0022, period: 2.737, radius: 561.4, i: 26.7, Om: 0, w: 0, M0: 239, retrograde: false },
  { key: "rhea", name: "Rhea", parent: "saturn", a: 527070, e: 0.0010, period: 4.518, radius: 763.8, i: 26.8, Om: 0, w: 0, M0: 311, retrograde: false },
  { key: "titan", name: "Titan", parent: "saturn", a: 1221870, e: 0.0288, period: 15.945, radius: 2574.7, i: 27.0, Om: 0, w: 0, M0: 53, retrograde: false },
  { key: "iapetus", name: "Iapetus", parent: "saturn", a: 3560820, e: 0.0286, period: 79.322, radius: 734.5, i: 42.2, Om: 0, w: 0, M0: 199, retrograde: false },
  // Uranus (near-polar system relative to the Sun — obliquity 97.77°)
  { key: "miranda", name: "Miranda", parent: "uranus", a: 129900, e: 0.0013, period: 1.413, radius: 235.8, i: 97.8, Om: 0, w: 0, M0: 7, retrograde: false },
  { key: "ariel", name: "Ariel", parent: "uranus", a: 190900, e: 0.0012, period: 2.520, radius: 578.9, i: 97.8, Om: 0, w: 0, M0: 101, retrograde: false },
  { key: "umbriel", name: "Umbriel", parent: "uranus", a: 266000, e: 0.0039, period: 4.144, radius: 584.7, i: 97.8, Om: 0, w: 0, M0: 179, retrograde: false },
  { key: "titania", name: "Titania", parent: "uranus", a: 436300, e: 0.0011, period: 8.706, radius: 788.9, i: 97.8, Om: 0, w: 0, M0: 251, retrograde: false },
  { key: "oberon", name: "Oberon", parent: "uranus", a: 583500, e: 0.0014, period: 13.463, radius: 761.4, i: 97.8, Om: 0, w: 0, M0: 313, retrograde: false },
  // Neptune (Triton: large, retrograde, steeply inclined)
  { key: "triton", name: "Triton", parent: "neptune", a: 354759, e: 0.00002, period: 5.877, radius: 1353.4, i: 130, Om: 0, w: 0, M0: 61, retrograde: true },
  // Pluto/Charon: true near-binary, coplanar with Pluto's high-obliquity equator
  { key: "charon", name: "Charon", parent: "pluto", a: 19591, e: 0.0002, period: 6.3872, radius: 606, i: 122.5, Om: 0, w: 0, M0: 5, retrograde: false },
];

export function planetByKey(key) {
  return PLANETS.find((p) => p.key === key);
}

export function moonsOf(key) {
  return MOONS.filter((m) => m.parent === key);
}
