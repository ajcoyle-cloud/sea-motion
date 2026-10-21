import * as THREE from 'three';

/**
 * Beneteau First 40, Farr 2007.
 * Hull length 12.24 m, beam 3.89 m, design draught 2.45 m.
 *
 * The bow is a raked stem (about 13.5° off vertical) with a short radius
 * where that stem turns into the canoe bottom — the forefoot is rounded,
 * not a knuckle or a long spoon. Maximum beam is aft of midships, the
 * rocker is flat through the middle, and the transom is broad and nearly
 * upright. Underwater: a swept fin, a torpedo bulb, a spade rudder, and a
 * saildrive.
 *
 * x forward, y up, z to starboard. Origin at midships on the waterline.
 */

type V2 = { x: number; y: number };

const TH = (13.5 * Math.PI) / 180;
const SIN = Math.sin(TH);
const COS = Math.cos(TH);
const TAN = Math.tan(TH);
const FORE_R = 0.5;
const Y_BOTTOM = -0.6;
const X_REF = 6.14;
const Y_REF = 1.24;
const NOSE_R = 0.11;
const Y_SHEER_BOW = 1.22;

const STEM_N = { x: -COS, y: SIN };

function stemX(y: number) {
  return X_REF - (Y_REF - y) * TAN;
}
function stemY(x: number) {
  return Y_REF - (X_REF - x) / TAN;
}

const forePy = Y_BOTTOM + FORE_R * (1 - SIN);
const forePx = stemX(forePy);
const foreC = { x: forePx + FORE_R * STEM_N.x, y: forePy + FORE_R * STEM_N.y };
const foreBT = { x: foreC.x, y: Y_BOTTOM };

const nosePy = Y_SHEER_BOW - NOSE_R * (1 + SIN);
const nosePx = stemX(nosePy);
const noseC = { x: nosePx + NOSE_R * STEM_N.x, y: nosePy + NOSE_R * STEM_N.y };
const noseSheer = { x: noseC.x, y: Y_SHEER_BOW };
const BOW_TIP = { x: noseC.x + NOSE_R, y: noseC.y };

/** Aftmost centreline point. The deck edge sits slightly forward of this. */
const X_STERN = -6.12;
const TRANSOM_RAKE = 0.1;

function rakeOf(xc: number) {
  const u = (xc + 4.35) / (X_STERN + 4.35);
  if (u <= 0) return 0;
  const t = Math.min(1, u);
  const s = t * t * (3 - 2 * t);
  return TRANSOM_RAKE * s;
}

function pchip(xs: number[], ys: number[], m0: number, m1: number) {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = ys.slice(1).map((y, i) => (y - ys[i]) / h[i]);
  const m = new Array<number>(n).fill(0);
  m[0] = m0;
  m[n - 1] = m1;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] === 0 || d[i] === 0 || d[i - 1] * d[i] < 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

/** Centreline rocker aft of the forefoot. Slope is flat where it meets the radius. */
const rocker = pchip(
  [X_STERN, -5.35, -4.15, -2.2, -0.2, 1.7, 3.3, 4.55, foreBT.x],
  [-0.16, -0.34, -0.55, -0.74, -0.8, -0.8, -0.74, -0.66, Y_BOTTOM],
  -0.12,
  0,
);

/**
 * Monotone cubic through the keys. A cosine blend was used here before, and
 * it forces a flat tangent at every key, which shows up as shelves along the
 * planform. Endpoint slopes follow Fritsch–Carlson so the curve cannot
 * overshoot.
 */
function fairKeys(keys: Array<[number, number]>, x: number) {
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const n = xs.length;
  const h = xs.slice(1).map((v, i) => v - xs[i]);
  const d = ys.slice(1).map((v, i) => (v - ys[i]) / h[i]);
  const endSlope = (d0: number, d1: number, h0: number, h1: number) => {
    let m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (m * d0 <= 0) m = 0;
    else if ((d0 > 0 && m > 3 * d0) || (d0 < 0 && m < 3 * d0)) m = 3 * d0;
    return m;
  };
  const m0 = endSlope(d[0], d[1] ?? d[0], h[0], h[1] ?? h[0]);
  const m1 = endSlope(d[n - 2], d[n - 3] ?? d[n - 2], h[n - 2], h[n - 3] ?? h[n - 2]);
  return pchip(xs, ys, m0, m1)(x);
}

