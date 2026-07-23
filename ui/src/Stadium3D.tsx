/**
 * Render 3D procedurale dello stadio (MODULE_UI, richiesta utente): la struttura
 * cambia con la capienza — provinciale (tribuna+gradinate), all'inglese (4 tribune,
 * angoli aperti), catino continuo, grande arena a tre anelli. Seggiolini nei colori
 * sociali, notturna con torri faro. Nessun modello esterno: solo geometria generata.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import {
  addBarrier,
  addCrane,
  addFrame,
  buildingGroup,
  stripeTexture,
  windowTexture,
} from './construction3d';
import type { ClubIdentity } from './identity';

const H = 420;

/** Cantiere in corso (MODULE_STADIUM §4): dove mettere gru e impalcature. */
export interface BuildSite {
  kind: string;
  target?: string | null;
}

/** Stato di un settore per il render per-settore (MODULE_STADIUM §3.3). */
export interface SectorView {
  seats: number;
  tiers: number;
  covered: boolean;
}

export function Stadium3D({
  id,
  capacity,
  pitch,
  site,
  built,
  sectors,
  daylight = false,
}: {
  id: ClubIdentity;
  capacity: number;
  /** Terreno dal modello Stadium; se assente lo deduce dal livello. */
  pitch?: 'terra' | 'erba';
  site?: BuildSite | null;
  /** Attività DELLO STADIO completate: nascono come edifici attorno all'impianto. */
  built?: readonly string[];
  /** Render per-settore: ogni spalto dai SUOI posti/anelli/copertura. */
  sectors?: Record<string, SectorView>;
  /** Giorno o notte (richiesta utente): sole e ombre lunghe, o riflettori e stelle. */
  daylight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Look cinematografico: ombre morbide + tone mapping filmico (via OutputPass).
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMappingExposure = daylight ? 0.85 : 1.0;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = daylight ? '#71879f' : '#07070b';
    scene.fog = new THREE.Fog(skyColor, daylight ? 750 : 300, daylight ? 1800 : 560);
    if (daylight) {
      // Cielo a GRADIENTE disegnato (via il modello fisico: troppi aloni o troppo buio):
      // zenit blu spento → orizzonte grigio-azzurro, mai bianco, sempre leggibile.
      const skyTex = canvasTex('daysky', 4, 256, (x) => {
        const grad = x.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#3f5878');
        grad.addColorStop(0.65, '#71879f');
        grad.addColorStop(1, '#8496a9');
        x.fillStyle = grad;
        x.fillRect(0, 0, 4, 256);
      });
      scene.background = skyTex;
    } else {
      scene.background = new THREE.Color(skyColor);
    }

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / H, 1, 1000);
    camera.position.set(150, 95, 165);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.enableDamping = true;
    controls.minDistance = 90;
    controls.maxDistance = 340;
    controls.maxPolarAngle = Math.PI * 0.48;

    if (daylight) {
      // Pomeriggio di partita: sole caldo obliquo con ombre lunghe, cielo aperto.
      scene.add(new THREE.HemisphereLight('#cfe0f2', '#5c6a4e', 0.7));
      const sun = new THREE.DirectionalLight('#ffe8c2', 1.9);
      sun.position.set(160, 190, 70);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      const cam = sun.shadow.camera;
      cam.left = -260;
      cam.right = 260;
      cam.top = 260;
      cam.bottom = -260;
      cam.far = 600;
      scene.add(sun);
    } else {
      // Notturna fisica: cielo freddo dall'alto, rimbalzo caldo dal prato, luna tenue,
      // e i VERI riflettori: spot con ombre che piovono sul campo.
      scene.add(new THREE.HemisphereLight('#26314d', '#141b12', 0.65));
      const moon = new THREE.DirectionalLight('#cfd8ee', 0.35);
      moon.position.set(-140, 180, -90);
      scene.add(moon);
      for (const [x, z, shadows] of [
        [110, 90, true],
        [-110, -90, false],
        [-110, 90, false],
        [110, -90, false],
      ] as const) {
        const spot = new THREE.SpotLight('#fff3d8', 2600, 600, Math.PI / 5, 0.45, 1.6);
        spot.position.set(x, 130, z);
        spot.target.position.set(0, 0, 0);
        spot.castShadow = shadows;
        if (shadows) {
          spot.shadow.mapSize.set(1024, 1024);
          spot.shadow.bias = -0.0004;
        }
        scene.add(spot, spot.target);
      }
      addNightSky(scene);
    }
    // Niente città (scelta utente): lo stadio vive nel suo spazio scenografico.
    buildStadium(scene, capacity, id, pitch, site, built, sectors, !daylight);

    // Post-processing: bloom (di notte sui fari), grana da pellicola, vignettatura.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Occlusione ambientale: incolla edifici e tribune a terra (realismo di contatto).
    const gtao = new GTAOPass(scene, camera, el.clientWidth, H);
    composer.addPass(gtao);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(el.clientWidth, H),
      daylight ? 0.12 : 0.25, // strength
      0.3, // radius
      daylight ? 1.0 : 0.92, // threshold: brillano solo fari e finestre accese
    );
    composer.addPass(bloom);
    composer.addPass(new FilmPass(daylight ? 0.12 : 0.22));
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset!.value = daylight ? 1.05 : 0.92;
    vignette.uniforms.darkness!.value = daylight ? 0.95 : 1.25;
    composer.addPass(vignette);
    composer.addPass(new OutputPass());

    let raf = 0;
    const loop = () => {
      controls.update();
      composer.render();
      raf = requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => {
      renderer.setSize(el.clientWidth, H);
      composer.setSize(el.clientWidth, H);
      camera.aspect = el.clientWidth / H;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
        }
      });
      composer.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [id, capacity, pitch, site, built, sectors, daylight]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800">
      <div ref={ref} className="w-full" />
      {/* attribuzione obbligatoria: il suolo è fatto di tile OSM/CARTO */}
      <span className="absolute bottom-1 right-2 text-[8px] text-zinc-600">
        © OpenStreetMap © CARTO
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- costruzione

