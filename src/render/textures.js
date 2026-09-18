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

// Grass and dirt ground for the outdoor map. Everything is drawn with wrap-around so the
// tile is seamless: an element near an edge is also drawn shifted by a full tile, which is
// what keeps the repeat from showing a grid.
export function grassFloor(base = '#5f7a3c', dirt = '#6d5c39', seed = 11) {
  return make(512, 512, (ctx, w, h) => {
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const wrap = (x, y, r, fn) => {
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        if (x + dx > -r && x + dx < w + r && y + dy > -r && y + dy < h + r) fn(x + dx, y + dy);
      }
    };
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);

    // broad tonal patches so the ground is not a flat green field
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 90;
      const light = rnd() > 0.45;
      wrap(x, y, r, (px, py) => {
        const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
        grd.addColorStop(0, light ? 'rgba(150,175,90,0.20)' : 'rgba(62,78,42,0.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      });
    }
    // worn dirt showing through
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w, y = rnd() * h, r = 22 + rnd() * 46;
      wrap(x, y, r, (px, py) => {
        const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
        grd.addColorStop(0, dirt + '7a');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      });
    }
    // grass blades: short strokes, leaning randomly
    ctx.lineCap = 'round';
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * w, y = rnd() * h;
      const len = 3 + rnd() * 7, lean = (rnd() - 0.5) * 5;
      const g = 110 + (rnd() * 70) | 0;
      ctx.strokeStyle = `rgba(${(g * 0.62) | 0},${g},${(g * 0.42) | 0},${0.35 + rnd() * 0.4})`;
      ctx.lineWidth = 0.8 + rnd() * 1.0;
      wrap(x, y, len + 4, (px, py) => {
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + lean, py - len); ctx.stroke();
      });
    }
    // pebbles and fallen leaves
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w, y = rnd() * h, r = 1.6 + rnd() * 3.4;
      const leaf = rnd() > 0.62;
      ctx.fillStyle = leaf ? `rgba(${140 + rnd() * 50 | 0},${100 + rnd() * 40 | 0},50,0.62)`
                           : `rgba(${130 + rnd() * 50 | 0},${128 + rnd() * 44 | 0},${120 + rnd() * 40 | 0},0.72)`;
      wrap(x, y, r + 2, (px, py) => {
        ctx.beginPath(); ctx.ellipse(px, py, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); ctx.fill();
      });
    }
    noise(ctx, w, h, 0.10, seed);
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
