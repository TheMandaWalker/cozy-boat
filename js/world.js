import * as THREE from 'three';
import { radialTexture, seeded } from './util.js';

const rand = seeded(42);
const range = (a, b) => a + (b - a) * rand();
const WHITE = new THREE.Color('#ffffff');
const NIGHT_CLOUD = new THREE.Color('#2b2f5a');
const cloudCol = new THREE.Color();

// Low-poly island with a lumpy top and instanced pine trees.
function createIsland(radius, treeCount, seedOffset = 0) {
  const group = new THREE.Group();
  const r = seeded(7 + seedOffset);

  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 0.9 + seedOffset) * 0.12 + Math.cos(v.z * 1.3) * 0.1 + r() * 0.08;
    v.multiplyScalar(1 + n);
    v.y *= v.y > 0 ? 0.35 : 0.9;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const palette = ['#7cae6a', '#6b9e5c', '#8fbf74'];
  const body = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: palette[seedOffset % palette.length], flatShading: true, roughness: 0.95 }),
  );
  body.position.y = -radius * 0.05;
  group.add(body);

  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: '#3f7a4f', flatShading: true, roughness: 0.9 }),
    treeCount,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius * 0.7;
    const h = 1.2 + r() * 1.4;
    p.set(Math.cos(a) * d, radius * 0.2 + h * 0.5, Math.sin(a) * d);
    s.set(0.45 + r() * 0.2, h, 0.45 + r() * 0.2);
    q.identity();
    m.compose(p, q, s);
    trees.setMatrixAt(i, m);
    color.setHSL(0.33 + (r() - 0.5) * 0.05, 0.4, 0.22 + r() * 0.08);
    trees.setColorAt(i, color);
  }
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  group.add(trees);

  return { group, radius };
}

