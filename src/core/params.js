import { clamp, cleanPoints, derive } from './geometry.js';
import { NOZZLES, nozzleOf, lwMaxOf } from './print.js';

/* Default values: the classic lantern. The keys match the exported parameters file. */
export const DEFAULTS = {
  H: 200, D: 130, n: 5, belly: 50, shoulder: 45,
  rings: 13, ringRelief: 1.2, ringWidth: 5,
  ribs: 8, ribRelief: 1, ribWidth: 16, twist: 0,
  botD: 76, botL: 16, botThread: true,
  topD: 76, topL: 16, topThread: true,
  pitch: 4, depth: 1.2, clearance: 0.3, capWall: 2, capFloor: 1.6,
  topHole: false, topHoleD: 40, botHole: false, botHoleD: 10,
  nozzle: 0.4, lh: 0.2, lw: 0.42, protect: true,
  base: 'open', baseT: 1,
  profile: 'barrel', pts: null, curve: 'smooth',
  ribShape: 'wave', ribProp: false,
  quality: 'normal',
};

/* Export mesh quality. The labels live in the message files under `quality.*`. */
export const QUALITY = {
  draft: { seg: 180, dz: 0.8 },
  normal: { seg: 360, dz: 0.4 },
  fine: { seg: 540, dz: 0.25 },
};

export const ENUMS = {
  quality: Object.keys(QUALITY),
  base: ['open', 'closed'],
  profile: ['barrel', 'free'],
  curve: ['smooth', 'round'],
  ribShape: ['wave', 'crest'],
};

/* Values written by the original Spanish-language build, so the parameter files it exported still
   load here. */
const LEGACY_VALUES = {
  abierta: 'open', cerrada: 'closed',
  barril: 'barrel', libre: 'free',
  suave: 'smooth', redonda: 'round',
  onda: 'wave', cresta: 'crest',
  borrador: 'draft', fina: 'fine',
};

/* What a preset leaves untouched: print settings, cap settings and mesh quality. */
export const KEPT_BY_PRESETS = ['nozzle', 'lw', 'lh', 'capWall', 'capFloor', 'topHole', 'topHoleD', 'botHole', 'botHoleD', 'baseT', 'quality'];

/* Starting points. The labels live in the message files under `presets.<id>`. */
export const PRESETS = [
  { id: 'classic', p: () => ({}) },
  /* Squat lantern with round shoulders: the wall reaches the collars at a steep tilt, so it needs a
     thin layer and a wide line. */
  { id: 'round', p: () => ({ H: 150, D: 180, n: 2.6, shoulder: 68, rings: 34, ringRelief: 0.5, ringWidth: 3, ribs: 6, ribRelief: 0.8, ribWidth: 6, botD: 100, botL: 12, topD: 100, topL: 12 }) },
  { id: 'twisted', p: () => ({ H: 220, D: 130, n: 2.6, belly: 38, shoulder: 40, rings: 0, ribs: 10, ribRelief: 2.2, ribWidth: 100, twist: 120, base: 'closed', botD: 70, botL: 0, botThread: false, topD: 84, topL: 0, topThread: false }) },
  /* Gourd made of two round lobes that meet in a sharp waist: 116 mm below, 80 % of that above,
     closing into a narrow mouth, with straight sunken ribs and no twist. */
  { id: 'gourd', p: () => ({ H: 200, D: 116, profile: 'free', curve: 'round', pts: [[0.2967, 1], [0.5685, 0.53], [0.7526, 0.8028], [0.9654, 0.1678]], shoulder: 60, rings: 0, ribs: 58, ribRelief: -3, ribWidth: 100, ribShape: 'crest', ribProp: true, twist: 0, base: 'closed', botD: 44, botL: 0, botThread: false, topD: 18, topL: 0, topThread: false }) },
  /* Vase whose shoulder narrows into a waist and opens again at the mouth. Only a free profile with
     no neck can do that: a neck is always a vertical cylinder, and with a neck length of 0 the wall
     reaches the mouth with whatever tilt the profile has there. */
  { id: 'flared', p: () => ({ H: 220, D: 130, profile: 'free', curve: 'smooth', pts: [[0.38, 1], [0.86, 0.36]], shoulder: 45, rings: 0, ribs: 72, ribRelief: 1.2, ribWidth: 100, ribShape: 'wave', twist: 0, base: 'closed', botD: 70, botL: 0, botThread: false, topD: 76, topL: 0, topThread: false }) },
  /* Short part for calibrating the clearance before printing a full lantern: it keeps the current thread. */
  { id: 'threadTest', p: (c) => ({ H: Math.max(16, c.topL) + 20, D: c.topD, n: 10, rings: 0, ribs: 0, botD: c.topD, botL: 0, botThread: false, topD: c.topD, topL: Math.max(16, c.topL), topThread: true, pitch: c.pitch, depth: c.depth, clearance: c.clearance }) },
];

/* Layer height and line width depend on the nozzle: switching nozzles resets them to that profile's values. */
export function fitToNozzle(p, reset) {
  if (!NOZZLES[p.nozzle]) p.nozzle = 0.4;
  const nz = nozzleOf(p.nozzle);
  p.lh = reset ? nz.lhDef : clamp(p.lh, nz.lhMin, nz.lhMax);
  p.lw = reset ? nz.lwDef : clamp(p.lw, p.nozzle, lwMaxOf(p.nozzle));
}

/* Copies only the known keys of `src` onto `target`, validating each type. Used for the state saved
   in the browser, for saved designs and for an imported parameters file. */
export function applyParams(target, src) {
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in src)) continue;
    const d = DEFAULTS[k];
    const v = typeof src[k] === 'string' && LEGACY_VALUES[src[k]] ? LEGACY_VALUES[src[k]] : src[k];
    if (typeof d === 'number' && Number.isFinite(+v)) target[k] = +v;
    else if (typeof d === 'boolean' && typeof v === 'boolean') target[k] = v;
    else if (ENUMS[k] && ENUMS[k].includes(v)) target[k] = v;
    else if (k === 'pts') { const c = cleanPoints(v); target.pts = c.length ? c : null; }
  }
  if (target.profile === 'free' && !target.pts) target.profile = 'barrel';
  fitToNozzle(target, false);
  return target;
}

export function presetParams(index, current) {
  const kept = {};
  for (const k of KEPT_BY_PRESETS) kept[k] = current[k];
  return { ...DEFAULTS, ...kept, ...PRESETS[index].p(current) };
}

/* Free-profile points that copy whatever barrel shape the model currently has. */
export function seedPoints(p) {
  const q = derive({ ...p, profile: 'barrel' });
  return [0.1, 0.3, 0.5, 0.7, 0.9].map((u) => [u, +(q.base[Math.round((q.zb + u * q.hb) / q.dz)] / q.Rmax).toFixed(3)]);
}

/* Validated deep copy of a parameter set, starting from the defaults. */
export function cloneParams(src) {
  return applyParams({ ...DEFAULTS }, src || {});
}
