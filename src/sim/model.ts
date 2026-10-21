/**
 * Real-time sea and hull motion for the promo / in-app preview.
 *
 * The surface is a linear sum of deep-water wave trains (wind wave plus
 * three swells). The hull is forced by that surface, resolved onto the
 * ship's own axes: pitch is fore and aft, roll is port to starboard.
 * Wavelength filtering keeps a 40 ft boat off 1-second chop.
 *
 * Pitch and roll are one rock — the slope of the sea — while they stay in
 * phase. With way on, keel and rudder damping kill the roll resonance, so
 * the hull tracks that slope and the mast leans along a single line. With
 * no way on, roll rings at its natural period, out of phase with the pitch,
 * and the boat wallows the way it does at anchor. Forward speed also shifts
 * the encounter period; that alone is not damping, and without the damping
 * it drives the roll onto its natural period and makes the wallow worse.
 *
 * It is a preview model, not the production hydrodynamic solver.
 *
 * Vertical acceleration is RMS at a point forward of midships.
 * Roll is RMS heel in degrees.
 * Slamming counts bow re-entries (or bridgedeck impacts on a cat) per hour.
 */

export const G = 9.81;

export type WaveId = 'wind' | 'primary' | 'secondary' | 'tertiary';

export type WaveComponent = {
  id: WaveId;
  name: string;
  /** Component height, trough to crest, metres. */
  height: number;
  /** Period, seconds. */
  period: number;
  /** Direction the waves travel toward, degrees true. 0 is north. */
  direction: number;
  phase: number;
  enabled: boolean;
};

export type ComfortFigures = {
  /** RMS roll, degrees. */
  rollRmsDeg: number;
  /** RMS vertical acceleration, m/s². */
  verticalAccelMs2: number;
  /** Events per hour. */
  slammingPerHour: number;
};

export type Scales = { heave: number; pitch: number; roll: number };

export const UNITY_SCALES: Scales = { heave: 1, pitch: 1, roll: 1 };

export type BoatKind = 'mono' | 'cat' | 'power';
export type HullStyle = 'farr' | 'cruiser' | 'cat' | 'planing';
export type KeelStyle = 'fin' | 'bilge' | 'dagger' | 'none';
export type SlamKind = 'bow' | 'deck';

export type Boat = {
  id: string;
  name: string;
  kind: BoatKind;
  hullStyle: HullStyle;
  keel: KeelStyle;
  slamKind: SlamKind;
  displacement: number;
  /** Waterline length used by the motion model, metres. */
  lwl: number;
  /** Length shown in the readout. Powerboats show overall length. */
  lengthShown: number;
  lengthLabel: 'LWL' | 'LENGTH';
  /** Overall beam, metres. */
  beam: number;
  /** Single-hull beam for a catamaran. */
  hullBeam: number;
  draught: number;
  /** Canoe-body depth below the waterline, metres. */
  canoe: number;
  freeboard: number;
  /** Bridgedeck clearance, metres. Cats only. */
  clearance: number;
  cruiseKn: number;
  maxKn: number;
  heavePeriod: number;
  pitchPeriod: number;
  rollPeriod: number;
  heaveZeta: number;
  pitchZeta: number;
  rollZeta: number;
  /** Re-entry speed that counts as a slam, m/s. */
  slamSpeed: number;
  /** Sensor for vertical acceleration, metres forward of midships. */
  sensorX: number;
  /** Bow station, metres forward of midships. */
  bowX: number;
  /** Static immersion of the bow station, metres. */
  bowImmersion: number;
};

