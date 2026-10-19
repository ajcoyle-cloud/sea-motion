import * as THREE from 'three';
import type { Boat, HullStyle } from '../sim/model';
import { createFirst40Hull } from './first40';

const hullMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.38,
  metalness: 0.06,
  clearcoat: 0.62,
  clearcoatRoughness: 0.28,
  emissive: 0x16364c,
  emissiveIntensity: 0.18,
  vertexColors: true,
  side: THREE.DoubleSide,
});

const deckMat = new THREE.MeshPhysicalMaterial({
  color: 0xf7fbff,
  roughness: 0.62,
  metalness: 0.02,
  clearcoat: 0.2,
  emissive: 0x163044,
  emissiveIntensity: 0.08,
  side: THREE.DoubleSide,
});

const appendageMat = new THREE.MeshPhysicalMaterial({
  color: 0x5aaee0,
  roughness: 0.42,
  metalness: 0.08,
  clearcoat: 0.4,
  emissive: 0x1a4a68,
  emissiveIntensity: 0.2,
  side: THREE.DoubleSide,
});

const cabinMat = new THREE.MeshPhysicalMaterial({
  color: 0x46e092,
  roughness: 0.4,
  metalness: 0.05,
  clearcoat: 0.5,
  emissive: 0x0c4630,
  emissiveIntensity: 0.35,
});

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x16384a,
  roughness: 0.06,
  metalness: 0.15,
  clearcoat: 1,
  transparent: true,
  opacity: 0.82,
});

const engineMat = new THREE.MeshStandardMaterial({
  color: 0x1a1e24,
  roughness: 0.45,
  metalness: 0.35,
});

const stripeMat = new THREE.MeshBasicMaterial({
  color: 0xf4fff8,
  toneMapped: false,
});

const sparMat = new THREE.MeshStandardMaterial({
  color: 0xe7eef2,
  roughness: 0.4,
  metalness: 0.2,
});

const TOP = new THREE.Color('#f7fbff');
const BOOT = new THREE.Color('#8ecbf3');
const BOTTOM = new THREE.Color('#3d94cb');

function curve(keys: Array<[number, number]>, u: number): number {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, y0] = keys[i - 1];
      const [u1, y1] = keys[i];
      const t = (u - u0) / (u1 - u0);
      const s = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

const BEAM: Record<HullStyle, Array<[number, number]>> = {
  farr: [
    [0, 0.58],
    [0.08, 0.82],
    [0.22, 0.96],
    [0.4, 1],
    [0.58, 0.9],
    [0.74, 0.58],
    [0.88, 0.22],
    [0.96, 0.04],
    [1, 0],
  ],
  cruiser: [
    [0, 0.3],
    [0.14, 0.66],
    [0.36, 1],
    [0.58, 0.93],
    [0.78, 0.52],
    [0.92, 0.16],
    [1, 0.018],
  ],
  cat: [
    [0, 0.38],
    [0.16, 0.76],
    [0.42, 1],
    [0.66, 0.9],
    [0.84, 0.42],
    [0.95, 0.12],
    [1, 0.02],
  ],
  planing: [
    [0, 0.9],
    [0.1, 1],
    [0.34, 0.96],
    [0.58, 0.74],
    [0.78, 0.4],
    [0.9, 0.14],
    [1, 0.02],
  ],
};

const ROCKER: Record<HullStyle, Array<[number, number]>> = {
  farr: [
    [0, 0.26],
    [0.16, 0.68],
    [0.42, 1],
    [0.7, 0.78],
    [0.88, 0.22],
    [1, 0.03],
  ],
  cruiser: [
    [0, 0.42],
    [0.2, 0.82],
    [0.5, 1],
    [0.78, 0.62],
    [1, 0.08],
  ],
  cat: [
    [0, 0.32],
    [0.28, 0.86],
    [0.55, 1],
    [0.8, 0.55],
    [1, 0.06],
  ],
  planing: [
    [0, 0.7],
    [0.4, 0.9],
    [0.7, 1],
    [1, 0.2],
  ],
};

const SHEER: Record<HullStyle, Array<[number, number]>> = {
  farr: [
    [0, 0.9],
    [0.45, 0.88],
    [0.78, 1.02],
    [1, 1.16],
  ],
  cruiser: [
    [0, 1],
    [0.4, 0.92],
    [0.75, 1.06],
    [1, 1.2],
  ],
  cat: [
    [0, 0.96],
    [0.5, 0.9],
    [1, 1.12],
  ],
  planing: [
    [0, 0.82],
    [0.45, 0.9],
    [0.8, 1.08],
    [1, 1.28],
  ],
};