function arcPoint(c: V2, radius: number, angle: number): V2 {
  return { x: c.x + radius * Math.cos(angle), y: c.y + radius * Math.sin(angle) };
}

function pushArc(out: V2[], c: V2, radius: number, a0: number, a1: number, steps: number) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const p = arcPoint(c, radius, a);
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-4) out.push(p);
  }
}

/** Lower silhouette: transom, rocker, forefoot radius, raked stem, stem-head radius. */
function buildLower(): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = X_STERN + ((foreBT.x - X_STERN) * i) / 48;
    pts.push({ x, y: rocker(x) });
  }
  // Horizontal bottom tangent is -90°. Stem tangent is -TH.
  pushArc(pts, foreC, FORE_R, -Math.PI / 2, -TH, 28);
  for (let i = 1; i <= 16; i++) {
    const y = forePy + ((nosePy - forePy) * i) / 16;
    pts.push({ x: stemX(y), y });
  }
  pushArc(pts, noseC, NOSE_R, -TH, 0, 8);
  return pts;
}

/** Upper silhouette: sheer, then the same stem-head radius over the top. */
function buildUpper(): V2[] {
  const pts: V2[] = [];
  const sheerKeys: Array<[number, number]> = [
    [-5.9, 1.16],
    [-3.2, 1.1],
    [0.2, 1.12],
    [2.6, 1.16],
    [4.2, 1.2],
    [noseSheer.x, Y_SHEER_BOW],
  ];
  for (let i = 0; i <= 36; i++) {
    const x = sheerKeys[0][0] + ((noseSheer.x - sheerKeys[0][0]) * i) / 36;
    pts.push({ x, y: fairKeys(sheerKeys, x) });
  }
  pushArc(pts, noseC, NOSE_R, Math.PI / 2, 0, 8);
  return pts;
}

const LOWER = buildLower();
const UPPER = buildUpper();

function yOn(poly: V2[], x: number) {
  if (x <= poly[0].x) return poly[0].y;
  const last = poly[poly.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < poly.length; i++) {
    if (x <= poly[i].x) {
      const a = poly[i - 1];
      const b = poly[i];
      const dx = b.x - a.x;
      const t = dx === 0 ? 0 : (x - a.x) / dx;
      return a.y + (b.y - a.y) * t;
    }
  }
  return last.y;
}

const TIP_X = LOWER[LOWER.length - 1].x;
const MAX_HALF = 1.945;

/** Deck-edge half beam. Maximum is aft of midships; the bow entry is fine. */
function halfBeam(x: number) {
  const f = (x + 5.92) / (TIP_X + 5.92);
  const keys: Array<[number, number]> = [
    [0, 0.8],
    [0.045, 0.9],
    [0.1, 0.945],
    [0.2, 0.985],
    [0.34, 1],
    [0.48, 0.965],
    [0.6, 0.84],
    [0.72, 0.64],
    [0.82, 0.42],
    [0.9, 0.24],
    [1, 0],
  ];
  return MAX_HALF * fairKeys(keys, Math.min(1, Math.max(0, f)));
}

function deadriseDeg(x: number) {
  return fairKeys(
    [
      [-6.2, 6],
      [-2.2, 8],
      [0.6, 10],
      [2.6, 13],
      [4.0, 16],
      [5.0, 20],
      [5.6, 26],
      [6.0, 32],
    ],
    x,
  );
}

function flareDeg(x: number) {
  // Eases back toward the stem. A flare that keeps rising on a narrowing
  // bow crosses the centreline, and clamping it there puts a kink in the
  // waterlines.
  return fairKeys(
    [
      [-6.2, 4],
      [-1, 5],
      [2.2, 7],
      [3.6, 8],
      [4.6, 7.2],
      [5.2, 5.6],
      [5.7, 4.0],
      [6.15, 2.0],
    ],
    x,
  );
}