export const BOATS: Boat[] = [
  {
    id: 'first-40',
    name: 'BENETEAU FIRST 40',
    kind: 'mono',
    hullStyle: 'farr',
    keel: 'fin',
    slamKind: 'bow',
    displacement: 7900,
    lwl: 10.67,
    lengthShown: 10.67,
    lengthLabel: 'LWL',
    beam: 3.89,
    hullBeam: 3.89,
    draught: 2.45,
    canoe: 0.42,
    freeboard: 1.18,
    clearance: 0,
    cruiseKn: 6.8,
    maxKn: 12,
    heavePeriod: 2.35,
    pitchPeriod: 2.55,
    rollPeriod: 3.5,
    heaveZeta: 0.34,
    pitchZeta: 0.28,
    rollZeta: 0.12,
    slamSpeed: 1.05,
    sensorX: 3.4,
    bowX: 5.05,
    bowImmersion: 0.14,
  },
  {
    id: 'hr-412',
    name: 'HALLBERG-RASSY 412',
    kind: 'mono',
    hullStyle: 'cruiser',
    keel: 'bilge',
    slamKind: 'bow',
    displacement: 11100,
    lwl: 11.5,
    lengthShown: 11.5,
    lengthLabel: 'LWL',
    beam: 4.11,
    hullBeam: 4.11,
    draught: 1.99,
    canoe: 0.72,
    freeboard: 1.32,
    clearance: 0,
    cruiseKn: 6.4,
    maxKn: 11,
    heavePeriod: 3.05,
    pitchPeriod: 3.25,
    rollPeriod: 4.9,
    heaveZeta: 0.4,
    pitchZeta: 0.34,
    rollZeta: 0.13,
    slamSpeed: 1.3,
    sensorX: 3.6,
    bowX: 5.4,
    bowImmersion: 0.22,
  },
  {
    // Factory sheet: LOA 13.72 m, LWL 13.07 m, beam 7.36 m, draught 1.50 m,
    // bridgedeck clearance 0.83 m, masthead 21.34 m, displacement 14,900 kg.
    // The mesh in public/models/catamaran.glb is this boat.
    id: 'leopard-45',
    name: 'LEOPARD 45',
    kind: 'cat',
    hullStyle: 'cat',
    keel: 'bilge',
    slamKind: 'deck',
    displacement: 14900,
    lwl: 13.07,
    lengthShown: 13.72,
    lengthLabel: 'LENGTH',
    beam: 7.36,
    hullBeam: 1.9,
    draught: 1.5,
    canoe: 0.62,
    freeboard: 1.6,
    clearance: 0.83,
    cruiseKn: 7.5,
    maxKn: 14,
    heavePeriod: 2.9,
    pitchPeriod: 3.2,
    rollPeriod: 6.6,
    heaveZeta: 0.42,
    pitchZeta: 0.32,
    rollZeta: 0.26,
    slamSpeed: 0.85,
    sensorX: 3.4,
    bowX: 6.2,
    bowImmersion: 0.18,
  },
  {
    id: 'axopar-37',
    name: 'AXOPAR 37 XC',
    kind: 'power',
    hullStyle: 'planing',
    keel: 'none',
    slamKind: 'bow',
    // Published light weight is 3,770 kg excluding engines. Motion uses a
    // loaded figure with engines; the readout shows the published weight.
    displacement: 3770,
    lwl: 9.4,
    lengthShown: 11.5,
    lengthLabel: 'LENGTH',
    beam: 3.35,
    hullBeam: 3.35,
    draught: 0.85,
    canoe: 0.55,
    freeboard: 0.92,
    clearance: 0,
    cruiseKn: 22,
    maxKn: 36,
    heavePeriod: 1.55,
    pitchPeriod: 1.7,
    rollPeriod: 2.4,
    heaveZeta: 0.38,
    pitchZeta: 0.3,
    rollZeta: 0.2,
    slamSpeed: 0.7,
    sensorX: 2.6,
    bowX: 4.5,
    bowImmersion: 0.08,
  },
];

export function boatById(id: string): Boat {
  return BOATS.find((b) => b.id === id) ?? BOATS[0];
}

/** The sea in the reference still. Heights are trough-to-crest component heights. */
export function referenceSea(): WaveComponent[] {
  return [
    { id: 'wind', name: 'WIND WAVE', height: 0.31, period: 1, phase: 0.4, direction: 153, enabled: true },
    { id: 'primary', name: 'PRIMARY SWELL', height: 2.37, period: 7.9, phase: 1.15, direction: 238, enabled: true },
    { id: 'secondary', name: 'SECONDARY SWELL', height: 1.15, period: 4.3, phase: 2.2, direction: 245, enabled: true },
    { id: 'tertiary', name: 'TERTIARY SWELL', height: 0.83, period: 3.6, phase: 0.75, direction: 231, enabled: true },
  ];
}

