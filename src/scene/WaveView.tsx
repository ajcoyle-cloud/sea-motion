import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Boat, Scales, WaveComponent } from '../sim/model';
import { emptyDofs, elevationRange, headingVectors, resolveWave, stepBoat } from '../sim/model';
import { createBoatGroup } from './boatMesh';
import { FIRST40_GUIDE } from './first40';

const SEA_W = 84;
const SEA_D = 84;

const VERT = /* glsl */ `
uniform vec4 uWaveA[4];
uniform vec4 uWaveB[4];
uniform vec2 uOrigin;
uniform float uTime;
varying float vH;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vUv = uv;
  float x = position.x + uOrigin.x;
  float z = position.y + uOrigin.y;
  float h = 0.0;
  float hx = 0.0;
  float hz = 0.0;
  for (int i = 0; i < 4; i++) {
    float amp = uWaveA[i].x;
    if (amp == 0.0) continue;
    float ph = uWaveA[i].y * x + uWaveA[i].z * z - uWaveA[i].w * uTime + uWaveB[i].x;
    float s = sin(ph);
    h += amp * cos(ph);
    hx += -amp * uWaveA[i].y * s;
    hz += -amp * uWaveA[i].z * s;
  }
  vH = h;
  vec3 pos = vec3(position.x, h, position.y);
  vNormal = normalize(vec3(-hx, 1.0, -hz));
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uRange;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec2 uGrid;
uniform vec2 uOrigin;
uniform vec2 uSpan;
uniform vec2 uHeading;
uniform float uMode;
varying float vH;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

vec3 ramp(float t) {
  if (t < 0.28) return mix(uC0, uC1, t / 0.28);
  if (t < 0.50) return mix(uC1, uC2, (t - 0.28) / 0.22);
  if (t < 0.74) return mix(uC2, uC3, (t - 0.50) / 0.24);
  return mix(uC3, uC4, clamp((t - 0.74) / 0.26, 0.0, 1.0));
}

// Square cells in ship axes, fixed to the water, so the lattice slides aft.
vec2 seaCoord() {
  vec2 xz = vWorld.xz + uOrigin;
  vec2 bow = normalize(uHeading);
  vec2 side = vec2(-bow.y, bow.x);
  vec2 ship = vec2(dot(xz, bow), dot(xz, side));
  return ship / (uSpan / uGrid);
}

float meshLine(vec2 coord) {
  vec2 fw = max(fwidth(coord), vec2(1e-4));
  vec2 dist = abs(fract(coord - 0.5) - 0.5);
  float axis = min(dist.x / fw.x, dist.y / fw.y);
  return 1.0 - smoothstep(0.08, 0.9, axis);
}

void main() {
  float edge = smoothstep(0.0, 0.025, vUv.x) * smoothstep(1.0, 0.975, vUv.x);
  edge *= smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 lightDir = normalize(vec3(0.4, 0.86, 0.22));
  vec3 halfDir = normalize(lightDir + viewDir);
  float ndl = clamp(dot(n, lightDir), 0.0, 1.0);
  float spec = pow(clamp(dot(n, halfDir), 0.0, 1.0), 48.0);

  if (uMode < 0.5) {
    float t = clamp(vH / uRange * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = ramp(t);
    float line = meshLine(seaCoord());
    float alpha = (0.28 + 0.62 * line) * edge;
    gl_FragColor = vec4(col * (0.72 + 0.45 * line), alpha);
    return;
  }

  if (uMode < 1.5) {
    float t = clamp(vH / uRange * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = ramp(t);
    float line = meshLine(seaCoord());
    vec3 shaded = col * (0.34 + 0.7 * ndl) + vec3(1.0) * spec * 0.12;
    gl_FragColor = vec4(shaded * (0.62 + 0.55 * line), 0.96 * edge);
    return;
  }

  vec2 flow = vWorld.xz + uOrigin;
  float rip = sin(flow.x * 2.1) * cos(flow.y * 1.7);
  float rip2 = sin((flow.x * 0.7 + flow.y) * 3.4);
  n = normalize(n + vec3(rip, 0.0, rip2) * 0.07);
  float facing = clamp(dot(n, viewDir), 0.0, 1.0);
  float fres = pow(1.0 - facing, 3.0);
  vec3 deep = vec3(0.015, 0.11, 0.26);
  vec3 mid = vec3(0.04, 0.38, 0.68);
  vec3 water = mix(deep, mid, facing);
  water = mix(water, vec3(0.62, 0.86, 0.92), fres * 0.5);
  float crest = smoothstep(0.25, 1.0, vH / max(uRange, 0.25));
  water = mix(water, vec3(0.78, 0.92, 0.95), crest * 0.22);
  float glint = pow(clamp(dot(n, halfDir), 0.0, 1.0), 90.0);
  float sheen = pow(clamp(dot(n, halfDir), 0.0, 1.0), 10.0) * 0.18;
  water += vec3(1.0, 0.97, 0.9) * (glint * 0.9 + sheen);
  gl_FragColor = vec4(water, 0.97 * edge);
}
`;