function bilgeRadius(x: number) {
  return fairKeys(
    [
      [-6.2, 0.28],
      [-2, 0.36],
      [0.8, 0.42],
      [2.8, 0.32],
      [4.2, 0.2],
      [5.1, 0.12],
      [5.8, 0.06],
    ],
    x,
  );
}

/**
 * Straight topside and bottom, no fillet. Used only when a radius will not
 * fit. Still meets the requested sheer and keel, so a missed fillet cannot
 * fatten the waterline the way a quarter-ellipse does.
 */
function wedgeSection(hb: number, top: number, bot: number, phi: number, delta: number): V2[] {
  const tdir = { x: -Math.sin(phi), y: -Math.cos(phi) };
  const bdir = { x: Math.cos(delta), y: Math.sin(delta) };
  const det = bdir.x * tdir.y - bdir.y * tdir.x;
  const dy = top - bot;
  const a = Math.abs(det) < 1e-8 ? -1 : (hb * tdir.y - dy * tdir.x) / det;
  const hit = { x: a * bdir.x, y: bot + a * bdir.y };
  const inside = a > 0.02 && hit.x > 0.015 && hit.x < hb - 0.008 && hit.y > bot + 0.03 && hit.y < top - 0.03;
  const pts: V2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!inside) {
      pts.push({ x: hb * (1 - t), y: top + (bot - top) * t });
      continue;
    }
    if (t <= 0.5) {
      const u = t / 0.5;
      pts.push({ x: hb + (hit.x - hb) * u, y: top + (hit.y - top) * u });
    } else {
      const u = (t - 0.5) / 0.5;
      pts.push({ x: hit.x + (0 - hit.x) * u, y: hit.y + (bot - hit.y) * u });
    }
  }
  return pts;
}

function buildSection(hb: number, top: number, bot: number, deadrise: number, flare: number, radius: number): V2[] {
  const depth = top - bot;
  if (depth < 0.03 || hb < 0.015) {
    return [
      { x: hb, y: top },
      { x: 0, y: bot },
    ];
  }
  // Flare on a narrow deep bow pulls the topside through the centreline.
  // The fillet then fails, and a quarter-ellipse stand-in left a bulge in
  // every waterline forward of that station.
  const phiCap = Math.atan((hb * 0.9) / depth);
  const phi = Math.min((Math.max(0, flare) * Math.PI) / 180, phiCap);
  const delta = (Math.max(1, deadrise) * Math.PI) / 180;
  const hi = Math.max(0.012, Math.min(radius, depth * 0.42, hb * 0.5));
  let best = solveSection(hb, top, bot, phi, delta, hi);
  if (best) return best;
  let lo = 0.01;
  let hiR = hi;
  for (let attempt = 0; attempt < 10; attempt++) {
    const mid = (lo + hiR) / 2;
    const solved = solveSection(hb, top, bot, phi, delta, mid);
    if (solved) {
      best = solved;
      lo = mid;
    } else hiR = mid;
  }
  return best ?? wedgeSection(hb, top, bot, phi, delta);
}