/** Opening view: the reference sea eased a little, with the short wind wave pulled right back. */
export function landingSea(): WaveComponent[] {
  return [
    { id: 'wind', name: 'WIND WAVE', height: 0.08, period: 2.4, phase: 0.4, direction: 153, enabled: true },
    { id: 'primary', name: 'PRIMARY SWELL', height: 1.9, period: 7.9, phase: 1.15, direction: 238, enabled: true },
    { id: 'secondary', name: 'SECONDARY SWELL', height: 0.85, period: 4.3, phase: 2.2, direction: 245, enabled: true },
    { id: 'tertiary', name: 'TERTIARY SWELL', height: 0.55, period: 3.6, phase: 0.75, direction: 231, enabled: true },
  ];
}

export function headSea(headingDeg: number): WaveComponent[] {
  const into = wrapDeg(headingDeg + 180);
  return [
    { id: 'wind', name: 'WIND WAVE', height: 0.7, period: 3.4, phase: 0.3, direction: wrapDeg(into + 18), enabled: true },
    { id: 'primary', name: 'PRIMARY SWELL', height: 2.2, period: 6.8, phase: 1.0, direction: into, enabled: true },
    { id: 'secondary', name: 'SECONDARY SWELL', height: 0.9, period: 9.5, phase: 2.0, direction: wrapDeg(into - 28), enabled: true },
    { id: 'tertiary', name: 'TERTIARY SWELL', height: 0.4, period: 4.2, phase: 0.6, direction: wrapDeg(into + 40), enabled: true },
  ];
}

export function beamSea(headingDeg: number, rollPeriod: number): WaveComponent[] {
  const fromBeam = wrapDeg(headingDeg + 90);
  return [
    { id: 'wind', name: 'WIND WAVE', height: 0.35, period: 3.0, phase: 0.2, direction: wrapDeg(fromBeam + 20), enabled: true },
    { id: 'primary', name: 'PRIMARY SWELL', height: 1.5, period: Math.round(rollPeriod * 10) / 10, phase: 0.8, direction: fromBeam, enabled: true },
    { id: 'secondary', name: 'SECONDARY SWELL', height: 0.45, period: 8.5, phase: 1.7, direction: wrapDeg(fromBeam - 25), enabled: true },
    { id: 'tertiary', name: 'TERTIARY SWELL', height: 0.2, period: 5, phase: 0.4, direction: wrapDeg(fromBeam + 15), enabled: false },
  ];
}

export function calmSea(): WaveComponent[] {
  return [
    { id: 'wind', name: 'WIND WAVE', height: 0.15, period: 2.8, phase: 0.2, direction: 140, enabled: true },
    { id: 'primary', name: 'PRIMARY SWELL', height: 0.6, period: 9.5, phase: 1.1, direction: 210, enabled: true },
    { id: 'secondary', name: 'SECONDARY SWELL', height: 0.25, period: 6, phase: 2.0, direction: 240, enabled: true },
    { id: 'tertiary', name: 'TERTIARY SWELL', height: 0.1, period: 4, phase: 0.5, direction: 180, enabled: false },
  ];
}

export function wrapDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

export type ResolvedWave = {
  amp: number;
  k: number;
  kx: number;
  kz: number;
  omega: number;
  phase: number;
  wavelength: number;
  capped: boolean;
};

/** Breaking-steepness cap so a short period cannot spike the surface. */
const MAX_STEEPNESS = 0.38;

export function resolveWave(w: WaveComponent): ResolvedWave {
  const period = Math.max(w.period, 0.6);
  const omega = (2 * Math.PI) / period;
  const k = (omega * omega) / G;
  let amp = w.enabled ? Math.max(0, w.height) / 2 : 0;
  const maxAmp = MAX_STEEPNESS / k;
  const capped = amp > maxAmp && amp > 0;
  if (capped) amp = maxAmp;
  const dir = (w.direction * Math.PI) / 180;
  return {
    amp,
    k,
    kx: k * Math.sin(dir),
    kz: k * Math.cos(dir),
    omega,
    phase: w.phase,
    wavelength: (2 * Math.PI) / k,
    capped,
  };
}

