import * as THREE from 'three';
import { radialTexture, woodTexture } from './util.js';

const HULL_L = 5.6;
const HULL_BEAM = 1.0;
const TERRACOTTA = new THREE.Color('#c96f4f');
const CREAM = new THREE.Color('#f4e6c8');

// Hull top and bottom height at a given station (u in 0..1 along the length).
function hullTop(edge) {
  return 0.5 + 0.35 * Math.pow(edge, 2.2);
}
function hullBottom(edge) {
  return -0.45 + 0.55 * Math.pow(edge, 3);
}
function hullHalfWidth(u) {
  return HULL_BEAM * Math.pow(Math.sin(Math.PI * u), 0.6);
}

// Lofts a double-ended hull: cross-sections swept along the length.
function createHull() {
  const N = 48;
  const M = 24;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = (u - 0.5) * HULL_L;
    const edge = Math.abs(u - 0.5) * 2;
    const w = hullHalfWidth(u);
    const top = hullTop(edge);
    const bottom = hullBottom(edge);
    for (let j = 0; j <= M; j++) {
      const s = (j / M) * 2 - 1;
      const z = s * w;
      const hgt = Math.pow(Math.abs(s), 1.7);
      const y = bottom + (top - bottom) * hgt;
      const c = hgt > 0.82 ? CREAM : TERRACOTTA;
      positions.push(x, y, z);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = (i + 1) * (M + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide }),
  );
}

// Flat deck laid across the top of the hull.
function createDeck(wood) {
  const N = 40;
  const M = 6;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = (u - 0.5) * HULL_L;
    const edge = Math.abs(u - 0.5) * 2;
    const w = hullHalfWidth(u) * 0.9;
    const y = hullTop(edge) - 0.06;
    for (let j = 0; j <= M; j++) {
      const s = (j / M) * 2 - 1;
      positions.push(x, y, s * w);
      uvs.push(u * 3, s * 1.2);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = (i + 1) * (M + 1) + j;
      // Reversed winding so the deck faces up.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }));
}

function createCabin(glowMat, wood) {
  const group = new THREE.Group();
  group.position.set(-1.75, 0.6, 0);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 0.95),
    new THREE.MeshStandardMaterial({ color: '#f6e7cc', roughness: 0.8 }),
  );
  walls.position.y = 0.45;
  group.add(walls);

  // Gable roof built from an extruded triangle, overhanging a little.
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, 0);
  shape.lineTo(0.7, 0);
  shape.lineTo(0, 0.55);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.45, bevelEnabled: false });
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.center();
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#b5573e', roughness: 0.7 }));
  roof.position.y = 0.9 + 0.275;
  group.add(roof);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.5, 0.18),
    new THREE.MeshStandardMaterial({ color: '#8c5a48', roughness: 0.9 }),
  );
  chimney.position.set(0.3, 1.35, -0.2);
  group.add(chimney);

  // Two warm windows and a glowing door.
  const windowGeo = new THREE.PlaneGeometry(0.34, 0.3);
  for (const side of [1, -1]) {
    const win = new THREE.Mesh(windowGeo, glowMat);
    win.position.set(0.1, 0.55, side * 0.48);
    if (side < 0) win.rotation.y = Math.PI;
    group.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.55), glowMat);
  door.position.set(0.61, 0.34, 0);
  door.rotation.y = Math.PI / 2;
  group.add(door);

  // Little wooden step in front of the door.
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.5), new THREE.MeshStandardMaterial({ map: wood }));
  step.position.set(0.72, 0.02, 0);
  group.add(step);

  return { group, smokeOrigin: new THREE.Vector3(0.3, 1.65, -0.2) };
}

function createMast(glowMat) {
  const group = new THREE.Group();
  group.position.set(0.4, 0.6, 0);
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4e35', roughness: 0.7 });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.2, 10), wood);
  mast.position.y = 1.6;
  group.add(mast);

  // Boom sits above the cabin roof, running backwards over the stern.
  const boomLen = 1.9;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, boomLen, 8), wood);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-boomLen / 2, 1.1, 0);
  group.add(boom);

  // Triangular sail, its vertices are animated every frame.
  const SEG = 14;
  const sailPositions = new Float32Array((SEG + 1) * (SEG + 1) * 3);
  const sailIdx = [];
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = (i + 1) * (SEG + 1) + j;
      sailIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.BufferAttribute(sailPositions, 3));
  sailGeo.setIndex(sailIdx);
  const sailMat = new THREE.MeshStandardMaterial({
    color: '#fff4e3',
    emissive: '#ffb27a',
    emissiveIntensity: 0.05,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const sail = new THREE.Mesh(sailGeo, sailMat);
  group.add(sail);

  // Lantern on top of the mast.
  const lantern = new THREE.Group();
  lantern.position.y = 3.25;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), glowMat);
  lantern.add(body);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 8), wood);
  cap.position.y = 0.16;
  lantern.add(cap);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,190,110,1)'), color: '#ffc27a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.scale.setScalar(1.8);
  lantern.add(halo);
  group.add(lantern);

  const lanternLight = new THREE.PointLight('#ffc27a', 1, 14, 1.6);
  lanternLight.position.set(0, 0.05, 0);
  lantern.add(lanternLight);

  // Sail coordinates are in the mast group's space, so the mast sits at x = 0 here.
  const sailBase = { mastX: 0, boomLen, topY: 2.85, boomY: 1.1 };
  return { group, sail, sailGeo, sailBase, lantern, halo, lanternLight };
}

