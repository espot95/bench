/**
 * ATELIER DELLE DIVISE (MODULE_STADIUM §3.4, punto E — richiesta utente): editor
 * della maglia con anteprima SVG viva, trama caricata da file locale (ridotta e
 * compressa nel salvataggio), proposte dello sponsor tecnico, lancio col verdetto
 * della piazza e archivio delle annate da rievocare.
 */

import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { KitDesign, KitPattern, KitStyle } from '../../src/core/types';
import { Help } from './Help';
import { Ic } from './Ic';
import { type GameSession, kitAtelierView, kitFidelity, launchKit } from './game';

const PATTERN_LABEL: Record<KitPattern, string> = {
  tinta: 'Tinta unita',
  palato: 'Palato',
  fasciato: 'Fasciato',
  sash: 'Sash',
  mezzo: 'Mezzo',
  scacchi: 'Scacchi',
  vstorica: 'V storica',
};

const STYLE_LABEL: Record<KitStyle, string> = {
  storico: 'Storico',
  creativo: 'Creativo',
  moderno: 'Moderno',
};

/**
 * La maglia SVG "da sarto": silhouette curva, luci e ombre in gradiente, cuciture,
 * polsini e bordo colletto, ombra a terra. Il pattern (o la trama caricata) veste
 * SOLO il torso, clippato sulla sagoma vera.
 */