export function wavesCapped(waves: WaveComponent[]): boolean {
  return waves.some((w) => w.enabled && resolveWave(w).capped);
}

export type SeaSummary = {
  height: number;
  direction: number;
  period: number;
};

/** Significant height, energy-weighted direction and period. */
export function combineSea(waves: WaveComponent[]): SeaSummary {
  let h2 = 0;
  let sx = 0;
  let sz = 0;
  let et = 0;
  for (const w of waves) {
    if (!w.enabled || w.height <= 0) continue;
    const e = w.height * w.height;
    h2 += e;
    const d = (w.direction * Math.PI) / 180;
    sx += e * Math.sin(d);
    sz += e * Math.cos(d);
    et += e * w.period;
  }
  if (h2 <= 0) return { height: 0, direction: 0, period: 0 };
  return {
    height: Math.sqrt(h2),
    direction: wrapDeg((Math.atan2(sx, sz) * 180) / Math.PI),
    period: et / h2,
  };
}

/** Colour-scale half-range, metres, snapped so the legend stays readable. */
export function elevationRange(waves: WaveComponent[]): number {
  const amp = waves.reduce((sum, w) => sum + resolveWave(w).amp, 0);
  const raw = Math.max(0.7, amp * 0.82);
  const steps = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return steps.find((s) => s >= raw) ?? 10;
}

export type Osc = { y: number; v: number };

export function stepOsc(o: Osc, target: number, omega: number, zeta: number, dt: number): number {
  const acc = omega * omega * (target - o.y) - 2 * zeta * omega * o.v;
  o.v += acc * dt;
  o.y += o.v * dt;
  return acc;
}

/** Shared by pitch and by roll once the boat has way on, so the two stay in phase. */
const SLOPE_TAU = 0.16;

/** Critically damped follow. Heave and pitch use this so they contour the
 *  filtered wave instead of ringing and lifting the fin clear of a trough. */
function followOsc(o: Osc, target: number, tau: number, dt: number): number {
  const omega = 1 / tau;
  const acc = omega * omega * (target - o.y) - 2 * omega * o.v;
  o.v += acc * dt;
  o.y += o.v * dt;
  return acc;
}

/**
 * 0 at rest, 1 once the keel and rudder are producing lift damping.
 * The first couple of knots take the edge off the at-anchor roll; by
 * sailing speed the resonance is gone and roll simply follows the sea.
 */
export function wayOn(speedKn: number): number {
  const metresPerSec = Math.max(0, speedKn) * 0.514444;
  return 1 - Math.exp(-metresPerSec / 1.1);
}

function stepRoll(boat: Boat, roll: Osc, target: number, speedKn: number, dt: number): number {
  const way = wayOn(speedKn);
  const resonant = (2 * Math.PI) / boat.rollPeriod;
  const tracking = 1 / SLOPE_TAU;
  const omega = resonant + (tracking - resonant) * way;
  const zeta = boat.rollZeta + (1 - boat.rollZeta) * way;
  return stepOsc(roll, target, omega, zeta, dt);
}

function clampOsc(o: Osc, limit: number) {
  if (o.y > limit) {
    o.y = limit;
    o.v *= 0.25;
  } else if (o.y < -limit) {
    o.y = -limit;
    o.v *= 0.25;
  }
}

function sinc(x: number): number {
  if (Math.abs(x) < 1e-4) return 1;
  return Math.sin(x) / x;
}

export type Frame = {
  heaveTarget: number;
  pitchTarget: number;
  rollTarget: number;
  immersion: number;
  immersionVel: number;
};

/** Matches the hull yaw (π/2 − heading), which points local +X along (sin h, −cos h). */
export function headingVectors(headingDeg: number) {
  const h = (headingDeg * Math.PI) / 180;
  return {
    fwdX: Math.sin(h),
    fwdZ: -Math.cos(h),
    stbdX: Math.cos(h),
    stbdZ: Math.sin(h),
  };
}

