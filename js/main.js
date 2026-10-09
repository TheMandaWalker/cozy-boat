import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createWater } from './water.js';
import { createEnvironment } from './environment.js';
import { createBoat } from './boat.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { heartTexture, easeOutCubic } from './util.js';

const canvas = document.getElementById('scene');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showFallback(message) {
  document.body.classList.add('no-webgl');
  const el = document.getElementById('fallback');
  if (el) el.textContent = message;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  showFallback("Ton navigateur ne peut pas afficher la scène 3D (WebGL indisponible).");
  throw err;
}

const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 2000);

const DEFAULT_VIEW = { pos: new THREE.Vector3(-11.5, 3.7, 14), target: new THREE.Vector3(0.3, 2.2, 0) };
const INTRO_FROM = new THREE.Vector3(-46, 22, 62);

// ----- Post-processing: soft bloom for the lanterns and windows -----
const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.6, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ----- Shared glowing material (bright enough to bloom) -----
const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.45).multiplyScalar(2.4) });

// ----- Scene pieces -----
const water = createWater();
scene.add(water.mesh);
const env = createEnvironment(scene);
const boat = createBoat(scene, glowMat);
const world = createWorld(scene, { glowMat });
const audio = createAudio();
const heartTex = heartTexture();

// ----- Camera controls -----
const controls = new OrbitControls(camera, canvas);
controls.target.copy(DEFAULT_VIEW.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.47;
controls.enablePan = false;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.3;
controls.enabled = false;

let intro = reduceMotion ? null : { start: null, duration: 4.5 };
const wallNow = () => performance.now() / 1000;
if (!intro) {
  camera.position.copy(DEFAULT_VIEW.pos);
  controls.enabled = true;
} else {
  camera.position.copy(INTRO_FROM);
}
camera.lookAt(DEFAULT_VIEW.target);

let resetAnim = null;
function resetView() {
  resetAnim = { from: camera.position.clone(), fromTarget: controls.target.clone(), t: 0 };
  controls.autoRotate = false;
}

controls.addEventListener('start', () => {
  controls.autoRotate = false;
});

// ----- State -----
const state = {
  hour: 19.4,
  rain: false,
  lanterns: true,
  sound: false,
  time: 0,
};

// ----- Interaction helpers -----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const hearts = [];

function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function seaHit() {
  return raycaster.ray.intersectPlane(seaPlane, hitPoint) ? hitPoint.clone() : null;
}

function spawnHearts(origin) {
  for (let i = 0; i < 4; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    sprite.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6));
    sprite.scale.setScalar(0.35 + Math.random() * 0.2);
    scene.add(sprite);
    hearts.push({ sprite, life: 0, drift: (Math.random() - 0.5) * 0.6, rise: 0.9 + Math.random() * 0.5 });
  }
}

function updateHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.life += dt;
    h.sprite.position.y += h.rise * dt;
    h.sprite.position.x += h.drift * dt;
    h.sprite.material.opacity = Math.max(0, 1 - h.life / 1.8);
    if (h.life > 1.8) {
      scene.remove(h.sprite);
      h.sprite.material.dispose();
      hearts.splice(i, 1);
    }
  }
}

const cat = boat.cat.group;

function handleClick(e, t) {
  setPointer(e);

  const catHits = raycaster.intersectObject(cat, true);
  if (catHits.length) {
    boat.hopCat();
    audio.meow();
    const p = new THREE.Vector3();
    cat.getWorldPosition(p);
    spawnHearts(p.add(new THREE.Vector3(0, 0.7, 0)));
    return;
  }

  if (state.lanterns) {
    const lanternHits = raycaster.intersectObjects(world.lanterns.map((l) => l.group), true);
    if (lanternHits.length) {
      const hit = lanternHits[0].object;
      const lantern = world.lanterns.find((l) => l.group.children.includes(hit));
      if (lantern) {
        const p = lantern.group.position;
        water.addRipple(p.x, p.z, t, 0.9);
        audio.chime(Math.floor(Math.random() * 7), 0.14);
        return;
      }
    }
  }

  const p = seaHit();
  if (p) {
    water.addRipple(p.x, p.z, t, 0.9);
    const dist = Math.hypot(p.x, p.z);
    audio.chime(Math.floor(dist) % 7, 0.12);
    if (dist < 4.5) boat.hopBoat();
  }
}

// Gentle trail of ripples while the pointer wanders over the sea.
let lastHoverRipple = 0;
function handleHover(e, t) {
  if (e.buttons || t - lastHoverRipple < 0.25) return;
  setPointer(e);
  const p = seaHit();
  if (!p) return;
  lastHoverRipple = t;
  water.addRipple(p.x, p.z, t, 0.18);
}

