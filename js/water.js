import * as THREE from 'three';
import { seeded } from './util.js';

// ---------------------------------------------------------------------------
// Sea model: a spectral sum of Gerstner waves.
//
// Each wave is a directional, choppy wave (points bunch at the crests, which
// is what makes foam appear). Wavelengths are log-spaced, the amplitude
// follows a k^-1 spectrum so every octave carries similar slope, and the
// directions spread around the wind. The Jacobian of the horizontal
// displacement tells us where crests fold over: that is the foam mask, the
// same idea Sea of Thieves uses on top of its FFT ocean.
//
// The same arrays drive the vertex shader and the JS helpers that keep the
// boat, bobber and lanterns on the surface, so nothing floats in mid-air.
// ---------------------------------------------------------------------------

export const NW = 36;
export const RIPPLE_COUNT = 12;
export const RIPPLE_LIFE = 8.0;
const RIPPLE_SPEED = 3.0;
const RIPPLE_FREQ = 5.0;
const RIPPLE_WIDTH = 3.0;
const RIPPLE_DECAY = 0.45;
const GRAVITY = 2.0;
const STEEPNESS = 0.9; // total steepness budget, keeps the sum from folding over itself
const ENERGY = 0.2; // sum of squared amplitudes, sets the overall wave height

function buildWaves() {
  const rnd = seeded(2024);
  const windAngle = Math.atan2(0.45, 1.0);
  const raw = [];
  const list = [];
  for (let i = 0; i < NW; i++) {
    const f = i / (NW - 1);
    const lambda = 5 * Math.pow(12, f) * (0.92 + 0.16 * rnd());
    const k = (Math.PI * 2) / lambda;
    // Short waves spread wider than the long swell that comes from the wind.
    const spread = (rnd() - 0.5) * 2.2 * (0.35 + 0.65 * f);
    const angle = windAngle + spread;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const omega = Math.sqrt(GRAVITY * k);
    const phase = rnd() * Math.PI * 2;
    raw.push(1 / k);
    list.push({ dx, dz, k, omega, phase });
  }
  const sumSq = raw.reduce((s, r) => s + r * r, 0);
  const scale = Math.sqrt(ENERGY / sumSq);
  return list.map((w, i) => {
    const a = raw[i] * scale;
    const Q = Math.min(1, STEEPNESS / (NW * w.k * a));
    return { ...w, a, Q };
  });
}

export const WAVES = buildWaves();

// ---------------------------------------------------------------------------
// JS mirror of the surface, used for buoyancy and anything that must sit on
// the water (boat, bobber, lanterns).
// ---------------------------------------------------------------------------

function rippleAt(x, z, t, ripples) {
  let h = 0;
  for (const r of ripples) {
    const age = t - r.t0;
    if (age < 0 || age > RIPPLE_LIFE) continue;
    const dx = x - r.x;
    const dz = z - r.z;
    const dist = Math.hypot(dx, dz);
    const x1 = dist - age * RIPPLE_SPEED;
    const env = Math.exp(-x1 * x1 * RIPPLE_WIDTH) * Math.exp(-age * RIPPLE_DECAY) * r.amp;
    h += env * Math.sin(x1 * RIPPLE_FREQ);
  }
  return h;
}

// Horizontal and vertical displacement of the Gerstner sum at rest point (x0, z0).
function gerstnerAt(x0, z0, t, sea) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (const w of WAVES) {
    const th = w.k * (w.dx * x0 + w.dz * z0) - w.omega * t + w.phase;
    const s = Math.sin(th);
    const c = Math.cos(th);
    const a = w.a * sea;
    dx += w.Q * a * w.dx * c;
    dz += w.Q * a * w.dz * c;
    dy += a * s;
  }
  return { dx, dy, dz };
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
#define NW ${NW}
#define RIPPLES ${RIPPLE_COUNT}
uniform float uTime;
uniform float uSea;
uniform vec4 uWaveA[NW];   // dir.xy, k, amplitude
uniform vec4 uWaveB[NW];   // steepness Q, omega, phase, unused
uniform vec4 uRipples[RIPPLES];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vJacobian;
varying float vHeight;
varying float vChop;