export function evaluateFrame(
  boat: Boat,
  waves: WaveComponent[],
  headingDeg: number,
  speedKn: number,
  originX: number,
  originZ: number,
  time: number,
  dofs: { heave: Osc; pitch: Osc },
): Frame {
  const { fwdX, fwdZ, stbdX, stbdZ } = headingVectors(headingDeg);
  const u = speedKn * 0.514444;
  const vx = fwdX * u;
  const vz = fwdZ * u;

  let heaveTarget = 0;
  let pitchTarget = 0;
  let rollTarget = 0;
  let immersion = boat.slamKind === 'deck' ? -boat.clearance : boat.bowImmersion;
  let immersionVel = 0;

  const bowX = originX + fwdX * boat.bowX;
  const bowZ = originZ + fwdZ * boat.bowX;
  const deckX = originX + fwdX * boat.lwl * 0.05;
  const deckZ = originZ + fwdZ * boat.lwl * 0.05;

  for (const wave of waves) {
    const w = resolveWave(wave);
    if (w.amp <= 0) continue;

    const phaseCg = w.kx * originX + w.kz * originZ - w.omega * time + w.phase;
    const s = Math.sin(phaseCg);
    const c = Math.cos(phaseCg);
    const argL = (w.k * boat.lwl) / 2;
    // Signed average over the waterline. This is the slope the hull can actually lie on.
    const along = sinc(argL);

    heaveTarget += w.amp * c * along;

    const gx = -w.amp * w.kx * s;
    const gz = -w.amp * w.kz * s;
    const slopeLong = gx * fwdX + gz * fwdZ;
    const slopeBeam = gx * stbdX + gz * stbdZ;
    // One slope, split onto the fore-aft axis and the port-starboard axis.
    pitchTarget += slopeLong * along;

    const argB = (w.k * boat.beam) / 2;
    const rollGain = Math.abs(sinc(argB)) * Math.exp(-w.k * boat.draught * 0.15);
    rollTarget += -slopeBeam * rollGain;

    const local = boat.slamKind === 'deck' ? 1 : bowWeight(w.wavelength, boat.lwl);
    if (local <= 0) continue;
    const px = boat.slamKind === 'deck' ? deckX : bowX;
    const pz = boat.slamKind === 'deck' ? deckZ : bowZ;
    const ph = w.kx * px + w.kz * pz - w.omega * time + w.phase;
    const ls = Math.sin(ph);
    const lc = Math.cos(ph);
    const amp = w.amp * local;
    immersion += amp * lc;
    const detadx = -amp * w.kx * ls;
    const detadz = -amp * w.kz * ls;
    const detadt = amp * w.omega * ls;
    immersionVel += detadt + detadx * vx + detadz * vz;
  }

  if (boat.slamKind === 'deck') {
    immersion -= dofs.heave.y;
    immersionVel -= dofs.heave.v;
  } else {
    immersion -= dofs.heave.y + boat.bowX * dofs.pitch.y;
    immersionVel -= dofs.heave.v + boat.bowX * dofs.pitch.v;
  }

  return { heaveTarget, pitchTarget, rollTarget, immersion, immersionVel };
}

function bowWeight(wavelength: number, lwl: number): number {
  const ratio = wavelength / lwl;
  if (ratio >= 0.5) return 1;
  if (ratio <= 0.18) return 0;
  return (ratio - 0.18) / 0.32;
}

export type Dofs = { heave: Osc; pitch: Osc; roll: Osc };

export function emptyDofs(): Dofs {
  return { heave: { y: 0, v: 0 }, pitch: { y: 0, v: 0 }, roll: { y: 0, v: 0 } };
}

export type StepResult = {
  slammed: boolean;
  rollDeg: number;
  verticalAccel: number;
};