function buildStadium(
  scene: THREE.Scene,
  capacity: number,
  id: ClubIdentity,
  pitchType?: 'terra' | 'erba',
  site?: BuildSite | null,
  built?: readonly string[],
  sectors?: Record<string, SectorView>,
  night = true,
): void {
  // Livelli strutturali: la capienza decide campo, anelli, angoli e copertura.
  // 0 ≤1k: terra battuta, una tribunetta scoperta sul lato lungo.
  // 1 ≤3k: erba, 4 tribunette scoperte (2 lati + 2 curve), angoli vuoti.
  // 2 <15k: provinciale — tribuna coperta + gradinate basse, torri faro.
  // 3 <40k: all'inglese — 4 tribune coperte, 2 anelli, angoli aperti, torri faro.
  // 4 <60k: catino continuo, angoli chiusi.  5 ≥60k: arena 3 anelli, tetto completo.
  const level =
    capacity < 1000
      ? 0
      : capacity < 3000
        ? 1
        : capacity < 15000
          ? 2
          : capacity < 40000
            ? 3
            : capacity < 60000
              ? 4
              : 5;
  const tiers = level <= 2 ? 1 : level === 3 ? 2 : 3;
  const closedCorners = level >= 4;
  const fullRoof = level >= 5;
  const pylons = level === 2 || level === 3;
  const dirt = pitchType ? pitchType === 'terra' : level === 0;

  // Terreno e campo.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(430, 56),
    new THREE.MeshStandardMaterial({ color: '#0e0e12', roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Bordo campo bagnato: appena riflettente, coglie i riflettori.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(126, 90),
    new THREE.MeshStandardMaterial({ color: '#26262c', roughness: 0.35, metalness: 0.1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  apron.receiveShadow = true;
  scene.add(apron);
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(105, 68),
    new THREE.MeshStandardMaterial({ map: pitchTexture(dirt), roughness: 0.9 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Materiali fisici: i seggiolini opachi, il tetto leggermente metallico che coglie i fari.
  const seatA = new THREE.MeshStandardMaterial({ color: id.primary, roughness: 0.85 });
  const seatB = new THREE.MeshStandardMaterial({ color: id.secondary, roughness: 0.85 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#3d3d44', roughness: 0.97 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#26262c',
    roughness: 0.45,
    metalness: 0.55,
  });
  const fascia = new THREE.MeshStandardMaterial({
    color: id.accent,
    roughness: 0.5,
    metalness: 0.2,
    // Nei grandi stadi la fascia del tetto si accende di notte: anello di colore.
    emissive: new THREE.Color(id.accent),
    emissiveIntensity: night && capacity >= 40000 ? 0.9 : 0.05,
  });
  // Varianti double-side per le gradinate curve degli angoli (lathe aperto ai lati).
  const seatADS = seatA.clone();
  const seatBDS = seatB.clone();
  const concreteDS = concrete.clone();
  const roofDS = roofMat.clone();
  const fasciaDS = fascia.clone();
  for (const m of [seatADS, seatBDS, concreteDS, roofDS, fasciaDS]) m.side = THREE.DoubleSide;
  const cornerMats = {
    seatA: seatADS,
    seatB: seatBDS,
    concrete: concreteDS,
    roof: roofDS,
    fascia: fasciaDS,
  };
  // Facciata esterna dei grandi stadi: muro, costoloni e banda nel colore d'accento.
  const facadeMat = new THREE.MeshStandardMaterial({ color: '#2c2c33', roughness: 0.9 });
  const bandMat = new THREE.MeshStandardMaterial({
    color: id.accent,
    roughness: 0.4,
    emissive: new THREE.Color(id.accent),
    emissiveIntensity: night ? 1.35 : 0.12,
  });
  // La folla nei colori sociali (sciarpe, maglie, giacconi scuri).
  const crowdColors = [
    new THREE.Color(id.primary),
    new THREE.Color(id.secondary),
    new THREE.Color('#d8d0bc'),
    new THREE.Color('#23232c'),
  ];

  // Quattro lati: [lunghezza tribuna, distanza dal centro] — lati lunghi e curve.
  const SIDES: { len: number; dist: number; angle: number }[] = [
    { len: 110, dist: 41, angle: 0 },
    { len: 110, dist: 41, angle: Math.PI },
    { len: 74, dist: 59.5, angle: Math.PI / 2 },
    { len: 74, dist: 59.5, angle: -Math.PI / 2 },
  ];

  let showPylons = pylons;
  let maxTop = 0;

  if (sectors) {
    // ---- Render PER-SETTORE (MODULE_STADIUM §3.3): ogni spalto dai suoi dati ----
    const MAIN_OF = ['principale', 'distinti', 'curvaNord', 'curvaSud'] as const;
    SIDES.forEach((side, s) => {
      const sec = sectors[MAIN_OF[s]!];
      if (!sec || sec.seats === 0) return;
      // La stazza dello spalto cresce coi posti del SUO settore.
      const ref = s < 2 ? 15000 : 9000;
      const scale = Math.min(1.5, Math.max(0.35, Math.sqrt(sec.seats / ref)));
      const sideLen = { ...side, len: side.len * Math.min(1, 0.55 + scale * 0.4) };
      let dist = side.dist;
      let base = 0;
      for (let t = 0; t < sec.tiers; t++) {
        const depth = 11 + t * 2;
        const height = Math.max(2.5, (7 + t * 2.5) * (0.45 + scale * 0.55));
        addStand(
          scene,
          sideLen,
          dist,
          base,
          depth,
          height,
          t % 2 === 0 ? seatA : seatB,
          concrete,
          crowdColors,
        );
        dist += depth + 1.5;
        base += height + 2;
      }
      if (sec.covered) {
        addRoof(scene, sideLen, dist - 6, base + 3, 10 + sec.tiers * 2, roofMat, fascia);
      }
      if (capacity >= 40000) addFacade(scene, sideLen, dist, base, facadeMat, roofMat, bandMat);
      maxTop = Math.max(maxTop, base);
    });

    // Ingombro reale di una tribuna adiacente (mezza lunghezza + fronte): serve
    // agli angoli per incastrarsi ESATTAMENTE nel vuoto, senza compenetrazioni.
    const sideHalf = (s: number): { half: number; dist: number } => {
      const adj = sectors[MAIN_OF[s]!];
      const side = SIDES[s]!;
      if (!adj || adj.seats === 0) return { half: side.len * 0.3, dist: side.dist };
      const ref = s < 2 ? 15000 : 9000;
      const sc = Math.min(1.5, Math.max(0.35, Math.sqrt(adj.seats / ref)));
      return { half: (side.len * Math.min(1, 0.55 + sc * 0.4)) / 2, dist: side.dist };
    };

    const CORNER_DIAG: Record<string, [number, number]> = {
      angoloNE: [1, -1],
      angoloNO: [-1, -1],
      angoloSE: [1, 1],
      angoloSO: [-1, 1],
    };
    for (const [cid, [dx, dz]] of Object.entries(CORNER_DIAG)) {
      const sec = sectors[cid];
      if (!sec || sec.seats === 0) continue;
      const scale = Math.min(1.4, Math.max(0.4, Math.sqrt(sec.seats / 2500)));
      // Gradinata CURVA: un arco che raccorda le due tribune adiacenti — il
      // catino si chiude in modo continuo e i posti crescono in profondità.
      const sx = -dz;
      const sz = dx;
      const L = sideHalf(sz > 0 ? 0 : 1);
      const S = sideHalf(sx > 0 ? 3 : 2);
      const arc = cornerSpan(sx, sz, L.half, L.dist, S.dist, S.half);
      const tiersArr = Array.from({ length: sec.tiers }, (_, t) => ({
        depth: 11 + t * 2,
        height: Math.max(2.5, (7 + t * 2.5) * (0.45 + scale * 0.55)),
      }));
      addCornerArc(scene, arc, tiersArr, !!sec.covered, cornerMats, crowdColors);
    }

    // Torri faro finché le quattro tribune principali non sono tutte coperte.
    showPylons = MAIN_OF.some(
      (m) => !sectors[m] || !sectors[m]!.covered || sectors[m]!.seats === 0,
    );
  } else {
    SIDES.forEach((side, s) => {
      const isMain = s === 0;
      // ≤1k posti: solo la tribunetta sul lato lungo, il resto è prato.
      if (level === 0 && !isMain) return;
      // Tribunette dei campetti (livelli 0-1) e gradinate della provinciale.
      const tiny = level <= 1;
      const lowTerrace = tiny || (level === 2 && !isMain);
      const sideLen = tiny ? { ...side, len: side.len * 0.62 } : side;
      let dist = side.dist;
      let base = 0;
      for (let t = 0; t < (lowTerrace ? 1 : tiers); t++) {
        const depth = tiny ? 6 : lowTerrace ? 8 : 13 + t;
        const height = tiny ? 3 : lowTerrace ? 4.5 : 9 + t * 2.5;
        addStand(
          scene,
          sideLen,
          dist,
          base,
          depth,
          height,
          t % 2 === 0 ? seatA : seatB,
          concrete,
          crowdColors,
        );
        dist += depth + 1.5;
        base += height + 2;
      }
      // Copertura: dai 3k in su la provinciale copre la principale, poi tutte.
      const roofed = level >= 3 || (level === 2 && isMain);
      if (roofed) {
        addRoof(scene, side, dist - 6, base + 3, 12 + tiers * 2, roofMat, fascia);
      }
      if (level >= 4 && !lowTerrace) {
        addFacade(scene, sideLen, dist, base, facadeMat, roofMat, bandMat);
      }
      maxTop = Math.max(maxTop, base);
    });

    // Angoli: chiusi nel catino e nell'arena — gradinate curve che raccordano.
    if (closedCorners) {
      const tiersArr = Array.from({ length: tiers }, (_, t) => ({
        depth: 13 + t,
        height: 9 + t * 2.5,
      }));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const arc = cornerSpan(sx, sz, 55, 41, 59.5, 37);
          addCornerArc(scene, arc, tiersArr, fullRoof, cornerMats, crowdColors);
        }
      }
    }
  }

  // Maxischermi su due angoli opposti: la firma dei grandi stadi (dai 30k).
  if (capacity >= 30000) addScreens(scene, maxTop + 9, night, concrete);

  // Torri faro per gli stadi senza copertura completa.
  if (showPylons) {
    const px = 70;
    const pz = 52;
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 42, 8), concrete);
        tower.position.set(dx * px, 21, dz * pz);
        scene.add(tower);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(7, 5, 1.2),
          // Colore HDR sopra 1: è quello che accende il bloom dei fari.
          night
            ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.6, 1.3) })
            : new THREE.MeshStandardMaterial({ color: '#c9ccd4', roughness: 0.5, metalness: 0.4 }),
        );
        head.position.set(dx * px, 44, dz * pz);
        head.lookAt(0, 0, 0);
        scene.add(head);
      }
    }
  }

  // ---- Attività dello stadio completate: edifici attorno all'impianto ----
  // Slot fissi sul perimetro (x, z, rotazione verso lo stadio); concerti = licenza.
  const SLOTS: Record<string, [number, number, number]> = {
    bar: [-96, 60, 0.5],
    ristorante: [98, 60, -0.5],
    hotel: [-110, -72, 0.9],
    centroCommerciale: [122, -80, -2.3],
    teatro: [-64, 98, Math.PI],
    opera: [64, 98, Math.PI],
  };
  for (const b of built ?? []) {
    const slot = SLOTS[b];
    if (!slot) continue;
    const g = buildingGroup(b, id.accent);
    g.position.set(slot[0], 0, slot[1]);
    g.rotation.y = slot[2];
    scene.add(g);
  }

  // ---- Cantiere visibile (MODULE_STADIUM §4) ----
  if (site) {
    const SIDE_OF: Record<string, number> = {
      principale: 0,
      distinti: 1,
      curvaNord: 2,
      curvaSud: 3,
    };
    const CORNER_OF: Record<string, [number, number]> = {
      angoloNE: [1, -1],
      angoloNO: [-1, -1],
      angoloSE: [1, 1],
      angoloSO: [-1, 1],
    };
    if (site.kind === 'terreno') {
      // Campo in rifacimento: teli di terra, transenne e un rullo al lavoro.
      const cover = new THREE.Mesh(
        new THREE.PlaneGeometry(105, 68),
        new THREE.MeshLambertMaterial({ color: '#7a5432', transparent: true, opacity: 0.65 }),
      );
      cover.rotation.x = -Math.PI / 2;
      cover.position.y = 0.15;
      scene.add(cover);
      for (const [bx, bz] of [
        [-30, 0],
        [30, 0],
        [0, -22],
        [0, 22],
      ] as const) {
        addBarrier(scene, bx, bz, 0);
      }
      addCrane(scene, 62, -44, 24, 0.6);
    } else if (site.kind === 'commerciale') {
      // L'attività nasce FUORI dallo stadio: scheletro in cemento + gru.
      addFrame(scene, 100, 66);
      addCrane(scene, 116, 76, 34, -2.2);
    } else if (site.target && site.target in SIDE_OF) {
      const side = SIDES[SIDE_OF[site.target]!]!;
      addSectorWorks(scene, side, tiers);
    } else if (site.target && site.target in CORNER_OF) {
      const [dx, dz] = CORNER_OF[site.target]!;
      addCrane(scene, dx * 78, dz * 62, 30, Math.atan2(-dz, -dx));
      addBarrier(scene, dx * 62, dz * 50, Math.atan2(dz, dx));
    }
  }
}

