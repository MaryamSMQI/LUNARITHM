import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Eye, EyeOff, Globe2, Mountain, Pause, Play, RotateCcw } from 'lucide-react';
import { InstantEphemeris, LunarSite } from '../types/lunar';
import { sampleHorizonMask } from '../engine/lunarEphemeris';

interface LunarViewport3DProps {
  site: LunarSite;
  allSites: LunarSite[];
  instant: InstantEphemeris;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectSite?: (siteId: string) => void;
  heightClass?: string;
}

const DEG2RAD = Math.PI / 180;

// Reusable scratch objects to prevent per-frame GC
const _targetVec = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _earthDir = new THREE.Vector3();

function azElToVec3(azDeg: number, elDeg: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  // Convention: +Z is South (180°), -Z is North (0°), +X is East (90°), -X is West (270°), +Y is Up
  const az = azDeg * DEG2RAD;
  const el = elDeg * DEG2RAD;
  const cosEl = Math.cos(el);
  out.set(
    radius * cosEl * Math.sin(az),
    radius * Math.sin(el),
    -radius * cosEl * Math.cos(az)
  );
  return out;
}

function latLonToSphereVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createRegolithTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a606c';
  ctx.fillRect(0, 0, 512, 512);

  // Fine lunar regolith grain & micro-craters (deterministic pseudo-random)
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 4800; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 0.8 + rand() * 2.2;
    const v = Math.floor(72 + rand() * 48);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 65; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 4 + rand() * 18;
    const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(32,36,44,0.65)');
    grad.addColorStop(0.75, 'rgba(55,60,70,0.28)');
    grad.addColorStop(0.92, 'rgba(130,136,148,0.38)');
    grad.addColorStop(1, 'rgba(90,96,108,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = anisotropy;
  return tex;
}

function buildTerrainGeometry(site: LunarSite): THREE.BufferGeometry {
  const radialSegs = 44;
  const angularSegs = 96;
  const maxRadius = 28;
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let rIdx = 0; rIdx <= radialSegs; rIdx++) {
    const t = rIdx / radialSegs;
    const radius = t * maxRadius;

    for (let aIdx = 0; aIdx <= angularSegs; aIdx++) {
      const aFrac = aIdx / angularSegs;
      const azDeg = aFrac * 360;
      const azRad = azDeg * DEG2RAD;

      const x = radius * Math.sin(azRad);
      const z = -radius * Math.cos(azRad);

      // Flat landing pad inside radius 3.5, then rises smoothly to match site.horizonMaskDeg at rim
      let y = 0;
      if (radius > 3.2) {
        const rimFactor = Math.min(1, (radius - 3.2) / (maxRadius - 3.2));
        const smoothRim = rimFactor * rimFactor * (3 - 2 * rimFactor);
        const maskElevDeg = sampleHorizonMask(site.horizonMaskDeg, azDeg);
        // Convert angular horizon height into local 3D relief height so shadows match horizon mask
        const targetRimHeight = Math.tan(Math.max(-2, maskElevDeg) * DEG2RAD) * radius * 0.95;
        const microRelief =
          Math.sin(x * 0.55 + z * 0.35) * 0.14 * rimFactor +
          Math.cos(x * 0.9 - z * 0.8) * 0.08 * rimFactor;
        y = targetRimHeight * smoothRim + microRelief;
      }

      positions.push(x, y, z);
      uvs.push(x / 18 + 0.5, z / 18 + 0.5);
    }
  }

  const stride = angularSegs + 1;
  for (let rIdx = 0; rIdx < radialSegs; rIdx++) {
    for (let aIdx = 0; aIdx < angularSegs; aIdx++) {
      const a = rIdx * stride + aIdx;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Composite 7-part Lunar Lander assembly grounded flush at y = 0.
 */
function buildLanderGroup(): { group: THREE.Group; dishPivot: THREE.Group; solarWing: THREE.Mesh } {
  const group = new THREE.Group();

  const goldFoilMat = new THREE.MeshStandardMaterial({
    color: 0xd4a024,
    metalness: 0.92,
    roughness: 0.24,
  });
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.78,
    roughness: 0.38,
  });
  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.3,
    roughness: 0.72,
  });
  const solarCellMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    metalness: 0.65,
    roughness: 0.18,
  });

  // 1. Octagonal Descent Stage (primary silhouette)
  const descentStage = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.76, 0.52, 8), goldFoilMat);
  descentStage.position.y = 0.62;
  descentStage.castShadow = true;
  descentStage.receiveShadow = true;
  group.add(descentStage);

  // 2. Upper Avionics Deck
  const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.38, 8), titaniumMat);
  upperDeck.position.y = 1.07;
  upperDeck.castShadow = true;
  upperDeck.receiveShadow = true;
  group.add(upperDeck);

  // 3. Engine Nozzle (underneath)
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 0.32, 16, 1, true), darkCarbonMat);
  nozzle.position.y = 0.24;
  group.add(nozzle);

  // 4-7. Four Articulated Landing Legs + Circular Footpads grounded at y = 0
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const legGroup = new THREE.Group();
    legGroup.rotation.y = angle;

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8), titaniumMat);
    strut.position.set(0.76, 0.34, 0);
    strut.rotation.z = 0.48;
    strut.castShadow = true;
    legGroup.add(strut);

    const footpad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 12), darkCarbonMat);
    footpad.position.set(0.94, 0.025, 0);
    footpad.castShadow = true;
    footpad.receiveShadow = true;
    legGroup.add(footpad);

    group.add(legGroup);
  }

  // Vertical Solar Mast & Panel (for polar grazing light)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), titaniumMat);
  mast.position.set(-0.22, 1.66, 0);
  mast.castShadow = true;
  group.add(mast);

  const solarWing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03), solarCellMat);
  solarWing.position.set(-0.22, 1.82, 0);
  solarWing.castShadow = true;
  group.add(solarWing);

  // Articulated High-Gain Parabolic Dish Antenna
  const dishPivot = new THREE.Group();
  dishPivot.position.set(0.24, 1.38, 0);

  const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 8), darkCarbonMat);
  dishStem.position.y = 0.1;
  dishPivot.add(dishStem);

  const dishPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.14, 0.02),
    new THREE.Vector2(0.28, 0.09),
    new THREE.Vector2(0.32, 0.13),
  ];
  const dishGeo = new THREE.LatheGeometry(dishPoints, 20);
  const dish = new THREE.Mesh(dishGeo, titaniumMat);
  dish.position.y = 0.22;
  dish.rotation.x = Math.PI / 2;
  dish.castShadow = true;
  dishPivot.add(dish);

  group.add(dishPivot);

  return { group, dishPivot, solarWing };
}

