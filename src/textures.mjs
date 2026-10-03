// Procedural surface detail drawn on canvases, so the buildings and workers get panel seams, rivets, grime,
// plaster grain, shingles, wood and fabric without loading any image files. Each skin is a colour map plus a
// matching bump map and is cached, so every building of one kind shares the same textures. Browser only.
import * as THREE from 'three';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const css = hex => '#' + hex.toString(16).padStart(6, '0');
const cache = new Map();

// Draws a colour canvas and a grey height canvas (mid-grey is flat, darker is cut in, lighter is raised).
function skin(key, draw, size = 512, tall = size) {
  if (cache.has(key)) return cache.get(key);
  const mk = () => { const c = document.createElement('canvas'); c.width = size; c.height = tall; return c; };
  const cc = mk(), hc = mk(), x = cc.getContext('2d'), h = hc.getContext('2d');
  h.fillStyle = '#808080'; h.fillRect(0, 0, size, tall);
  draw(x, h, size, lcg(key.length * 977 + size), tall);
  const map = new THREE.CanvasTexture(cc), bumpMap = new THREE.CanvasTexture(hc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.keep = true; }
  const out = { map, bumpMap }; cache.set(key, out);
  return out;
}

const speck = (x, s, r, n, rgb, a, w = 2) => {
  n = Math.round(n * (s / 256) ** 2);   // more specks on a bigger canvas, so the grain keeps its density
  for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${rgb},${a * (0.4 + r() * 0.6)})`; x.fillRect(r() * s, r() * s, 1 + r() * w, 1 + r() * w); }
};
// dirty rain streaks running down from the top edge
const streaks = (x, s, r, n, a = 0.2) => {
  for (let i = 0; i < n; i++) {
    const px = r() * s, w = 2 + r() * 8, len = 40 + r() * 130, g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(30,22,14,${a})`); g.addColorStop(1, 'rgba(30,22,14,0)'); x.fillStyle = g; x.fillRect(px, 0, w, len);
  }
};
const fadeBottom = (x, s, a = 0.28) => {
  const g = x.createLinearGradient(0, s * 0.72, 0, s); g.addColorStop(0, 'rgba(25,18,10,0)'); g.addColorStop(1, `rgba(25,18,10,${a})`); x.fillStyle = g; x.fillRect(0, s * 0.72, s, s * 0.28);
};
// a cut-in seam with a lit edge, on both the colour and the height canvas
const seamV = (x, h, px, s, w = 2) => {
  x.fillStyle = 'rgba(15,12,10,0.34)'; x.fillRect(px - w / 2, 0, w, s); x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(px + w / 2, 0, 1, s);
  h.fillStyle = '#202020'; h.fillRect(px - w / 2, 0, w, s);
};
const seamH = (x, h, py, s, w = 2) => {
  x.fillStyle = 'rgba(15,12,10,0.34)'; x.fillRect(0, py - w / 2, s, w); x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(0, py + w / 2, s, 1);
  h.fillStyle = '#202020'; h.fillRect(0, py - w / 2, s, w);
};
const rivet = (x, h, px, py, r = 2.2) => {
  x.fillStyle = 'rgba(15,12,10,0.4)'; x.beginPath(); x.arc(px, py + 0.8, r, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.arc(px, py, r * 0.7, 0, 7); x.fill();
  h.fillStyle = '#e0e0e0'; h.beginPath(); h.arc(px, py, r, 0, 7); h.fill();
};

// Painted metal plates: eight panels around a drum, seams, rivets, rain streaks and scuffs.
export const panelSkin = hex => skin('panel' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  speck(x, s, r, 1100, '255,255,255', 0.08); speck(x, s, r, 1100, '0,0,0', 0.09);
  streaks(x, s, r, 18); fadeBottom(x, s);
  for (let k = 0; k <= 8; k++) seamV(x, h, (k * s) / 8 || 1, s);
  for (const py of [s / 3, (2 * s) / 3]) seamH(x, h, py, s);
  for (let k = 0; k < 8; k++) for (const py of [s / 3, (2 * s) / 3]) { rivet(x, h, (k * s) / 8 + 6, py - 7); rivet(x, h, ((k + 1) * s) / 8 - 6, py - 7); }
});