let press = null;
canvas.addEventListener('pointerdown', (e) => {
  press = { x: e.clientX, y: e.clientY, time: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  const quick = performance.now() - press.time < 450;
  press = null;
  if (moved < 6 && quick) handleClick(e, state.time);
});
canvas.addEventListener('pointermove', (e) => handleHover(e, state.time));

// ----- UI wiring -----
const $ = (id) => document.getElementById(id);
const hourInput = $('hour');
const hourLabel = $('hour-label');
const btnRain = $('btn-rain');
const btnLanterns = $('btn-lanterns');
const btnSound = $('btn-sound');
const btnReset = $('btn-reset');
const btnAuto = $('btn-auto');

function formatHour(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function setHour(h) {
  state.hour = h;
  hourInput.value = String(h);
  hourLabel.textContent = formatHour(h);
}
hourInput.addEventListener('input', () => setHour(parseFloat(hourInput.value)));
setHour(state.hour);

function setToggle(btn, on) {
  btn.setAttribute('aria-pressed', String(on));
}

btnRain.addEventListener('click', () => {
  state.rain = !state.rain;
  world.setRain(state.rain);
  setToggle(btnRain, state.rain);
});

btnLanterns.addEventListener('click', () => {
  state.lanterns = !state.lanterns;
  setToggle(btnLanterns, state.lanterns);
});

btnSound.addEventListener('click', () => {
  state.sound = !state.sound;
  if (audio.setEnabled(state.sound)) {
    setToggle(btnSound, state.sound);
    if (state.sound) audio.chime(4, 0.12);
  } else {
    state.sound = false;
  }
});

btnAuto.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  setToggle(btnAuto, controls.autoRotate);
});
setToggle(btnAuto, controls.autoRotate);

btnReset.addEventListener('click', resetView);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  switch (e.key.toLowerCase()) {
    case 'p': btnRain.click(); break;
    case 'l': btnLanterns.click(); break;
    case 's': btnSound.click(); break;
    case 'r': btnReset.click(); break;
    default: break;
  }
});

setToggle(btnLanterns, state.lanterns);
setToggle(btnRain, state.rain);
setToggle(btnSound, state.sound);

// ----- Resize -----
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ----- Main loop -----
const clock = new THREE.Clock();
let rainTimer = 0;
const introTimer = $('intro');
let introHidden = false;

function renderFrame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  const t = state.time;

  // Sky, sun, water and fog share one palette sampled from the slider.
  const palette = env.palette(state.hour);
  env.apply(palette, t);
  const u = water.uniforms;
  u.uLightDir.value.copy(palette.lightDir);
  u.uSunColor.value.copy(palette.sun);
  u.uSunVis.value = palette.sunVis;
  u.uDeep.value.copy(palette.deep);
  u.uSkyTop.value.copy(palette.top);
  u.uSkyHorizon.value.copy(palette.horizon);
  u.uFogColor.value.copy(palette.horizon);
  u.uNight.value = palette.night;

  water.syncUniforms(t);
  u.uCamPos.value.copy(camera.position);

  boat.update(t, dt, water, palette);
  world.update(t, dt, palette, water, pixelRatio);

  // Lantern toggle: switch off the mast light and floating lanterns.
  const lanternsOn = state.lanterns ? 1 : 0;
  boat.mast.lanternLight.intensity *= lanternsOn;
  boat.mast.halo.visible = state.lanterns;
  for (const l of world.lanterns) l.group.visible = state.lanterns;

  // Rain drops ripples at random spots near the boat.
  if (world.isRaining()) {
    rainTimer += dt;
    while (rainTimer > 0.18) {
      rainTimer -= 0.18;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 14;
      water.addRipple(Math.cos(a) * r, Math.sin(a) * r, t, 0.22);
      if (Math.random() < 0.3) audio.splash(0.03);
    }
  }

  updateHearts(dt);

  // Intro dolly, then the reset dolly, otherwise free orbit.
  if (intro) {
    intro.start ??= wallNow();
    const k = Math.min((wallNow() - intro.start) / intro.duration, 1);
    camera.position.lerpVectors(INTRO_FROM, DEFAULT_VIEW.pos, easeOutCubic(k));
    camera.lookAt(DEFAULT_VIEW.target);
    if (k >= 1) {
      intro = null;
      controls.enabled = true;
    }
  } else if (resetAnim) {
    resetAnim.t += dt / 1.2;
    const k = easeOutCubic(Math.min(resetAnim.t, 1));
    camera.position.lerpVectors(resetAnim.from, DEFAULT_VIEW.pos, k);
    controls.target.lerpVectors(resetAnim.fromTarget, DEFAULT_VIEW.target, k);
    if (resetAnim.t >= 1) resetAnim = null;
  }

  controls.update();

  if (!introHidden && introTimer && wallNow() > 1.2) {
    introTimer.classList.add('hide');
    introHidden = true;
  }

  composer.render();
}

renderer.setAnimationLoop(renderFrame);

// Expose a tiny hook for automated checks and debugging.
window.cozyBoat = { state, setHour, camera, controls, boat, water, world };