/** Impalcature + pannelli a strisce + gru sul settore in lavori. */
function addSectorWorks(
  scene: THREE.Scene,
  side: { len: number; dist: number; angle: number },
  tiers: number,
): void {
  const g = new THREE.Group();
  const height = 10 + tiers * 4;
  // Pannellatura da cantiere sulla facciata interna del settore.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(side.len * 0.9, height * 0.55),
    new THREE.MeshLambertMaterial({
      map: stripeTexture(),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    }),
  );
  panel.position.set(0, height * 0.32, -1.2);
  g.add(panel);
  // Tubi dell'impalcatura.
  const pole = new THREE.MeshLambertMaterial({ color: '#8b8b93' });
  const n = Math.max(4, Math.floor(side.len / 12));
  for (let i = 0; i <= n; i++) {
    const x = -side.len * 0.45 + (side.len * 0.9 * i) / n;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.35), pole);
    m.position.set(x, height / 2, -0.4);
    g.add(m);
  }
  for (const y of [height * 0.33, height * 0.66]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(side.len * 0.9, 0.3, 0.3), pole);
    bar.position.set(0, y, -0.4);
    g.add(bar);
  }
  g.rotation.y = -side.angle;
  g.translateZ(side.dist - 1.5);
  scene.add(g);
  // La gru dietro il settore, oltre l'ultimo anello.
  const crane = new THREE.Group();
  addCrane(crane, side.len * 0.28, 0, 26 + tiers * 5, Math.PI);
  crane.rotation.y = -side.angle;
  crane.translateZ(side.dist + 16 + tiers * 6);
  scene.add(crane);
}

