import * as THREE from 'three';

// Time-of-day keyframes. The slider moves through them and every colour,
// light and the sun direction is interpolated between the two neighbours.
const KEYS = [
  { hour: 0, elev: -35, azim: 200, top: '#0a0f2e', horizon: '#1e2350', sun: '#9fb4ff', sunVis: 0, night: 1, deep: '#05112a', light: 0.35, hemiSky: '#3a4a80', hemiGround: '#1a1a2a', hemi: 0.5 },
  { hour: 5.5, elev: -4, azim: 70, top: '#4a5fa8', horizon: '#ffa98a', sun: '#ffc9a0', sunVis: 0.35, night: 0.45, deep: '#1d3c5c', light: 0.8, hemiSky: '#a3a6e0', hemiGround: '#5a4a4a', hemi: 0.7 },
  { hour: 8.5, elev: 22, azim: 110, top: '#4f9fe8', horizon: '#bfe0ff', sun: '#fff3dc', sunVis: 1, night: 0, deep: '#1f5577', light: 2.2, hemiSky: '#bfe3ff', hemiGround: '#7b6d5d', hemi: 1.0 },
  { hour: 13, elev: 62, azim: 150, top: '#5aa8f2', horizon: '#cfeaff', sun: '#fff8e8', sunVis: 1, night: 0, deep: '#1b5a7a', light: 2.6, hemiSky: '#d6eeff', hemiGround: '#8a7a64', hemi: 1.1 },
  { hour: 17.5, elev: 14, azim: 245, top: '#5b72b8', horizon: '#ffb27a', sun: '#ffc27a', sunVis: 1, night: 0, deep: '#1d4766', light: 1.8, hemiSky: '#ffd6b0', hemiGround: '#7a5a4a', hemi: 0.9 },
  { hour: 19.5, elev: -2, azim: 275, top: '#2b2f6e', horizon: '#ff8fa3', sun: '#ffb08a', sunVis: 0.5, night: 0.45, deep: '#132a4a', light: 0.6, hemiSky: '#7a7ac4', hemiGround: '#3a3050', hemi: 0.7 },
  { hour: 21, elev: -14, azim: 290, top: '#141a48', horizon: '#3a3a7a', sun: '#9db0ff', sunVis: 0.1, night: 0.9, deep: '#0a1a38', light: 0.35, hemiSky: '#4a5a9a', hemiGround: '#1a1a30', hemi: 0.55 },
  { hour: 24, elev: -35, azim: 200, top: '#0a0f2e', horizon: '#1e2350', sun: '#9fb4ff', sunVis: 0, night: 1, deep: '#05112a', light: 0.35, hemiSky: '#3a4a80', hemiGround: '#1a1a2a', hemi: 0.5 },
];

const MOON_DIR = new THREE.Vector3(-0.45, 0.55, -0.7).normalize();

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep the dome at the far plane
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunVis;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);

  vec3 col = mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), 0.45));
  col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, d.y));

  // Sun glow and disc.
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.32 + pow(sd, 90.0) * 0.5 + pow(sd, 900.0) * 3.0) * uSunVis;

  // Moon, halo and stars at night.
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.6, 0.7, 1.0) * (pow(md, 900.0) * 2.0 + pow(md, 18.0) * 0.06) * uNight;

  vec3 cell = floor(d * 260.0);
  float s = hash(cell);
  float star = step(0.9972, s) * (0.6 + 0.4 * sin(uTime * 2.2 + s * 80.0));
  col += vec3(star) * uNight * smoothstep(0.02, 0.35, d.y);

  // Aurora curtains, a bit of fantasy in the high sky.
  float ang = atan(d.z, d.x);
  float wave = sin(ang * 3.0 + uTime * 0.09 + sin(ang * 5.0 + uTime * 0.05) * 1.6) * 0.5 + 0.5;
  float height = smoothstep(0.08, 0.35, d.y) * smoothstep(0.85, 0.45, d.y);
  vec3 aurCol = mix(vec3(0.25, 1.0, 0.65), vec3(0.75, 0.35, 1.0), 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.03));
  col += aurCol * pow(wave, 2.5) * height * uNight * 0.28;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createEnvironment(scene) {
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: MOON_DIR.clone() },
    uSunVis: { value: 1 },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunLight = new THREE.DirectionalLight('#ffffff', 1.5);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.8);
  scene.add(hemi);

  scene.fog = new THREE.Fog('#ffd7b0', 60, 420);

  const c = {
    top: new THREE.Color(),
    horizon: new THREE.Color(),
    sun: new THREE.Color(),
    deep: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
  };
  const sunDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();

  // Returns the palette for an hour in [0, 24).
  function palette(hour) {
    let i = 0;
    while (i < KEYS.length - 2 && hour > KEYS[i + 1].hour) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(hour, a.hour, b.hour);
    const L = THREE.MathUtils.lerp;
    const lerpColor = (name, ca, cb) => c[name].set(ca).lerp(new THREE.Color(cb), t);
    lerpColor('top', a.top, b.top);
    lerpColor('horizon', a.horizon, b.horizon);
    lerpColor('sun', a.sun, b.sun);
    lerpColor('deep', a.deep, b.deep);
    lerpColor('hemiSky', a.hemiSky, b.hemiSky);
    lerpColor('hemiGround', a.hemiGround, b.hemiGround);
    const elev = THREE.MathUtils.degToRad(L(a.elev, b.elev, t));
    const azim = THREE.MathUtils.degToRad(L(a.azim, b.azim, t));
    sunDir.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim));
    const night = L(a.night, b.night, t);
    lightDir.copy(sunDir).lerp(MOON_DIR, night).normalize();
    return {
      top: c.top,
      horizon: c.horizon,
      sun: c.sun,
      deep: c.deep,
      hemiSky: c.hemiSky,
      hemiGround: c.hemiGround,
      sunDir,
      lightDir,
      sunVis: L(a.sunVis, b.sunVis, t),
      night,
      light: L(a.light, b.light, t),
      hemi: L(a.hemi, b.hemi, t),
    };
  }

  // Pushes a palette into the sky, sun, hemisphere light and fog.
  function apply(p, time) {
    skyUniforms.uTop.value.copy(p.top);
    skyUniforms.uHorizon.value.copy(p.horizon);
    skyUniforms.uSunColor.value.copy(p.sun);
    skyUniforms.uSunDir.value.copy(p.sunDir);
    skyUniforms.uSunVis.value = p.sunVis;
    skyUniforms.uNight.value = p.night;
    skyUniforms.uTime.value = time;

    sunLight.color.copy(p.sun);
    sunLight.intensity = p.light;
    sunLight.position.copy(p.lightDir).multiplyScalar(40);

    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    hemi.intensity = p.hemi;

    scene.fog.color.copy(p.horizon);
  }

  return { sky, sunLight, hemi, palette, apply, skyUniforms };
}
