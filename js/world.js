import * as THREE from 'three';
import { radialTexture, seeded } from './util.js';
import { createArchipelago } from './archipelago.js';

const rand = seeded(42);
const range = (a, b) => a + (b - a) * rand();
const WHITE = new THREE.Color('#ffffff');
const NIGHT_CLOUD = new THREE.Color('#2b2f5a');
const cloudCol = new THREE.Color();
const CLOUD_WRAP = 320;

// Everything here that is "near the boat" (clouds, fireflies, rain, lanterns)
// is positioned relative to an anchor point that follows the boat. The sky
// island is a fixed landmark, and the islands come from the archipelago.
export function createWorld(scene, { glowMat }) {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  const archipelago = createArchipelago(scene, { glowMat });

  // ----- Floating sky island with a waterfall -----
  const sky = new THREE.Group();
  sky.position.set(136, 52, -102);
  // Rounded, lumpy underside instead of a sharp cone, so it reads as land and not a shard.
  const rockGeo = new THREE.IcosahedronGeometry(16, 2);
  const rockPos = rockGeo.attributes.position;
  for (let i = 0; i < rockPos.count; i++) {
    const x = rockPos.getX(i);
    const y = rockPos.getY(i);
    const z = rockPos.getZ(i);
    const bump = 1 + 0.12 * Math.sin(x * 0.5) * Math.cos(z * 0.4 + y * 0.2);
    rockPos.setXYZ(i, x * bump, y * bump * (y < 0 ? 0.75 : 0.2), z * bump);
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(
    rockGeo,
    new THREE.MeshStandardMaterial({ color: '#b7a4c4', flatShading: true, roughness: 0.95, emissive: '#2a2040', emissiveIntensity: 0.6 }),
  );
  rock.position.y = -8;
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

  // ----- Clouds: they drift past the boat, relative to its position -----
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
    world.add(group);
    clouds.push({ group, puffs, speed: range(0.8, 2.2), relX: range(-CLOUD_WRAP, CLOUD_WRAP), relZ: range(-260, -120), y: range(28, 60) });
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
  fireflies.frustumCulled = false;
  world.add(fireflies);

  // ----- Lanterns floating on the sea, circling the boat -----
  const lanterns = [];
  const lanternBodyGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.2).multiplyScalar(1.8) });
  const lanternHaloTex = radialTexture('rgba(255,200,120,1)');
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(lanternBodyGeo, lanternMat));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: lanternHaloTex, color: '#ffb36b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(2.0);
    halo.position.y = 0.45; // lift the glow so the sea does not slice it in half
    group.add(halo);
    group.userData.kind = 'lantern';
    world.add(group);
    lanterns.push({
      group,
      halo,
      radius: 5 + i * 0.9 + rand() * 0.6,
      phase: (i / 6) * Math.PI * 2 + rand() * 0.5,
      speed: 0.05 + rand() * 0.04,
      bob: rand() * 6,
    });
  }

  // ----- Rain: a box of drops that follows the boat -----
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

  // Per-frame update. `anchor` is the boat's position, `water` the sea helper,
  // `dt` seconds.
  function update(t, dt, palette, water, pixelRatio, anchor) {
    const night = palette.night;

    archipelago.update(t, anchor);

    // Clouds drift past and tint with the sky.
    cloudCol.copy(palette.horizon).lerp(WHITE, 0.55).lerp(NIGHT_CLOUD, night * 0.7);
    for (const c of clouds) {
      c.relX += c.speed * dt;
      if (c.relX > CLOUD_WRAP) c.relX -= CLOUD_WRAP * 2;
      c.group.position.set(anchor.x + c.relX, c.y, anchor.z + c.relZ);
      for (const p of c.puffs) p.material.color.copy(cloudCol);
    }

    sky.position.y = 55 + Math.sin(t * 0.25) * 1.2;
    sky.rotation.y = Math.sin(t * 0.05) * 0.05;
    fall.position.y = sky.position.y;
    fallMat.uniforms.uTime.value = t;
    fallMat.uniforms.uPixel.value = pixelRatio;

    fireflies.position.set(anchor.x, 0, anchor.z);
    flyMat.uniforms.uTime.value = t;
    flyMat.uniforms.uNight.value = night;
    flyMat.uniforms.uPixel.value = pixelRatio;

    // Lanterns drift in slow loops around the boat and bob on the waves.
    for (const l of lanterns) {
      const a = l.phase + t * l.speed;
      const x = anchor.x + Math.cos(a) * l.radius;
      const z = anchor.z + Math.sin(a) * l.radius * 0.8;
      const h = water.sampleAt(x, z, t).h;
      l.group.position.set(x, h + 0.1 + Math.sin(t * 1.3 + l.bob) * 0.05, z);
      l.group.rotation.y = a;
      l.halo.material.opacity = 0.2 + night * 0.8;
      l.halo.scale.setScalar(1.6 + night * 1.2);
    }

    // Rain fades in and out, and falls around the boat.
    rainLevel += (rainTarget - rainLevel) * (1 - Math.exp(-dt * 1.5));
    rain.position.set(anchor.x, 0, anchor.z);
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

  return {
    update,
    setRain,
    isRaining,
    lanterns,
    obstacles: (x, z, range) => archipelago.obstacles(x, z, range),
  };
}