/** Una tribuna: cuneo estruso (spalti) su base in cemento — e la FOLLA sopra. */
function addStand(
  scene: THREE.Scene,
  side: { len: number; angle: number },
  dist: number,
  base: number,
  depth: number,
  height: number,
  seat: THREE.Material,
  concrete: THREE.Material,
  crowd?: THREE.Color[],
): void {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(depth, height);
  shape.lineTo(depth, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: side.len, bevelEnabled: false });
  // Profilo (X=profondità, Y=altezza) estruso lungo Z → ruota perché la lunghezza
  // corra lungo il lato e la salita vada VERSO L'ESTERNO del campo (+Z locale).
  geo.rotateY(-Math.PI / 2);
  geo.translate(side.len / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, seat);
  mesh.position.y = base;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  if (base > 0) {
    // Basamento in cemento sotto gli anelli superiori.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(side.len, base, depth), concrete);
    plinth.position.set(0, base / 2, depth / 2);
    plinth.castShadow = true;
    g.add(plinth);
  }

  // La folla: istanze sedute sulla pendenza, colori sociali con buchi realistici.
  if (crowd && crowd.length > 0 && height > 2) {
    const rows = Math.max(2, Math.floor(depth / 2.2));
    const perRow = Math.max(4, Math.floor(side.len / 1.9));
    const dummy = new THREE.Object3D();
    const positions: { x: number; y: number; z: number; c: THREE.Color }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < perRow; i++) {
        // Pseudo-caso deterministico: niente Math.random, la folla è stabile.
        const h = (r * 73856093 + i * 19349663 + Math.floor(dist * 7)) >>> 0;
        if (h % 100 >= 74) continue; // seggiolini vuoti
        const zz = ((r + 0.5) / rows) * depth;
        positions.push({
          x: -side.len / 2 + ((i + 0.5) / perRow) * side.len + ((h % 7) - 3) * 0.08,
          y: base + (zz / depth) * height + 0.75,
          z: zz,
          c: crowd[h % crowd.length]!,
        });
      }
    }
    if (positions.length > 0) {
      const inst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.05, 1.5, 0.75),
        new THREE.MeshStandardMaterial({ roughness: 0.95 }),
        positions.length,
      );
      positions.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, p.c);
      });
      g.add(inst);
    }
  }

  g.rotation.y = -side.angle;
  // Dopo la rotazione, spingi il gruppo verso l'esterno lungo la normale del lato.
  g.translateZ(dist);
  scene.add(g);
}

