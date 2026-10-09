import * as THREE from 'three';
import { radialTexture, woodTexture } from './util.js';

// ---------------------------------------------------------------------------
// A stylised sloop in the spirit of Sea of Thieves: chunky proportions, a
// painted hull with a cream rail, a warm wooden deck, billowing sails with
// seams, rigging, barrels and a little cat at the bow.
//
// Everything is built in boat space: +x is the bow, +y is up, +z is starboard.
// ---------------------------------------------------------------------------

const HULL_L = 6.2;
const BEAM = 1.05;
const DECK_DROP = 0.24;
const SEGMENT_STATIONS = 48;

const TERRA = new THREE.Color('#c96f4f');
const CREAM = new THREE.Color('#f6ead2');
const DECK = new THREE.Color('#dba878');

// Heights as a function of how far a station is from the middle of the boat
// (edge = 0 amidships, 1 at the bow and stern).
const rimY = (edge) => 0.5 + 0.38 * Math.pow(edge, 2.2);
const keelY = (edge) => -0.5 + 0.55 * Math.pow(edge, 3);
const edgeAt = (x) => (2 * Math.abs(x)) / HULL_L;
const uAt = (x) => x / HULL_L + 0.5;
const halfWidthAt = (x) => BEAM * Math.pow(Math.sin(Math.PI * uAt(x)), 0.55);
const deckAt = (x) => rimY(edgeAt(x)) - DECK_DROP;

const MAST_X = 0.7;
const MAST_BASE = deckAt(MAST_X);
const CABIN_X = -2.0;
const CAT_X = 2.25;
const BOW_TIP = new THREE.Vector3(4.0, 1.0, 0);
const MAIN = { boomLen: 2.5, boomY: 1.93, topY: 3.83 };

// Half cross-section, from the keel centre up the outside, over the rail,
// down the inner wall and across the deck to the centre line.
function halfProfile(x) {
  const edge = edgeAt(x);
  const W = halfWidthAt(x);
  const rim = rimY(edge);
  const keel = keelY(edge);
  const deck = rim - DECK_DROP;
  const pts = [];
  const N = 14;
  for (let k = 0; k <= N; k++) {
    const a = k / N;
    pts.push({
      z: W * Math.pow(Math.sin((a * Math.PI) / 2), 0.8),
      y: keel + (rim - keel) * Math.pow(a, 1.6),
      c: a < 0.55 ? TERRA : CREAM,
    });
  }
  pts.push({ z: W * 0.94, y: rim, c: CREAM });
  for (let k = 1; k <= 4; k++) {
    const a = k / 4;
    pts.push({ z: W * 0.94, y: rim + (deck - rim) * a, c: CREAM });
  }
  for (let k = 1; k <= 8; k++) {
    const a = k / 8;
    pts.push({ z: W * 0.94 * (1 - a), y: deck, c: DECK });
  }
  return pts;
}

// Closed ring: the half profile, then its mirror image walked backwards.
function fullRing(x) {
  const half = halfProfile(x);
  const ring = half.slice();
  for (let i = half.length - 2; i >= 1; i--) {
    const p = half[i];
    ring.push({ z: -p.z, y: p.y, c: p.c });
  }
  return ring;
}

