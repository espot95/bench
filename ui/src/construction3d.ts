/**
 * Elementi 3D condivisi (MODULE_STADIUM §3-4): cantiere (gru, transenne, scheletro,
 * strisce giallo/nero) ed edifici procedurali delle attività — usati sia dal render
 * dello stadio sia dal viewer delle strutture in città. Solo geometria generata.
 */

import * as THREE from 'three';

let stripeCache: THREE.CanvasTexture | null = null;
/** Strisce oblique giallo/nero da cantiere (una sola texture, riusata). */
export function stripeTexture(): THREE.CanvasTexture {
  if (stripeCache) return stripeCache;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d9b13b';
  x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#1c1917';
  for (let i = -32; i < 128; i += 32) {
    x.beginPath();
    x.moveTo(i, 32);
    x.lineTo(i + 16, 0);
    x.lineTo(i + 32, 0);
    x.lineTo(i + 16, 32);
    x.fill();
  }
  stripeCache = new THREE.CanvasTexture(c);
  stripeCache.wrapS = THREE.RepeatWrapping;
  stripeCache.repeat.set(3, 1);
  return stripeCache;
}

let windowCache: THREE.CanvasTexture | null = null;
/** Finestre notturne accese (facciate di hotel/edifici alti). */
export function windowTexture(): THREE.CanvasTexture {
  if (windowCache) return windowCache;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2e2e36';
  x.fillRect(0, 0, 64, 128);
  for (let r = 0; r < 12; r++) {
    for (let k = 0; k < 5; k++) {
      x.fillStyle = (r * 5 + k) % 3 === 0 ? '#f2d98a' : '#44444e';
      x.fillRect(6 + k * 11, 6 + r * 10, 7, 6);
    }
  }
  windowCache = new THREE.CanvasTexture(c);
  return windowCache;
}

/** Gru a torre da cantiere: torre, braccio, controbraccio, cavo e gancio. */
export function addCrane(
  parent: THREE.Scene | THREE.Group,
  x: number,
  z: number,
  h: number,
  yaw = 0,
): void {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ roughness: 0.9, color: '#e0b13e' });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), steel);
  mast.position.y = h / 2;
  g.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 24), steel);
  jib.position.set(0, h + 0.5, -9);
  g.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 6), steel);
  counter.position.set(0, h + 0.4, 5.5);
  g.add(counter);
  const cable = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, h * 0.45, 0.12),
    new THREE.MeshBasicMaterial({ color: '#c9c9cf' }),
  );
  cable.position.set(0, h - h * 0.225 + 1, -16);
  g.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), steel);
  hook.position.set(0, h * 0.55, -16);
  g.add(hook);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  parent.add(g);
}

/** Transenna da cantiere a strisce. */
export function addBarrier(
  parent: THREE.Scene | THREE.Group,
  x: number,
  z: number,
  yaw: number,
): void {
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.6, 0.4),
    new THREE.MeshStandardMaterial({ roughness: 0.8, map: stripeTexture() }),
  );
  b.position.set(x, 0.9, z);
  b.rotation.y = yaw;
  parent.add(b);
}

/** Scheletro in cemento a tre piani (edificio in costruzione). */
export function addFrame(parent: THREE.Scene | THREE.Group, x: number, z: number): void {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ roughness: 0.9, color: '#6b6b72' });
  for (let floor = 0; floor < 3; floor++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 12), concrete);
    slab.position.y = 3.5 + floor * 4;
    g.add(slab);
  }
  for (const cx of [-8, 0, 8]) {
    for (const cz of [-5, 5]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), concrete);
      col.position.set(cx, 6, cz);
      g.add(col);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = -0.5;
  parent.add(g);
}

