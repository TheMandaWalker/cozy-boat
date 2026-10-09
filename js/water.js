import * as THREE from 'three';

// Shared wave description. The GLSL vertex shader and the JS helper below are
// both generated from / mirror these values, so the boat floats exactly on the
// surface the shader draws.
export const WAVES = [
  { dir: [1.0, 0.3], amp: 0.17, k: 0.85, speed: 1.05, phase: 0.0 },
  { dir: [-0.6, 1.0], amp: 0.1, k: 1.6, speed: 1.5, phase: 1.3 },
  { dir: [0.3, -1.0], amp: 0.055, k: 3.0, speed: 2.3, phase: 2.1 },
  { dir: [-1.0, -0.4], amp: 0.03, k: 5.8, speed: 3.4, phase: 0.7 },
];

export const RIPPLE_COUNT = 12;
export const RIPPLE_LIFE = 8.0;
const RIPPLE_SPEED = 3.0;
const RIPPLE_FREQ = 5.0;
const RIPPLE_WIDTH = 3.0;
const RIPPLE_DECAY = 0.45;

const normWaves = WAVES.map((w) => {
  const len = Math.hypot(w.dir[0], w.dir[1]);
  return { ...w, dx: w.dir[0] / len, dz: w.dir[1] / len };
});

// Height and gradient of the sea at (x, z). Mirrors the GLSL `surface()` below.
export function sampleSurface(x, z, t, ripples = []) {
  let h = 0;
  let gx = 0;
  let gz = 0;
  for (const w of normWaves) {
    const ph = (w.dx * x + w.dz * z) * w.k + t * w.speed + w.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    h += w.amp * s;
    gx += w.amp * w.k * w.dx * c;
    gz += w.amp * w.k * w.dz * c;
  }
  for (const r of ripples) {
    const age = t - r.t0;
    if (age < 0 || age > RIPPLE_LIFE) continue;
    const dx = x - r.x;
    const dz = z - r.z;
    const dist = Math.hypot(dx, dz);
    const x1 = dist - age * RIPPLE_SPEED;
    const env = Math.exp(-x1 * x1 * RIPPLE_WIDTH) * Math.exp(-age * RIPPLE_DECAY) * r.amp;
    const s = Math.sin(x1 * RIPPLE_FREQ);
    const c = Math.cos(x1 * RIPPLE_FREQ);
    h += env * s;
    const dh = env * RIPPLE_FREQ * c - 2 * RIPPLE_WIDTH * x1 * env * s;
    const inv = 1 / Math.max(dist, 0.001);
    gx += dh * dx * inv;
    gz += dh * dz * inv;
  }
  return { h, gx, gz };
}

const waveGLSL = normWaves
  .map(
    (w) => `{
    float ph = (${w.dx.toFixed(4)} * p.x + ${w.dz.toFixed(4)} * p.y) * ${w.k.toFixed(4)} + t * ${w.speed.toFixed(4)} + ${w.phase.toFixed(4)};
    float s = sin(ph); float c = cos(ph);
    h += ${w.amp.toFixed(4)} * s;
    g += ${(w.amp * w.k).toFixed(4)} * c * vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)});
  }`,
  )
  .join('\n');

const surfaceGLSL = /* glsl */ `
uniform float uTime;
uniform vec4 uRipples[${RIPPLE_COUNT}];

// Returns (height, d/dx, d/dz) of the sea at p.
vec3 surface(vec2 p, float t) {
  float h = 0.0;
  vec2 g = vec2(0.0);
  ${waveGLSL}
  for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > ${RIPPLE_LIFE.toFixed(2)}) continue;
    vec2 d = p - r.xy;
    float dist = length(d);
    float x1 = dist - age * ${RIPPLE_SPEED.toFixed(2)};
    float env = exp(-x1 * x1 * ${RIPPLE_WIDTH.toFixed(2)}) * exp(-age * ${RIPPLE_DECAY.toFixed(2)}) * r.w;
    float s = sin(x1 * ${RIPPLE_FREQ.toFixed(2)});
    float c = cos(x1 * ${RIPPLE_FREQ.toFixed(2)});
    h += env * s;
    float dh = env * ${RIPPLE_FREQ.toFixed(2)} * c - 2.0 * ${RIPPLE_WIDTH.toFixed(2)} * x1 * env * s;
    g += dh * d / max(dist, 0.001);
  }
  return vec3(h, g);
}
`;

const vertexShader = /* glsl */ `
${surfaceGLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;

void main() {
  vec3 p = position;
  vec3 s = surface(p.xz, uTime);
  p.y += s.x;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(vec3(-s.y, 1.0, -s.z));
  vHeight = s.x;
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
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 N = normalize(vNormal);

  // Fine ripple detail that the coarse vertex grid cannot represent.
  vec2 w = vWorld.xz;
  vec2 detail = vec2(
    sin(w.x * 3.1 + uTime * 1.3) + sin(w.y * 2.7 - uTime * 1.1 + w.x * 0.7),
    cos(w.y * 2.9 + uTime * 1.2) + cos(w.x * 2.3 + uTime * 0.9 - w.y * 0.5)
  ) * 0.018;
  N = normalize(N + vec3(detail.x, 0.0, detail.y));

  vec3 V = normalize(uCamPos - vWorld);
  vec3 R = reflect(-V, N);

  float ndv = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Cheap sky reflection: horizon colour blending into the zenith colour.
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.7, max(R.y, 0.0)));

  // Water body: deep colour lifted slightly where waves are high (light through crests).
  vec3 body = uDeep + vec3(0.02, 0.09, 0.08) * smoothstep(-0.1, 0.25, vHeight);
  vec3 col = mix(body, sky, clamp(fresnel * 0.8 + 0.02, 0.0, 1.0));

  // Sun / moon glitter.
  float ld = max(dot(R, uLightDir), 0.0);
  col += uSunColor * (pow(ld, 260.0) * 3.0 + pow(ld, 28.0) * 0.14) * uSunVis;

  // Sparkles from the detail normals.
  float sp = hash(floor(w * 42.0));
  col += uSunColor * step(0.997, sp) * pow(ld, 6.0) * 1.5 * uSunVis;

  // Foam on crests.
  float crest = smoothstep(0.24, 0.34, vHeight + detail.x * 0.03);
  float foamNoise = 0.6 + 0.4 * sin(w.x * 7.0 + w.y * 5.0 + uTime * 0.8);
  col = mix(col, vec3(0.92, 0.97, 1.0), crest * 0.22 * foamNoise);

  // Distance fog into the horizon colour.
  float dist = length(vWorld - uCamPos);
  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, f);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater() {
  const uniforms = {
    uTime: { value: 0 },
    uRipples: { value: Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCamPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
    uSunColor: { value: new THREE.Color('#fff2d6') },
    uSunVis: { value: 1 },
    uDeep: { value: new THREE.Color('#1d4a66') },
    uSkyTop: { value: new THREE.Color('#6fb8ff') },
    uSkyHorizon: { value: new THREE.Color('#ffd7b0') },
    uFogColor: { value: new THREE.Color('#ffd7b0') },
    uFogNear: { value: 60 },
    uFogFar: { value: 380 },
    uNight: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  const geometry = new THREE.PlaneGeometry(520, 520, 220, 220);
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

  return { mesh, uniforms, addRipple, ripples, syncUniforms, sampleAt: (x, z, t) => sampleSurface(x, z, t, ripples) };
}