// A standing-seam metal roof: many fine ribs and a lighter wear pattern.
export const ribSkin = hex => skin('rib' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  speck(x, s, r, 900, '255,255,255', 0.1); speck(x, s, r, 700, '0,0,0', 0.08);
  for (let k = 0; k < 16; k++) { const px = (k * s) / 16; x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px + 3, 0, 2, s); seamV(x, h, px || 1, s, 3); }
  seamH(x, h, s * 0.5, s, 3); streaks(x, s, r, 10, 0.14);
});

// Rendered adobe/plaster: soft blotches, fine grain, a few hairline cracks and a dirty foot.
export const plasterSkin = hex => skin('plaster' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,245,225' : '40,25,12'},${0.04 + r() * 0.07})`; x.beginPath(); x.arc(r() * s, r() * s, 12 + r() * 36, 0, 7); x.fill(); }
  speck(x, s, r, 2200, '255,255,255', 0.1, 1.5); speck(x, s, r, 2200, '0,0,0', 0.12, 1.5);
  for (let i = 0; i < 6; i++) {
    let px = r() * s, py = r() * s * 0.6; x.strokeStyle = 'rgba(30,18,10,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py);
    for (let j = 0; j < 6; j++) { px += (r() - 0.5) * 18; py += 6 + r() * 14; x.lineTo(px, py); } x.stroke();
  }
  for (let i = 0; i < 400; i++) { h.fillStyle = `rgba(${r() < 0.5 ? 200 : 60},${r() < 0.5 ? 200 : 60},60,0.25)`; h.fillRect(r() * s, r() * s, 2, 2); }
  streaks(x, s, r, 12, 0.16); fadeBottom(x, s, 0.34);
});

// A segmented dome: meridian and ring seams with a darker sheen towards the rim.
export const domeSkin = hex => skin('dome' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  speck(x, s, r, 1000, '255,255,255', 0.07); speck(x, s, r, 1000, '0,0,0', 0.09);
  for (let k = 0; k <= 12; k++) seamV(x, h, (k * s) / 12 || 1, s);
  for (const py of [s * 0.3, s * 0.55, s * 0.8]) seamH(x, h, py, s);
  streaks(x, s, r, 8, 0.12);
});

// Roof shingles in offset rows, each a little different in tone.
export const shingleSkin = hex => skin('shingle' + hex, (x, h, s, r) => {
  const rows = 10, cols = 8, rh = s / rows, cw = s / cols;
  for (let j = 0; j < rows; j++) for (let k = -1; k < cols; k++) {
    const px = k * cw + (j % 2 ? cw / 2 : 0), tone = r() * 0.16 - 0.08;
    x.fillStyle = css(hex); x.fillRect(px, j * rh, cw, rh);
    x.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone})`; x.fillRect(px, j * rh, cw, rh);
    x.fillStyle = 'rgba(10,8,6,0.4)'; x.fillRect(px, j * rh + rh - 2, cw, 2); x.fillRect(px, j * rh, 1.5, rh);
    h.fillStyle = '#303030'; h.fillRect(px, j * rh + rh - 3, cw, 3); h.fillStyle = '#a0a0a0'; h.fillRect(px + 1, j * rh, cw - 2, 3);
  }
  speck(x, s, r, 900, '0,0,0', 0.1);
});

// Solar cells: a grid of dark glass cells with pale busbars, tinted by the instance colour.
export const solarSkin = hex => skin('solar' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  const n = 6, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const g = x.createLinearGradient(i * c, j * c, (i + 1) * c, (j + 1) * c); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
    x.fillStyle = g; x.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
    x.fillStyle = 'rgba(255,255,255,0.4)'; for (const f of [0.33, 0.66]) x.fillRect(i * c + 2, j * c + c * f, c - 4, 1);
  }
  for (let i = 0; i <= n; i++) { seamV(x, h, i * c || 1, s, 3); seamH(x, h, i * c || 1, s, 3); }
});

// Wooden crates: boards, a cross brace, corner brackets and worn edges. Pale, so the instance colour tints it.
export const crateSkin = hex => skin('crate' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  const boards = 5, bh = s / boards;
  for (let j = 0; j < boards; j++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.08})`; x.fillRect(0, j * bh, s, bh);
    for (let g = 0; g < 18; g++) { x.fillStyle = 'rgba(60,40,20,0.12)'; x.fillRect(r() * s, j * bh + r() * bh, 20 + r() * 60, 1); }
    seamH(x, h, j * bh || 1, s, 3);
  }
  x.strokeStyle = 'rgba(40,28,16,0.45)'; x.lineWidth = 9; x.strokeRect(10, 10, s - 20, s - 20);
  x.beginPath(); x.moveTo(14, 14); x.lineTo(s - 14, s - 14); x.moveTo(s - 14, 14); x.lineTo(14, s - 14); x.stroke();
  h.strokeStyle = '#b0b0b0'; h.lineWidth = 9; h.strokeRect(10, 10, s - 20, s - 20);
  for (const [px, py] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]]) rivet(x, h, px, py, 4);
  speck(x, s, r, 800, '0,0,0', 0.1);
});

