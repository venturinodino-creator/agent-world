// Procedural surface detail drawn on canvases, so the buildings and workers get panel seams, rivets, grime,
// plaster grain, shingles, wood and fabric without loading any image files. Each skin is a colour map plus a
// matching bump map and is cached, so every building of one kind shares the same textures. Browser only.
import * as THREE from 'three';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const css = hex => '#' + hex.toString(16).padStart(6, '0');
const cache = new Map();

// Draws a colour canvas and a grey height canvas (mid-grey is flat, darker is cut in, lighter is raised).
function skin(key, draw, size = 256, tall = size) {
  if (cache.has(key)) return cache.get(key);
  const mk = () => { const c = document.createElement('canvas'); c.width = size; c.height = tall; return c; };
  const cc = mk(), hc = mk(), x = cc.getContext('2d'), h = hc.getContext('2d');
  h.fillStyle = '#808080'; h.fillRect(0, 0, size, tall);
  draw(x, h, size, lcg(key.length * 977 + size), tall);
  const map = new THREE.CanvasTexture(cc), bumpMap = new THREE.CanvasTexture(hc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.keep = true; }
  const out = { map, bumpMap }; cache.set(key, out);
  return out;
}

const speck = (x, s, r, n, rgb, a, w = 2) => {
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

// Fine sand: warm speckle with wind ripples, tiled across the whole desert (near white, so the dune colours show through).
export const sandSkin = () => skin('sand', (x, h, s, r) => {
  x.fillStyle = '#f3ead9'; x.fillRect(0, 0, s, s);
  speck(x, s, r, 9000, '120,90,50', 0.16, 1.4); speck(x, s, r, 7000, '255,250,235', 0.3, 1.4);
  for (let i = 0; i < 26; i++) {
    const y0 = r() * s, amp = 3 + r() * 5, f = 0.012 + r() * 0.02, ph = r() * 6;
    x.strokeStyle = `rgba(90,60,30,${0.05 + r() * 0.06})`; x.lineWidth = 1.5; x.beginPath();
    h.strokeStyle = '#9a9a9a'; h.lineWidth = 3; h.beginPath();
    for (let px = 0; px <= s; px += 8) { const py = y0 + Math.sin(px * f * 6.28 + ph) * amp; if (px) { x.lineTo(px, py); h.lineTo(px, py); } else { x.moveTo(px, py); h.moveTo(px, py); } }
    x.stroke(); h.stroke();
  }
  speck(h, s, r, 3000, '255,255,255', 0.4, 1.2);
}, 512);

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