function updateSail(geo, base, t) {
  const pos = geo.attributes.position;
  const SEG = Math.round(Math.sqrt(pos.count)) - 1;
  const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.0);
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    for (let j = 0; j <= SEG; j++) {
      const v = j / SEG;
      const x = base.mastX - u * base.boomLen * (1 - v);
      const y = base.boomY + v * (base.topY - base.boomY);
      // Belly of the sail, pushed by the wind.
      const bulge = Math.sin(Math.PI * u) * (0.35 + 0.25 * gust) * (1 - v * 0.4);
      const flutter = Math.sin(t * 2.2 + v * 4 + u * 2) * 0.04;
      const idx = (i * (SEG + 1) + j) * 3;
      pos.array[idx] = x;
      pos.array[idx + 1] = y;
      pos.array[idx + 2] = -bulge + flutter;
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// Bunting strung from the mast top to the bow.
function createBunting(from, to) {
  const group = new THREE.Group();
  const COUNT = 9;
  const colors = ['#ff8f7a', '#ffd27a', '#8fd4b3', '#9ec5ff', '#ffb3d1'];
  const points = [];
  for (let i = 0; i <= COUNT; i++) {
    const t = i / COUNT;
    const p = from.clone().lerp(to, t);
    p.y -= Math.sin(Math.PI * t) * 0.35;
    points.push(p);
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#5b3a2a' }),
  );
  group.add(line);

  const flags = [];
  for (let i = 0; i < COUNT; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.12;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, -0.22, 0], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    group.add(mesh);
    flags.push(mesh);
  }
  return { group, flags };
}

// A small tabby cat sitting at the bow. Clickable.
function createCat() {
  const group = new THREE.Group();
  group.position.set(1.95, 0.64, 0);
  group.userData.kind = 'cat';

  const fur = new THREE.MeshStandardMaterial({ color: '#e59a5c', roughness: 0.95 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff1e0', roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a1d1a', roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), fur);
  body.scale.set(0.9, 1.2, 0.95);
  body.position.y = 0.3;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), cream);
  chest.position.set(0.12, 0.3, 0);
  chest.scale.set(0.8, 1.2, 1);
  group.add(chest);

  const head = new THREE.Group();
  head.position.set(0.08, 0.72, 0);
  group.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), fur);
  head.add(skull);
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 3), fur);
    ear.position.set(-0.02, 0.2, side * 0.1);
    ear.rotation.z = -0.15;
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
    eye.position.set(0.17, 0.02, side * 0.075);
    eye.scale.set(0.6, 1.4, 1);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: '#f08a8a' }));
  nose.position.set(0.19, -0.04, 0);
  head.add(nose);

  // Tail on a pivot so it can sway.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.2, 0.12, 0);
  group.add(tailPivot);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.2, 0.02, 0.02),
    new THREE.Vector3(-0.35, 0.18, 0.04),
    new THREE.Vector3(-0.3, 0.38, 0.02),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.05, 8), fur);
  tailPivot.add(tail);

  return { group, head, tailPivot };
}

function createRodAndBobber() {
  const rodMat = new THREE.MeshStandardMaterial({ color: '#8c5a3c', roughness: 0.7 });
  const pivot = new THREE.Group();
  pivot.position.set(-0.5, 0.5, 0.95);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.6, 8), rodMat);
  rod.position.y = 1.3;
  pivot.add(rod);
  pivot.rotation.x = 0.9;
  const tipLocal = new THREE.Vector3(0, 2.6, 0);

  const bobber = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#ff6b6b', roughness: 0.5 }),
  );
  bobber.add(ball);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#fff6e8', roughness: 0.5 }),
  );
  tip.position.y = 0.07;
  bobber.add(tip);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f4efe6', transparent: true, opacity: 0.8 }));
  return { pivot, bobber, line, tipLocal };
}

