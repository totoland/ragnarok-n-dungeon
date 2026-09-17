// Procedural canvas textures so the dungeon ships with zero image files.
import * as THREE from 'three';

function noise(ctx, w, h, alpha, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * alpha;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function make(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Flagstone floor: irregular tile grid with dark grout and per-tile shade.
export function stoneFloor(base = '#5a5a62', grout = '#25242b', seed = 3) {
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = grout; ctx.fillRect(0, 0, w, h);
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const cols = 4, rows = 4;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const tw = w / cols, th = h / rows;
      const shade = 0.82 + rnd() * 0.3;
      const [r, g, b] = base.match(/\w\w/g).map((v) => Math.min(255, parseInt(v, 16) * shade));
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      const inset = 4 + rnd() * 4;
      ctx.fillRect(x * tw + inset, y * th + inset, tw - inset * 2, th - inset * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x * tw + inset, y * th + th - inset - 6, tw - inset * 2, 6);
    }
    noise(ctx, w, h, 0.18, seed);
  });
}

// Brick wall with staggered courses.
export function brickWall(base = '#4c4653', mortar = '#211d26', seed = 5) {
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const bh = 32, bw = 96;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const shade = 0.78 + rnd() * 0.36;
        const [r, g, b] = base.match(/\w\w/g).map((v) => Math.min(255, parseInt(v, 16) * shade));
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(x + off + 3, y + 3, bw - 6, bh - 6);
      }
    }
    noise(ctx, w, h, 0.16, seed);
  });
}

// Soft round particle sprite.
export function particleSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Damage number as a sprite texture. Cached by text+style, bounded.
const textCache = new Map();
export function textTexture(text, { color = '#fff', size = 64, stroke = '#000', font = '900' } = {}) {
  const key = `${text}|${color}|${size}|${stroke}`;
  if (textCache.has(key)) return textCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = `${font} ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = color; ctx.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (textCache.size > 300) { const first = textCache.keys().next().value; textCache.get(first).dispose(); textCache.delete(first); }
  textCache.set(key, t);
  return t;
}