function solveSection(hb: number, top: number, bot: number, phi: number, delta: number, Rb: number): V2[] | null {
  const keel = { x: 0, y: bot };
  const sheer = { x: hb, y: top };
  const bdir = { x: Math.cos(delta), y: Math.sin(delta) };
  const tdir = { x: -Math.sin(phi), y: -Math.cos(phi) };
  const nBot = { x: -Math.sin(delta), y: Math.cos(delta) };
  const nTop = { x: -Math.cos(phi), y: Math.sin(phi) };
  const pBot = { x: keel.x + Rb * nBot.x, y: keel.y + Rb * nBot.y };
  const pTop = { x: sheer.x + Rb * nTop.x, y: sheer.y + Rb * nTop.y };
  const det = bdir.x * tdir.y - bdir.y * tdir.x;
  if (Math.abs(det) < 1e-8) return null;
  const dx = pTop.x - pBot.x;
  const dy = pTop.y - pBot.y;
  const a = (dx * tdir.y - dy * tdir.x) / det;
  const c = { x: pBot.x + a * bdir.x, y: pBot.y + a * bdir.y };
  const tb = { x: c.x - Rb * nBot.x, y: c.y - Rb * nBot.y };
  const tt = { x: c.x - Rb * nTop.x, y: c.y - Rb * nTop.y };
  if (tb.x < -0.02 || tt.x < -0.02 || tt.y > top + 0.03 || tb.y > tt.y + 0.02 || c.x < -0.02) return null;
  if (tb.x > hb + 0.08 || tt.x > hb + 0.05) return null;

  const pts: V2[] = [keel];
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    pts.push({ x: keel.x + (tb.x - keel.x) * t, y: keel.y + (tb.y - keel.y) * t });
  }
  const aTb = Math.atan2(tb.y - c.y, tb.x - c.x);
  const aTt = Math.atan2(tt.y - c.y, tt.x - c.x);
  let da = aTt - aTb;
  while (da <= -Math.PI) da += Math.PI * 2;
  while (da > Math.PI) da -= Math.PI * 2;
  if (da < 0.05) return null;
  for (let i = 1; i <= 8; i++) {
    const ang = aTb + (da * i) / 8;
    pts.push({ x: c.x + Rb * Math.cos(ang), y: c.y + Rb * Math.sin(ang) });
  }
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    pts.push({ x: tt.x + (sheer.x - tt.x) * t, y: tt.y + (sheer.y - tt.y) * t });
  }
  // Stored keel → sheer. Callers want sheer first.
  pts.reverse();
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y > pts[i - 1].y + 0.04) return null;
  }
  return pts;
}

/** Quarter-round at the deck edge, so the topsides don't meet the deck in a knife edge. */
function addRail(section: V2[], radius: number): V2[] {
  const sheer = section[0];
  const depth = sheer.y - section[section.length - 1].y;
  const r = Math.min(radius, Math.abs(sheer.x) * 0.42, depth * 0.18);
  if (r < 0.025) return section;
  const cy = sheer.y - r;
  const cz = sheer.x - r;
  const arc: V2[] = [];
  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const theta = (i / steps) * (Math.PI / 2);
    arc.push({ x: cz + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
  }
  const body = section.slice(1).filter((p) => p.y < cy - 0.004);
  return [...arc, ...body];
}

function resample(pts: V2[], count: number): V2[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d);
    total += d;
  }
  if (total < 1e-5) return Array.from({ length: count }, () => ({ ...pts[0] }));
  const out: V2[] = [];
  for (let i = 0; i < count; i++) {
    let target = (i / (count - 1)) * total;
    let acc = 0;
    for (let s = 0; s < seg.length; s++) {
      if (acc + seg[s] >= target - 1e-6 || s === seg.length - 1) {
        const t = seg[s] === 0 ? 0 : Math.min(1, (target - acc) / seg[s]);
        out.push({
          x: pts[s].x + (pts[s + 1].x - pts[s].x) * t,
          y: pts[s].y + (pts[s + 1].y - pts[s].y) * t,
        });
        break;
      }
      acc += seg[s];
    }
  }
  return out;
}

type Station = { pts: V2[]; xs: number[] };

function buildStations(): Station[] {
  const count = 112;
  const girth = 24;
  const stations: Station[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const s = 1 - (1 - u) ** 1.6;
    const xc = X_STERN + (TIP_X - X_STERN) * s;
    const rake = rakeOf(xc);
    const sheerX = Math.min(TIP_X, xc + rake);
    const bot = yOn(LOWER, xc);
    const top = Math.max(yOn(UPPER, sheerX), bot + 0.004);
    const hb = halfBeam(sheerX);
    let section = buildSection(hb, top, bot, deadriseDeg(xc), flareDeg(xc), bilgeRadius(xc));
    section = addRail(section, Math.min(0.055, Math.max(0.018, hb * 0.11)));
    // The section solver can miss the requested beam. Scale onto the fair
    // half-beam so a failed fillet cannot put a hollow in the planform.
    const widest = section.reduce((m, p) => Math.max(m, p.x), 0);
    if (widest > 1e-4 && hb > 1e-4) {
      const scale = hb / widest;
      if (Math.abs(scale - 1) > 1e-4) section = section.map((p) => ({ x: p.x * scale, y: p.y }));
    }
    section = resample(section, girth);
    const depth = Math.max(1e-4, top - bot);
    const xs = section.map((p) => xc + rake * ((p.y - bot) / depth));
    stations.push({ pts: section, xs });
  }
  return stations;
}

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