// Builds the whole boat. Returns handles used by the main loop.
export function createBoat(scene, glowMat) {
  const wood = woodTexture();
  const boat = new THREE.Group();
  boat.rotation.order = 'YXZ';

  const hull = createHull();
  boat.add(hull);
  boat.add(createDeck(wood));

  const cabin = createCabin(glowMat, wood);
  boat.add(cabin.group);

  const mast = createMast(glowMat);
  boat.add(mast.group);

  const bunting = createBunting(new THREE.Vector3(0.4, 3.7, 0), new THREE.Vector3(2.5, 0.85, 0));
  boat.add(bunting.group);

  const cat = createCat();
  boat.add(cat.group);

  const rod = createRodAndBobber();
  boat.add(rod.pivot);

  // Chimney smoke, drawn as soft sprites that rise and fade.
  const smokeTex = radialTexture('rgba(255,250,245,0.9)');
  const smoke = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.age = i * 0.45;
    smoke.push(s);
    scene.add(s);
  }

  // The bobber lives in world space so it can sit on the moving water.
  const bobberWorld = rod.bobber;
  const lineWorld = rod.line;
  scene.add(bobberWorld);
  scene.add(lineWorld);

  scene.add(boat);

  const state = {
    hopY: 0,
    hopV: 0,
    catY: 0,
    catV: 0,
    roll: 0,
    pitch: 0,
  };

  // Advance the spring and compute the boat's pose on the sea.
  function update(t, dt, water, palette) {
    // Gentle gust sways the sail, cat tail and bunting.
    updateSail(mast.sailGeo, mast.sailBase, t);
    cat.tailPivot.rotation.z = Math.sin(t * 2.1) * 0.25;
    cat.head.rotation.z = Math.sin(t * 0.9) * 0.05;
    bunting.flags.forEach((f, i) => {
      f.rotation.y = Math.sin(t * 2 + i * 0.7) * 0.35;
    });

    // Spring for hop reactions.
    const k = 60;
    const c = 6;
    state.hopV += (-k * state.hopY - c * state.hopV) * dt;
    state.hopY += state.hopV * dt;
    state.catV += (-80 * state.catY - 7 * state.catV) * dt;
    state.catY += state.catV * dt;
    cat.group.position.y = 0.64 + state.catY;

    // Sit on the waves: average height plus slope-driven pitch and roll.
    const center = water.sampleAt(0, 0, t);
    const bowS = water.sampleAt(2.0, 0, t);
    const sternS = water.sampleAt(-2.0, 0, t);
    const sideS = water.sampleAt(0, 1.0, t);
    const targetRoll = -(sideS.h - center.h) * 0.9;
    const targetPitch = (bowS.h - sternS.h) * 0.5;
    const ease = 1 - Math.exp(-dt * 5);
    state.roll += (targetRoll - state.roll) * ease;
    state.pitch += (targetPitch - state.pitch) * ease;

    boat.position.set(0, center.h - 0.12 + state.hopY * 0.5, 0);
    boat.rotation.set(state.roll, Math.sin(t * 0.13) * 0.05, state.pitch);
    boat.updateMatrixWorld(true);

    // Lantern glow follows the palette's night factor.
    const night = palette.night;
    mast.lanternLight.intensity = 0.8 + night * 9;
    mast.halo.material.opacity = 0.35 + night * 0.5;
    mast.sail.material.emissiveIntensity = 0.03 + night * 0.12;

    // Fishing line and bobber.
    const bobWorld = boat.localToWorld(new THREE.Vector3(-0.5, 0, 3.4));
    const bobH = water.sampleAt(bobWorld.x, bobWorld.z, t).h;
    bobberWorld.position.set(bobWorld.x, bobH + Math.sin(t * 2.4) * 0.03, bobWorld.z);
    bobberWorld.rotation.y = t;
    const tipWorld = rod.tipLocal.clone().applyMatrix4(rod.pivot.matrixWorld);
    lineWorld.geometry.setFromPoints([tipWorld, bobberWorld.position.clone().add(new THREE.Vector3(0, 0.1, 0))]);

    // Smoke puffs.
    const origin = cabin.smokeOrigin.clone().applyMatrix4(boat.matrixWorld);
    for (const s of smoke) {
      s.userData.age += dt * 0.35;
      if (s.userData.age > 1) s.userData.age -= 1;
      const a = s.userData.age;
      s.position.set(origin.x + a * 0.5 + Math.sin(a * 6) * 0.05, origin.y + a * 1.9, origin.z);
      s.scale.setScalar(0.25 + a * 0.9);
      s.material.opacity = Math.sin(a * Math.PI) * 0.22 * (1 - night * 0.4);
    }
  }

  // Impulse so the boat and cat bounce when clicked.
  function hopBoat() {
    state.hopV += 2.4;
  }
  function hopCat() {
    state.catV += 3.2;
  }

  return { group: boat, cat, update, hopBoat, hopCat, mast, bobber: bobberWorld, smoke, state };
}