/**
 * LA CITTÀ VERA IN 3D (richiesta utente, 2ª iterazione): gli edifici REALI di
 * OpenStreetMap attorno alle coordinate dello stadio, estrusi alle loro altezze —
 * i palazzi veri allineati alle strade vere della mappa a terra. Cache per club
 * (il toggle giorno/notte non riscarica). Fallback: contesto procedurale.
 */
// ---- Canvas texture con cache (usata dal cielo a gradiente diurno) ----
const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Cielo notturno: una cupola di stelle deterministiche sopra lo stadio. */
function addNightSky(scene: THREE.Scene): void {
  const pts: number[] = [];
  for (let i = 0; i < 550; i++) {
    const h = (i * 2654435761) >>> 0;
    const az = ((h % 3600) / 3600) * Math.PI * 2;
    const el = 0.08 + (((h >> 8) % 1000) / 1000) * 1.35;
    const r = 430;
    pts.push(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: '#c8cfe4', size: 1.6, sizeAttenuation: false, fog: false }),
  );
  scene.add(stars);
}

/** Tettoia a sbalzo sopra l'ultimo anello, con fascia nel colore d'accento. */
function addRoof(
  scene: THREE.Scene,
  side: { len: number; angle: number },
  outerDist: number,
  y: number,
  depth: number,
  roofMat: THREE.Material,
  fascia: THREE.Material,
): void {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(side.len + 2, 0.8, depth), roofMat);
  slab.position.set(0, y, -depth / 2 + 2);
  slab.rotation.x = 0.06;
  g.add(slab);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(side.len + 2, 1.6, 0.5), fascia);
  edge.position.set(0, y - 0.4, -depth + 2.2);
  g.add(edge);
  g.rotation.y = -side.angle;
  g.translateZ(outerDist);
  scene.add(g);
}