function gridMesh(stations: Station[]) {
  const girth = stations[0].pts.length;
  const rows = stations.length;
  const cols = girth * 2 - 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const color = { r: 0, g: 0, b: 0 };

  for (let s = 0; s < rows; s++) {
    const station = stations[s];
    for (let g = 0; g < girth; g++) {
      const p = station.pts[g];
      positions.push(station.xs[g], p.y, p.x);
      paint(p.y, color);
      colors.push(color.r, color.g, color.b);
    }
    for (let g = girth - 2; g >= 0; g--) {
      const p = station.pts[g];
      positions.push(station.xs[g], p.y, -p.x);
      paint(p.y, color);
      colors.push(color.r, color.g, color.b);
    }
  }

  const indices: number[] = [];
  const pos = positions;
  const area = (ia: number, ib: number, ic: number) => {
    const ax = pos[ia * 3];
    const ay = pos[ia * 3 + 1];
    const az = pos[ia * 3 + 2];
    const bx = pos[ib * 3] - ax;
    const by = pos[ib * 3 + 1] - ay;
    const bz = pos[ib * 3 + 2] - az;
    const cx = pos[ic * 3] - ax;
    const cy = pos[ic * 3 + 1] - ay;
    const cz = pos[ic * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    return nx * nx + ny * ny + nz * nz;
  };
  for (let s = 0; s < rows - 1; s++) {
    for (let g = 0; g < cols - 1; g++) {
      const a = s * cols + g;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (area(a, b, c) > 1e-10) indices.push(a, b, c);
      if (area(b, d, c) > 1e-10) indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, cols, rows };
}

function profileY(x: number) {
  return yOn(LOWER, x);
}

/**
 * Vertical axis the motion guide is drawn on.
 * Underwater volume (canoe, fin and bulb) sits about half a metre aft of
 * midships. The line runs from the bulb to the published masthead height.
 */
export const FIRST40_GUIDE = {
  cbX: -0.5,
  cbY: -0.42,
  masthead: 19.3,
  keel: -2.47,
};

const hullMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.55,
  metalness: 0,
  clearcoat: 0.28,
  clearcoatRoughness: 0.4,
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
  color: 0x4e9cc8,
  roughness: 0.48,
  metalness: 0.02,
  clearcoat: 0.2,
  side: THREE.DoubleSide,
});
const bulbMat = new THREE.MeshPhysicalMaterial({
  color: 0x3f86b0,
  roughness: 0.42,
  metalness: 0.04,
  clearcoat: 0.28,
  side: THREE.DoubleSide,
});

function nacaHalf(t: number, fraction: number) {
  const x = Math.min(1, Math.max(0, t));
  return (
    5 *
    fraction *
    (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x)
  );
}

type FoilSpec = {
  rootLe: number;
  rootTe: number;
  tipLe: number;
  tipTe: number;
  rootY: number;
  tipY: number;
  rootThick: number;
  tipThick: number;
  /** Sink the root into the hull along the canoe profile. */
  followHull: boolean;
  spanStations: number;
  around: number;
  /** 0..1 of span that flares thicker into the hull. */
  rootFlare: number;
};

