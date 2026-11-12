// fightskyone: the sky page. Behind bsky.app it's a quiet view of your jet
// cruising between the clouds with the people you follow flying about; in fly
// mode it takes the mouse and keyboard.
//
// Query options (set by the content script):
//   saver                 run as the background (no input until 'fightsky:fly')
//   px=240 fps=30         render height and frame cap (fly mode runs uncapped)
//   mins=12               minutes per sky
//   jets=1 me=<did|handle> posts from the people `me` follows fly as jets
//   demo=1                made-up demo posts instead (and separate storage)
//   parent=<origin>       the Bluesky page, for open/leave messages
//   sky=<id> fly=1        start on a given sky / straight in fly mode (testing)

import * as THREE from './vendor/three.module.js';
import { U } from './ps1/materials.js';
import { Pipeline } from './ps1/post.js';
import { makeSkyMaterial } from './ps1/materials.js';
import { makeShadowTarget, renderShadowMap } from './ps1/impostor.js';
import { SKIES, skyById, applySky } from './skies.js';
import { Land, heightAt, forestAt } from './terrain.js';
import { Clouds } from './clouds.js';
import { Particles } from './particles.js';
import { Traffic } from './traffic.js';
import { Player } from './flight.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { loadFollows, listen, demoFeed, avatarColour, xrpc } from './feed.js';

const q = new URLSearchParams(location.search);
const PX = +q.get('px') || 240;
const FPS = +q.get('fps') || 30;
const MINS = +q.get('mins') || 12;
const DEMO = q.get('demo') === '1';
const ME = (q.get('me') || '').trim();
const JETS = DEMO || (q.get('jets') === '1' && !!ME);
const PARENT = q.get('parent') || 'https://bsky.app';
const EMBEDDED = window.parent !== window;
const PREFIX = DEMO ? 'fightsky:demo:' : 'fightsky:';
let fly = false;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.autoClear = true;
const post = new Pipeline(renderer);
const scene = new THREE.Scene();
// Near plane at 6 m (the chase camera sits ~38 m back): far more depth
// precision at range, so clouds touching hills don't flicker.
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 6, 60000);
camera.layers.enable(1);

const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), makeSkyMaterial());
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

const land = new Land(renderer, scene);
const clouds = new Clouds(scene);
clouds.puffs.layers.enable(1);
clouds.deck.layers.enable(1);
const particles = new Particles(scene);

// Read posts are remembered (blue contrails, blue on the radar).
let marks = {};
try { marks = JSON.parse(localStorage.getItem(`${PREFIX}marks`)) || {}; } catch { /* none yet */ }
let marksTimer = 0;
function saveMark() {
  clearTimeout(marksTimer);
  marksTimer = setTimeout(() => {
    const keys = Object.keys(marks);
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete marks[k];
    try { localStorage.setItem(`${PREFIX}marks`, JSON.stringify(marks)); } catch { /* full */ }
  }, 1000);
}

const traffic = new Traffic(scene, particles, U, { marks, saveMark });
const player = new Player(scene, camera, particles);
let people = {};
const audio = new Audio();
audio.set({ on: q.get('sound') !== '0', vol: (+(q.get('vol') ?? 60)) / 100, music: (+(q.get('music') ?? 50)) / 100 });
const hud = new Hud({ onClose: () => audio.closeCard() });
// Your own music loop: chosen in the popup and kept only in this browser's
// extension storage (or ?midi=<url> when testing the page on its own).
const store = typeof chrome !== 'undefined' && chrome.storage?.local;
if (store) {
  store.get('midiLoop').then(r => audio.setLoop(r.midiLoop)).catch(() => {});
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && 'midiLoop' in ch) audio.setLoop(ch.midiLoop.newValue); });
}
if (q.get('midi') && window.parseMidi) {
  fetch(q.get('midi')).then(r => r.arrayBuffer()).then(b => audio.setLoop(window.parseMidi(b))).catch(e => console.warn('midi', e));
}
traffic.audio = audio;
const combat = new Combat(scene, camera, player, traffic, particles, audio, {
  onBurst: (j, at) => {
    const s = hud.project(at, camera) || { x: innerWidth / 2, y: innerHeight / 2 };
    hud.showCard(j.post, people, s);
  },
});

