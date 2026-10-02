// Soft contact shadows: a dark, feathered disc under every building and walking worker. The sun shadows alone are
// too coarse to catch something this small, and without a dark anchor under it each figure looks pasted on the floor.
import * as THREE from 'three';

let tex = null;
const blobTexture = () => {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c); tex.userData.keep = true;
  return tex;
};

export const blobMaterial = opacity => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
export const blobGeometry = radius => new THREE.CircleGeometry(radius, 20).rotateX(-Math.PI / 2);

// A disc that moves with something (a building or a character) and sits just above the floor.
export function addBlob(parent, radius, y = 0.03, opacity = 0.55) {
  const m = new THREE.Mesh(blobGeometry(radius), blobMaterial(opacity));
  m.position.y = y; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = false;
  m.raycast = () => {};   // a shadow is not something you can click
  parent.add(m);
  return m;
}