function loftFoil(spec: FoilSpec, material: THREE.Material) {
  const { spanStations, around } = spec;
  const positions: number[] = [];
  for (let s = 0; s < spanStations; s++) {
    const v = s / (spanStations - 1);
    const flare = spec.rootFlare > 0 && v < spec.rootFlare ? 1 + 0.55 * (1 - v / spec.rootFlare) ** 2 : 1;
    const thick = (spec.rootThick + (spec.tipThick - spec.rootThick) * v) * flare;
    const le = spec.rootLe + (spec.tipLe - spec.rootLe) * v;
    const te = spec.rootTe + (spec.tipTe - spec.rootTe) * v;
    const ySpan = spec.rootY + (spec.tipY - spec.rootY) * v;
    // Cluster samples at the leading edge.
    for (let i = 0; i < around; i++) {
      const u = i / around;
      const upper = u < 0.5;
      const edge = upper ? u * 2 : (1 - u) * 2;
      const t = 0.5 - 0.5 * Math.cos(Math.PI * edge);
      const chordT = upper ? t : t;
      const x = le + (te - le) * chordT;
      const half = nacaHalf(chordT, thick) * Math.abs(te - le);
      const z = (upper ? 1 : -1) * half;
      // Root sits up inside the shell so the fin meets the canoe with no gap.
      const yRoot = profileY(x) + 0.08;
      const y = spec.followHull ? yRoot + (spec.tipY - yRoot) * v : ySpan;
      positions.push(x, y, z);
    }
  }

  const indices: number[] = [];
  for (let s = 0; s < spanStations - 1; s++) {
    for (let i = 0; i < around; i++) {
      const a = s * around + i;
      const b = s * around + ((i + 1) % around);
      const c = a + around;
      const d = b + around;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Close the tip with a fan so the rudder doesn't read as a hollow tube.
  // The keel tip is buried in the bulb; a cap there is hidden and harmless.
  const tip = (spanStations - 1) * around;
  let tipX = 0;
  let tipY = 0;
  let tipZ = 0;
  for (let i = 0; i < around; i++) {
    tipX += positions[(tip + i) * 3];
    tipY += positions[(tip + i) * 3 + 1];
    tipZ += positions[(tip + i) * 3 + 2];
  }
  positions.push(tipX / around, tipY / around - 0.02, tipZ / around);
  const cap = spanStations * around;
  for (let i = 0; i < around; i++) {
    indices.push(tip + i, cap, tip + ((i + 1) % around));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function loftBulb(material: THREE.Material) {
  const noseX = 1.58;
  const tailX = -0.58;
  const along = 36;
  const around = 28;
  const positions: number[] = [];
  for (let i = 0; i < along; i++) {
    const t = i / (along - 1);
    let env: number;
    if (t < 0.2) env = Math.max(0, Math.sin((t / 0.2) * (Math.PI / 2))) ** 0.8;
    else if (t < 0.58) env = 1;
    else env = Math.max(0, Math.cos(((t - 0.58) / 0.42) * (Math.PI / 2))) ** 0.75;
    const lift = t < 0.78 ? 0 : 0.05 * ((t - 0.78) / 0.22) ** 1.4;
    const cy = -2.28 + lift;
    const hw = 0.24 * env;
    const hh = 0.21 * env;
    const x = noseX + (tailX - noseX) * t;
    if (env < 0.02) {
      for (let k = 0; k < around; k++) positions.push(x, cy, 0);
      continue;
    }
    for (let k = 0; k < around; k++) {
      const theta = (k / around) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const n = 2.25;
      const z = Math.sign(ct) * hw * Math.abs(ct) ** (2 / n);
      let y = Math.sign(st || 1) * hh * Math.abs(st) ** (2 / n);
      if (st < 0) y *= 0.84;
      positions.push(x, cy + y, z);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < along - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * around + k;
      const b = i * around + ((k + 1) % around);
      const c = a + around;
      const d = b + around;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function saildrive(material: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'saildrive';
  const x = -4.08;
  const hullY = profileY(x);
  const footY = -1.02;
  const strut = loftFoil(
    {
      rootLe: x + 0.1,
      rootTe: x - 0.12,
      tipLe: x + 0.06,
      tipTe: x - 0.1,
      rootY: hullY + 0.02,
      tipY: footY,
      rootThick: 0.34,
      tipThick: 0.26,
      followHull: true,
      spanStations: 6,
      around: 16,
      rootFlare: 0.35,
    },
    material,
  );
  strut.name = 'saildrive-leg';
  group.add(strut);

  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12), material);
  pod.scale.set(2.1, 0.72, 0.85);
  pod.position.set(x - 0.02, footY, 0);
  pod.name = 'saildrive-pod';
  group.add(pod);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.1, 12), material);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x - 0.12, footY, 0);
  hub.name = 'prop-hub';
  group.add(hub);

  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(x - 0.16, footY, 0);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.012, 0.03);
  bladeShape.quadraticCurveTo(0.045, 0.1, 0.012, 0.2);
  bladeShape.quadraticCurveTo(0.004, 0.16, -0.012, 0.11);
  bladeShape.quadraticCurveTo(-0.02, 0.06, 0.012, 0.03);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: false });
  bladeGeo.translate(0, 0, -0.006);
  for (let b = 0; b < 3; b++) {
    const blade = new THREE.Mesh(bladeGeo, material);
    blade.rotation.x = (b * Math.PI * 2) / 3 + 0.35;
    prop.add(blade);
  }
  group.add(prop);
  return group;
}