export const LunarViewport3D: React.FC<LunarViewport3DProps> = ({
  site,
  allSites,
  instant,
  isPlaying,
  onTogglePlay,
  onSelectSite,
  heightClass = 'h-[430px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'terrain' | 'globe'>('terrain');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Refs synced to Three.js without re-creating renderer
  const latestPropsRef = useRef({ site, allSites, instant, viewMode, onSelectSite });
  latestPropsRef.current = { site, allSites, instant, viewMode, onSelectSite };

  const sceneRefs = useRef<{
    requestRender: () => void;
    resetCamera: () => void;
    rebuildTerrain: (s: LunarSite) => void;
    rebuildPins: (sites: LunarSite[], activeId: string) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL probe per threejs skill
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 430);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c16);
    scene.fog = new THREE.FogExp2(0x0c0c16, 0.015);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      44,
      (container.clientWidth || 800) / (container.clientHeight || 430),
      0.1,
      250
    );
    camera.position.set(11.5, 6.8, 12.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 42;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 1.0, 0);

    // Lighting rig: warm solar key light + cool sky/ground hemisphere + subtle Earthshine rim
    const hemiLight = new THREE.HemisphereLight(0x3b82f6, 0x0f172a, 0.36);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 2.8);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 75;
    const d = 18;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const earthLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    scene.add(earthLight);

    // Subtle starfield using InstancedMesh / Points
    const starPositions = new Float32Array(900 * 3);
    let sSeed = 42;
    const sRand = () => {
      sSeed = (sSeed * 16807) % 2147483647;
      return (sSeed - 1) / 2147483646;
    };
    for (let i = 0; i < 900; i++) {
      const theta = sRand() * Math.PI * 2;
      const phi = Math.acos(2 * sRand() - 1);
      const r = 95 + sRand() * 35;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 2;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.45, sizeAttenuation: true });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const regolithTexture = createRegolithTexture(maxAniso);

    // === GROUP 1: LOCAL TERRAIN HORIZON MODE ===
    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: regolithTexture,
      roughness: 0.92,
      metalness: 0.05,
    });
    let terrainMesh = new THREE.Mesh(buildTerrainGeometry(latestPropsRef.current.site), terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    terrainGroup.add(terrainMesh);

    // Compass ring on landing pad (North = -Z, East = +X)
    const ringGeo = new THREE.RingGeometry(3.05, 3.16, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const compassRing = new THREE.Mesh(ringGeo, ringMat);
    compassRing.position.y = 0.025;
    terrainGroup.add(compassRing);

    // North indicator tick
    const northTick = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.55, 4),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    northTick.rotation.x = -Math.PI / 2;
    northTick.position.set(0, 0.06, -3.45);
    terrainGroup.add(northTick);

    // Lander assembly
    const { group: landerGroup, dishPivot, solarWing } = buildLanderGroup();
    terrainGroup.add(landerGroup);

    // Sun & Earth sky vectors + orbs
    const sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    terrainGroup.add(sunOrb);

    const sunRayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, 5, -18),
    ]);
    const sunRayMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 });
    const sunRay = new THREE.Line(sunRayGeo, sunRayMat);
    terrainGroup.add(sunRay);

    const earthOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    terrainGroup.add(earthOrb);

    const earthRayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.24, 1.6, 0),
      new THREE.Vector3(0, 4, -18),
    ]);
    const earthRayMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.75 });
    const earthRay = new THREE.Line(earthRayGeo, earthRayMat);
    terrainGroup.add(earthRay);

    // === GROUP 2: LUNAR GLOBE CONTEXT MODE ===
    const globeGroup = new THREE.Group();
    globeGroup.visible = false;
    scene.add(globeGroup);

    const globeRadius = 5.4;
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(globeRadius, 64, 48),
      new THREE.MeshStandardMaterial({
        map: regolithTexture,
        roughness: 0.9,
        metalness: 0.04,
      })
    );
    globeGroup.add(moonMesh);

    // South Pole latitude rings (-80°, -85°)
    [-80, -85].forEach((lat) => {
      const r = globeRadius * Math.cos(lat * DEG2RAD);
      const y = globeRadius * Math.sin(lat * DEG2RAD);
      const latRing = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.015, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x334155 })
      );
      latRing.rotation.x = Math.PI / 2;
      latRing.position.y = y;
      globeGroup.add(latRing);
    });

    const pinsGroup = new THREE.Group();
    globeGroup.add(pinsGroup);

    const pinMeshes: THREE.Mesh[] = [];
    const rebuildPins = (sites: LunarSite[], activeId: string) => {
      while (pinsGroup.children.length > 0) {
        const child = pinsGroup.children.pop() as THREE.Mesh;
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      pinMeshes.length = 0;

      sites.forEach((s) => {
        const isActive = s.id === activeId;
        const pin = new THREE.Mesh(
          new THREE.SphereGeometry(isActive ? 0.2 : 0.12, 14, 14),
          new THREE.MeshBasicMaterial({
            color: isActive ? 0xfbbf24 : s.isCustom ? 0x34d399 : 0x06b6d4,
          })
        );
        const pos = latLonToSphereVec3(s.latDeg, s.lonDeg, globeRadius + (isActive ? 0.16 : 0.08));
        pin.position.copy(pos);
        pin.userData = { siteId: s.id };
        pinsGroup.add(pin);
        pinMeshes.push(pin);
      });
    };
    rebuildPins(latestPropsRef.current.allSites, latestPropsRef.current.site.id);

    // Camera transition state
    let camTransition: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
    const cancelCamTransition = () => {
      camTransition = null;
    };
    controls.addEventListener('start', cancelCamTransition);

    // On-demand + transition render scheduler per threejs skill
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateSceneFromState(delta: number) {
      const { site: s, instant: inst, viewMode: vm } = latestPropsRef.current;

      terrainGroup.visible = vm === 'terrain';
      globeGroup.visible = vm === 'globe';
      controls.maxPolarAngle = vm === 'terrain' ? Math.PI * 0.485 : Math.PI;

      if (vm === 'terrain') {
        azElToVec3(inst.sun.azimuthDeg, inst.sun.geometricElevationDeg, 32, _sunDir);
        sunLight.position.copy(_sunDir);
        sunLight.intensity = inst.sun.isVisible ? 3.2 : 0.25;
        sunOrb.position.copy(_sunDir).multiplyScalar(0.82);

        const rayPosAttr = sunRay.geometry.getAttribute('position') as THREE.BufferAttribute;
        rayPosAttr.setXYZ(0, 0, 1.6, 0);
        rayPosAttr.setXYZ(1, sunOrb.position.x, sunOrb.position.y, sunOrb.position.z);
        rayPosAttr.needsUpdate = true;
        sunRayMat.opacity = inst.sun.isVisible ? 0.72 : 0.16;

        azElToVec3(inst.earth.azimuthDeg, inst.earth.geometricElevationDeg, 26, _earthDir);
        earthLight.position.copy(_earthDir);
        earthOrb.position.copy(_earthDir);

        const earthPosAttr = earthRay.geometry.getAttribute('position') as THREE.BufferAttribute;
        earthPosAttr.setXYZ(0, 0.24, 1.55, 0);
        earthPosAttr.setXYZ(1, earthOrb.position.x, earthOrb.position.y, earthOrb.position.z);
        earthPosAttr.needsUpdate = true;
        earthRayMat.opacity = inst.earth.isVisible ? 0.85 : 0.14;
        (earthOrb.material as THREE.MeshBasicMaterial).color.setHex(inst.earth.isVisible ? 0x22d3ee : 0x475569);

        // Smoothly point dish antenna & solar mast toward Earth & Sun
        const targetDishAz = -(inst.earth.azimuthDeg * DEG2RAD);
        dishPivot.rotation.y = THREE.MathUtils.damp(dishPivot.rotation.y, targetDishAz, 6, delta);
        solarWing.rotation.y = THREE.MathUtils.damp(solarWing.rotation.y, -(inst.sun.azimuthDeg * DEG2RAD), 5, delta);
      } else {
        // Globe mode: illuminate Moon from subsolar coordinates, Earth direction from sub-Earth
        const subSun = latLonToSphereVec3(inst.subsolarLatDeg, inst.subsolarLonDeg, 25);
        sunLight.position.copy(subSun);
        sunLight.intensity = 3.2;

        const subEarth = latLonToSphereVec3(inst.earthSubLatDeg, inst.earthSubLonDeg, 20);
        earthLight.position.copy(subEarth);

        void s;
      }
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const delta = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        let needsMore = false;
        if (camTransition) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, camTransition.pos.x, 7, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, camTransition.pos.y, 7, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, camTransition.pos.z, 7, delta);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, camTransition.target.x, 7, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, camTransition.target.y, 7, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, camTransition.target.z, 7, delta);

          if (
            camera.position.distanceTo(camTransition.pos) < 0.05 &&
            controls.target.distanceTo(camTransition.target) < 0.05
          ) {
            camTransition = null;
          } else {
            needsMore = true;
          }
        }

        const ctrlMoving = controls.update();
        if (ctrlMoving) needsMore = true;

        updateSceneFromState(delta);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMore) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    // Raycast click on globe site pins
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onCanvasClick = (e: MouseEvent) => {
      if (latestPropsRef.current.viewMode !== 'globe' || !latestPropsRef.current.onSelectSite) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pinMeshes, false);
      if (hits.length > 0) {
        const sid = hits[0].object.userData?.siteId;
        if (sid) latestPropsRef.current.onSelectSite(sid);
      }
    };
    renderer.domElement.addEventListener('click', onCanvasClick);

    const onControlChange = () => requestRender();
    controls.addEventListener('change', onControlChange);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 430;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const resetCamera = () => {
      if (latestPropsRef.current.viewMode === 'terrain') {
        camTransition = {
          pos: new THREE.Vector3(11.5, 6.8, 12.5),
          target: new THREE.Vector3(0, 1.0, 0),
        };
      } else {
        // Focus South Pole region
        camTransition = {
          pos: new THREE.Vector3(0, -11.5, 8.5),
          target: new THREE.Vector3(0, -1.5, 0),
        };
      }
      requestRender();
    };

    const rebuildTerrain = (s: LunarSite) => {
      const nextGeo = buildTerrainGeometry(s);
      terrainMesh.geometry.dispose();
      terrainMesh.geometry = nextGeo;
      requestRender();
    };

    sceneRefs.current = { requestRender, resetCamera, rebuildTerrain, rebuildPins };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', onControlChange);
      controls.removeEventListener('start', cancelCamTransition);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      regolithTexture.dispose();
      terrainMesh.geometry.dispose();
      terrainMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, []);

  // Update terrain geometry when active site changes
  useEffect(() => {
    sceneRefs.current?.rebuildTerrain(site);
    sceneRefs.current?.rebuildPins(allSites, site.id);
  }, [site, allSites]);

  // Trigger render when time/instant updates
  useEffect(() => {
    sceneRefs.current?.requestRender();
  }, [instant, viewMode]);

  // Smoothly reframe camera when switching between Terrain and Globe
  useEffect(() => {
    sceneRefs.current?.resetCamera();
  }, [viewMode]);

  return (
    <div className={`relative w-full ${heightClass} bg-[#0c0c16] border border-[#272d47] rounded-lg overflow-hidden`}>
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c0c16]/95 text-center p-6">
          <p className="text-sm font-medium text-slate-200">3D WebGL context paused by browser</p>
          <p className="text-xs text-[#7392B5] mt-1">Use the 2D Horizon & Sky-Dome profile below for full solar/Earth analysis.</p>
        </div>
      )}

      {/* Minimal Top-Left HUD label (no pulsing dots, solid surface, zero backdrop-blur) */}
      <div className="pointer-events-none absolute top-3 left-3 bg-[#131524]/95 border border-[#272d47] rounded px-3 py-1.5 flex flex-wrap items-center gap-2.5 text-xs">
        <span className="font-semibold text-white">{site.name}</span>
        <span className="text-[#7392B5]">·</span>
        <span className="font-mono text-[#F5B83D]">
          Sun {instant.sun.isVisible ? `+${instant.sun.apparentAboveTerrainDeg.toFixed(1)}°` : 'Occluded'} (Az {instant.sun.azimuthDeg.toFixed(0)}°)
        </span>
        <span className="text-[#7392B5]">·</span>
        <span className="font-mono text-[#c9e8ff]">
          Earth {instant.earth.isVisible ? `+${instant.earth.apparentAboveTerrainDeg.toFixed(1)}°` : 'Blocked'} (Az {instant.earth.azimuthDeg.toFixed(0)}°)
        </span>
      </div>

      {/* Collapsible Bottom Control Dock (per threejs skill) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 transition-transform duration-200 z-10 ${
          dockCollapsed ? 'bottom-0 translate-y-[calc(100%-30px)]' : 'bottom-3'
        }`}
      >
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-[#c9e8ff] bg-[#131524] border border-b-0 border-[#272d47] rounded-t-md hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {dockCollapsed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {dockCollapsed ? 'Show 3D Controls' : 'Hide Controls'}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 bg-[#131524] border border-[#272d47] rounded-lg shadow-lg">
            <div className="flex items-center gap-1 p-0.5 bg-[#0c0c16] border border-[#272d47] rounded">
              <button
                type="button"
                onClick={() => setViewMode('terrain')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                  viewMode === 'terrain' ? 'bg-[#c9e8ff] text-[#0c0c16]' : 'text-[#7392B5] hover:text-white'
                }`}
              >
                <Mountain className="w-3.5 h-3.5" />
                Local Horizon
              </button>
              <button
                type="button"
                onClick={() => setViewMode('globe')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                  viewMode === 'globe' ? 'bg-[#c9e8ff] text-[#0c0c16]' : 'text-[#7392B5] hover:text-white'
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                South Pole Globe
              </button>
            </div>

            <button
              type="button"
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-[#F5B83D]/15 text-[#F5B83D] border border-[#F5B83D]/35 hover:bg-[#F5B83D]/25 transition-colors whitespace-nowrap shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause Orbit' : 'Play Lunar Day'}
            </button>

            <button
              type="button"
              onClick={() => sceneRefs.current?.resetCamera()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-[#0c0c16] text-slate-200 border border-[#272d47] hover:border-[#7392B5] transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