const lam = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const box = (w: number, h: number, d: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

/**
 * L'edificio finito di un'attività (stadio o città), riconoscibile a colpo
 * d'occhio: chiosco, vetrina, torre-hotel, mall, teatro, opera, negozio, museo.
 */
export function buildingGroup(id: string, accent: string): THREE.Group {
  const g = new THREE.Group();
  const stone = lam('#8f8a7c');
  const dark = lam('#3c3c44');
  const cream = lam('#cfc8b4');
  const accentMat = lam(accent);

  if (id === 'bar') {
    const body = box(8, 4, 6, cream);
    body.position.y = 2;
    g.add(body);
    const awn = box(8.6, 0.4, 2.4, accentMat);
    awn.position.set(0, 3.6, 3.6);
    awn.rotation.x = 0.25;
    g.add(awn);
    const sign = box(4, 1, 0.3, dark);
    sign.position.set(0, 4.6, 2.9);
    g.add(sign);
  } else if (id === 'ristorante') {
    const body = box(12, 5, 9, lam('#6a5a48'));
    body.position.y = 2.5;
    g.add(body);
    const glass = box(10, 3, 0.3, lam('#31404f'));
    glass.position.set(0, 2, 4.7);
    g.add(glass);
    const band = box(12.4, 0.9, 9.4, accentMat);
    band.position.y = 5.2;
    g.add(band);
  } else if (id === 'hotel') {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(12, 28, 12),
      new THREE.MeshStandardMaterial({
        map: windowTexture(),
        emissiveMap: windowTexture(),
        emissive: new THREE.Color('#ffe9a8'),
        emissiveIntensity: 0.85,
        roughness: 0.7,
      }),
    );
    tower.position.y = 14;
    g.add(tower);
    const crown = box(13, 1.2, 13, accentMat);
    crown.position.y = 28.6;
    g.add(crown);
    const lobby = box(16, 3.5, 14, dark);
    lobby.position.y = 1.75;
    g.add(lobby);
  } else if (id === 'centroCommerciale') {
    const mall = box(30, 8, 20, lam('#57575e'));
    mall.position.y = 4;
    g.add(mall);
    const stripe = box(30.4, 1.4, 20.4, accentMat);
    stripe.position.y = 7;
    g.add(stripe);
    const entry = box(8, 5, 2, lam('#31404f'));
    entry.position.set(0, 2.5, 10.8);
    g.add(entry);
  } else if (id === 'teatro' || id === 'museo') {
    // Facciata classica: base, colonnato, architrave e timpano.
    const base = box(18, 1.4, 13, stone);
    base.position.y = 0.7;
    g.add(base);
    const hall = box(15, 7, 10, id === 'museo' ? cream : lam('#6a5a48'));
    hall.position.set(0, 4.9, -1);
    g.add(hall);
    for (const cx of [-6, -2, 2, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 6.4, 10), cream);
      col.position.set(cx, 4.6, 4.6);
      g.add(col);
    }
    const arch = box(16, 1.2, 3, cream);
    arch.position.set(0, 8.3, 4.2);
    g.add(arch);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 3), cream);
    ped.rotation.z = Math.PI / 2;
    ped.rotation.x = Math.PI;
    ped.position.set(0, 9.6, 4.2);
    ped.scale.set(1, 1, 2.2);
    g.add(ped);
  } else if (id === 'opera') {
    const hall = box(14, 8, 14, lam('#5b4a5e'));
    hall.position.y = 4;
    g.add(hall);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(6.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      lam('#c9a961'),
    );
    dome.position.y = 8;
    g.add(dome);
    const front = box(10, 5, 1.2, cream);
    front.position.set(0, 2.5, 7.4);
    g.add(front);
  } else if (id === 'negozio') {
    const shop = box(12, 5, 9, lam('#4e4e56'));
    shop.position.y = 2.5;
    g.add(shop);
    const sign = box(12.4, 1.6, 0.5, accentMat);
    sign.position.set(0, 4.6, 4.6);
    g.add(sign);
    const vetrina = box(9, 2.6, 0.3, lam('#31404f'));
    vetrina.position.set(0, 1.6, 4.7);
    g.add(vetrina);
  } else {
    const generic = box(10, 6, 8, stone);
    generic.position.y = 3;
    g.add(generic);
  }
  return g;
}
