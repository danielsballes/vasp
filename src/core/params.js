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
  profile: 'barrel', pts: null, ptsL: null, curve: 'smooth',
  ribShape: 'wave', ribProp: false,
  quality: 'normal',
};

/* Export mesh quality: segments around and the height between rings, in mm. The labels live in the
   message files under `quality.*`. */
export const QUALITY = {
  draft: { segments: 180, ringStep: 0.8 },
  normal: { segments: 360, ringStep: 0.4 },
  fine: { segments: 540, ringStep: 0.25 },
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
  { id: 'classic', params: () => ({}) },
  /* Squat lantern with round shoulders: the wall reaches the collars at a steep tilt, so it needs a
     thin layer and a wide line. */
  { id: 'round', params: () => ({ H: 150, D: 180, n: 2.6, shoulder: 68, rings: 34, ringRelief: 0.5, ringWidth: 3, ribs: 6, ribRelief: 0.8, ribWidth: 6, botD: 100, botL: 12, topD: 100, topL: 12 }) },
  { id: 'twisted', params: () => ({ H: 220, D: 130, n: 2.6, belly: 38, shoulder: 40, rings: 0, ribs: 10, ribRelief: 2.2, ribWidth: 100, twist: 120, base: 'closed', botD: 70, botL: 0, botThread: false, topD: 84, topL: 0, topThread: false }) },
  /* Gourd made of two round lobes that meet in a sharp waist: 116 mm below, 80 % of that above,
     closing into a narrow mouth, with straight sunken ribs and no twist. */
  { id: 'gourd', params: () => ({ H: 200, D: 116, profile: 'free', curve: 'round', pts: [[0.2967, 1], [0.5685, 0.53], [0.7526, 0.8028], [0.9654, 0.1678]], shoulder: 60, rings: 0, ribs: 58, ribRelief: -3, ribWidth: 100, ribShape: 'crest', ribProp: true, twist: 0, base: 'closed', botD: 44, botL: 0, botThread: false, topD: 18, topL: 0, topThread: false }) },
  /* Vase whose shoulder narrows into a waist and opens again at the mouth. Only a free profile with
     no neck can do that: a neck is always a vertical cylinder, and with a neck length of 0 the wall
     reaches the mouth with whatever tilt the profile has there. */
  { id: 'flared', params: () => ({ H: 220, D: 130, profile: 'free', curve: 'smooth', pts: [[0.38, 1], [0.86, 0.36]], shoulder: 45, rings: 0, ribs: 72, ribRelief: 1.2, ribWidth: 100, ribShape: 'wave', twist: 0, base: 'closed', botD: 70, botL: 0, botThread: false, topD: 76, topL: 0, topThread: false }) },
  /* Short part for calibrating the clearance before printing a full lantern: it keeps the current thread. */
  { id: 'threadTest', params: (current) => ({ H: Math.max(16, current.topL) + 20, D: current.topD, n: 10, rings: 0, ribs: 0, botD: current.topD, botL: 0, botThread: false, topD: current.topD, topL: Math.max(16, current.topL), topThread: true, pitch: current.pitch, depth: current.depth, clearance: current.clearance }) },
];

/* Layer height and line width depend on the nozzle: switching nozzles resets them to that profile's values. */
export function fitToNozzle(params, reset) {
  if (!NOZZLES[params.nozzle]) params.nozzle = 0.4;
  const nozzle = nozzleOf(params.nozzle);
  params.lh = reset ? nozzle.lhDef : clamp(params.lh, nozzle.lhMin, nozzle.lhMax);
  params.lw = reset ? nozzle.lwDef : clamp(params.lw, params.nozzle, lwMaxOf(params.nozzle));
}

/* Copies only the known keys of `src` onto `target`, validating each type. Used for the state saved
   in the browser, for saved designs and for an imported parameters file. */
export function applyParams(target, source) {
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in source)) continue;
    const fallback = DEFAULTS[key];
    const value = typeof source[key] === 'string' && LEGACY_VALUES[source[key]] ? LEGACY_VALUES[source[key]] : source[key];
    if (typeof fallback === 'number' && Number.isFinite(+value)) target[key] = +value;
    else if (typeof fallback === 'boolean' && typeof value === 'boolean') target[key] = value;
    else if (ENUMS[key] && ENUMS[key].includes(value)) target[key] = value;
    else if (key === 'pts' || key === 'ptsL') {
      const points = cleanPoints(value);
      target[key] = points.length ? points : null;
    }
  }
  if ('pts' in source && !('ptsL' in source)) target.ptsL = null;   // older files: both sides follow pts
  if (target.profile === 'free' && !target.pts) target.profile = 'barrel';
  fitToNozzle(target, false);
  return target;
}

export function presetParams(index, current) {
  const kept = {};
  for (const key of KEPT_BY_PRESETS) kept[key] = current[key];
  return { ...DEFAULTS, ...kept, ...PRESETS[index].params(current) };
}

/* Parameter set inside a parsed file, or null when the file is something else (for example a
   designs backup, which has its own loader) or has no parameter this app knows. */
export function paramsFromFile(data) {
  const source = data && data.params ? data.params : data;
  if (!source || typeof source !== 'object' || Array.isArray(source) || data.designs) return null;
  return Object.keys(DEFAULTS).some((key) => Object.hasOwn(source, key)) ? source : null;
}

/* Free-profile points that copy whatever barrel shape the model currently has. */
export function seedPoints(params) {
  const barrel = derive({ ...params, profile: 'barrel' });
  return [0.1, 0.3, 0.5, 0.7, 0.9].map((heightShare) => {
    const sample = Math.round((barrel.bodyBottom + heightShare * barrel.bodyHeight) / barrel.sampleStep);
    return [heightShare, +(barrel.radii[sample] / barrel.maxRadius).toFixed(3)];
  });
}

/* Validated deep copy of a parameter set, starting from the defaults. */
export function cloneParams(source) {
  return applyParams({ ...DEFAULTS }, source || {});
}