void main() {
  vec3 rest = position;
  vec2 x0 = rest.xz;
  float t = uTime;

  vec3 disp = vec3(0.0);
  // Tangents of the surface along rest x and rest z.
  vec3 Tx = vec3(1.0, 0.0, 0.0);
  vec3 Tz = vec3(0.0, 0.0, 1.0);
  float J11 = 1.0;
  float J12 = 0.0;
  float J22 = 1.0;

  for (int i = 0; i < NW; i++) {
    vec4 A = uWaveA[i];
    vec4 B = uWaveB[i];
    vec2 d = A.xy;
    float k = A.z;
    float a = A.w * uSea;
    float Q = B.x;
    float th = k * dot(d, x0) - B.y * t + B.z;
    float s = sin(th);
    float c = cos(th);
    float ka = k * a;

    disp.x += Q * a * d.x * c;
    disp.z += Q * a * d.y * c;
    disp.y += a * s;

    J11 -= Q * ka * d.x * d.x * s;
    J12 -= Q * ka * d.x * d.y * s;
    J22 -= Q * ka * d.y * d.y * s;
    Tx.y += ka * d.x * c;
    Tz.y += ka * d.y * c;
  }

  Tx.x = J11; Tx.z = J12;
  Tz.x = J12; Tz.z = J22;

  // Ripples from clicks and rain: vertical bumps with their gradient.
  float rh = 0.0;
  vec2 rg = vec2(0.0);
  for (int i = 0; i < RIPPLES; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > ${RIPPLE_LIFE.toFixed(2)}) continue;
    vec2 d = x0 - r.xy;
    float dist = length(d);
    float x1 = dist - age * ${RIPPLE_SPEED.toFixed(2)};
    float env = exp(-x1 * x1 * ${RIPPLE_WIDTH.toFixed(2)}) * exp(-age * ${RIPPLE_DECAY.toFixed(2)}) * r.w;
    float s = sin(x1 * ${RIPPLE_FREQ.toFixed(2)});
    float c = cos(x1 * ${RIPPLE_FREQ.toFixed(2)});
    rh += env * s;
    float dh = env * ${RIPPLE_FREQ.toFixed(2)} * c - 2.0 * ${RIPPLE_WIDTH.toFixed(2)} * x1 * env * s;
    rg += dh * d / max(dist, 0.001);
  }
  Tx.y += rg.x;
  Tz.y += rg.y;
  disp.y += rh;

  vec3 p = vec3(x0.x + disp.x, disp.y, x0.y + disp.z);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(cross(Tz, Tx));
  vJacobian = J11 * J22 - J12 * J12;
  vHeight = disp.y;
  vChop = length(disp.xz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform float uSunVis;
uniform vec3 uDeep;
uniform vec3 uSubsurface;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;
uniform float uSea;
uniform vec2 uBoatXZ;
uniform float uBoatYaw;
uniform float uFoamGain;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vJacobian;
varying float vHeight;
varying float vChop;

float h21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Sky as seen in a reflection. Matches the sky dome's palette.
vec3 skyColor(vec3 R) {
  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, max(R.y, 0.0)));
  float sd = max(dot(R, uLightDir), 0.0);
  col += uSunColor * (pow(sd, 40.0) * 0.6 + pow(sd, 600.0) * 4.0) * uSunVis;
  return col;
}

