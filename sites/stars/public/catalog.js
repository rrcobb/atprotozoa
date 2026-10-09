// Real stars: [name, RA hours, Dec degrees, distance ly, absolute magnitude, [r,g,b]].
// Values are rounded from memory of standard catalogs; good to a few percent.
const RED = [255, 150, 110], ORG = [255, 190, 130], YEL = [255, 240, 190], WHT = [235, 240, 255], BLU = [170, 200, 255];

export const STARS = [
  ["Proxima Centauri", 14.495, -62.68, 4.24, 15.5, RED],
  ["Alpha Centauri", 14.660, -60.83, 4.37, 4.1, YEL],
  ["Barnard's Star", 17.963, 4.69, 5.96, 13.2, RED],
  ["Wolf 359", 10.941, 7.01, 7.86, 16.6, RED],
  ["Lalande 21185", 11.055, 35.97, 8.3, 10.4, RED],
  ["Sirius", 6.752, -16.72, 8.6, 1.42, BLU],
  ["Ross 154", 18.83, -23.83, 9.7, 13.1, RED],
  ["Epsilon Eridani", 3.549, -9.46, 10.5, 6.2, ORG],
  ["Procyon", 7.655, 5.22, 11.5, 2.66, YEL],
  ["61 Cygni", 21.115, 38.75, 11.4, 7.5, ORG],
  ["Tau Ceti", 1.734, -15.94, 11.9, 5.7, YEL],
  ["Altair", 19.846, 8.87, 16.7, 2.2, WHT],
  ["Vega", 18.616, 38.78, 25, 0.58, BLU],
  ["Fomalhaut", 22.961, -29.62, 25, 1.74, WHT],
  ["Pollux", 7.755, 28.03, 34, 1.08, ORG],
  ["Arcturus", 14.261, 19.18, 36.7, -0.3, ORG],
  ["Capella", 5.278, 46.0, 42.9, -0.5, YEL],
  ["Castor", 7.577, 31.89, 51, 0.5, WHT],
  ["Aldebaran", 4.599, 16.51, 65, -0.64, ORG],
  ["Regulus", 10.139, 11.97, 79, -0.52, BLU],
  ["Alioth", 12.9, 55.96, 83, -0.2, WHT],
  ["Dubhe", 11.062, 61.75, 123, -1.1, ORG],
  ["Achernar", 1.629, -57.24, 139, -2.7, BLU],
  ["Bellatrix", 5.419, 6.35, 250, -2.8, BLU],
  ["Spica", 13.42, -11.16, 250, -3.55, BLU],
  ["Canopus", 6.399, -52.7, 310, -5.71, YEL],
  ["Acrux", 12.443, -63.1, 320, -4.2, BLU],
  ["Hadar", 14.064, -60.37, 390, -5.4, BLU],
  ["Polaris", 2.53, 89.26, 433, -3.6, YEL],
  ["Antares", 16.49, -26.43, 550, -5.28, RED],
  ["Betelgeuse", 5.919, 7.41, 550, -5.85, RED],
  ["Rigel", 5.242, -8.2, 860, -7.84, BLU],
  ["Mintaka", 5.533, -0.3, 1200, -5.0, BLU],
  ["Alnitak", 5.679, -1.94, 1260, -6.0, BLU],
  ["Alnilam", 5.603, -1.2, 2000, -6.9, BLU],
  ["Deneb", 20.69, 45.28, 2600, -8.4, WHT],
  ["Eta Carinae", 10.752, -59.68, 7500, -8.0, ORG],
];

// Fuzzy things with a physical size (ly): [name, RA h, Dec °, dist ly, size ly, [r,g,b]].
export const OBJECTS = [
  ["Pleiades", 3.79, 24.1, 444, 40, [150, 190, 255]],
  ["Orion Nebula", 5.588, -5.39, 1344, 24, [255, 140, 190]],
  ["Galactic centre (Sgr A*)", 17.761, -29.008, 26700, 6000, [255, 220, 160]],
  ["Andromeda Galaxy", 0.712, 41.27, 2537000, 220000, [200, 210, 255]],
];

export const radec = (raH, decDeg, d) => {
  const a = raH * Math.PI / 12, b = decDeg * Math.PI / 180;
  return [d * Math.cos(b) * Math.cos(a), d * Math.cos(b) * Math.sin(a), d * Math.sin(b)];
};