export function createWorld(scene, { glowMat, water }) {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  // ----- Distant islands on the horizon -----
  const islands = [];
  const placements = [
    { x: -150, z: -170, r: 26, trees: 46 },
    { x: 120, z: -200, r: 18, trees: 28 },
    { x: 260, z: -60, r: 14, trees: 20 },
    { x: -260, z: -30, r: 16, trees: 24 },
  ];
  placements.forEach((p, i) => {
    const island = createIsland(p.r, p.trees, i);
    island.group.position.set(p.x, 0, p.z);
    world.add(island.group);
    islands.push(island);
  });

  // Lighthouse on the largest island, with a blinking lamp.
  const lighthouseGroup = new THREE.Group();
  const lighthouseBase = placements[0];
  lighthouseGroup.position.set(lighthouseBase.x + 8, lighthouseBase.r * 0.35, lighthouseBase.z + 6);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 9, 12),
    new THREE.MeshStandardMaterial({ color: '#f5efe6', roughness: 0.8 }),
  );
  tower.position.y = 4.5;
  lighthouseGroup.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.4, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: '#d9644f', roughness: 0.8 }),
  );
  band.position.y = 6;
  lighthouseGroup.add(band);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), glowMat);
  lamp.position.y = 9.4;
  lighthouseGroup.add(lamp);
  const lampHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,230,160,1)'), color: '#ffe3a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  lampHalo.position.y = 9.4;
  lampHalo.scale.setScalar(12);
  lighthouseGroup.add(lampHalo);
  world.add(lighthouseGroup);

  // Warm village lights on the big island.
  const lightsGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const villageGroup = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = 4 + rand() * 9;
    const cottage = new THREE.Mesh(lightsGeo, glowMat);
    cottage.position.set(
      lighthouseBase.x - 6 + Math.cos(a) * d,
      lighthouseBase.r * 0.45 + 0.2,
      lighthouseBase.z - 4 + Math.sin(a) * d,
    );
    villageGroup.add(cottage);
  }
  world.add(villageGroup);

  // ----- Floating sky island with a waterfall -----
  const sky = new THREE.Group();
  sky.position.set(136, 52, -102);
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(16, 26, 9),
    new THREE.MeshStandardMaterial({ color: '#b7a4c4', flatShading: true, roughness: 0.95, emissive: '#2a2040', emissiveIntensity: 0.6 }),
  );
  rock.rotation.x = Math.PI;
  rock.position.y = -13;
  sky.add(rock);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 15, 3, 14),
    new THREE.MeshStandardMaterial({ color: '#9cc97a', flatShading: true, roughness: 0.9 }),
  );
  sky.add(top);
  const skyTrees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: '#4f8a57', flatShading: true }),
    14,
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 10;
    const h = 1.8 + rand() * 1.8;
    m.compose(new THREE.Vector3(Math.cos(a) * d, 1.5 + h / 2, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(0.7, h, 0.7));
    skyTrees.setMatrixAt(i, m);
  }
  sky.add(skyTrees);
  const cottage = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.8, 2.2),
    new THREE.MeshStandardMaterial({ color: '#f6e7cc', roughness: 0.8 }),
  );
  cottage.position.set(-4, 3.4, 3);
  sky.add(cottage);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.4, 4), new THREE.MeshStandardMaterial({ color: '#b5573e' }));
  roof.position.set(-4, 5.2, 3);
  roof.rotation.y = Math.PI / 4;
  sky.add(roof);
  const skyWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glowMat);
  skyWindow.position.set(-4, 3.4, 4.12);
  sky.add(skyWindow);
  world.add(sky);

  // Waterfall: particles falling off the island's edge.
  const FALL = 260;
  const fallGeo = new THREE.BufferGeometry();
  const fallBase = new Float32Array(FALL * 3);
  const fallSeed = new Float32Array(FALL);
  for (let i = 0; i < FALL; i++) {
    const a = rand() * Math.PI * 2;
    fallBase[i * 3] = Math.cos(a) * 15;
    fallBase[i * 3 + 1] = 0;
    fallBase[i * 3 + 2] = Math.sin(a) * 15;
    fallSeed[i] = rand();
  }
  fallGeo.setAttribute('position', new THREE.BufferAttribute(fallBase, 3));
  fallGeo.setAttribute('seed', new THREE.BufferAttribute(fallSeed, 1));
  const fallMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPixel;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float fall = mod(uTime * (0.6 + seed * 0.4) + seed * 30.0, 30.0);
        p.y = -fall;
        p.x *= 1.0 + fall * 0.07;
        p.z *= 1.0 + fall * 0.07;
        vAlpha = (1.0 - fall / 30.0) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPixel * (1.6 + seed * 1.4) * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c)) * vAlpha;
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0), a * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fall = new THREE.Points(fallGeo, fallMat);
  fall.position.copy(sky.position);
  world.add(fall);

  // ----- Clouds -----
  const cloudTex = radialTexture('rgba(255,255,255,1)');
  const clouds = [];
  for (let c = 0; c < 11; c++) {
    const group = new THREE.Group();
    const puffs = [];
    const count = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85 });
      const s = new THREE.Sprite(mat);
      const w = 14 + rand() * 12;
      s.scale.set(w, w * 0.55, 1);
      s.position.set((i - count / 2) * 9 + rand() * 4, rand() * 3, rand() * 4);
      group.add(s);
      puffs.push(s);
    }
    group.position.set(range(-300, 300), range(28, 60), range(-260, -120));
    world.add(group);
    clouds.push({ group, puffs, speed: range(0.8, 2.2) });
  }

  // ----- Fireflies around the boat -----
  const FLY = 240;
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(FLY * 3);
  const flySeed = new Float32Array(FLY);
  for (let i = 0; i < FLY; i++) {
    flyPos[i * 3] = range(-9, 9);
    flyPos[i * 3 + 1] = range(0.4, 4.5);
    flyPos[i * 3 + 2] = range(-7, 7);
    flySeed[i] = rand();
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('seed', new THREE.BufferAttribute(flySeed, 1));
  const flyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uNight;
      uniform float uPixel;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.2 + seed * 0.3) + seed * 40.0;
        p += vec3(sin(t) * 1.4, sin(t * 1.3) * 0.5, cos(t * 0.8) * 1.4);
        float tw = 0.5 + 0.5 * sin(uTime * (1.5 + seed * 2.0) + seed * 20.0);
        vAlpha = tw * uNight;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPixel * (5.0 + tw * 4.0) * (14.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.5) * 2.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fireflies = new THREE.Points(flyGeo, flyMat);
  scene.add(fireflies);

  // ----- Lanterns floating on the sea -----
  const lanterns = [];
  const lanternBodyGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.2).multiplyScalar(1.8) });
  const lanternHaloTex = radialTexture('rgba(255,200,120,1)');
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(lanternBodyGeo, lanternMat);
    group.add(body);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: lanternHaloTex, color: '#ffb36b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(2.0);
    halo.position.y = 0.45; // lift the glow so the sea does not slice it in half
    group.add(halo);
    group.userData.kind = 'lantern';
    scene.add(group);
    lanterns.push({
      group,
      halo,
      radius: 5 + i * 0.9 + rand() * 0.6,
      phase: (i / 6) * Math.PI * 2 + rand() * 0.5,
      speed: 0.05 + rand() * 0.04,
      bob: rand() * 6,
    });
  }

  // ----- Rain -----
  const RAIN = 2400;
  const rainGeo = new THREE.BufferGeometry();
  const rainBase = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) {
    rainBase[i * 3] = range(-30, 30);
    rainBase[i * 3 + 1] = range(0, 26);
    rainBase[i * 3 + 2] = range(-30, 30);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainBase, 3));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixel;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * 16.0, 26.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPixel * 1.6 * (20.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.2, d) * 0.35 * uAlpha;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0), a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  world.add(rain);

  let rainLevel = 0;
  let rainTarget = 0;

  // Per-frame update. `palette` comes from the environment, `water` is the sea
  // helper from water.js, `dt` is seconds.
  function update(t, dt, palette, water, pixelRatio) {
    const night = palette.night;

    // Lighthouse lamp blinks slowly, and only shows well after dusk.
    lampHalo.material.opacity = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9), 10)) * (0.25 + night * 0.75);

    // Clouds drift and tint with the sky.
    cloudCol.copy(palette.horizon).lerp(WHITE, 0.55).lerp(NIGHT_CLOUD, night * 0.7);
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 320) c.group.position.x = -320;
      for (const p of c.puffs) p.material.color.copy(cloudCol);
    }

    sky.position.y = 55 + Math.sin(t * 0.25) * 1.2;
    sky.rotation.y = Math.sin(t * 0.05) * 0.05;
    fall.position.y = sky.position.y;
    fallMat.uniforms.uTime.value = t;
    fallMat.uniforms.uPixel.value = pixelRatio;

    flyMat.uniforms.uTime.value = t;
    flyMat.uniforms.uNight.value = night;
    flyMat.uniforms.uPixel.value = pixelRatio;

    // Lanterns drift in slow loops and bob on the waves.
    for (const l of lanterns) {
      const a = l.phase + t * l.speed;
      const x = Math.cos(a) * l.radius;
      const z = Math.sin(a) * l.radius * 0.8;
      const h = water.sampleAt(x, z, t).h;
      l.group.position.set(x, h + 0.1 + Math.sin(t * 1.3 + l.bob) * 0.05, z);
      l.group.rotation.y = a;
      l.halo.material.opacity = 0.2 + night * 0.8;
      l.halo.scale.setScalar(1.6 + night * 1.2);
    }

    // Rain fades in and out.
    rainLevel += (rainTarget - rainLevel) * (1 - Math.exp(-dt * 1.5));
    rainMat.uniforms.uAlpha.value = rainLevel;
    rainMat.uniforms.uTime.value = t;
    rainMat.uniforms.uPixel.value = pixelRatio;
    rain.visible = rainLevel > 0.01;
  }

  function setRain(on) {
    rainTarget = on ? 1 : 0;
  }
  function isRaining() {
    return rainTarget > 0.5;
  }

  return { update, setRain, isRaining, lanterns, islands, lighthouse: lighthouseGroup };
}
