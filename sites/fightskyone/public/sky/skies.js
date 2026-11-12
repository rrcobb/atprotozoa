// Skies: light, fog and land colours for flying, in the playtreeone preset
// format (ramps dark -> light, resampled into the shared CLUT texture) but
// tuned for a view from a kilometre or more up. Ramp rows on the land:
//   leaf   - forest            leaf2  - fields and meadows
//   accent - the odd field     bark   - rock and cliffs
//   ground - lowland soil, beaches
// `weather` picks the cloud set (clouds.js); fog density is per metre.

import * as THREE from './vendor/three.module.js';
import { U, buildRampTexture } from './ps1/materials.js';

export const SKIES = [
  {
    id: 'clear-morning', name: 'Clear Morning',
    sky: { top: '#4f79bf', horizon: '#c7d6ea' },
    fog: { color: '#b4c4d8', density: 0.00016, falloff: 0.0007 },
    sun: { color: '#fff0d4', elevation: 28, azimuth: 40, strength: 1.1, godrays: 0.5 },
    ambient: '#7d8ea8',
    water: ['#1d3550', '#3b6286', '#7fa3c0'],
    snow: '#e9eef4',
    ramps: {
      leaf:   ['#14251a', '#1f3a25', '#2f5233', '#456c44'],
      leaf2:  ['#2c4425', '#46632f', '#678a3f', '#93b25a'],
      accent: ['#4a4422', '#71662f', '#a08f45', '#cdb866'],
      bark:   ['#2a2826', '#46423d', '#6a655d', '#958e84'],
      ground: ['#3a3424', '#5a5034', '#857653', '#b9a87e'],
    },
    weather: 'scattered',
  },
  {
    id: 'golden-hour', name: 'Golden Hour',
    sky: { top: '#5b78a8', horizon: '#f0c590' },
    fog: { color: '#d8b48c', density: 0.00019, falloff: 0.0008 },
    sun: { color: '#ffcf86', elevation: 9, azimuth: -20, strength: 1.2, godrays: 1.0 },
    ambient: '#86788a',
    water: ['#2a2c3c', '#5a5464', '#c8a07a'],
    snow: '#f6dcc0',
    ramps: {
      leaf:   ['#161d14', '#2a3620', '#3f4c26', '#5f6a34'],
      leaf2:  ['#2b331c', '#4b5a2c', '#74813e', '#a8a65a'],
      accent: ['#3a2414', '#6e3e1a', '#a4642a', '#d89a48'],
      bark:   ['#2a2018', '#4a3a2c', '#735d47', '#a08468'],
      ground: ['#2f2818', '#4f4226', '#7c6a3c', '#b09a62'],
    },
    weather: 'broken',
  },
  {
    id: 'above-the-deck', name: 'Above the Deck',
    sky: { top: '#3864ac', horizon: '#d2deec' },
    fog: { color: '#c2d0e2', density: 0.00012, falloff: 0.0005 },
    sun: { color: '#fffaf0', elevation: 42, azimuth: 120, strength: 1.15, godrays: 0.35 },
    ambient: '#8a9ab6',
    water: ['#1a3048', '#335a7e', '#7aa0c2'],
    snow: '#f0f4f8',
    ramps: {
      leaf:   ['#13221c', '#1d3529', '#2b4c39', '#40664e'],
      leaf2:  ['#2a4030', '#415e42', '#5f8356', '#89ab74'],
      accent: ['#394a2e', '#566c3e', '#7a9450', '#a6bc6a'],
      bark:   ['#26282c', '#40434a', '#62666e', '#8e939a'],
      ground: ['#33362c', '#4e5240', '#717659', '#9ea27e'],
    },
    weather: 'undercast',
  },
  {
    id: 'autumn-haze', name: 'Autumn Haze',
    sky: { top: '#8a93a8', horizon: '#dcd2bf' },
    fog: { color: '#cbbfa8', density: 0.00024, falloff: 0.0009 },
    sun: { color: '#ffe2b0', elevation: 18, azimuth: 200, strength: 0.85, godrays: 0.6 },
    ambient: '#8f8a86',
    water: ['#2a3038', '#4e5a62', '#9aa29e'],
    snow: '#ece6dc',
    ramps: {
      leaf:   ['#2a1a12', '#4e2c16', '#7a4a1e', '#a8702e'],
      leaf2:  ['#3a3a1e', '#5e5a2a', '#88803c', '#b8ac5a'],
      accent: ['#3e1c12', '#6e2e18', '#a04a22', '#d07a3a'],
      bark:   ['#2a2622', '#45403a', '#6a6258', '#948a7c'],
      ground: ['#352c20', '#54462e', '#7c6a46', '#a8946a'],
    },
    weather: 'scattered',
  },
  {
    id: 'dusk-towers', name: 'Dusk Towers',
    sky: { top: '#2b3462', horizon: '#e08a6c' },
    fog: { color: '#a07a86', density: 0.0002, falloff: 0.0008 },
    sun: { color: '#ff9858', elevation: 4, azimuth: 250, strength: 0.95, godrays: 1.1 },
    ambient: '#5c5a80',
    water: ['#161a30', '#343a5a', '#c07a70'],
    snow: '#e8c6c8',
    ramps: {
      leaf:   ['#0e1416', '#18242a', '#26363c', '#3a4c50'],
      leaf2:  ['#1a2224', '#2c3a38', '#44564c', '#667862'],
      accent: ['#2e1e22', '#4e2e30', '#784640', '#a8664e'],
      bark:   ['#1a1820', '#2e2a36', '#48424e', '#6a6070'],
      ground: ['#201c22', '#363036', '#54484c', '#7a686a'],
    },
    weather: 'towers',
  },
];

export const skyById = id => SKIES.find(s => s.id === id) || SKIES[0];

const col = hex => new THREE.Color(hex);

// Set the shared uniforms (and the post pass) from a sky. Extra uniforms for
// the land and water live on `W` so the terrain material can share them.
export const W = {
  uWater: { value: [col('#000'), col('#000'), col('#000')] },
  uSnow: { value: col('#fff') },
};

export function applySky(sky, post) {
  U.uSkyTop.value.set(sky.sky.top);
  U.uSkyHorizon.value.set(sky.sky.horizon);
  U.uFogColor.value.set(sky.fog.color);
  U.uFogDensity.value = sky.fog.density;
  U.uFogBase.value = 0;
  U.uFogFalloff.value = sky.fog.falloff;
  U.uFogNoise.value = 0.15;
  U.uSunColor.value.set(sky.sun.color);
  U.uSunStrength.value = sky.sun.strength;
  U.uAmbient.value.set(sky.ambient);
  const el = THREE.MathUtils.degToRad(sky.sun.elevation), az = THREE.MathUtils.degToRad(sky.sun.azimuth);
  U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  U.uRampSteps.value = 6;
  U.uRampDither.value = 0.8;
  const old = U.uRamp.value;
  U.uRamp.value = buildRampTexture(sky, 6);
  if (old?.isDataTexture && old.image?.width > 1) old.dispose();
  sky.water.forEach((h, i) => W.uWater.value[i].set(h));
  W.uSnow.value.set(sky.snow);
  if (post) {
    post.uniforms.uGodray.value = sky.sun.godrays;
    post.uniforms.uSunColor.value.copy(U.uSunColor.value);
    post.uniforms.uFogDensity.value = sky.fog.density;
  }
}