type Pt = { z: number; y: number };

function resample(pts: Pt[], count: number): Pt[] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
    lengths.push(d);
    total += d;
  }
  if (total < 1e-4) return Array.from({ length: count }, () => ({ ...pts[0] }));
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let target = (i / (count - 1)) * total;
    let acc = 0;
    for (let s = 0; s < lengths.length; s++) {
      if (acc + lengths[s] >= target - 1e-6 || s === lengths.length - 1) {
        const t = lengths[s] === 0 ? 0 : Math.min(1, (target - acc) / lengths[s]);
        out.push({
          z: pts[s].z + (pts[s + 1].z - pts[s].z) * t,
          y: pts[s].y + (pts[s + 1].y - pts[s].y) * t,
        });
        break;
      }
      acc += lengths[s];
    }
  }
  return out;
}

/** Sheer at the start of the list, keel at the end. Bow stations get a V and a knuckle. */
function yachtOutline(half: number, draft: number, freeboard: number, bow: number): Pt[] {
  const vee = Math.min(1, Math.max(0, bow));
  const floor = half * 0.38 * (1 - vee);
  const bilge = half * (0.82 - 0.28 * vee);
  const keelY = -Math.max(draft, 0.02);
  const floorY = keelY + draft * (0.28 + 0.55 * vee);
  const turnY = -Math.max(0.03, draft * 0.18 * (1 - vee));
  const pts: Pt[] = [{ z: 0, y: keelY }];
  if (floor > 0.03) pts.push({ z: floor, y: Math.min(turnY - 0.02, floorY) });
  pts.push({ z: Math.max(bilge, floor), y: turnY });
  pts.push({ z: half * 0.99, y: 0 });
  pts.push({ z: half * (1.015 - 0.05 * vee), y: freeboard * 0.42 });
  pts.push({ z: half * 0.995, y: freeboard });
  return resample(pts.reverse(), 12);
}

function planingOutline(half: number, draft: number, freeboard: number, bow: number): Pt[] {
  const chine = Math.max(half * 0.96, 0.02);
  const keelY = -Math.max(draft, 0.1);
  const vee = 0.25 + bow * 0.7;
  const pts: Pt[] = [
    { z: 0, y: keelY },
    { z: chine * 0.62, y: keelY * vee },
    { z: chine, y: Math.min(-0.04, keelY * 0.15) },
    { z: half * 1.03, y: freeboard * 0.38 },
    { z: half, y: freeboard },
  ];
  return resample(pts.reverse(), 12);
}

function hullColor(y: number, target: { r: number; g: number; b: number }) {
  const c = y > 0.08 ? TOP : y < -0.08 ? BOTTOM : BOOT;
  target.r = c.r;
  target.g = c.g;
  target.b = c.b;
}

type BuiltHull = {
  group: THREE.Group;
  sheer: THREE.Vector3[];
  waterline: THREE.Vector3[];
};

