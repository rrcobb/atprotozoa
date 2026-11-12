// Shared with TechyBen/playtreeone (src/presets.js); keep the two in step.
// Scene presets. Colours were picked by eye from the reference photos in
// /examples and from the "Misty Dawn" target screenshot. Each ramp runs
// dark -> light and is resampled to `rampSteps` entries (a PS1-style CLUT).
//
// Ramp rows used by the shaders:
//   leaf   - main foliage        leaf2 - lighter/yellower foliage (larch, shrubs)
//   accent - per-leaf colour swap (autumn leaves etc.), chance = `accent`
//   bark   - trunks, branches, twig pixels in leaf tiles
//   ground - terrain
//
// `forest` is the species mix (relative weights); `shrubs` scales undergrowth.

export const PRESETS = [
  {
    id: 'misty-dawn', name: 'Misty Dawn',
    sky: { top: '#7f84ab', horizon: '#c6c5de' },
    fog: { color: '#a9abc9', density: 0.03, base: 2, falloff: 0.08, noise: 0.35 },
    sun: { color: '#f3eef8', elevation: 14, azimuth: 6, strength: 0.75, godrays: 0.6 },
    ambient: '#8e92b4',
    ramps: {
      leaf:   ['#161d2b', '#243048', '#38475f', '#596a84'],
      leaf2:  ['#1a2530', '#2a3b46', '#43575f', '#677f80'],
      accent: ['#2a2638', '#423a52', '#5e566e', '#857c92'],
      bark:   ['#1b1b24', '#2c2c38', '#434250', '#615f6e'],
      ground: ['#20222d', '#2e313e', '#404454', '#575c6e'],
    },
    accent: 0.0,
    forest: { fir: 0.4, larch: 0.2, beech: 0.3, snag: 0.08 },
    shrubs: 1,
  },
  {
    id: 'golden-sunrise', name: 'Golden Sunrise',
    sky: { top: '#6f86ad', horizon: '#f2c992' },
    fog: { color: '#cfae86', density: 0.022, base: 1, falloff: 0.1, noise: 0.3 },
    sun: { color: '#ffd38a', elevation: 9, azimuth: -10, strength: 1.15, godrays: 1.0 },
    ambient: '#8a7c86',
    ramps: {
      leaf:   ['#161d14', '#2a3620', '#4b582b', '#7c7e40'],
      leaf2:  ['#1b271b', '#324828', '#546e37', '#8a9a4c'],
      accent: ['#3a2414', '#6e3e1a', '#a4642a', '#d89a48'],
      bark:   ['#1f160e', '#38291b', '#58432f', '#806446'],
      ground: ['#272216', '#403720', '#5f532d', '#88773f'],
    },
    accent: 0.08,
    forest: { beech: 0.35, larch: 0.25, oak: 0.2, fir: 0.2 },
    shrubs: 1,
  },
  {
    id: 'quiet-larch', name: 'Quiet Larch',
    sky: { top: '#d9dbd6', horizon: '#ecece8' },
    fog: { color: '#d3d5d0', density: 0.045, base: 3, falloff: 0.05, noise: 0.5 },
    sun: { color: '#fbf8ef', elevation: 34, azimuth: 25, strength: 0.45, godrays: 0.25 },
    ambient: '#a9ada5',
    ramps: {
      leaf:   ['#1d3121', '#2d4a2f', '#446e43', '#68945f'],
      leaf2:  ['#26402a', '#3a5f37', '#58884b', '#86b26f'],
      accent: ['#3a4a2a', '#5a6e3a', '#7c944c', '#a6bc66'],
      bark:   ['#1f1b18', '#342e28', '#4d453e', '#6e665e'],
      ground: ['#2c3828', '#3e4e34', '#546846', '#72865c'],
    },
    accent: 0.05,
    forest: { larch: 0.7, fir: 0.2, snag: 0.1 },
    shrubs: 1.4,
  },
  {
    id: 'autumn-haze', name: 'Autumn Haze',
    sky: { top: '#c3bec6', horizon: '#d6d1d4' },
    fog: { color: '#c3bbba', density: 0.038, base: 1, falloff: 0.06, noise: 0.4 },
    sun: { color: '#f6e2c8', elevation: 20, azimuth: 40, strength: 0.6, godrays: 0.35 },
    ambient: '#a49896',
    ramps: {
      leaf:   ['#382820', '#5c3927', '#86502e', '#b0763e'],
      leaf2:  ['#3c3822', '#5a542e', '#7c783e', '#a49c58'],
      accent: ['#5a2216', '#8a3420', '#b8502a', '#d8763a'],
      bark:   ['#2c2826', '#484340', '#6c6662', '#928c86'],
      ground: ['#473126', '#674634', '#876046', '#a67e5c'],
    },
    accent: 0.3,
    forest: { oak: 0.45, bare: 0.3, beech: 0.25 },
    shrubs: 1.2,
  },
  {
    id: 'laurel-gloom', name: 'Laurel Gloom',
    sky: { top: '#cbcbc0', horizon: '#dcdcd2' },
    fog: { color: '#a6aa9f', density: 0.05, base: 1, falloff: 0.05, noise: 0.45 },
    sun: { color: '#f2f0e4', elevation: 40, azimuth: -20, strength: 0.4, godrays: 0.25 },
    ambient: '#8a9084',
    ramps: {
      leaf:   ['#0e150f', '#172318', '#243425', '#394d37'],
      leaf2:  ['#1a281a', '#283c26', '#3c5836', '#58784c'],
      accent: ['#1a281a', '#283c26', '#3c5836', '#58784c'],
      bark:   ['#0f110f', '#1b1f1a', '#2b3129', '#41493d'],
      ground: ['#2a4020', '#3a562a', '#4e6e36', '#6a8a46'],
    },
    accent: 0.15,
    forest: { laurel: 0.85, snag: 0.15 },
    shrubs: 0.8,
  },
  {
    id: 'ember-oak', name: 'Ember Oak',
    sky: { top: '#d4d4d2', horizon: '#e6e6e4' },
    fog: { color: '#d8d8d6', density: 0.045, base: 2, falloff: 0.05, noise: 0.4 },
    sun: { color: '#fff4e6', elevation: 30, azimuth: 0, strength: 0.5, godrays: 0.3 },
    ambient: '#a9a9a6',
    ramps: {
      leaf:   ['#5a1b0c', '#8e2d12', '#c2451a', '#e8662c'],
      leaf2:  ['#5a1b0c', '#8e2d12', '#c2451a', '#e8662c'],
      accent: ['#6e2a10', '#a8461c', '#d8702c', '#f49a4c'],
      bark:   ['#211b17', '#382e25', '#534538', '#746456'],
      ground: ['#46413d', '#5f5751', '#79716a', '#948c85'],
    },
    accent: 0.2,
    forest: { bare: 0.6, oak: 0.2, beech: 0.2 },
    shrubs: 0.6,
  },
];

export const presetById = id => PRESETS.find(p => p.id === id) || PRESETS[0];