/**
 * L'arco di un settore angolare: dai due spigoli interni delle tribune adiacenti
 * (mezza lunghezza + fronte) ricava inizio, ampiezza e raggio interno del vuoto.
 * Ogni punto dell'arco a raggio ≥ r0 resta FUORI dai corpi delle tribune: è la
 * garanzia geometrica che elimina le compenetrazioni.
 */
function cornerSpan(
  sx: number,
  sz: number,
  halfLong: number,
  distLong: number,
  distShort: number,
  halfShort: number,
): { phiStart: number; phiSpan: number; r0: number } {
  const a1 = Math.atan2(sx * halfLong, sz * distLong);
  let a2 = Math.atan2(sx * distShort, sz * halfShort);
  if (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
  if (a1 - a2 > Math.PI) a2 += 2 * Math.PI;
  const phiStart = Math.min(a1, a2) + 0.03;
  const phiSpan = Math.max(0.12, Math.abs(a2 - a1) - 0.06);
  const r0 = Math.max(Math.hypot(halfLong, distLong), Math.hypot(distShort, halfShort)) + 0.5;
  return { phiStart, phiSpan, r0 };
}

/**
 * Gradinata angolare CURVA (lathe): anelli che raccordano le tribune come in un
 * vero catino, con folla, testate di cemento e tettoia ad arco se coperta.
 */
function addCornerArc(
  scene: THREE.Scene,
  arc: { phiStart: number; phiSpan: number; r0: number },
  tiers: { depth: number; height: number }[],
  covered: boolean,
  m: {
    seatA: THREE.Material;
    seatB: THREE.Material;
    concrete: THREE.Material;
    roof: THREE.Material;
    fascia: THREE.Material;
  },
  crowd?: THREE.Color[],
): void {
  const { phiStart, phiSpan, r0 } = arc;
  const segs = Math.max(6, Math.round(phiSpan * 30));
  let r = r0;
  let base = 0;
  tiers.forEach((tier, t) => {
    const r1 = r + tier.depth;
    const yTop = base + tier.height;
    // Profilo chiuso (pendenza, retro, fondo) rivoluto sull'arco.
    const profile = [
      new THREE.Vector2(r, base),
      new THREE.Vector2(r1, yTop),
      new THREE.Vector2(r1, 0),
      new THREE.Vector2(r, 0),
      new THREE.Vector2(r, base),
    ];
    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(profile, segs, phiStart, phiSpan),
      t % 2 === 0 ? m.seatB : m.seatA,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Testate: chiudono le estremità dell'arco verso le tribune.
    for (const phi of [phiStart, phiStart + phiSpan]) {
      const shape = new THREE.Shape();
      shape.moveTo(r, 0);
      shape.lineTo(r, base);
      shape.lineTo(r1, yTop);
      shape.lineTo(r1, 0);
      shape.closePath();
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), m.concrete);
      cap.rotation.y = phi - Math.PI / 2;
      scene.add(cap);
    }
    // La folla sull'arco, stessa mano deterministica delle tribune.
    if (crowd && crowd.length > 0 && tier.height > 2) {
      const rows = Math.max(2, Math.floor(tier.depth / 2.2));
      const dummy = new THREE.Object3D();
      const positions: { x: number; y: number; z: number; c: THREE.Color }[] = [];
      for (let rr = 0; rr < rows; rr++) {
        const rad = r + ((rr + 0.5) / rows) * tier.depth;
        const per = Math.max(3, Math.floor((rad * phiSpan) / 1.9));
        for (let i = 0; i < per; i++) {
          const h = (rr * 73856093 + i * 19349663 + Math.floor(r0 * 7) + t * 97) >>> 0;
          if (h % 100 >= 74) continue;
          const phi = phiStart + ((i + 0.5) / per) * phiSpan;
          positions.push({
            x: rad * Math.sin(phi),
            z: rad * Math.cos(phi),
            y: base + ((rr + 0.5) / rows) * tier.height + 0.75,
            c: crowd[h % crowd.length]!,
          });
        }
      }
      if (positions.length > 0) {
        const inst = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1.05, 1.5, 0.75),
          new THREE.MeshStandardMaterial({ roughness: 0.95 }),
          positions.length,
        );
        positions.forEach((p, i) => {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = Math.atan2(p.x, p.z);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          inst.setColorAt(i, p.c);
        });
        scene.add(inst);
      }
    }
    r = r1 + 1.5;
    base = yTop + 2;
  });
  if (covered) {
    // Tettoia curva: slab ad arco con fascia interna nel colore d'accento.
    const rOut = r + 0.5;
    const rIn = rOut - (10 + tiers.length * 2);
    const y = base + 2;
    const slab = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(rIn, y - 0.5),
          new THREE.Vector2(rOut, y + 0.4),
          new THREE.Vector2(rOut, y + 1.1),
          new THREE.Vector2(rIn, y + 0.2),
          new THREE.Vector2(rIn, y - 0.5),
        ],
        segs,
        phiStart,
        phiSpan,
      ),
      m.roof,
    );
    slab.castShadow = true;
    scene.add(slab);
    const edge = new THREE.Mesh(
      new THREE.LatheGeometry(
        [new THREE.Vector2(rIn + 0.3, y - 1.6), new THREE.Vector2(rIn + 0.3, y - 0.2)],
        segs,
        phiStart,
        phiSpan,
      ),
      m.fascia,
    );
    scene.add(edge);
  }
}