// Speckled poured concrete for plinths and bases.
export const concreteSkin = hex => skin('concrete' + hex, (x, h, s, r) => {
  x.fillStyle = css(hex); x.fillRect(0, 0, s, s);
  for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.06})`; x.beginPath(); x.arc(r() * s, r() * s, 10 + r() * 30, 0, 7); x.fill(); }
  speck(x, s, r, 2600, '255,255,255', 0.12, 1.5); speck(x, s, r, 2600, '0,0,0', 0.16, 1.5);
  seamV(x, h, s / 2, s, 3); streaks(x, s, r, 10, 0.18);
});

// Woven work fabric with creases; near-white, so the instance colour dyes it.
export const fabricSkin = () => skin('fabric', (x, h, s, r) => {
  x.fillStyle = '#e9e9ec'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < s; i += 3) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i, 0, 1, s); x.fillRect(0, i, s, 1); }
  for (let i = 0; i < 26; i++) {
    const py = r() * s, g = x.createLinearGradient(0, py, 0, py + 10); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, py, s, 10);
  }
  speck(x, s, r, 1400, '0,0,0', 0.1, 1); speck(x, s, r, 800, '255,255,255', 0.12, 1);
  for (let i = 0; i < s; i += 3) { h.fillStyle = '#707070'; h.fillRect(i, 0, 1, s); h.fillRect(0, i, s, 1); }
  // rows of stitching, and the shadow of a seam beside each
  for (const py of [s * 0.25, s * 0.75]) {
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, py + 2, s, 3);
    for (let px = 0; px < s; px += 12) { x.fillStyle = 'rgba(40,30,20,0.34)'; x.fillRect(px, py, 7, 1.6); h.fillStyle = '#a8a8a8'; h.fillRect(px, py, 7, 2); }
  }
});

// An astronaut's visor: near-black glass with a faint blue sheen, a few stars reflected in it, a bright glint high on one
// side and a darker edge. It is painted on a cap of the helmet sphere, so the middle of the picture faces forward.
export const visorSkin = () => skin('visor', (x, h, s, r, t) => {
  const k = s / 384;
  const glass = x.createLinearGradient(0, 0, s, t); glass.addColorStop(0, '#04060c'); glass.addColorStop(0.55, '#0c1428'); glass.addColorStop(1, '#16223d');
  x.fillStyle = glass; x.fillRect(0, 0, s, t);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; x.fillRect(r() * s, r() * t, (1 + r()) * k, (1 + r()) * k); }
  // a soft curved reflection of a bright sky across the upper half
  const sky = x.createLinearGradient(0, 0, 0, t * 0.6); sky.addColorStop(0, 'rgba(120,170,255,0.22)'); sky.addColorStop(1, 'rgba(120,170,255,0)');
  x.fillStyle = sky; x.beginPath(); x.ellipse(s / 2, t * 0.1, s * 0.46, t * 0.5, 0, 0, 7); x.fill();
  const glint = x.createRadialGradient(s * 0.76, t * 0.24, 1, s * 0.76, t * 0.24, 40 * k); glint.addColorStop(0, 'rgba(255,255,255,0.95)'); glint.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glint; x.beginPath(); x.ellipse(s * 0.76, t * 0.24, 42 * k, 28 * k, -0.5, 0, 7); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 6 * k; x.beginPath(); x.arc(s / 2, t * 0.55, 150 * k, Math.PI * 1.15, Math.PI * 1.45); x.stroke();
  const rim = x.createRadialGradient(s / 2, t / 2, t * 0.3, s / 2, t / 2, s * 0.62); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = rim; x.fillRect(0, 0, s, t);
}, 384, 256);

// The glass of a habitat dome: a clear blue tint with a geodesic frame (triangles) of white struts. Mostly transparent.
export const glassSkin = () => skin('glass', (x, h, s, r) => {
  x.clearRect(0, 0, s, s);
  x.fillStyle = 'rgba(110,170,235,0.20)'; x.fillRect(0, 0, s, s);
  const cols = 12, rows = 6, cw = s / cols, rh = s / rows;
  x.strokeStyle = 'rgba(240,248,255,0.92)'; x.lineWidth = 3.5; x.beginPath();
  for (let j = 0; j <= rows; j++) { x.moveTo(0, j * rh); x.lineTo(s, j * rh); }
  for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
    const off = j % 2 ? cw / 2 : 0;
    x.moveTo(i * cw + off, j * rh); x.lineTo(i * cw + off + cw / 2, (j + 1) * rh);
    x.moveTo(i * cw + off, j * rh); x.lineTo(i * cw + off - cw / 2, (j + 1) * rh);
  }
  x.stroke();
  const glint = x.createLinearGradient(0, 0, s, s * 0.6); glint.addColorStop(0, 'rgba(255,255,255,0.35)'); glint.addColorStop(0.3, 'rgba(255,255,255,0)');
  x.fillStyle = glint; x.fillRect(0, 0, s, s);
}, 256);

// A small flag for the cabin: an invented emblem (a blue disc with a white star on white, an orange stripe), not a real one.
export const flagSkin = () => skin('flag', (x, h, s, r) => {
  x.fillStyle = '#f7f9fc'; x.fillRect(0, 0, s, s);
  x.fillStyle = '#f0a030'; x.fillRect(0, s * 0.78, s, s * 0.12);
  x.fillStyle = '#2f6fe0'; x.beginPath(); x.arc(s / 2, s * 0.42, s * 0.3, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? s * 0.07 : s * 0.17; x.lineTo(s / 2 + Math.cos(a) * rad, s * 0.42 + Math.sin(a) * rad); }
  x.closePath(); x.fill();
}, 128);

// The planet in the sky: oceans, continents, clouds and ice caps painted on a plain equirectangular map, shaded lighter on one
// side. Plain CanvasTextures (not skins), used on unlit spheres.
export const planetMap = (kind = 'earth') => {
  const key = 'planet-' + kind;
  if (cache.has(key)) return cache.get(key).map;
  const w = 1024, hgt = 512, c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const x = c.getContext('2d'), r = lcg(kind.length * 311 + 7);
  if (kind === 'earth') {
    const sea = x.createLinearGradient(0, 0, 0, hgt); sea.addColorStop(0, '#173f8a'); sea.addColorStop(0.5, '#1d62c4'); sea.addColorStop(1, '#173f8a');
    x.fillStyle = sea; x.fillRect(0, 0, w, hgt);
    for (let i = 0; i < 26; i++) {
      const cx = r() * w, cy = hgt * (0.2 + r() * 0.6);
      for (let k = 0; k < 14; k++) { x.fillStyle = r() < 0.35 ? '#8a7a4c' : '#3f8a46'; x.beginPath(); x.ellipse(cx + (r() - 0.5) * 90, cy + (r() - 0.5) * 50, 14 + r() * 40, 8 + r() * 24, r() * 3, 0, 7); x.fill(); }
    }
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.18 + r() * 0.3})`; x.beginPath(); x.ellipse(r() * w, r() * hgt, 20 + r() * 70, 5 + r() * 16, (r() - 0.5) * 0.8, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(240,248,255,0.9)'; x.fillRect(0, 0, w, 22); x.fillRect(0, hgt - 22, w, 22);
  } else if (kind === 'gas') {
    const bands = ['#e9c58a', '#c9854a', '#8a4a3a', '#f2dcb0', '#6b3a52', '#d89a5c', '#f6e6c4', '#9a5a46'];
    let y = 0;
    while (y < hgt) { const bh = 14 + r() * 38; x.fillStyle = bands[Math.floor(r() * bands.length)]; x.fillRect(0, y, w, bh + 2); y += bh; }
    for (let i = 0; i < 420; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,235,200' : '90,40,40'},${0.05 + r() * 0.1})`; x.beginPath(); x.ellipse(r() * w, r() * hgt, 30 + r() * 120, 2 + r() * 7, 0, 0, 7); x.fill(); }
    x.fillStyle = '#b8402e'; x.beginPath(); x.ellipse(w * 0.62, hgt * 0.62, 70, 36, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,230,190,0.6)'; x.lineWidth = 4; x.beginPath(); x.ellipse(w * 0.62, hgt * 0.62, 84, 46, 0, 0, 7); x.stroke();
  } else {
    x.fillStyle = '#8d8d94'; x.fillRect(0, 0, w, hgt);
    for (let i = 0; i < 180; i++) { const cx = r() * w, cy = r() * hgt, rad = 4 + r() * 26; const g = x.createRadialGradient(cx, cy, 1, cx, cy, rad); g.addColorStop(0, 'rgba(40,40,48,0.5)'); g.addColorStop(1, 'rgba(40,40,48,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill(); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(210,210,215,${0.1 + r() * 0.2})`; x.beginPath(); x.arc(r() * w, r() * hgt, 20 + r() * 60, 0, 7); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true;
  cache.set(key, { map: t });
  return t;
};

// Alien ground, near white so the terrain's vertex colours (violet, magenta, rust, teal) show through: fine grit, scattered
// pebbles and faint layers of rock, with a bump map to match. Tiled across the whole surface.
export const alienSkin = () => skin('alien', (x, h, s, r) => {
  x.fillStyle = '#e8e2ee'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 36; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '70,50,90'},${0.04 + r() * 0.08})`; x.beginPath(); x.arc(r() * s, r() * s, 12 + r() * 46, 0, 7); x.fill(); }
  for (let i = 0; i < 14; i++) { const y0 = r() * s; x.strokeStyle = `rgba(60,40,80,${0.05 + r() * 0.07})`; x.lineWidth = 2 + r() * 3; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(s * 0.3, y0 + (r() - 0.5) * 30, s * 0.7, y0 + (r() - 0.5) * 30, s, y0 + (r() - 0.5) * 20); x.stroke(); }
  speck(x, s, r, 2000, '50,30,70', 0.2, 1.6); speck(x, s, r, 1250, '255,255,255', 0.35, 1.6);
  for (let i = 0; i < 170; i++) {
    const px = r() * s, py = r() * s, rad = 2 + r() * 7;
    x.fillStyle = 'rgba(40,25,60,0.35)'; x.beginPath(); x.ellipse(px + 1, py + 2, rad, rad * 0.7, 0, 0, 7); x.fill();
    x.fillStyle = `rgba(255,250,255,${0.25 + r() * 0.3})`; x.beginPath(); x.ellipse(px, py, rad, rad * 0.7, 0, 0, 7); x.fill();
    h.fillStyle = '#d0d0d0'; h.beginPath(); h.ellipse(px, py, rad, rad * 0.7, 0, 0, 7); h.fill();
  }
  speck(h, s, r, 875, '255,255,255', 0.4, 1.4);
}, 512);

// Glowing cracks for the ground's emissive map: black with branching cyan fissures. Plain texture (not a skin), tiled.
export const veinsMap = () => {
  if (cache.has('veins')) return cache.get('veins').map;
  const sz = 512, c = document.createElement('canvas'); c.width = c.height = sz;
  const x = c.getContext('2d'), r = lcg(91);
  x.fillStyle = '#000'; x.fillRect(0, 0, sz, sz);
  x.lineCap = 'round'; x.shadowColor = '#35e6ff'; x.shadowBlur = 9;
  const crack = (px, py, ang, len, w) => {
    x.strokeStyle = `rgba(80,235,255,${0.6 + r() * 0.4})`; x.lineWidth = w; x.beginPath(); x.moveTo(px, py);
    for (let i = 0; i < len; i++) {
      ang += (r() - 0.5) * 0.7; px += Math.cos(ang) * 9; py += Math.sin(ang) * 9; x.lineTo(px, py);
      if (r() < 0.06 && w > 1.1) { x.stroke(); crack(px, py, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.7), Math.floor(len * 0.5), w * 0.65); x.beginPath(); x.moveTo(px, py); }
    }
    x.stroke();
  };
  for (let i = 0; i < 6; i++) crack(70 + r() * 370, 70 + r() * 370, r() * 6.28, 20 + Math.floor(r() * 14), 2.6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.keep = true;
  cache.set('veins', { map: t });
  return t;
};

// The gas giant's ring: concentric bands of dusty tan fading in and out, drawn so the ring's outer edge touches the canvas.
export const ringMap = () => {
  if (cache.has('ring')) return cache.get('ring').map;
  const sz = 1024, c = document.createElement('canvas'); c.width = c.height = sz;
  const x = c.getContext('2d'), r = lcg(55), mid = sz / 2;
  x.clearRect(0, 0, sz, sz);
  for (let rad = mid * 0.62; rad < mid; rad += 1.5) {
    const edge = Math.min(1, (rad - mid * 0.62) / 22, (mid - rad) / 22), gap = Math.sin(rad * 0.09) * Math.sin(rad * 0.023) > 0.7 ? 0.15 : 1;
    x.strokeStyle = `rgba(${210 + Math.floor(r() * 30)},${175 + Math.floor(r() * 30)},${130 + Math.floor(r() * 30)},${edge * gap * (0.35 + r() * 0.5)})`;
    x.lineWidth = 2; x.beginPath(); x.arc(mid, mid, rad, 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true;
  cache.set('ring', { map: t });
  return t;
};

// Little road-sign style plates for the decor: an arrow, a caution diamond, an orange arrow, all on a plain background.
export const signSkin = kind => skin('sign-' + kind, (x, h, s) => {
  const bg = { arrow: '#2f6fe0', caution: '#f2c230', orange: '#e8742a' }[kind] || '#2f6fe0';
  x.fillStyle = '#f4f6fa'; x.fillRect(0, 0, s, s);
  x.fillStyle = bg; x.fillRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
  x.fillStyle = kind === 'caution' ? '#1b1d24' : '#ffffff';
  if (kind === 'caution') {
    x.font = `bold ${s * 0.7}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', s / 2, s * 0.54);
  } else {
    x.beginPath(); x.moveTo(s * 0.2, s * 0.42); x.lineTo(s * 0.5, s * 0.42); x.lineTo(s * 0.5, s * 0.26); x.lineTo(s * 0.8, s * 0.5); x.lineTo(s * 0.5, s * 0.74); x.lineTo(s * 0.5, s * 0.58); x.lineTo(s * 0.2, s * 0.58); x.closePath(); x.fill();
  }
}, 128);

// The name plate over a base entrance: pale lettering on dark steel, with a thin border.
export const plaqueSkin = text => skin('plaque-' + text, (x, h, s, r, t) => {
  x.fillStyle = '#3a404c'; x.fillRect(0, 0, s, t);
  x.strokeStyle = '#aab2c0'; x.lineWidth = 6; x.strokeRect(6, 6, s - 12, t - 12);
  x.fillStyle = '#e8ecf4'; x.font = `bold ${t * 0.5}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, s / 2, t / 2 + 4);
}, 512, 128);
