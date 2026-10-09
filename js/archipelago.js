import * as THREE from 'three';
import { radialTexture, seeded } from './util.js';

// ---------------------------------------------------------------------------
// Procedural archipelago. The world is cut into square cells. Each cell
// decides, from a hash of its coordinates, whether it holds an island and
// what the island looks like. The same cell always gives the same island, so
// the sea looks consistent as the boat sails back and forth.
//
// Only the cells near the boat are built. Cells that fall out of range are
// disposed, so the amount of geometry stays small however far the boat goes.
// ---------------------------------------------------------------------------

const CELL = 150;
const LOAD_RADIUS = 3; // cells around the boat that are kept alive
const START_CLEAR = 90; // no island this close to the start, so the boat never begins on land

// Stable pseudo-random value in [0, 1) from integer cell coordinates.
function hash2(i, j, salt = 0) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Returns null for empty cells, or the island description for this cell.
function describeCell(i, j) {
  if (hash2(i, j) > 0.5) return null;
  const rnd = seeded(1 + Math.floor(hash2(i, j, 7) * 2e9));
  const x = (i + 0.2 + rnd() * 0.6) * CELL;
  const z = (j + 0.2 + rnd() * 0.6) * CELL;
  if (Math.hypot(x, z) < START_CLEAR) return null;
  const big = rnd() < 0.2;
  const radius = big ? 22 + rnd() * 8 : 6 + rnd() * 12;
  return {
    x,
    z,
    radius,
    trees: Math.round(radius * 1.4),
    village: rnd() < 0.45,
    lighthouse: rnd() < 0.15,
    seed: 1 + Math.floor(hash2(i, j, 11) * 1e6),
  };
}

// Low-poly island with a lumpy top and instanced conifers.
function buildLand(d, owned) {
  const group = new THREE.Group();
  const r = seeded(d.seed);

  const geo = new THREE.IcosahedronGeometry(d.radius, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 0.9 + d.seed) * 0.12 + Math.cos(v.z * 1.3) * 0.1 + r() * 0.08;
    v.multiplyScalar(1 + n);
    v.y *= v.y > 0 ? 0.35 : 0.9;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const greens = ['#7cae6a', '#6b9e5c', '#8fbf74'];
  const bodyMat = new THREE.MeshStandardMaterial({ color: greens[d.seed % greens.length], flatShading: true, roughness: 0.95 });
  group.add(new THREE.Mesh(geo, bodyMat));
  owned.push(geo, bodyMat);

  const treeMat = new THREE.MeshStandardMaterial({ color: '#3f7a4f', flatShading: true, roughness: 0.9 });
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), treeMat, d.trees);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < d.trees; i++) {
    const a = r() * Math.PI * 2;
    const dist = Math.sqrt(r()) * d.radius * 0.7;
    const h = 1.2 + r() * 1.4;
    p.set(Math.cos(a) * dist, d.radius * 0.2 + h * 0.5, Math.sin(a) * dist);
    s.set(0.45 + r() * 0.2, h, 0.45 + r() * 0.2);
    m.compose(p, q.identity(), s);
    trees.setMatrixAt(i, m);
    color.setHSL(0.33 + (r() - 0.5) * 0.05, 0.4, 0.22 + r() * 0.08);
    trees.setColorAt(i, color);
  }
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  group.add(trees);
  owned.push(trees.geometry, treeMat);
  return group;
}

// Warm windows of a small village, shared glow material so they bloom.
function buildVillage(d, glowMat, owned) {
  const r = seeded(d.seed + 3);
  const count = 10 + Math.floor(r() * 10);
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  owned.push(geo);
  const group = new THREE.Group();
  for (let k = 0; k < count; k++) {
    const a = r() * Math.PI * 2;
    const dist = 3 + r() * d.radius * 0.45;
    const light = new THREE.Mesh(geo, glowMat);
    light.position.set(Math.cos(a) * dist, d.radius * 0.45 + 0.2, Math.sin(a) * dist);
    group.add(light);
  }
  return group;
}

// Small lighthouse with a blinking lamp.
function buildLighthouse(d, glowMat, owned) {
  const group = new THREE.Group();
  const tower = new THREE.MeshStandardMaterial({ color: '#f5efe6', roughness: 0.8 });
  const band = new THREE.MeshStandardMaterial({ color: '#d9644f', roughness: 0.8 });
  const bodyGeo = new THREE.CylinderGeometry(0.9, 1.3, 7, 12);
  const bandGeo = new THREE.CylinderGeometry(1.0, 1.15, 1, 12);
  const body = new THREE.Mesh(bodyGeo, tower);
  body.position.y = 3.5;
  group.add(body);
  const stripe = new THREE.Mesh(bandGeo, band);
  stripe.position.y = 5;
  group.add(stripe);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), glowMat);
  lamp.position.y = 7.6;
  group.add(lamp);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture('rgba(255,230,160,1)'), color: '#ffe3a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.position.y = 7.6;
  halo.scale.setScalar(10);
  group.add(halo);
  owned.push(bodyGeo, bandGeo, tower, band);
  return { group, halo };
}

export function createArchipelago(scene, { glowMat }) {
  const root = new THREE.Group();
  root.name = 'archipelago';
  scene.add(root);

  // key "i,j" -> { desc, group, owned, lamp }
  const cells = new Map();

  function build(desc) {
    const owned = [];
    const group = new THREE.Group();
    group.position.set(desc.x, 0, desc.z);
    group.add(buildLand(desc, owned));
    let lamp = null;
    if (desc.village) group.add(buildVillage(desc, glowMat, owned));
    if (desc.lighthouse) {
      const lh = buildLighthouse(desc, glowMat, owned);
      lh.group.position.set(desc.radius * 0.35, desc.radius * 0.2, -desc.radius * 0.3);
      group.add(lh.group);
      lamp = lh.halo;
    }
    root.add(group);
    return { desc, group, owned, lamp };
  }

  function dispose(entry) {
    root.remove(entry.group);
    for (const r of entry.owned) r.dispose();
  }

  // Keep the cells around `anchor` alive and drop the rest.
  function update(t, anchor) {
    const ci = Math.floor(anchor.x / CELL);
    const cj = Math.floor(anchor.z / CELL);
    const wanted = new Set();
    for (let di = -LOAD_RADIUS; di <= LOAD_RADIUS; di++) {
      for (let dj = -LOAD_RADIUS; dj <= LOAD_RADIUS; dj++) {
        const i = ci + di;
        const j = cj + dj;
        const key = `${i},${j}`;
        wanted.add(key);
        if (!cells.has(key)) {
          const desc = describeCell(i, j);
          cells.set(key, desc ? build(desc) : { desc: null });
        }
      }
    }
    for (const [key, entry] of cells) {
      if (!wanted.has(key)) {
        if (entry.group) dispose(entry);
        cells.delete(key);
      }
    }

    // Lighthouses blink on their own schedule.
    const blink = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9), 10);
    for (const entry of cells.values()) {
      if (entry.lamp) entry.lamp.material.opacity = blink;
    }
  }

  // Islands within `range` of a point, used by the boat to steer around them.
  function obstacles(x, z, range = 140) {
    const out = [];
    for (const entry of cells.values()) {
      if (!entry.desc) continue;
      const d = entry.desc;
      if (Math.hypot(d.x - x, d.z - z) < range) out.push({ x: d.x, z: d.z, r: d.radius });
    }
    return out;
  }

  return { update, obstacles };
}