/**
 * Facciata esterna dei grandi stadi (≥40k): muro perimetrale dietro la tribuna,
 * costoloni verticali e banda orizzontale nel colore d'accento — che di notte
 * si accende in un anello luminoso attorno all'impianto.
 */
function addFacade(
  scene: THREE.Scene,
  side: { len: number; angle: number },
  outerDist: number,
  topBase: number,
  wallMat: THREE.Material,
  ribMat: THREE.Material,
  bandMat: THREE.Material,
): void {
  const g = new THREE.Group();
  const H = Math.max(10, topBase * 0.85);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(side.len + 4, H, 2), wallMat);
  wall.position.set(0, H / 2, 1);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(side.len + 4.6, 1.4, 2.5), bandMat);
  stripe.position.set(0, H * 0.74, 1);
  g.add(stripe);
  const nRibs = Math.max(4, Math.round(side.len / 14));
  for (let i = 0; i <= nRibs; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 2.6), ribMat);
    rib.position.set(-side.len / 2 + (i / nRibs) * side.len, H / 2, 1);
    g.add(rib);
  }
  g.rotation.y = -side.angle;
  g.translateZ(outerDist + 0.5);
  scene.add(g);
}

/** Maxischermi su due angoli opposti, montati su piloni, schermo acceso. */
function addScreens(scene: THREE.Scene, y: number, night: boolean, post: THREE.Material): void {
  for (const [sx, sz] of [
    [1, -1],
    [-1, 1],
  ] as const) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(18, 10.5, 1),
      new THREE.MeshStandardMaterial({ color: '#101016', roughness: 0.6, metalness: 0.3 }),
    );
    frame.castShadow = true;
    g.add(frame);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(16.6, 9),
      night
        ? // Colore sopra 1: lo schermo acceso entra nel bloom notturno.
          new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.72, 1.15) })
        : new THREE.MeshStandardMaterial({
            color: '#42506a',
            emissive: '#22354e',
            emissiveIntensity: 0.5,
            roughness: 0.4,
          }),
    );
    screen.position.z = 0.56;
    g.add(screen);
    const h = Math.max(4, y - 5.2);
    for (const px of [-6.5, 6.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, h, 8), post);
      pole.position.set(px, -5.2 - h / 2, -0.3);
      g.add(pole);
    }
    const d = 86 * Math.SQRT1_2;
    g.position.set(sx * d, y, sz * d);
    g.lookAt(0, Math.max(2, y * 0.45), 0);
    scene.add(g);
  }
}