function loftHull(boat: Boat, length: number, beam: number, canoe: number, freeboard: number): BuiltHull {
  const style = boat.hullStyle;
  const stations = 42;
  const girth = 11;
  const cols = girth * 2 + 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const sheer: THREE.Vector3[] = [];
  const waterline: THREE.Vector3[] = [];
  const color = { r: 0, g: 0, b: 0 };

  for (let s = 0; s < stations; s++) {
    const u = s / (stations - 1);
    const x = (u - 0.5) * length;
    const half = (beam / 2) * curve(BEAM[style], u);
    const body = canoe * curve(ROCKER[style], u);
    const fb = freeboard * curve(SHEER[style], u);
    const bow = curve(
      [
        [0, 0],
        [0.55, 0.15],
        [0.82, 0.55],
        [1, 1],
      ],
      u,
    );
    const rake = style === 'farr' || style === 'cruiser' ? curve([[0, 0], [0.7, 0.05], [1, 0.85]], u) : 0.15 * bow;
    const outline =
      style === 'planing'
        ? planingOutline(half, body, fb, bow)
        : yachtOutline(half, Math.max(body, 0.04), fb, bow);

    for (let g = 0; g < cols; g++) {
      const side = g <= girth ? 1 : -1;
      const sample = outline[g <= girth ? g : cols - 1 - g];
      const y = sample.y;
      const z = side * sample.z;
      const stem = x + rake * Math.max(0, y) / Math.max(fb, 0.2);
      positions.push(stem, y, z);
      hullColor(y, color);
      colors.push(color.r, color.g, color.b);
      if (g === 0) sheer.push(new THREE.Vector3(stem, y, z));
      if (g === cols - 1) sheer.push(new THREE.Vector3(stem, y, z));
    }

    const wlZ = Math.max(0.01, half * 0.98);
    waterline.push(new THREE.Vector3(x, 0.035, wlZ));
    waterline.push(new THREE.Vector3(x, 0.035, -wlZ));
  }

  const indices: number[] = [];
  for (let s = 0; s < stations - 1; s++) {
    for (let g = 0; g < cols - 1; g++) {
      const a = s * cols + g;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, hullMat);
  mesh.name = 'hull';

  const deck = buildDeck(sheer.filter((_, i) => i % 2 === 0), sheer.filter((_, i) => i % 2 === 1), length);
  const group = new THREE.Group();
  group.add(mesh, deck);
  return { group, sheer, waterline };
}

function buildDeck(starboard: THREE.Vector3[], port: THREE.Vector3[], length: number): THREE.Mesh {
  const n = Math.min(starboard.length, port.length);
  const positions: number[] = [];
  const indices: number[] = [];
  const camber = Math.max(0.06, length * 0.008);
  for (let i = 0; i < n; i++) {
    const s = starboard[i];
    const p = port[i];
    positions.push(s.x, s.y, s.z, s.x, Math.max(s.y, p.y) + camber, 0, p.x, p.y, p.z);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, deckMat);
  mesh.name = 'deck';
  return mesh;
}

function ring(y: number, chord: number, thick: number, shift: number): number[][] {
  const nose = -chord * 0.18 + shift;
  const tail = nose + chord;
  return [
    [nose, y, 0],
    [nose + chord * 0.34, y, thick / 2],
    [tail, y, 0],
    [nose + chord * 0.34, y, -thick / 2],
  ];
}

function makeFin(chordRoot: number, chordTip: number, thickRoot: number, thickTip: number, span: number, sweep: number): THREE.Mesh {
  const root = ring(0, chordRoot, thickRoot, 0);
  const tip = ring(-span, chordTip, thickTip, sweep);
  const positions = [...root.flat(), ...tip.flat()];
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const n = (i + 1) % 4;
    indices.push(i, n, 4 + i, n, 4 + n, 4 + i);
  }
  indices.push(0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, appendageMat);
}

function addKeel(group: THREE.Group, boat: Boat, length: number, canoe: number) {
  if (boat.keel === 'none') return;
  const span = Math.max(0.45, boat.draught - canoe * 0.35);
  const chord = boat.keel === 'dagger' ? length * 0.055 : boat.keel === 'bilge' ? length * 0.2 : length * 0.13;
  const thick = boat.keel === 'dagger' ? 0.07 : 0.12;
  const x = boat.keel === 'bilge' ? -length * 0.02 : length * 0.02;
  const fin = makeFin(chord, chord * (boat.keel === 'dagger' ? 0.7 : 0.62), thick, thick * 0.55, span, chord * 0.18);
  fin.position.set(x, -canoe * 0.55, 0);
  fin.name = 'keel';
  group.add(fin);

  if (boat.keel === 'fin') {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12), appendageMat);
    bulb.scale.set(3.1, 0.72, 1.15);
    bulb.position.set(x + chord * 0.12, -canoe * 0.55 - span, 0);
    bulb.name = 'bulb';
    group.add(bulb);
  }

  if (boat.keel === 'dagger') return;

  const rudderSpan = Math.max(0.7, span * 0.62);
  const rudder = makeFin(chord * 0.38, chord * 0.22, thick * 0.55, thick * 0.35, rudderSpan, chord * 0.08);
  rudder.position.set(-length * 0.42, -canoe * 0.25, 0);
  rudder.name = 'rudder';
  group.add(rudder);
}

function addRig(group: THREE.Group, length: number, beam: number, freeboard: number) {
  const deckY = freeboard * 0.9;
  const cabinLen = length * 0.26;
  const cabinWid = beam * 0.38;
  const cabinH = 0.46;
  const cabinX = length * 0.05;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, cabinH, cabinWid), cabinMat);
  cabin.position.set(cabinX, deckY + cabinH / 2, 0);
  cabin.name = 'coachroof';
  const windows = new THREE.Mesh(new THREE.BoxGeometry(cabinLen * 0.86, 0.14, cabinWid + 0.04), glassMat);
  windows.position.set(cabinX, deckY + cabinH * 0.62, 0);
  windows.name = 'windows';

  const mastH = length * 1.22;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, mastH, 12), sparMat);
  mast.position.set(length * 0.14, deckY + mastH / 2, 0);
  mast.name = 'mast';
  const boomLen = length * 0.38;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, boomLen, 8), sparMat);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(length * 0.14 - boomLen / 2, deckY + 1.15, 0);
  boom.name = 'boom';
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, beam * 0.72), sparMat);
  spreader.position.set(length * 0.14, deckY + mastH * 0.48, 0);
  group.add(cabin, windows, mast, boom, spreader);
}

