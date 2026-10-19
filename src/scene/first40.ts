import * as THREE from 'three';

/**
 * Beneteau First 40, Farr 2007, hull only.
 * Lofted to the brochure plan and deep-keel profile: hull length 12.24 m,
 * LWL 10.67 m, beam 3.89 m, draught 2.45 m. Fine bow, maximum beam aft of
 * midships, broad transom, flat sheer, knuckle on the waterline, deep fin
 * with an elongated bulb and a separate spade rudder.
 *
 * x forward, y up, z to starboard. Origin at midships on the waterline.
 */

type P = [number, number, number];

const STATIONS: P[][] = [
  // Transom. Broad, nearly vertical, almost no deadrise.
  [
    [-6.04, 1.12, 1.58],
    [-5.96, 0.55, 1.6],
    [-5.9, 0.02, 1.54],
    [-5.86, -0.04, 1.05],
    [-5.84, -0.1, 0.22],
    [-5.84, -0.12, 0],
  ],
  [
    [-5.15, 1.11, 1.7],
    [-5.15, 0.5, 1.72],
    [-5.15, 0, 1.68],
    [-5.15, -0.14, 1.2],
    [-5.15, -0.28, 0.28],
    [-5.15, -0.34, 0],
  ],
  [
    [-3.7, 1.09, 1.84],
    [-3.7, 0.48, 1.86],
    [-3.7, 0, 1.82],
    [-3.7, -0.18, 1.32],
    [-3.7, -0.36, 0.26],
    [-3.7, -0.44, 0],
  ],
  // Maximum beam, aft of midships, as on the plan.
  [
    [-1.9, 1.08, 1.945],
    [-1.9, 0.48, 1.93],
    [-1.9, 0, 1.86],
    [-1.9, -0.22, 1.28],
    [-1.9, -0.42, 0.24],
    [-1.9, -0.5, 0],
  ],
  [
    [-0.15, 1.08, 1.84],
    [-0.15, 0.5, 1.8],
    [-0.15, 0, 1.7],
    [-0.15, -0.18, 1.1],
    [-0.15, -0.36, 0.22],
    [-0.15, -0.44, 0],
  ],
  [
    [1.45, 1.1, 1.55],
    [1.45, 0.52, 1.48],
    [1.42, 0, 1.28],
    [1.36, -0.14, 0.72],
    [1.32, -0.26, 0.16],
    [1.3, -0.32, 0],
  ],
  [
    [3.05, 1.16, 1.08],
    [3.0, 0.55, 0.92],
    [2.92, 0, 0.58],
    [2.86, -0.08, 0.16],
    [2.82, -0.12, 0],
  ],
  [
    [4.35, 1.22, 0.62],
    [4.22, 0.58, 0.4],
    [4.08, 0.06, 0.1],
    [4.02, -0.02, 0],
  ],
  // Forefoot knuckle on the designed waterline, stem raked forward of it.
  [
    [5.45, 1.28, 0.14],
    [5.32, 0.58, 0.05],
    [5.25, 0, 0],
  ],
  [
    [6.2, 1.32, 0],
    [5.25, 0, 0],
  ],
];

const WHITE = new THREE.Color('#f7fbff');
const SKY = new THREE.Color('#8ecbf3');
const DEEP = new THREE.Color('#3d94cb');
const tint = new THREE.Color();

function paint(y: number, into: { r: number; g: number; b: number }) {
  if (y >= 0.14) tint.copy(WHITE);
  else if (y >= -0.06) tint.copy(WHITE).lerp(SKY, (0.14 - y) / 0.2);
  else tint.copy(SKY).lerp(DEEP, Math.min(1, (-0.06 - y) / 1.7));
  into.r = tint.r;
  into.g = tint.g;
  into.b = tint.b;
}

function resample(points: P[], count: number): THREE.Vector3[] {
  const vectors = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (vectors.length < 2) return Array.from({ length: count }, () => vectors[0].clone());
  return new THREE.CatmullRomCurve3(vectors, false, 'centripetal').getPoints(count - 1);
}

function ring(y: number, chord: number, thick: number, shift: number): number[][] {
  const nose = -chord * 0.2 + shift;
  return [
    [nose, y, 0],
    [nose + chord * 0.32, y, thick / 2],
    [nose + chord, y, 0],
    [nose + chord * 0.32, y, -thick / 2],
  ];
}