/** Il terreno di gioco su canvas: erba con righe di taglio, o terra battuta. */
function pitchTexture(dirt: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1050;
  c.height = 680;
  const x = c.getContext('2d')!;
  if (dirt) {
    // Terra battuta: fondo bruno con chiazze irregolari (deterministiche).
    x.fillStyle = '#8a5f36';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 60; i++) {
      const px = ((i * 197) % 1050) + 10;
      const py = ((i * 131) % 660) + 10;
      x.fillStyle = i % 2 === 0 ? 'rgba(120,79,44,0.5)' : 'rgba(158,113,66,0.45)';
      x.beginPath();
      x.ellipse(px, py, 26 + (i % 5) * 9, 14 + (i % 3) * 7, (i % 7) * 0.5, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    for (let i = 0; i < 10; i++) {
      x.fillStyle = i % 2 === 0 ? '#1d6b35' : '#1a5f2f';
      x.fillRect((c.width / 10) * i, 0, c.width / 10, c.height);
    }
  }
  x.strokeStyle = dirt ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)';
  x.lineWidth = 4;
  x.strokeRect(30, 30, c.width - 60, c.height - 60);
  x.beginPath();
  x.moveTo(c.width / 2, 30);
  x.lineTo(c.width / 2, c.height - 30);
  x.stroke();
  x.beginPath();
  x.arc(c.width / 2, c.height / 2, 90, 0, Math.PI * 2);
  x.stroke();
  x.strokeRect(30, c.height / 2 - 200, 160, 400);
  x.strokeRect(c.width - 190, c.height / 2 - 200, 160, 400);
  x.strokeRect(30, c.height / 2 - 90, 55, 180);
  x.strokeRect(c.width - 85, c.height / 2 - 90, 55, 180);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
