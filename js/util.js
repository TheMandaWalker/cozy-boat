import * as THREE from 'three';

// Soft round sprite used for glows, smoke and clouds.
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function heartTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2 + 6);
  ctx.scale(2.6, 2.6);
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-10, 0, -8, -10, 0, -4);
  ctx.bezierCurveTo(8, -10, 10, 0, 0, 8);
  ctx.fillStyle = '#ff8fa8';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Warm wooden planks, used on the deck and the dock-style details.
export function woodTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const plank = size / 6;
  for (let i = 0; i < 6; i++) {
    const shade = 0.88 + Math.random() * 0.16;
    ctx.fillStyle = `rgb(${Math.round(186 * shade)},${Math.round(134 * shade)},${Math.round(84 * shade)})`;
    ctx.fillRect(0, i * plank, size, plank);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(90,52,28,${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      const y = i * plank + Math.random() * plank;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 10, size * 0.7, y + (Math.random() - 0.5) * 10, size, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,35,20,0.45)';
    ctx.fillRect(0, i * plank, size, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Seeded random so the scene layout is the same on every visit.
export function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