function addStripes(group: THREE.Group, sheer: THREE.Vector3[], waterline: THREE.Vector3[], length: number) {
  const radius = Math.max(0.045, length * 0.005);
  const starboard = sheer.filter((_, i) => i % 2 === 0);
  const port = sheer.filter((_, i) => i % 2 === 1);
  for (const pts of [starboard, port]) {
    if (pts.length < 4) continue;
    const curve3 = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve3, pts.length * 2, radius, 5, false),
      stripeMat,
    );
    tube.name = 'sheer-line';
    group.add(tube);
  }

  const starWl = waterline.filter((_, i) => i % 2 === 0);
  const portWl = waterline.filter((_, i) => i % 2 === 1);
  for (const pts of [starWl, portWl]) {
    if (pts.length < 4) continue;
    const curve3 = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve3, pts.length * 2, radius * 0.7, 5, false),
      stripeMat,
    );
    tube.name = 'waterline';
    group.add(tube);
  }
}

function addBridge(group: THREE.Group, boat: Boat) {
  const sep = (boat.beam - boat.hullBeam) / 2;
  const width = Math.max(0.8, sep * 2 - boat.hullBeam * 0.45);
  const len = boat.lwl * 0.58;
  const thick = 0.38;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(len, thick, width), deckMat);
  slab.position.set(boat.lwl * 0.02, boat.clearance + thick / 2, 0);
  slab.name = 'bridgedeck';
  const cabinLen = len * 0.46;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, 0.62, width * 0.62), cabinMat);
  cabin.position.set(-boat.lwl * 0.04, boat.clearance + thick + 0.31, 0);
  cabin.name = 'cabin';
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, width * 0.55), glassMat);
  glass.position.set(-boat.lwl * 0.04 + cabinLen / 2, boat.clearance + thick + 0.48, 0);
  glass.name = 'windows';
  group.add(slab, cabin, glass);
}

function addCabin(group: THREE.Group, boat: Boat, length: number) {
  const cabinLen = length * 0.34;
  const cabinBeam = boat.beam * 0.62;
  const base = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, 0.72, cabinBeam), cabinMat);
  cabin.position.set(length * 0.04, base + 0.36, 0);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, cabinBeam * 0.92), glassMat);
  screen.position.set(length * 0.04 + cabinLen / 2 - 0.02, base + 0.62, 0);
  screen.rotation.z = -0.35;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinLen * 0.7, 0.06, cabinBeam * 1.02), deckMat);
  roof.position.set(length * 0.02, base + 0.76, 0);
  group.add(cabin, screen, roof);

  for (const side of [-1, 1]) {
    const engine = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), engineMat);
    leg.position.y = -0.28;
    const cowling = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.48, 0.26), engineMat);
    cowling.position.set(-0.08, 0.12, 0);
    engine.add(leg, cowling);
    engine.position.set(-length * 0.48, 0.15, side * 0.38);
    engine.name = 'outboard';
    group.add(engine);
  }
}

export function createBoatGroup(boat: Boat): THREE.Group {
  const root = new THREE.Group();
  root.name = boat.id;

  if (boat.id === 'first-40') {
    root.add(createFirst40Hull());
    return root;
  }

  if (boat.kind === 'cat') {
    const built = loftHull(boat, boat.lwl, boat.hullBeam, boat.canoe, boat.freeboard);
    addKeel(built.group, boat, boat.lwl, boat.canoe);
    addStripes(built.group, built.sheer, built.waterline, boat.lwl);
    const sep = (boat.beam - boat.hullBeam) / 2;
    const port = built.group;
    const starboard = built.group.clone();
    port.position.z = -sep;
    starboard.position.z = sep;
    root.add(port, starboard);
    addBridge(root, boat);
    return root;
  }

  const built = loftHull(boat, boat.lwl, boat.beam, boat.canoe, boat.freeboard);
  addStripes(built.group, built.sheer, built.waterline, boat.lwl);
  if (boat.kind === 'power') addCabin(built.group, boat, boat.lwl);
  else addKeel(built.group, boat, boat.lwl, boat.canoe);
  root.add(built.group);
  return root;
}