// Cloud shadows: an orthographic view from the sun over the land round the
// camera, of the clouds and jets only (layer 1).
const shadowRT = makeShadowTarget(1024);
const sunCam = new THREE.OrthographicCamera(-9000, 9000, 9000, -9000, 100, 60000);
sunCam.layers.set(1);
let shadowFrame = 0;
// The view is snapped to whole shadow texels in the sun's own frame, so cloud
// shadows stay put on the land instead of crawling as you fly.
const lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3(), centre = new THREE.Vector3();
function updateShadows() {
  const texel = 18000 / 1024, sun = U.uSunDir.value;
  sunCam.position.copy(sun).multiplyScalar(25000);
  sunCam.lookAt(0, 0, 0);
  sunCam.updateMatrixWorld();
  lightRight.setFromMatrixColumn(sunCam.matrixWorld, 0);
  lightUp.setFromMatrixColumn(sunCam.matrixWorld, 1);
  centre.set(camera.position.x, 800, camera.position.z);
  const r = centre.dot(lightRight), u = centre.dot(lightUp);
  centre.addScaledVector(lightRight, Math.round(r / texel) * texel - r).addScaledVector(lightUp, Math.round(u / texel) * texel - u);
  sunCam.position.copy(centre).addScaledVector(sun, 25000);
  sunCam.lookAt(centre);
  sunCam.updateMatrixWorld();
  sky.visible = false;
  renderShadowMap(renderer, scene, sunCam, shadowRT, 30);
  sky.visible = true;
}

// ---------------------------------------------------------------- skies
let skyIndex = Math.max(0, SKIES.findIndex(s => s.id === q.get('sky')));
if (!q.get('sky')) skyIndex = Math.floor(Math.random() * SKIES.length);
let sceneSeed = 1 + Math.floor(Math.random() * 1000);
let fade = 1, fadeDir = -1, nextScene = performance.now() / 1000 + MINS * 60;

function setSky(i) {
  const s = SKIES[i % SKIES.length];
  applySky(s, post);
  post.uniforms.uFogDensity.value = s.fog.density;
  clouds.setWeather(s.weather, sceneSeed);
  player.deck = clouds.weather.deck;
  if (player.deck && !fly) player.startSafe();
  if (land.variants.length) land.rebake(); else land.buildTrees(7);
}
setSky(skyIndex);

// ---------------------------------------------------------------- feed
let status = DEMO ? 'demo posts' : JETS ? 'finding who you follow…' : 'sign in to bsky.app (or set a handle in the popup) for jets';
if (DEMO) {
  const d = demoFeed(p => traffic.arrive(p));
  people = d.people;
  traffic.setPeople(d.people, d.colours);
  d.start();
} else if (JETS) {
  loadFollows(ME, PREFIX)
    .then(c => {
      people = c.people;
      traffic.setPeople(c.people);
      const dids = Object.keys(c.people);
      if (!dids.length) { status = 'you don’t follow anyone yet'; return; }
      listen(dids, p => traffic.arrive(p), s => { status = s; });
    })
    .catch(err => { status = `couldn’t load who you follow (${err.message})`; });
  // Your own jet in your own colour.
  xrpc('app.bsky.actor.getProfile', { actor: ME }).then(p => p.avatar && avatarColour(p.avatar)).then(rgb => rgb && player.setPaint(rgb)).catch(() => {});
}

