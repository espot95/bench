/**
 * Viewer 3D di una struttura del club in città (MODULE_STADIUM §3): cliccando il
 * marker sulla mappa si vede l'edificio — scheletro+gru durante i lavori,
 * edificio finito a cantiere chiuso. Stessa famiglia procedurale dello stadio.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { addBarrier, addCrane, addFrame, buildingGroup } from './construction3d';

export function Structure3D({
  structure,
  building,
  accent,
}: {
  structure: string;
  building: boolean;
  accent: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const H = 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a0d');
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / H, 1, 500);
    camera.position.set(38, 24, 38);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 7, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.enableDamping = true;
    controls.minDistance = 20;
    controls.maxDistance = 110;
    controls.maxPolarAngle = Math.PI * 0.48;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.add(new THREE.HemisphereLight('#2a3450', '#16190f', 0.8));
    const lamp = new THREE.SpotLight('#fff3d8', 2200, 300, Math.PI / 4.5, 0.5, 1.6);
    lamp.position.set(42, 60, 28);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0004;
    scene.add(lamp, lamp.target);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(70, 40),
      new THREE.MeshLambertMaterial({ color: '#17171b' }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    if (building) {
      addFrame(scene, 0, 0);
      addCrane(scene, 14, 9, 24, -2.4);
      addBarrier(scene, -12, 8, 0.4);
      addBarrier(scene, 10, -10, -0.6);
    } else {
      scene.add(buildingGroup(structure, accent));
    }
    // Ombre: tutto il gruppo le proietta, il suolo le riceve.
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    ground.castShadow = false;
    ground.receiveShadow = true;

    // Post-processing: bloom (le finestre accese), vignettatura, tone mapping.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(el.clientWidth, H), 0.4, 0.5, 0.85));
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset!.value = 0.95;
    vignette.uniforms.darkness!.value = 1.2;
    composer.addPass(vignette);
    composer.addPass(new OutputPass());

    let raf = 0;
    const loop = () => {
      controls.update();
      composer.render();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
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
  }, [structure, building, accent]);

  return <div ref={ref} className="w-full overflow-hidden rounded-lg" />;
}