void main() {
  vec2 w = vWorld.xz;
  float dist = length(vWorld - uCamPos);

  // Micro normals from scrolling noise. Faded out far away to avoid shimmer.
  vec2 q = w * 1.6 + vec2(uTime * 0.35, uTime * 0.22);
  float e = 0.06;
  float n0 = fbm(q);
  float nx = fbm(q + vec2(e, 0.0)) - n0;
  float nz = fbm(q + vec2(0.0, e)) - n0;
  float fade = 1.0 - smoothstep(60.0, 220.0, dist);
  vec3 N = normalize(vNormal + vec3(nx, 0.0, nz) * 3.2 * fade);

  vec3 V = normalize(uCamPos - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 R = reflect(-V, N);
  float ndv = max(dot(N, V), 0.0);

  // Fresnel: grazing angles mirror the sky, looking down shows the body colour.
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Wave-peak mask, from height and from how much the crest is folding.
  float peak = smoothstep(0.12, 0.32, vHeight / max(0.02, 0.25 * uSea)) * (1.0 - smoothstep(0.7, 1.0, vJacobian));
  peak = clamp(peak, 0.0, 1.0);

  // Light transmitted through crests when looking towards the sun.
  float sss = pow(max(dot(-V, L), 0.0), 4.0) * peak;
  vec3 body = mix(uDeep, uSubsurface, clamp(peak * 0.55 + sss * 0.9, 0.0, 1.0));
  body *= 0.85 + 0.15 * fade;

  vec3 col = mix(body, skyColor(R), clamp(F * 0.9 + 0.03, 0.0, 1.0));

  // Sun glitter from the reflection lobe, plus sparkles from the micro normals.
  float ld = max(dot(R, L), 0.0);
  col += uSunColor * (pow(ld, 260.0) * 3.2 + pow(ld, 26.0) * 0.12) * uSunVis;
  float sp = h21(floor(w * 48.0));
  col += uSunColor * step(0.996, sp) * pow(ld, 5.0) * 1.2 * uSunVis * fade;

  // Crest foam: folded crests (low Jacobian) broken up by noise and blown by the wind.
  float breakup = fbm(w * 0.45 + vec2(uTime * 0.12, uTime * 0.05));
  float crestFoam = smoothstep(0.55, 0.2, vJacobian) * smoothstep(0.35, 0.65, breakup);
  crestFoam *= clamp(uSea * uFoamGain, 0.0, 1.0);

  // Contact foam around the boat hull: a capsule distance field, as a stand-in for the depth-buffer intersection foam.
  vec2 rel = w - uBoatXZ;
  float cs = cos(-uBoatYaw);
  float sn = sin(-uBoatYaw);
  vec2 local = vec2(cs * rel.x - sn * rel.y, sn * rel.x + cs * rel.y);
  float hx = clamp(local.x, -2.5, 2.5);
  float hull = length(local - vec2(hx, 0.0)) - 1.05;
  float contactNoise = fbm(w * 3.0 + vec2(uTime * 0.5, -uTime * 0.3));
  // A thin churned ring hugging the hull, broken up by noise, instead of a solid patch.
  float contact = smoothstep(0.32, 0.0, abs(hull + 0.12)) * smoothstep(0.42, 0.6, contactNoise);

  float foam = clamp(crestFoam + contact * 0.8, 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.75 + 0.25 * uSunVis), foam * 0.85);

  // Distance fog into the horizon colour.
  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, f);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater() {
  const waveA = WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.a));
  const waveB = WAVES.map((w) => new THREE.Vector4(w.Q, w.omega, w.phase, 0));

  const uniforms = {
    uTime: { value: 0 },
    uSea: { value: 0.8 },
    uWaveA: { value: waveA },
    uWaveB: { value: waveB },
    uRipples: { value: Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCamPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
    uSunColor: { value: new THREE.Color('#fff2d6') },
    uSunVis: { value: 1 },
    uDeep: { value: new THREE.Color('#1d4a66') },
    uSubsurface: { value: new THREE.Color('#2a8a8a') },
    uSkyTop: { value: new THREE.Color('#6fb8ff') },
    uSkyHorizon: { value: new THREE.Color('#ffd7b0') },
    uFogColor: { value: new THREE.Color('#ffd7b0') },
    uFogNear: { value: 60 },
    uFogFar: { value: 380 },
    uNight: { value: 0 },
    uBoatXZ: { value: new THREE.Vector2() },
    uBoatYaw: { value: 0 },
    uFoamGain: { value: 1.2 },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  // Dense grid so the shortest waves (5 m) are sampled properly; the far edge is hidden by the fog.
  const geometry = new THREE.PlaneGeometry(700, 700, 480, 480);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sea';

  // Ripple bookkeeping lives here so the shader and boat stay in sync.
  const ripples = [];

  function addRipple(x, z, t, amp = 0.6) {
    const r = { x, z, t0: t, amp };
    ripples.push(r);
    if (ripples.length > RIPPLE_COUNT) ripples.shift();
    return r;
  }

  function pruneRipples(t) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (t - ripples[i].t0 > RIPPLE_LIFE) ripples.splice(i, 1);
    }
  }

  function syncUniforms(t) {
    pruneRipples(t);
    const slots = uniforms.uRipples.value;
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      const r = ripples[i];
      if (r) slots[i].set(r.x, r.z, r.t0, r.amp);
      else slots[i].set(0, 0, 0, 0);
    }
    uniforms.uTime.value = t;
  }

  // Sea state from calm (0.3) to rough (1.1). Scales the swell amplitude.
  function setSeaState(v) {
    uniforms.uSea.value = v;
  }

  // Height of the water surface at a world point. Inverts the horizontal
  // displacement once so the result matches what the vertex shader draws.
  function sampleAt(x, z, t) {
    const sea = uniforms.uSea.value;
    let x0 = x;
    let z0 = z;
    for (let i = 0; i < 2; i++) {
      const d = gerstnerAt(x0, z0, t, sea);
      x0 = x - d.dx;
      z0 = z - d.dz;
    }
    const d = gerstnerAt(x0, z0, t, sea);
    return { h: d.dy + rippleAt(x0, z0, t, ripples) };
  }

  return {
    mesh,
    uniforms,
    addRipple,
    ripples,
    syncUniforms,
    setSeaState,
    sampleAt,
  };
}