function color(hex: string) {
  return new THREE.Color(hex);
}

/** Deep-water Kelvin cusp. The wake opens at arcsin(1/3) either side of the track. */
const KELVIN = Math.asin(1 / 3);
const WAKE_ALONG = 40;
const WAKE_ACROSS = 16;

function surfaceAt(x: number, z: number, waves: WaveComponent[], time: number) {
  let height = 0;
  for (const wave of waves) {
    const resolved = resolveWave(wave);
    if (resolved.amp === 0) continue;
    const phase = resolved.kx * x + resolved.kz * z - resolved.omega * time + resolved.phase;
    height += resolved.amp * Math.cos(phase);
  }
  return height;
}

export type SeaSurface = 'wire' | 'colour' | 'water';

type Props = {
  boat: Boat;
  waves: WaveComponent[];
  heading: number;
  speedKn: number;
  scales: Scales;
  paused: boolean;
  rotate: boolean;
  onUserInteract: () => void;
  range: number;
  surface: SeaSurface;
};

export function WaveView(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
    camera.position.set(16, 3.4, -17.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.1, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 16;
    controls.maxDistance = 95;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI / 2 + 0.4;
    controls.autoRotateSpeed = 0.45;
    const stopRotate = () => {
      if (propsRef.current.rotate) propsRef.current.onUserInteract();
    };
    renderer.domElement.addEventListener('pointerdown', stopRotate);
    controls.addEventListener('start', stopRotate);

    scene.add(new THREE.HemisphereLight(0xc5dcff, 0x102033, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e5, 2.4);
    key.position.set(18, 28, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8eb6ff, 0.7);
    fill.position.set(-16, 10, -12);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd9ffe8, 0.9);
    rim.position.set(-8, 6, 20);
    scene.add(rim);

    const seaGeo = new THREE.PlaneGeometry(SEA_W, SEA_D, 420, 420);
    const uniforms = {
      uWaveA: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uWaveB: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uOrigin: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uRange: { value: 2 },
      uGrid: { value: new THREE.Vector2(56, 56) },
      uSpan: { value: new THREE.Vector2(SEA_W, SEA_D) },
      uHeading: { value: new THREE.Vector2(0, -1) },
      uMode: { value: 0 },
      uC0: { value: color('#14d6e6') },
      uC1: { value: color('#3d7cff') },
      uC2: { value: color('#8a6bff') },
      uC3: { value: color('#e456c8') },
      uC4: { value: color('#ff3d8a') },
    };
    const seaMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.renderOrder = 2;
    sea.name = 'sea';
    scene.add(sea);

    const bowPoint = new THREE.Vector3();
    const bowSample = new THREE.Vector3();
    let bowStation = 0;

    function readBowStation(group: THREE.Group, fallback: number) {
      group.updateMatrixWorld(true);
      const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      let best = -Infinity;
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        const attr = mesh.geometry?.getAttribute?.('position');
        if (!attr) return;
        for (let i = 0; i < attr.count; i++) {
          bowSample.fromBufferAttribute(attr as THREE.BufferAttribute, i);
          bowSample.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          if (Math.abs(bowSample.z) > 0.18 || Math.abs(bowSample.y) > 0.12) continue;
          if (bowSample.x > best) best = bowSample.x;
        }
      });
      return best > 0 ? best : fallback;
    }
    function readSternStation(group: THREE.Group, fallback: number) {
      group.updateMatrixWorld(true);
      const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      let best = Infinity;
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        const attr = mesh.geometry?.getAttribute?.('position');
        if (!attr) return;
        for (let i = 0; i < attr.count; i++) {
          bowSample.fromBufferAttribute(attr as THREE.BufferAttribute, i);
          bowSample.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          if (Math.abs(bowSample.z) > 0.4 || Math.abs(bowSample.y) > 0.2) continue;
          if (bowSample.x < best) best = bowSample.x;
        }
      });
      return best < 0 ? best : fallback;
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    scene.add(ring);

    const wakeCount = (WAKE_ALONG + 1) * (WAKE_ACROSS + 1);
    const wakePos = new THREE.BufferAttribute(new Float32Array(wakeCount * 3), 3);
    const wakeCol = new THREE.BufferAttribute(new Float32Array(wakeCount * 4), 4);
    const wakeIndex = new Uint32Array(WAKE_ALONG * WAKE_ACROSS * 6);
    for (let i = 0, k = 0; i < WAKE_ALONG; i++) {
      for (let j = 0; j < WAKE_ACROSS; j++) {
        const a = i * (WAKE_ACROSS + 1) + j;
        wakeIndex[k++] = a;
        wakeIndex[k++] = a + 1;
        wakeIndex[k++] = a + WAKE_ACROSS + 1;
        wakeIndex[k++] = a + 1;
        wakeIndex[k++] = a + WAKE_ACROSS + 2;
        wakeIndex[k++] = a + WAKE_ACROSS + 1;
      }
    }
    const wakeGeo = new THREE.BufferGeometry();
    wakeGeo.setAttribute('position', wakePos);
    wakeGeo.setAttribute('color', wakeCol);
    wakeGeo.setIndex(new THREE.BufferAttribute(wakeIndex, 1));
    const wake = new THREE.Mesh(
      wakeGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    wake.renderOrder = 3;
    wake.frustumCulled = false;
    wake.name = 'wake';
    scene.add(wake);
    const sternPoint = new THREE.Vector3();
    let sternStation = -5;

    const guideOpacity = 0.3;
    const { cbX, masthead, keel } = FIRST40_GUIDE;
    const guideMidY = (masthead + keel) / 2;
    const guideMaterial = (dashed: boolean) =>
      dashed
        ? new THREE.LineDashedMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: guideOpacity,
            dashSize: 0.22,
            gapSize: 0.18,
            depthWrite: false,
            toneMapped: false,
          })
        : new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: guideOpacity,
            depthWrite: false,
            toneMapped: false,
          });
    const guideLine = (material: THREE.Material) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, keel, 0),
        new THREE.Vector3(0, masthead, 0),
      ]);
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 3;
      return line;
    };
    const swayLine = guideLine(guideMaterial(false));
    swayLine.position.set(cbX, 0, 0);
    const lockLine = guideLine(guideMaterial(true));
    lockLine.computeLineDistances();
    scene.add(lockLine);
    // Fore-aft and port-starboard only. A circle here reads as the mast
    // walking every heading, which is the at-anchor wallow.
    const axisMaterial = guideMaterial(false);
    const makeAxis = (name: string) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, axisMaterial);
      line.frustumCulled = false;
      line.renderOrder = 3;
      line.name = name;
      scene.add(line);
      return line;
    };
    const pitchAxis = makeAxis('pitch-axis');
    const rollAxis = makeAxis('roll-axis');
    const layAxis = (line: THREE.Line, ox: number, oy: number, oz: number, dx: number, dz: number) => {
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, ox - dx, oy, oz - dz);
      attr.setXYZ(1, ox + dx, oy, oz + dz);
      attr.needsUpdate = true;
    };
    const swayA = new THREE.Vector3();
    const swayB = new THREE.Vector3();
    const swayHit = new THREE.Vector3();

    const state = {
      originX: 0,
      originZ: 0,
      time: 1.4,
      dofs: emptyDofs(),
      armed: false,
      prevImm: 1,
    };
    let flash = 0;
    let boatId = '';
    let boatGroup: THREE.Group | null = null;

    function syncWaves(waves: WaveComponent[], range: number) {
      waves.forEach((wave, i) => {
        const r = resolveWave(wave);
        uniforms.uWaveA.value[i].set(r.amp, r.kx, r.kz, r.omega);
        uniforms.uWaveB.value[i].set(r.phase, 0, 0, 0);
      });
      uniforms.uRange.value = range;
    }

    function mountBoat(boat: Boat) {
      if (boatGroup) {
        swayLine.removeFromParent();
        scene.remove(boatGroup);
        boatGroup.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      }
      boatGroup = createBoatGroup(boat);
      boatGroup.renderOrder = 1;
      scene.add(boatGroup);
      const showGuide = boat.id === 'first-40';
      swayLine.visible = showGuide;
      lockLine.visible = showGuide;
      pitchAxis.visible = showGuide;
      rollAxis.visible = showGuide;
      if (showGuide) boatGroup.add(swayLine);
      boatId = boat.id;
      state.dofs = emptyDofs();
      state.armed = false;
      state.prevImm = 1;
      const current = propsRef.current;
      for (let i = 0; i < 30 * 8; i++) {
        stepBoat(current.boat, current.waves, current.heading, current.speedKn, state, current.scales, 1 / 30);
      }
      flash = 0;
      bowStation = readBowStation(boatGroup, current.boat.bowX);
      sternStation = readSternStation(boatGroup, -current.boat.lwl * 0.5);
    }

    const resize = () => {
      const w = wrap.clientWidth;
      const h = Math.max(wrap.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const current = propsRef.current;
      if (current.boat.id !== boatId) mountBoat(current.boat);
      syncWaves(current.waves, current.range || elevationRange(current.waves));

      if (!current.paused) {
        const sub = 2;
        const h = dt / sub;
        for (let i = 0; i < sub; i++) {
          const sample = stepBoat(
            current.boat,
            current.waves,
            current.heading,
            current.speedKn,
            state,
            current.scales,
            h,
          );
          if (sample.slammed) flash = 1;
        }
      }

      uniforms.uOrigin.value.set(state.originX, state.originZ);
      uniforms.uTime.value = state.time;
      const flowHeading = (current.heading * Math.PI) / 180;
      uniforms.uHeading.value.set(Math.sin(flowHeading), -Math.cos(flowHeading));
      const mode = current.surface === 'colour' ? 1 : current.surface === 'water' ? 2 : 0;
      uniforms.uMode.value = mode;
      seaMat.depthWrite = mode !== 0;

      if (boatGroup) {
        const headingRad = (current.heading * Math.PI) / 180;
        // Y, then Z, then X. Pitch stays about the beam and roll about the
        // keel. The previous YXZ order yawed the bow whenever both were off zero.
        boatGroup.rotation.order = 'YZX';
        boatGroup.rotation.y = Math.PI / 2 - headingRad;
        boatGroup.rotation.z = state.dofs.pitch.y;
        boatGroup.rotation.x = state.dofs.roll.y;
        boatGroup.position.y = state.dofs.heave.y;

        boatGroup.updateMatrixWorld();
        if (current.boat.id === 'first-40') {
          const yaw = boatGroup.rotation.y;
          const lockX = cbX * Math.cos(yaw);
          const lockZ = -cbX * Math.sin(yaw);
          lockLine.position.set(lockX, 0, lockZ);
          swayA.set(cbX, keel, 0).applyMatrix4(boatGroup.matrixWorld);
          swayB.set(cbX, masthead, 0).applyMatrix4(boatGroup.matrixWorld);
          const rise = swayB.y - swayA.y;
          const along = Math.abs(rise) < 1e-4 ? 0.5 : THREE.MathUtils.clamp((guideMidY - swayA.y) / rise, 0, 1);
          swayHit.lerpVectors(swayA, swayB, along);
          const dx = swayHit.x - lockX;
          const dz = swayHit.z - lockZ;
          const { fwdX, fwdZ, stbdX, stbdZ } = headingVectors(current.heading);
          const fore = dx * fwdX + dz * fwdZ;
          const athwart = dx * stbdX + dz * stbdZ;
          layAxis(pitchAxis, lockX, guideMidY, lockZ, fwdX * fore, fwdZ * fore);
          layAxis(rollAxis, lockX, guideMidY, lockZ, stbdX * athwart, stbdZ * athwart);
          pitchAxis.visible = Math.abs(fore) > 0.05;
          rollAxis.visible = Math.abs(athwart) > 0.05;
        }
        bowPoint.set(bowStation, 0, 0).applyMatrix4(boatGroup.matrixWorld);
        ring.position.set(
          bowPoint.x,
          surfaceAt(bowPoint.x + state.originX, bowPoint.z + state.originZ, current.waves, state.time) + 0.03,
          bowPoint.z,
        );
      }

      flash *= Math.exp(-dt * 2.4);
      const ringMat = ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = flash * 0.85;
      const spread = 1 + (1 - flash) * 4;
      ring.scale.set(spread, spread, spread);

      const speedKn = current.speedKn;
      const moving = speedKn > 0.35;
      wake.visible = moving && !!boatGroup;
      if (wake.visible && boatGroup) {
        const heading = (current.heading * Math.PI) / 180;
        const aftX = -Math.sin(heading);
        const aftZ = Math.cos(heading);
        const sideX = Math.cos(heading);
        const sideZ = Math.sin(heading);
        sternPoint.set(sternStation, 0, 0).applyMatrix4(boatGroup.matrixWorld);
        const length = Math.min(48, 10 + speedKn * 3.2);
        const strength = Math.min(1, (speedKn - 0.35) / 3);
        const half0 = current.boat.hullBeam * 0.38;
        const wakeTan = Math.tan(KELVIN);
        const pos = wakePos.array as Float32Array;
        const col = wakeCol.array as Float32Array;
        let v = 0;
        let c = 0;
        for (let i = 0; i <= WAKE_ALONG; i++) {
          const t = i / WAKE_ALONG;
          const dist = t * length;
          const halfW = half0 + dist * wakeTan;
          const along = (1 - t) ** 1.2;
          const flow = 0.9 + 0.1 * Math.sin(dist * 0.62 - state.time * speedKn * 0.5);
          for (let j = 0; j <= WAKE_ACROSS; j++) {
            const side = (j / WAKE_ACROSS) * 2 - 1;
            const x = sternPoint.x + aftX * dist + sideX * side * halfW;
            const z = sternPoint.z + aftZ * dist + sideZ * side * halfW;
            pos[v++] = x;
            pos[v++] = surfaceAt(x + state.originX, z + state.originZ, current.waves, state.time) + 0.045;
            pos[v++] = z;
            const fromEdge = 1 - Math.abs(side);
            const fill = fromEdge ** 0.45;
            const cusp = Math.exp(-((Math.abs(side) - 1) ** 2) / 0.018);
            col[c++] = 0.92;
            col[c++] = 0.96;
            col[c++] = 1;
            col[c++] = Math.min(0.32, 0.3 * strength * along * flow * (0.72 * fill + 0.55 * cusp));
          }
        }
        wakePos.needsUpdate = true;
        wakeCol.needsUpdate = true;
      }

      controls.autoRotate = current.rotate;
      // Orbit radius is large, so a fixed angle past horizontal would dive many
      // metres down. Hold the eye at the waterline and a little under it.
      const orbitRadius = Math.max(camera.position.distanceTo(controls.target), controls.minDistance);
      const lowestEye = -1.2;
      const cosLimit = THREE.MathUtils.clamp((lowestEye - controls.target.y) / orbitRadius, -1, 1);
      controls.maxPolarAngle = Math.acos(cosLimit);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', stopRotate);
      controls.removeEventListener('start', stopRotate);
      observer.disconnect();
      controls.dispose();
      seaGeo.dispose();
      seaMat.dispose();
      wakeGeo.dispose();
      (wake.material as THREE.Material).dispose();
      swayLine.geometry.dispose();
      (swayLine.material as THREE.Material).dispose();
      lockLine.geometry.dispose();
      (lockLine.material as THREE.Material).dispose();
      pitchAxis.geometry.dispose();
      rollAxis.geometry.dispose();
      axisMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={wrapRef} className="stage" />
  );
}