let planksCache = null;
function planksTexture() {
  if (planksCache) return planksCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const band = size / 4;
  for (let i = 0; i < 4; i++) {
    const shade = 245 + Math.round(Math.random() * 10);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, i * band, size, band);
    for (let g = 0; g < 10; g++) {
      ctx.strokeStyle = `rgba(90,60,40,${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      const y = i * band + Math.random() * band;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.33, y + (Math.random() - 0.5) * 6, size * 0.66, y + (Math.random() - 0.5) * 6, size, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(55,35,22,0.5)';
    ctx.fillRect(0, i * band, size, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  planksCache = tex;
  return tex;
}

// Loft the whole hull (outside, rail, inside and deck) as one closed shell.
function createHull() {
  const rings = [];
  for (let i = 0; i <= SEGMENT_STATIONS; i++) {
    const x = ((i / SEGMENT_STATIONS) - 0.5) * HULL_L;
    rings.push({ x, ring: fullRing(x) });
  }
  const R = rings[0].ring.length;
  const positions = [];
  const colors = [];
  const uvs = [];
  for (const { x, ring } of rings) {
    for (const p of ring) {
      positions.push(x, p.y, p.z);
      colors.push(p.c.r, p.c.g, p.c.b);
      if (p.c === DECK) uvs.push(x * 0.7, p.z * 1.1 + 3);
      else uvs.push(x * 0.7, p.y * 2.2);
    }
  }
  const indices = [];
  for (let i = 0; i < SEGMENT_STATIONS; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const a1 = i * R + ((j + 1) % R);
      const b = (i + 1) * R + j;
      const b1 = (i + 1) * R + ((j + 1) % R);
      indices.push(a, b, a1, b, b1, a1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: planksTexture(),
    vertexColors: true,
    roughness: 0.68,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

function createCylinderBetween(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, len, 8), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function createCabin(glowMat, wood) {
  const group = new THREE.Group();
  group.position.set(CABIN_X, deckAt(CABIN_X), 0);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f6e7cc', roughness: 0.8 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.8), wallMat);
  walls.position.y = 0.425;
  group.add(walls);

  // Gable roof with a slight overhang, shingled colour.
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 0.45);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.36, bevelEnabled: false });
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.center();
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#b5573e', roughness: 0.75 }));
  roof.position.y = 0.85 + 0.225;
  group.add(roof);

  // Painted trim around the base, a stylised touch.
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.26, 0.07, 0.86),
    new THREE.MeshStandardMaterial({ color: '#fff8ea', roughness: 0.6 }),
  );
  trim.position.y = 0.035;
  group.add(trim);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.5, 0.16),
    new THREE.MeshStandardMaterial({ color: '#8c5a48', roughness: 0.9 }),
  );
  chimney.position.set(0.35, 1.25, -0.12);
  group.add(chimney);

  const windowGeo = new THREE.PlaneGeometry(0.28, 0.26);
  for (const side of [1, -1]) {
    for (const xo of [-0.3, 0.3]) {
      const win = new THREE.Mesh(windowGeo, glowMat);
      win.position.set(xo, 0.5, side * 0.405);
      if (side < 0) win.rotation.y = Math.PI;
      group.add(win);
    }
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.55), glowMat);
  door.position.set(0.605, 0.3, 0);
  door.rotation.y = Math.PI / 2;
  group.add(door);

  const step = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.5), new THREE.MeshStandardMaterial({ map: wood }));
  step.position.set(0.72, 0.03, 0);
  group.add(step);

  const smokeOrigin = new THREE.Vector3(CABIN_X + 0.35, deckAt(CABIN_X) + 1.5, -0.12);
  return { group, smokeOrigin };
}

function barrel(x, z, wood, hoopMat) {
  const group = new THREE.Group();
  group.position.set(x, deckAt(x) + 0.23, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.46, 14), wood);
  group.add(body);
  for (const y of [-0.16, 0.16]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.018, 6, 18), hoopMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    group.add(hoop);
  }
  return group;
}

function createCargo(wood) {
  const group = new THREE.Group();
  const barrelWood = new THREE.MeshStandardMaterial({ color: '#8b5a36', roughness: 0.85 });
  const hoopMat = new THREE.MeshStandardMaterial({ color: '#3d2a20', roughness: 0.6 });
  group.add(barrel(-0.95, -0.42, barrelWood, hoopMat));
  group.add(barrel(-0.95, 0.02, barrelWood, hoopMat));

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }));
  crate.position.set(-0.4, deckAt(-0.4) + 0.21, -0.4);
  crate.rotation.y = 0.25;
  group.add(crate);
  return group;
}

// Sail geometry: a grid over (u, v) in [0, 1]. The position is set every frame.
function sailGeometry(SEG) {
  const count = (SEG + 1) * (SEG + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    for (let j = 0; j <= SEG; j++) {
      const k = i * (SEG + 1) + j;
      uv[k * 2] = i / SEG;
      uv[k * 2 + 1] = j / SEG;
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = (i + 1) * (SEG + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function updateSailGeo(geo, fn, t) {
  const pos = geo.attributes.position;
  const SEG = Math.round(Math.sqrt(pos.count)) - 1;
  for (let i = 0; i <= SEG; i++) {
    for (let j = 0; j <= SEG; j++) {
      const [x, y, z] = fn(i / SEG, j / SEG, t);
      pos.setXYZ(i * (SEG + 1) + j, x, y, z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function sailTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff7ea';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(190,170,140,0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 6, size);
    ctx.stroke();
  }
  ctx.fillStyle = '#e4574f';
  ctx.fillRect(0, size - 26, size, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mainPoint(u, v, t) {
  const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.0);
  const x = -u * MAIN.boomLen * (1 - v);
  const y = MAIN.boomY + v * (MAIN.topY - MAIN.boomY);
  const bulge = Math.sin(Math.PI * u) * (0.3 + 0.25 * gust) * (1 - v * 0.35);
  const flutter = Math.sin(t * 2.2 + v * 4 + u * 2) * 0.04;
  return [x, y, -bulge + flutter];
}

// Jib: a triangle from the mast top, to the bow tip, to a clew near the mast foot.
const JIB_HEAD = new THREE.Vector3(MAST_X, MAST_BASE + 3.85, 0);
const JIB_CLEW = new THREE.Vector3(1.25, deckAt(1.25) + 0.1, 0);
function jibPoint(u, v, t) {
  const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.0);
  const vv = v * (1 - u);
  const p = new THREE.Vector3()
    .copy(JIB_HEAD)
    .addScaledVector(new THREE.Vector3().subVectors(BOW_TIP, JIB_HEAD), u)
    .addScaledVector(new THREE.Vector3().subVectors(JIB_CLEW, JIB_HEAD), vv);
  const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * (0.28 + 0.2 * gust);
  const flutter = Math.sin(t * 2.6 + u * 5) * 0.035;
  return [p.x, p.y, -bulge + flutter];
}

// Pennant at the top of the mast, a little ribbon that streams in the wind.
function createPennant(glowMat) {
  const S = 12;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((S + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < S; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: '#e4574f', side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 4.35, 0);
  return { mesh, S };
}

function updatePennant(p, t) {
  const pos = p.mesh.geometry.attributes.position;
  for (let i = 0; i <= p.S; i++) {
    const s = i / p.S;
    const wave = Math.sin(t * 4 + s * 5) * 0.12 * s;
    const half = 0.14 * (1 - s * 0.85);
    const x = -s * 1.1;
    const z = wave;
    pos.setXYZ(i * 2, x, half, z);
    pos.setXYZ(i * 2 + 1, x, -half, z);
  }
  pos.needsUpdate = true;
  p.mesh.geometry.computeVertexNormals();
}

function createMast(glowMat) {
  const group = new THREE.Group();
  group.position.set(MAST_X, MAST_BASE, 0);
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4e35', roughness: 0.7 });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 4.4, 12), wood);
  mast.position.y = 2.2;
  group.add(mast);

  // Boom, over the cabin roof and out towards the stern.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, MAIN.boomLen, 8), wood);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-MAIN.boomLen / 2, MAIN.boomY, 0);
  group.add(boom);

  const sailMat = new THREE.MeshStandardMaterial({
    map: sailTexture(),
    emissive: '#ffb27a',
    emissiveIntensity: 0.05,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const sailGeo = sailGeometry(18);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  group.add(sail);

  const pennant = createPennant(glowMat);
  group.add(pennant.mesh);

  // Lantern on top of the mast, with a small brass cap.
  const lantern = new THREE.Group();
  lantern.position.y = 4.5;
  lantern.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), glowMat));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 8), new THREE.MeshStandardMaterial({ color: '#c99a4a', metalness: 0.5, roughness: 0.4 }));
  cap.position.y = 0.18;
  lantern.add(cap);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,190,110,1)'), color: '#ffc27a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.scale.setScalar(1.9);
  lantern.add(halo);
  group.add(lantern);

  const lanternLight = new THREE.PointLight('#ffc27a', 1, 14, 1.6);
  lanternLight.position.set(0, 0.05, 0);
  lantern.add(lanternLight);

  return { group, sail, sailGeo, lantern, halo, lanternLight, pennant };
}

function createRigging() {
  const top = new THREE.Vector3(MAST_X, MAST_BASE + 3.95, 0);
  const sternTop = new THREE.Vector3(-3.0, deckAt(-3.0) + 0.3, 0);
  const sideL = new THREE.Vector3(0.2, deckAt(0.2) + 0.3, 0.9);
  const sideR = new THREE.Vector3(0.2, deckAt(0.2) + 0.3, -0.9);
  const points = [
    top, BOW_TIP,
    top, sternTop,
    top, sideL,
    top, sideR,
    JIB_HEAD, JIB_CLEW,
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#4a3024' }));
}

// A small tabby cat sitting at the bow. Clickable.
function createCat() {
  const group = new THREE.Group();
  group.position.set(CAT_X, deckAt(CAT_X), 0);
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
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), fur));
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

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.2, 0.12, 0);
  group.add(tailPivot);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.2, 0.02, 0.02),
    new THREE.Vector3(-0.35, 0.18, 0.04),
    new THREE.Vector3(-0.3, 0.38, 0.02),
  ]);
  tailPivot.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.05, 8), fur));

  return { group, head, tailPivot };
}

function createRodAndBobber() {
  const rodMat = new THREE.MeshStandardMaterial({ color: '#8c5a3c', roughness: 0.7 });
  const pivot = new THREE.Group();
  pivot.position.set(-0.5, 0.55, 1.0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 2.6, 8), rodMat);
  rod.position.y = 1.3;
  pivot.add(rod);
  pivot.rotation.x = 0.9;
  const tipLocal = new THREE.Vector3(0, 2.6, 0);

  const bobber = new THREE.Group();
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: '#ff6b6b', roughness: 0.5 })));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff6e8', roughness: 0.5 }));
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

  boat.add(createHull());

  const cabin = createCabin(glowMat, wood);
  boat.add(cabin.group);

  const cargo = createCargo(wood);
  boat.add(cargo);

  const mast = createMast(glowMat);
  boat.add(mast.group);

  // Foresail sits in boat space, its head at the mast top.
  const jibGeo = sailGeometry(16);
  const jib = new THREE.Mesh(
    jibGeo,
    new THREE.MeshStandardMaterial({ map: sailTexture(), emissive: '#ffb27a', emissiveIntensity: 0.05, roughness: 0.95, side: THREE.DoubleSide }),
  );
  boat.add(jib);

  // Bowsprit reaching out over the water.
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7a4e35', roughness: 0.7 });
  boat.add(createCylinderBetween(new THREE.Vector3(2.7, deckAt(2.7) + 0.05, 0), BOW_TIP, 0.05, woodMat));

  // Brass lantern hanging at the bow.
  const bowLantern = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), glowMat);
  bowLantern.position.set(3.75, 0.5, 0);
  boat.add(bowLantern);

  boat.add(createRigging());

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

  const catBase = deckAt(CAT_X);
  const state = {
    hopY: 0,
    hopV: 0,
    catY: 0,
    catV: 0,
    roll: 0,
    pitch: 0,
  };

  function update(t, dt, water, palette) {
    updateSailGeo(mast.sailGeo, mainPoint, t);
    updateSailGeo(jibGeo, jibPoint, t);
    updatePennant(mast.pennant, t);
    cat.tailPivot.rotation.z = Math.sin(t * 2.1) * 0.25;
    cat.head.rotation.z = Math.sin(t * 0.9) * 0.05;

    // Springs for the hop reactions.
    state.hopV += (-60 * state.hopY - 6 * state.hopV) * dt;
    state.hopY += state.hopV * dt;
    state.catV += (-80 * state.catY - 7 * state.catV) * dt;
    state.catY += state.catV * dt;
    cat.group.position.y = catBase + state.catY;

    // Sit on the waves: average height plus slope-driven pitch and roll.
    const center = water.sampleAt(0, 0, t);
    const bowS = water.sampleAt(2.8, 0, t);
    const sternS = water.sampleAt(-2.8, 0, t);
    const sideS = water.sampleAt(0, 1.0, t);
    const targetRoll = -(sideS.h - center.h) * 0.9;
    const targetPitch = (bowS.h - sternS.h) * 0.5;
    const ease = 1 - Math.exp(-dt * 5);
    state.roll += (targetRoll - state.roll) * ease;
    state.pitch += (targetPitch - state.pitch) * ease;

    boat.position.set(0, center.h - 0.12 + state.hopY * 0.5, 0);
    boat.rotation.set(state.roll, Math.sin(t * 0.13) * 0.05, state.pitch);
    boat.updateMatrixWorld(true);

    const night = palette.night;
    mast.lanternLight.intensity = 0.8 + night * 9;
    mast.halo.material.opacity = 0.35 + night * 0.5;
    mast.sail.material.emissiveIntensity = 0.03 + night * 0.12;
    jib.material.emissiveIntensity = 0.03 + night * 0.12;

    // Fishing line and bobber.
    const bobWorld = boat.localToWorld(new THREE.Vector3(-0.5, 0, 3.4));
    const bobH = water.sampleAt(bobWorld.x, bobWorld.z, t).h;
    bobberWorld.position.set(bobWorld.x, bobH + Math.sin(t * 2.4) * 0.03, bobWorld.z);
    bobberWorld.rotation.y = t;
    const tipWorld = rod.tipLocal.clone().applyMatrix4(rod.pivot.matrixWorld);
    lineWorld.geometry.setFromPoints([tipWorld, bobberWorld.position.clone().add(new THREE.Vector3(0, 0.1, 0))]);

    // Chimney smoke.
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

  function hopBoat() {
    state.hopV += 2.4;
  }
  function hopCat() {
    state.catV += 3.2;
  }

  return { group: boat, cat, update, hopBoat, hopCat, mast, bobber: bobberWorld, smoke, state };
}