export function createFirst40Hull(): THREE.Group {
  const stations = buildStations();
  const { geometry } = gridMesh(stations);

  const group = new THREE.Group();
  group.name = 'first-40-hull';
  const hull = new THREE.Mesh(geometry, hullMat);
  hull.name = 'hull';
  group.add(hull);

  const girth = stations[0].pts.length;
  const rows = stations.length;
  const deckPositions: number[] = [];
  const deckIndex: number[] = [];
  for (let s = 0; s < rows; s++) {
    const sheer = stations[s].pts[0];
    const x = stations[s].xs[0];
    const camber = Math.min(0.075, Math.max(0.01, sheer.x * 0.045));
    deckPositions.push(x, sheer.y, sheer.x, x, sheer.y + camber, 0, x, sheer.y, -sheer.x);
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

  // Close the stern. The station is raked, so this cap follows that face.
  const transomPos: number[] = [];
  const aft = stations[0];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const outline: number[] = [];
  for (let g = 0; g < girth; g++) outline.push(aft.xs[g], aft.pts[g].y, aft.pts[g].x);
  for (let g = girth - 2; g >= 0; g--) outline.push(aft.xs[g], aft.pts[g].y, -aft.pts[g].x);
  const nOutline = outline.length / 3;
  for (let i = 0; i < nOutline; i++) {
    cx += outline[i * 3];
    cy += outline[i * 3 + 1];
    cz += outline[i * 3 + 2];
  }
  transomPos.push(...outline, cx / nOutline, cy / nOutline, cz / nOutline);
  const transomIndex: number[] = [];
  const center = nOutline;
  for (let i = 0; i < nOutline; i++) {
    const n = (i + 1) % nOutline;
    transomIndex.push(i, center, n);
  }
  const transomGeo = new THREE.BufferGeometry();
  transomGeo.setAttribute('position', new THREE.Float32BufferAttribute(transomPos, 3));
  transomGeo.setIndex(transomIndex);
  transomGeo.computeVertexNormals();
  const transom = new THREE.Mesh(transomGeo, hullMat);
  transom.name = 'transom';
  group.add(transom);

  const keel = loftFoil(
    {
      rootLe: 1.68,
      rootTe: -0.06,
      tipLe: 1.14,
      tipTe: -0.14,
      rootY: profileY(0.8) - 0.02,
      tipY: -2.16,
      rootThick: 0.12,
      tipThick: 0.09,
      followHull: true,
      spanStations: 10,
      around: 26,
      rootFlare: 0.16,
    },
    appendageMat,
  );
  keel.name = 'keel';
  group.add(keel);

  const bulb = loftBulb(bulbMat);
  bulb.name = 'bulb';
  group.add(bulb);

  const rudder = loftFoil(
    {
      rootLe: -4.82,
      rootTe: -5.24,
      tipLe: -4.96,
      tipTe: -5.22,
      rootY: profileY(-5.05) - 0.02,
      tipY: -1.95,
      rootThick: 0.13,
      tipThick: 0.09,
      followHull: true,
      spanStations: 12,
      around: 22,
      rootFlare: 0.2,
    },
    appendageMat,
  );
  rudder.name = 'rudder';
  group.add(rudder);

  group.add(saildrive(appendageMat));
  return group;
}