function makeFin(chordRoot: number, chordTip: number, thickRoot: number, thickTip: number, span: number, sweep: number, material: THREE.Material) {
  const root = ring(0, chordRoot, thickRoot, 0);
  const tip = ring(-span, chordTip, thickTip, sweep);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...root.flat(), ...tip.flat()], 3));
  geometry.setIndex([0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4, 7, 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** Turn the sharp sheer into the radiused hull-to-deck joint of the real boat. */
function addRail(section: THREE.Vector3[], radius: number, steps: number, count: number): THREE.Vector3[] {
  const sheer = section[0];
  const zSign = Math.sign(sheer.z) || 1;
  const r = Math.min(radius, Math.abs(sheer.z) * 0.7);
  if (r < 0.012) return section;
  const cy = sheer.y - r;
  const cz = sheer.z - zSign * r;
  const arc: THREE.Vector3[] = [];
  for (let i = steps; i >= 0; i--) {
    const theta = (i / steps) * (Math.PI / 2);
    arc.push(new THREE.Vector3(sheer.x, cy + Math.sin(theta) * r, cz + Math.cos(theta) * r * zSign));
  }
  const body = section.slice(1).filter((point) => point.y < cy + 0.004);
  const curve = new THREE.CatmullRomCurve3([...arc, ...body], false, 'centripetal');
  return curve.getPoints(count - 1);
}

/**
 * Vertical axis the motion guide is drawn on.
 * Centre of buoyancy is the immersed canoe plus fin and bulb, about 1.07 m
 * aft of midships and 0.21 m below the waterline. Air draught is the
 * published 19.30 m, so the line tops out at masthead height.
 */
export const FIRST40_GUIDE = {
  cbX: -1.84,
  cbY: -0.21,
  masthead: 19.3,
  keel: -2.6,
};

export function createFirst40Hull(): THREE.Group {
  const girth = 28;
  const sections = STATIONS.map((station) => addRail(resample(station, girth), 0.075, 6, girth));
  const lengthPoints = 56;
  const spines = sections[0].map((_, g) => {
    const along = sections.map((section) => section[g]);
    return new THREE.CatmullRomCurve3(along, false, 'centripetal').getPoints(lengthPoints - 1);
  });

  const rows = spines[0].length;
  const cols = girth * 2 - 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = { r: 0, g: 0, b: 0 };

  for (let s = 0; s < rows; s++) {
    for (let g = 0; g < girth; g++) {
      const p = spines[g][s];
      positions.push(p.x, p.y, p.z);
      paint(p.y, tint);
      colors.push(tint.r, tint.g, tint.b);
    }
    for (let g = girth - 2; g >= 0; g--) {
      const p = spines[g][s];
      positions.push(p.x, p.y, -p.z);
      paint(p.y, tint);
      colors.push(tint.r, tint.g, tint.b);
    }
  }

  const indices: number[] = [];
  for (let s = 0; s < rows - 1; s++) {
    for (let g = 0; g < cols - 1; g++) {
      const a = s * cols + g;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hullGeo.setIndex(indices);
  hullGeo.computeVertexNormals();

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const deckMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7fbff,
    roughness: 0.58,
    metalness: 0.02,
    clearcoat: 0.18,
    side: THREE.DoubleSide,
  });
  const appendageMat = new THREE.MeshPhysicalMaterial({
    color: 0x5aaee0,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  group.name = 'first-40-hull';
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.name = 'hull';
  group.add(hull);

  const deckPositions: number[] = [];
  const deckIndex: number[] = [];
  for (let s = 0; s < rows; s++) {
    const star = spines[0][s];
    deckPositions.push(star.x, star.y, star.z, star.x, star.y + 0.07, 0, star.x, star.y, -star.z);
  }
  for (let s = 0; s < rows - 1; s++) {
    const a = s * 3;
    deckIndex.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3));
  deckGeo.setIndex(deckIndex);
  deckGeo.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.name = 'deck';
  group.add(deck);

  const fin = makeFin(1.35, 0.72, 0.14, 0.07, 1.95, 0.16, appendageMat);
  fin.position.set(0.35, -0.32, 0);
  fin.name = 'keel';
  group.add(fin);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 28, 16), appendageMat);
  bulb.scale.set(4.4, 0.55, 1.05);
  bulb.position.set(0.42, -2.33, 0);
  bulb.name = 'bulb';
  group.add(bulb);

  const rudder = makeFin(0.48, 0.26, 0.065, 0.035, 1.35, 0.06, appendageMat);
  rudder.position.set(-4.85, -0.2, 0);
  rudder.name = 'rudder';
  group.add(rudder);

  return group;
}