// ---------------------------------------------------------------- size
let W = 0, H = 0;
function resize() {
  H = PX;
  W = Math.max(1, Math.round(PX * innerWidth / Math.max(1, innerHeight)));
  renderer.setSize(W, H, false);
  post.setSize(W, H);
  U.uRes.value.set(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  hud.resize();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- fly mode
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function setFly(on) {
  if (on === fly) return;
  fly = on;
  player.fly = on;
  player.keys.clear();
  player.aimOn = false;
  document.body.classList.toggle('fly', on);
  if (on) window.focus();
  else hud.closeCard(true);
  audio.setActive(on);
}

function leave() {
  setFly(false);
  if (EMBEDDED) parent.postMessage({ type: 'fightsky:leave' }, PARENT);
}

function openCard() {
  const p = hud.cardPost;
  if (!p || p.demo) return;
  const handle = people[p.did]?.[0] || '';
  setFly(false);
  if (EMBEDDED) parent.postMessage({ type: 'fightsky:open', did: p.did, rkey: p.rkey, handle }, PARENT);
  else open(`https://bsky.app/profile/${p.did}/post/${p.rkey}`, '_blank', 'noopener');
}

addEventListener('message', e => {
  if (e.source !== parent || e.source === window) return;
  if (e.data === 'fightsky:fly') setFly(true);
  else if (e.data === 'fightsky:calm') setFly(false);
  // Sound settings, live: { type: 'fightsky:sound', on, vol, music } (0-100).
  else if (e.data?.type === 'fightsky:sound') audio.set({ on: !!e.data.on, vol: e.data.vol / 100, music: e.data.music / 100 });
});

addEventListener('keydown', e => {
  if (!fly) return;
  audio.start();   // a gesture: sound may start
  if (e.code === 'Escape') { e.preventDefault(); if (hud.card) hud.closeCard(); else leave(); return; }
  if (e.code === 'Enter') { e.preventDefault(); openCard(); return; }
  if (e.code === 'KeyC') { hud.closeCard(); return; }
  if (e.code === 'Space') { e.preventDefault(); combat.fire(); return; }
  if (e.code === 'Tab') { e.preventDefault(); combat.cycle(); return; }
  if (KEYS.has(e.code)) { player.keys.add(e.code); e.preventDefault(); }
}, true);
addEventListener('keyup', e => player.keys.delete(e.code), true);
addEventListener('blur', () => player.keys.clear());

addEventListener('pointermove', e => {
  hud.mouse.x = e.clientX;
  hud.mouse.y = e.clientY;
  player.aim.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (fly) player.aimOn = true;
});
addEventListener('pointerdown', e => {
  if (fly) audio.start();
  if (!fly || e.button !== 0 || e.target.closest?.('.card')) return;
  player.aimOn = true;
  combat.fire();
});
// The cursor left the window: fly straight on.
document.addEventListener('pointerleave', () => { player.aimOn = false; });

// ---------------------------------------------------------------- loop
const clock0 = performance.now() / 1000;
let last = clock0, lastDraw = 0;
const whiteout = new THREE.Color();

function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;
  const cap = 1 / (fly ? 60 : FPS);
  if (cap && now - lastDraw < cap * 0.95) return;
  lastDraw = now;
  const dt = Math.min(0.1, now - last);
  last = now;
  U.uTime.value = now - clock0;

  // A new sky now and then, behind a fade (not while you're flying).
  if (!fly && now > nextScene && fadeDir === 0) fadeDir = 1;
  if (fadeDir) {
    fade = THREE.MathUtils.clamp(fade + fadeDir * dt / 3, 0, 1);
    if (fade >= 1 && fadeDir > 0) {
      skyIndex = (skyIndex + 1) % SKIES.length;
      sceneSeed++;
      setSky(skyIndex);
      fadeDir = -1;
      nextScene = now + MINS * 60;
    } else if (fade <= 0 && fadeDir < 0) fadeDir = 0;
  }

  player.update(dt, clouds);
  traffic.update(dt, player);
  const pc = player.craft;
  audio.update(dt, { throttle: player.throttle, speed: pc.speed, turn: pc.turn, bank: pc.bank, inside: clouds.inside, camera, jets: traffic.jets });
  combat.update(dt, fly);
  clouds.update(dt, camera.position);
  land.update(camera.position);
  particles.flush();

  if (shadowFrame++ % 2 === 0) updateShadows();

  // Fade: a scene change goes through the fog colour; inside a cloud the view
  // goes soft white-grey.
  const inside = Math.min(0.85, clouds.inside * 1.3);
  whiteout.copy(U.uAmbient.value).lerp(new THREE.Color(1, 1, 1), 0.55);
  const pu = post.uniforms;
  if (fade > inside) { pu.uFade.value = fade; pu.uFadeColor.value.copy(U.uFogColor.value); } else { pu.uFade.value = inside; pu.uFadeColor.value.copy(whiteout); }

  renderer.setRenderTarget(post.rt);
  renderer.render(scene, camera);
  post.composite(camera, U.uSunDir.value);

  hud.status = fly ? `${traffic.jets.length} jets · ${status} · point to lock · click to fire · W/S throttle · Tab next · Esc back` : '';
  hud.draw({ camera, player, traffic, combat, people, fly });
}
requestAnimationFrame(frame);

if (q.get('fly') === '1') setFly(true);
if (EMBEDDED) parent.postMessage({ type: 'fightsky:ready' }, PARENT);

// For testing from the devtools console.
window.fightsky = { audio, forestAt, THREE, U, scene, camera, renderer, player, traffic, combat, clouds, land, hud, particles, heightAt, setFly, setSky: i => setSky(skyIndex = i), status: () => status };