export function stepBoat(
  boat: Boat,
  waves: WaveComponent[],
  headingDeg: number,
  speedKn: number,
  state: { originX: number; originZ: number; time: number; dofs: Dofs; armed: boolean; prevImm: number },
  scales: Scales,
  dt: number,
): StepResult {
  const { fwdX, fwdZ } = headingVectors(headingDeg);
  const u = speedKn * 0.514444;
  state.originX += fwdX * u * dt;
  state.originZ += fwdZ * u * dt;
  state.time += dt;

  const frame = evaluateFrame(boat, waves, headingDeg, speedKn, state.originX, state.originZ, state.time, state.dofs);
  const heaveAcc = followOsc(state.dofs.heave, frame.heaveTarget * scales.heave, 0.1, dt);
  // A little extra pitch, so the bow still drops back into the sea. Same
  // time constant as underway roll, so a quartering sea stays one rock.
  const pitchAcc = followOsc(state.dofs.pitch, frame.pitchTarget * scales.pitch * 1.22, SLOPE_TAU, dt);
  stepRoll(boat, state.dofs.roll, frame.rollTarget * scales.roll, speedKn, dt);

  clampOsc(state.dofs.heave, 4);
  clampOsc(state.dofs.pitch, 0.38);
  clampOsc(state.dofs.roll, 0.42);

  const crossed = state.prevImm < 0 && frame.immersion >= 0;
  const slammed = state.armed && crossed && frame.immersionVel > boat.slamSpeed;
  if (frame.immersion < 0) state.armed = true;
  if (slammed) state.armed = false;
  state.prevImm = frame.immersion;

  const verticalAccel = heaveAcc + boat.sensorX * pitchAcc;
  return {
    slammed,
    rollDeg: (state.dofs.roll.y * 180) / Math.PI,
    verticalAccel,
  };
}

export function simulateMetrics(
  boat: Boat,
  waves: WaveComponent[],
  headingDeg: number,
  speedKn: number,
  scales: Scales = UNITY_SCALES,
): ComfortFigures {
  const dt = 1 / 30;
  const total = 90;
  const burn = 24;
  const state = {
    originX: 0,
    originZ: 0,
    time: 0,
    dofs: emptyDofs(),
    armed: false,
    prevImm: 1,
  };
  let n = 0;
  let rollSq = 0;
  let accelSq = 0;
  let slams = 0;
  const steps = Math.round(total / dt);
  for (let i = 0; i < steps; i++) {
    const sample = stepBoat(boat, waves, headingDeg, speedKn, state, scales, dt);
    if (state.time < burn) continue;
    n += 1;
    rollSq += sample.rollDeg * sample.rollDeg;
    accelSq += sample.verticalAccel * sample.verticalAccel;
    if (sample.slammed) slams += 1;
  }
  const seconds = n * dt;
  return {
    rollRmsDeg: n ? Math.sqrt(rollSq / n) : 0,
    verticalAccelMs2: n ? Math.sqrt(accelSq / n) : 0,
    slammingPerHour: seconds > 0 ? slams / (seconds / 3600) : 0,
  };
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(3.2, Math.max(0.25, n));
}

/** Scale the oscillators so a short run lands near supplied route figures. */
export function matchScales(
  boat: Boat,
  waves: WaveComponent[],
  headingDeg: number,
  speedKn: number,
  target: ComfortFigures,
): { scales: Scales; achieved: ComfortFigures } {
  const base = simulateMetrics(boat, waves, headingDeg, speedKn, UNITY_SCALES);
  const accel = clampScale(target.verticalAccelMs2 / Math.max(base.verticalAccelMs2, 0.05));
  const roll = clampScale(target.rollRmsDeg / Math.max(base.rollRmsDeg, 0.2));
  let scales: Scales = { heave: accel, pitch: accel, roll };
  const mid = simulateMetrics(boat, waves, headingDeg, speedKn, scales);
  if (mid.slammingPerHour > 0.4 && target.slammingPerHour >= 0) {
    const fix = clampScale(Math.sqrt(target.slammingPerHour / mid.slammingPerHour));
    scales = { heave: accel, pitch: clampScale(accel * fix), roll };
  } else if (target.slammingPerHour >= 4 && mid.slammingPerHour <= 0.4) {
    scales = { heave: accel, pitch: clampScale(accel * 1.7), roll };
  }
  const achieved = simulateMetrics(boat, waves, headingDeg, speedKn, scales);
  return { scales, achieved };
}

/** Example route figures for a First 40 in the reference sea. Editable. */
export const PLACEHOLDER_FIGURES: ComfortFigures = {
  rollRmsDeg: 5.5,
  verticalAccelMs2: 1.4,
  slammingPerHour: 9,
};