export function KitShirt({
  design,
  size = 96,
  sponsor,
}: {
  design: KitDesign;
  size?: number;
  sponsor?: string | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (k: string) => `kit-${k}-${uid}`;
  const d = design;

  // Sagome (viewBox 140×150): torso con spalle spioventi, vita appena segnata,
  // orlo curvo; maniche raglan corte con polsino.
  const torso =
    'M48,26 C52,20 58,17 62,16 L78,16 C82,17 88,20 92,26 ' +
    'L94,62 C94.5,84 94.5,100 94,116 C94,126 86,132 70,132 C54,132 46,126 46,116 ' +
    'C45.5,100 45.5,84 46,62 Z';
  const sleeveL = 'M48,26 C40,29 30,36 24,46 C22,49 21,52 22,55 L32,72 C34,69 40,63 46,60 L47,40 Z';
  const sleeveR =
    'M92,26 C100,29 110,36 116,46 C118,49 119,52 118,55 L108,72 C106,69 100,63 94,60 L93,40 Z';

  return (
    <svg
      width={size}
      height={(size * 150) / 140}
      viewBox="0 0 140 150"
      role="img"
      aria-label="anteprima divisa"
    >
      <defs>
        <clipPath id={id('torso')}>
          <path d={torso} />
        </clipPath>
        <clipPath id={id('sll')}>
          <path d={sleeveL} />
        </clipPath>
        <clipPath id={id('slr')}>
          <path d={sleeveR} />
        </clipPath>
        {/* Luce dall'alto + ombra sul fondo: il tessuto prende volume. */}
        <linearGradient id={id('light')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="0.75" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        {/* Ombre morbide sui fianchi: il torso si arrotonda. */}
        <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.28" />
          <stop offset="0.14" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.86" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        {/* Sheen diagonale: il riflesso del tecnico in vetrina. */}
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.58" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Micro-trama del tessuto (quasi invisibile, dà la grana). */}
        <pattern id={id('weave')} patternUnits="userSpaceOnUse" width="3" height="3">
          <path d="M0,3 L3,0" stroke="#ffffff" strokeWidth="0.4" opacity="0.05" />
        </pattern>
        {d.texture && (
          <pattern id={id('tex')} patternUnits="userSpaceOnUse" width="26" height="26">
            <image href={d.texture} width="26" height="26" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
      </defs>

      {/* Ombra a terra */}
      <ellipse cx="70" cy="140" rx="34" ry="5" fill="#000000" opacity="0.30" />

      {/* ---- Maniche (dietro il torso) ---- */}
      {(
        [
          [sleeveL, id('sll'), 'M24,46 C29,53 33,60 35,66'],
          [sleeveR, id('slr'), 'M116,46 C111,53 107,60 105,66'],
        ] as const
      ).map(([path, clip, cuff]) => (
        <g key={clip}>
          <path d={path} fill={d.sleeves} />
          <g clipPath={`url(#${clip})`}>
            <rect x="0" y="0" width="140" height="150" fill={`url(#${id('light')})`} />
            <rect x="0" y="0" width="140" height="150" fill={`url(#${id('weave')})`} />
            {/* polsino nel colore del colletto */}
            <path d={cuff} fill="none" stroke={d.collar} strokeWidth="5" opacity="0.95" />
          </g>
          <path d={path} fill="none" stroke="#000000" strokeWidth="1" opacity="0.35" />
        </g>
      ))}

      {/* ---- Torso ---- */}
      <path d={torso} fill={d.primary} />
      <g clipPath={`url(#${id('torso')})`}>
        {d.pattern === 'palato' &&
          [50, 62, 74, 86].map((x) => (
            <rect key={x} x={x} y={10} width={7} height={130} fill={d.secondary} />
          ))}
        {d.pattern === 'fasciato' &&
          [30, 56, 82, 108].map((y) => (
            <rect key={y} x={40} y={y} width={60} height={11} fill={d.secondary} />
          ))}
        {d.pattern === 'sash' && (
          <>
            <path d="M40,22 L60,12 L104,116 L84,126 Z" fill={d.secondary} />
            <path
              d="M40,22 L60,12 M84,126 L104,116"
              stroke={d.collar}
              strokeWidth="1.4"
              opacity="0.7"
            />
          </>
        )}
        {d.pattern === 'mezzo' && <rect x={70} y={10} width={30} height={130} fill={d.secondary} />}
        {d.pattern === 'scacchi' &&
          [0, 1, 2, 3, 4, 5].flatMap((r) =>
            [0, 1, 2, 3].map((c) =>
              (r + c) % 2 === 0 ? (
                <rect
                  key={`${r}-${c}`}
                  x={46 + c * 12.5}
                  y={16 + r * 19.5}
                  width={12.5}
                  height={19.5}
                  fill={d.secondary}
                />
              ) : null,
            ),
          )}
        {d.pattern === 'vstorica' && (
          <path
            d="M46,34 C55,42 63,49 70,54 C77,49 85,42 94,34 L94,48 C85,56 77,63 70,68 C63,63 55,56 46,48 Z"
            fill={d.secondary}
          />
        )}
        {d.texture && <path d={torso} fill={`url(#${id('tex')})`} opacity={0.82} />}

        {/* volume: luce, fianchi, sheen, grana */}
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('side')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('light')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('sheen')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('weave')})`} />

        {/* cuciture: giromanica e orlo */}
        <path
          d="M48,26 C50,38 50,50 47,60 M92,26 C90,38 90,50 93,60"
          fill="none"
          stroke="#000000"
          strokeWidth="0.8"
          opacity="0.3"
        />
        <path
          d="M46,124 C54,128 86,128 94,124"
          fill="none"
          stroke="#000000"
          strokeWidth="0.8"
          opacity="0.28"
          strokeDasharray="2 1.6"
        />

        {/* sponsor sul petto, con la sua ombra */}
        {sponsor && (
          <>
            <text
              x={70.6}
              y={82.7}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill="#000000"
              opacity="0.35"
              style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}
            >
              {sponsor.slice(0, 12)}
            </text>
            <text
              x={70}
              y={82}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill={d.collar}
              style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}
            >
              {sponsor.slice(0, 12)}
            </text>
          </>
        )}
      </g>

      {/* ---- Colletto girocollo con bordino ---- */}
      <path
        d="M56,18 C60,25 80,25 84,18 C82,15 79,13.5 76,13 C74,17 66,17 64,13 C61,13.5 58,15 56,18 Z"
        fill={d.collar}
      />
      <path
        d="M58,19 C62,24.5 78,24.5 82,19"
        fill="none"
        stroke="#000000"
        strokeWidth="0.9"
        opacity="0.3"
      />
      {/* scollo: l'ombra del collo dentro la maglia */}
      <path
        d="M62,16.5 C65,20 75,20 78,16.5 C75,19.5 65,19.5 62,16.5 Z"
        fill="#000"
        opacity="0.45"
      />

      {/* contorno morbido finale */}
      <path
        d={torso}
        fill="none"
        stroke="#000000"
        strokeWidth="1.1"
        opacity="0.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ---- MAGLIA 3D (three.js): la vetrina vera — mesh curva, luci da studio ---- */

type Cmd = ['M', number, number] | ['L', number, number] | ['C', ...number[]];

/** Coordinate condivise 2D/3D (spazio 140×150, y in giù come nell'SVG). */
const K3D = {
  torso: [
    ['M', 48, 26],
    ['C', 52, 20, 58, 17, 62, 16],
    ['C', 65, 22, 75, 22, 78, 16],
    ['C', 82, 17, 88, 20, 92, 26],
    ['L', 94, 62],
    ['C', 94.5, 84, 94.5, 100, 94, 116],
    ['C', 94, 126, 86, 132, 70, 132],
    ['C', 54, 132, 46, 126, 46, 116],
    ['C', 45.5, 100, 45.5, 84, 46, 62],
  ] as Cmd[],
  sleeveL: [
    ['M', 48, 26],
    ['C', 40, 29, 30, 36, 24, 46],
    ['C', 22, 49, 21, 52, 22, 55],
    ['L', 32, 72],
    ['C', 34, 69, 40, 63, 46, 60],
    ['L', 47, 40],
  ] as Cmd[],
  sleeveR: [
    ['M', 92, 26],
    ['C', 100, 29, 110, 36, 116, 46],
    ['C', 118, 49, 119, 52, 118, 55],
    ['L', 108, 72],
    ['C', 106, 69, 100, 63, 94, 60],
    ['L', 93, 40],
  ] as Cmd[],
} as const;

function cmdsToSvgPath(cmds: readonly Cmd[]): string {
  return `${cmds.map((c) => `${c[0]}${c.slice(1).join(',')}`).join(' ')} Z`;
}

function cmdsToShape(cmds: readonly Cmd[]): THREE.Shape {
  const sh = new THREE.Shape();
  const Y = (y: number) => 150 - y;
  for (const c of cmds) {
    if (c[0] === 'M') sh.moveTo(c[1] as number, Y(c[2] as number));
    else if (c[0] === 'L') sh.lineTo(c[1] as number, Y(c[2] as number));
    else
      sh.bezierCurveTo(
        c[1] as number,
        Y(c[2] as number),
        c[3] as number,
        Y(c[4] as number),
        c[5] as number,
        Y(c[6] as number),
      );
  }
  sh.closePath();
  return sh;
}

/** Dipinge la divisa su canvas (spazio 140×150 ×5): la texture del tessuto 3D. */
function paintKit(design: KitDesign, onReady: () => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 700;
  c.height = 750;
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(5, 5);
  const d = design;
  const torso = new Path2D(cmdsToSvgPath(K3D.torso));
  const slL = new Path2D(cmdsToSvgPath(K3D.sleeveL));
  const slR = new Path2D(cmdsToSvgPath(K3D.sleeveR));

  // Maniche + polsini.
  g.fillStyle = d.sleeves;
  g.fill(slL);
  g.fill(slR);
  g.save();
  g.clip(slL);
  g.strokeStyle = d.collar;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(24, 46);
  g.bezierCurveTo(29, 53, 33, 60, 35, 66);
  g.stroke();
  g.restore();
  g.save();
  g.clip(slR);
  g.beginPath();
  g.moveTo(116, 46);
  g.bezierCurveTo(111, 53, 107, 60, 105, 66);
  g.strokeStyle = d.collar;
  g.lineWidth = 5;
  g.stroke();
  g.restore();

  // Torso + pattern (clippati sulla sagoma).
  g.fillStyle = d.primary;
  g.fill(torso);
  g.save();
  g.clip(torso);
  g.fillStyle = d.secondary;
  if (d.pattern === 'palato') for (const x of [50, 62, 74, 86]) g.fillRect(x, 10, 7, 130);
  if (d.pattern === 'fasciato') for (const y of [30, 56, 82, 108]) g.fillRect(40, y, 60, 11);
  if (d.pattern === 'mezzo') g.fillRect(70, 10, 30, 130);
  if (d.pattern === 'sash') {
    g.beginPath();
    g.moveTo(40, 22);
    g.lineTo(60, 12);
    g.lineTo(104, 116);
    g.lineTo(84, 126);
    g.closePath();
    g.fill();
  }
  if (d.pattern === 'scacchi')
    for (let r = 0; r < 6; r++)
      for (let col = 0; col < 4; col++)
        if ((r + col) % 2 === 0) g.fillRect(46 + col * 12.5, 16 + r * 19.5, 12.5, 19.5);
  if (d.pattern === 'vstorica') {
    g.beginPath();
    g.moveTo(46, 34);
    g.bezierCurveTo(55, 42, 63, 49, 70, 54);
    g.bezierCurveTo(77, 49, 85, 42, 94, 34);
    g.lineTo(94, 48);
    g.bezierCurveTo(85, 56, 77, 63, 70, 68);
    g.bezierCurveTo(63, 63, 55, 56, 46, 48);
    g.closePath();
    g.fill();
  }
  // Trama caricata dall'utente (async: al load si ridipinge e si avvisa il 3D).
  if (d.texture) {
    const img = new Image();
    img.onload = () => {
      g.save();
      g.clip(torso);
      g.globalAlpha = 0.82;
      const pat = g.createPattern(img, 'repeat');
      if (pat) {
        pat.setTransform(new DOMMatrix().scale(26 / 96));
        g.fillStyle = pat;
        g.fillRect(0, 0, 140, 150);
      }
      g.restore();
      onReady();
    };
    img.src = d.texture;
  }
  g.restore();

  // Colletto girocollo col bordino.
  g.fillStyle = d.collar;
  g.beginPath();
  g.moveTo(56, 18);
  g.bezierCurveTo(60, 25, 80, 25, 84, 18);
  g.bezierCurveTo(82, 15, 79, 13.5, 76, 13);
  g.bezierCurveTo(74, 17, 66, 17, 64, 13);
  g.bezierCurveTo(61, 13.5, 58, 15, 56, 18);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(58, 19);
  g.bezierCurveTo(62, 24.5, 78, 24.5, 82, 19);
  g.stroke();
  return c;
}

/** Testo su canvas trasparente (sponsor sul petto, numero sulla schiena). */
function textPlane(text: string, color: string, big = false): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d');
  if (g) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = big ? '900 150px Georgia, serif' : '800 58px Georgia, serif';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 4;
    g.fillStyle = color;
    g.fillText(text, 256, 100);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(big ? 34 : 40, big ? 12.75 : 15),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  return mesh;
}

/** La maglia in 3D: estrusa e bombata sul petto, tessuto ruvido, giro completo. */
export function Kit3D({
  design,
  sponsor,
  accent,
  width = 250,
  height = 275,
}: {
  design: KitDesign;
  sponsor?: string | null;
  accent: string;
  width?: number;
  height?: number;
}) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 1, 1000);
    camera.position.set(0, 8, 265);

    // Studio: chiave calda, riempimento freddo, rim nel colore sociale.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
    key.position.set(70, 90, 130);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.55);
    fill.position.set(-90, 20, 70);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.3);
    rim.position.set(0, 50, -150);
    scene.add(rim);

    const canvas = paintKit(design, () => {
      tex.needsUpdate = true;
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const group = new THREE.Group();
    const disposables: { dispose(): void }[] = [renderer, tex];

    const buildPiece = (cmds: readonly Cmd[], depth: number, zOff: number) => {
      const geo = new THREE.ExtrudeGeometry(cmdsToShape(cmds), {
        depth,
        bevelEnabled: true,
        bevelThickness: 1.4,
        bevelSize: 1.1,
        bevelSegments: 3,
        curveSegments: 26,
      });
      // Bombatura del petto + UV planari condivise (tutti i pezzi sulla stessa tela).
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const nx = Math.max(-1, Math.min(1, (x - 70) / 55));
        pos.setZ(i, pos.getZ(i) + 8 * Math.cos((nx * Math.PI) / 2));
        uv.setXY(i, x / 140, y / 150);
      }
      geo.computeVertexNormals();
      geo.translate(-70, -73, -(depth / 2) - 4 + zOff);
      const front = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.85,
        metalness: 0.02,
      });
      const side = new THREE.MeshStandardMaterial({
        color: new THREE.Color(design.primary).multiplyScalar(0.55),
        roughness: 0.9,
      });
      disposables.push(geo, front, side);
      group.add(new THREE.Mesh(geo, [front, side]));
    };
    buildPiece(K3D.torso, 9, 0);
    buildPiece(K3D.sleeveL, 6.5, -1.2);
    buildPiece(K3D.sleeveR, 6.5, -1.2);

    // Sponsor davanti, numero 10 dietro (mai testo specchiato).
    if (sponsor) {
      const sp = textPlane(sponsor.slice(0, 12), design.collar);
      sp.position.set(0, 4, 15.2);
      group.add(sp);
      disposables.push(sp.geometry, sp.material as THREE.Material);
    }
    const num = textPlane('10', design.collar, true);
    num.position.set(0, 18, -10.2);
    num.rotation.y = Math.PI;
    group.add(num);
    disposables.push(num.geometry, num.material as THREE.Material);

    scene.add(group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.minPolarAngle = Math.PI / 2 - 0.35;
    controls.maxPolarAngle = Math.PI / 2 + 0.22;
    let resumeTimer: number | undefined;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      if (resumeTimer) window.clearTimeout(resumeTimer);
    });
    controls.addEventListener('end', () => {
      resumeTimer = window.setTimeout(() => {
        controls.autoRotate = true;
      }, 2500);
    });

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer) window.clearTimeout(resumeTimer);
      controls.dispose();
      for (const x of disposables) x.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [sponsor, accent, width, height, design]);

  return <div ref={mount} style={{ width, height, cursor: 'grab' }} />;
}

export function KitAtelier({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = kitAtelierView(session);

  const [design, setDesign] = useState<KitDesign>(() => ({
    pattern: 'palato',
    primary: v.identity.primary,
    secondary: v.identity.secondary,
    sleeves: v.identity.primary,
    collar: v.identity.secondary,
    style: 'moderno',
    origin: 'utente',
  }));
  const patch = (p: Partial<KitDesign>) =>
    setDesign((d) => ({ ...d, ...p, origin: 'utente', sourceYear: undefined }));

  const fidelity = kitFidelity(session, design);
  const fidelityLabel =
    fidelity >= 0.75
      ? 'fedele ai colori sociali'
      : fidelity >= 0.35
        ? 'interpretazione libera'
        : 'rottura totale';

  /** Trama da file locale: ridotta a 96px e compressa (finisce nel salvataggio). */
  const onTexture = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const g = canvas.getContext('2d');
        if (!g) return;
        g.drawImage(img, 0, 0, 96, 96);
        setDesign((d) => ({ ...d, texture: canvas.toDataURL('image/jpeg', 0.72) }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const ColorInput = ({
    label,
    k,
  }: { label: string; k: 'primary' | 'secondary' | 'sleeves' | 'collar' }) => (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-400">
      {label}
      <input
        type="color"
        value={design[k]}
        onChange={(e) => patch({ [k]: e.target.value })}
        className="h-7 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      {/* La maglia dell'anno, se già lanciata */}
      {v.current && v.launched && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
          <KitShirt design={v.current.design} size={64} sponsor={v.sponsorName} />
          <div className="text-xs">
            <div className="font-semibold" style={{ color: accent }}>
              <Ic name="check_circle" fill /> La maglia {session.year}/
              {String(session.year + 1).slice(2)} è in vendita
            </div>
            <div className="mt-0.5 text-zinc-400">
              {STYLE_LABEL[v.current.design.style]} · verdetto della piazza{' '}
              <b
                className={
                  v.current.verdictPct >= 65
                    ? 'text-emerald-300'
                    : v.current.verdictPct < 35
                      ? 'text-red-300'
                      : 'text-zinc-200'
                }
              >
                {v.current.verdictPct}/100
              </b>
            </div>
          </div>
        </div>
      )}

      {!v.launched && (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          {/* Anteprima viva: la maglia 3D in vetrina, col bagliore del club */}
          <div
            className="flex flex-col items-center gap-1 rounded-xl border border-zinc-800 p-2"
            style={{
              background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${accent}26, transparent 70%), linear-gradient(180deg, #18181b 0%, #09090b 100%)`,
            }}
          >
            <Kit3D design={design} sponsor={v.sponsorName} accent={accent} />
            <span className="text-[10px] text-zinc-600">trascina per girarla</span>
            <span
              className={`text-[10px] ${fidelity >= 0.75 ? 'text-emerald-300' : fidelity >= 0.35 ? 'text-zinc-400' : 'text-amber-300'}`}
            >
              {fidelityLabel}
            </span>
            {design.origin === 'rievocazione' && design.sourceYear !== undefined && (
              <span className="text-[10px] text-zinc-500">rievocazione {design.sourceYear}</span>
            )}
          </div>
          {/* Controlli */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <ColorInput label="Corpo" k="primary" />
              <ColorInput label="Dettaglio" k="secondary" />
              <ColorInput label="Maniche" k="sleeves" />
              <ColorInput label="Colletto" k="collar" />
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PATTERN_LABEL) as KitPattern[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ pattern: p })}
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    design.pattern === p
                      ? 'bg-zinc-800'
                      : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                  }`}
                  style={design.pattern === p ? { borderColor: accent, color: accent } : undefined}
                >
                  {PATTERN_LABEL[p]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-600">
                Stile
                <Help text="Lo stile guida il marketing: STORICO parla alla curva (premia la fedeltà ai colori, commuove dopo un'annata felice), MODERNO viaggia (vende di più sui mercati esteri), CREATIVO è una scommessa — capolavoro o fischi." />
              </span>
              {(Object.keys(STYLE_LABEL) as KitStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => patch({ style: st })}
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    design.style === st
                      ? 'bg-zinc-800'
                      : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                  }`}
                  style={design.style === st ? { borderColor: accent, color: accent } : undefined}
                >
                  {STYLE_LABEL[st]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onTexture(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                <Ic name="texture" /> Carica trama da file
              </button>
              {design.texture && (
                <button
                  type="button"
                  onClick={() => setDesign((d) => ({ ...d, texture: undefined }))}
                  className="text-[10px] text-zinc-500 underline hover:text-zinc-300"
                >
                  rimuovi trama
                </button>
              )}
              <Help text="Scegli un'immagine dal tuo computer: viene ridotta a 96px e compressa (resta piccola nel salvataggio) e diventa la trama del corpo maglia." />
            </div>
            <button
              type="button"
              onClick={() => {
                setMsg(launchKit(session, design));
                refresh();
              }}
              className="w-full rounded-lg border px-4 py-2 text-sm font-bold transition-colors hover:bg-zinc-800"
              style={{ borderColor: accent, color: accent }}
            >
              <Ic name="rocket_launch" /> Lancia la maglia {session.year}/
              {String(session.year + 1).slice(2)}
            </button>
          </div>
        </div>
      )}

      {/* Proposte dello sponsor */}
      {!v.launched && v.proposals && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Le proposte di {v.proposals.brandName}
            <Help text="Lo sponsor tecnico presenta i suoi bozzetti dell'anno: cliccane uno per portarlo nell'editor (puoi ancora ritoccarlo), oppure ignorali e fai da te." />
          </div>
          <div className="flex gap-2">
            {v.proposals.designs.map((d, i) => (
              <button
                key={`${d.pattern}-${i}`}
                type="button"
                onClick={() => {
                  setDesign({ ...d, origin: 'sponsor' });
                  refresh();
                }}
                className="rounded-lg border border-zinc-800 p-2 hover:bg-zinc-900"
                title={`${PATTERN_LABEL[d.pattern]} · ${STYLE_LABEL[d.style]}`}
              >
                <KitShirt design={d} size={56} />
                <div className="mt-0.5 text-center text-[9px] text-zinc-500">
                  {STYLE_LABEL[d.style]}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Archivio: le maglie delle stagioni passate, da rievocare */}
      {v.archive.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Archivio
            <Help text="Le maglie lanciate nelle stagioni passate, con l'annata: rievocarne una da un anno d'ORO (titolo, coppa, promozione) fa impazzire i nostalgici; rievocare un'annata anonima strappa alzate di spalle. La rievocazione si lancia come una maglia nuova, in stile storico." />
          </div>
          <div className="flex flex-wrap gap-2">
            {v.archive.map((e) => (
              <div key={e.year} className="rounded-lg border border-zinc-800 p-2 text-center">
                <KitShirt design={e.design} size={48} />
                <div className="text-[9px] text-zinc-400">
                  {e.year} · {e.verdictPct}/100
                </div>
                {e.annata && (
                  <div
                    className={`text-[9px] font-semibold ${e.annata.golden ? 'text-amber-300' : 'text-zinc-600'}`}
                  >
                    {e.annata.label}
                  </div>
                )}
                {!v.launched && e.year < session.year && (
                  <button
                    type="button"
                    onClick={() => {
                      setDesign({
                        ...e.design,
                        style: 'storico',
                        origin: 'rievocazione',
                        sourceYear: e.year,
                      });
                      refresh();
                    }}
                    className="mt-0.5 text-[9px] underline"
                    style={{ color: accent }}
                  >
                    rievoca
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="note-in text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
