import { reactive, shallowRef, computed, watch } from 'vue';
import * as G from '../core/geometry.js';
import { DEFAULTS, QUALITY, applyParams, cloneParams, fitToNozzle, presetParams, seedPoints } from '../core/params.js';
import { PLA, PLATE, lwMaxOf, nozzleOf, supportAt, supportLevel, suggestPrint } from '../core/print.js';
import { formatNumber, t } from '../i18n/index.js';

/* Single application state: the parameters edited in the panel, the view options and the model
   computed from them. Every component shares it.

   The working state is written to the browser's local storage on every change, so the page comes
   back as it was left. Named designs are kept apart (see useDesigns.js). */

const STORE = 'vasp-v1';
const VIEW_MODES = ['body', 'exploded', 'assembled'];
const VIEW_DEFAULTS = { mode: 'exploded', heat: false, bodyColor: '#c9962e', capColor: '#6b4a32' };
const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function load() {
  const state = { params: { ...DEFAULTS }, view: { ...VIEW_DEFAULTS }, designName: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.params) applyParams(state.params, saved.params);
    const savedView = saved && saved.view;
    if (savedView && typeof savedView === 'object') {
      if (VIEW_MODES.includes(savedView.mode)) state.view.mode = savedView.mode;
      if (typeof savedView.heat === 'boolean') state.view.heat = savedView.heat;
      if (isColor(savedView.bodyColor)) state.view.bodyColor = savedView.bodyColor;
      if (isColor(savedView.capColor)) state.view.capColor = savedView.capColor;
    }
    if (saved && typeof saved.designName === 'string') state.designName = saved.designName;
  } catch { /* no storage available: keep the defaults */ }
  return state;
}
function save() {
  const { mode, heat, bodyColor, capColor } = view;
  try {
    localStorage.setItem(STORE, JSON.stringify({ params, view: { mode, heat, bodyColor, capColor }, designName: session.designName }));
  } catch { /* persistence is optional */ }
}

/* Preview model: `shape` (what derive() works out), the body `mesh`, its `measures` and the caps.
   The preview mesh splits a vertex budget between the contour and the height. */
function compute(params) {
  const shape = G.derive(params);
  const segmentCount = G.segments(shape, 192, 6);
  const ringStep = Math.max(0.45, shape.height / Math.min(380, Math.floor(115000 / segmentCount)));
  const mesh = G.buildBody(shape, 192, ringStep, 6);
  const measures = G.measure(mesh, true);
  const caps = {};
  for (const which of ['bottom', 'top']) {
    const spec = G.capSpec(shape, which);
    if (!spec) continue;
    const capMesh = G.buildCap(shape, spec, 144, 0.35, true);
    caps[which] = { spec, mesh: capMesh, grams: (G.volume(capMesh) * PLA) / 1000 };
  }
  return { shape, mesh, measures, caps };
}

const initial = load();
const params = reactive(initial.params);
/* `selected` is the profile-editor point being edited; it is not saved. */
const view = reactive({ ...initial.view, selected: 1 });
/* `designName` is the saved design this session started from, if any. */
const session = reactive({ designName: initial.designName });
const model = shallowRef(compute(params));

/* The model is recomputed at most once per frame, even if a slider fires many changes. */
let queued = false;
function recompute() {
  queued = false;
  model.value = compute(params);
  save();
}
watch(params, () => {
  if (queued) return;
  queued = true;
  (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(recompute);
}, { deep: true });

/* Adjustments that depend on the computed model. */
watch(model, (current) => {
  if (!current.caps.bottom && !current.caps.top && view.mode !== 'body') view.mode = 'body';
  for (const [which, switchKey, diameterKey] of [['top', 'topHole', 'topHoleD'], ['bottom', 'botHole', 'botHoleD']]) {
    const cap = current.caps[which];
    if (!cap || !params[switchKey] || cap.spec.holeMax < 1) continue;
    const max = Math.max(2, Math.floor(2 * cap.spec.holeMax));
    if (params[diameterKey] > max) params[diameterKey] = max;
  }
}, { immediate: true });

watch([() => view.mode, () => view.heat, () => view.bodyColor, () => view.capColor, () => session.designName], save);

const hasCaps = computed(() => !!(model.value.caps.bottom || model.value.caps.top));
const isFree = computed(() => params.profile === 'free' && Array.isArray(params.pts) && params.pts.length > 0);
const nozzle = computed(() => nozzleOf(params.nozzle));
const lwMax = computed(() => lwMaxOf(params.nozzle));

/* Readout for the stats bar. The texts follow the interface language. */
const stats = computed(() => {
  const { shape, mesh, measures } = model.value;
  const diameter = 2 * measures.maxRadius;
  const over = measures.over;
  const support = supportAt(over, shape.layerHeight, shape.lineWidth) * 100;
  const where = t(measures.overBody >= measures.overBottom && measures.overBody >= measures.overTop ? 'stats.where.body'
    : measures.overBottom >= measures.overTop ? 'stats.where.bottomThread' : 'stats.where.topThread');
  const floorRadius = mesh.radii[0];
  const grams = (measures.area * shape.lineWidth * PLA) / 1000
    + (shape.closedBase ? (Math.PI * floorRadius * floorRadius * shape.baseThickness * PLA) / 1000 : 0);
  /* triangles of the exported body, at the export quality */
  const quality = QUALITY[params.quality];
  const segmentCount = G.segments(shape, quality.segments);
  const ringCount = Math.max(3, Math.ceil(shape.height / quality.ringStep) + 1);
  const triangles = G.triCount(segmentCount, ringCount);
  const level = supportLevel(support);
  return {
    size: t('stats.sizeValue', { h: formatNumber(shape.height), d: formatNumber(diameter, 1) }),
    fits: diameter <= Math.min(PLATE.x, PLATE.y) && shape.height <= PLATE.z,
    over, support,
    overText: formatNumber(over) + '°',
    levelClass: level.cls,
    levelText: t('support.' + level.level),
    overNote: support > 0 ? t('stats.overhangSupported', { where, pct: formatNumber(support) }) : t('stats.overhangNone', { where }),
    grams,
    massText: t('stats.massValue', { g: formatNumber(grams) }),
    massNote: shape.closedBase
      ? t('stats.massClosed', { lw: formatNumber(shape.lineWidth, 2), floor: formatNumber(shape.baseThickness, 1) })
      : t('stats.massOpen', { lw: formatNumber(shape.lineWidth, 2), area: formatNumber(measures.area / 100, 0) }),
    triangles, meshStep: 360 / segmentCount, ringStep: quality.ringStep,
    meshText: t('stats.meshValue', { n: formatNumber(triangles / 1000) }),
    meshNote: t('stats.meshNote', { quality: t('quality.' + params.quality).toLowerCase(), mb: formatNumber((84 + triangles * 50) / 1e6, 1) }),
  };
});

/* Print advice: which layer height and line width support the steepest area. */
const advice = computed(() => {
  const { shape, measures } = model.value;
  const over = measures.over;
  const support = supportAt(over, shape.layerHeight, shape.lineWidth) * 100;
  const halfLineTilt = (Math.atan((0.5 * shape.lineWidth) / shape.layerHeight) * 180) / Math.PI;   // tilt at which half a line rests on the layer below
  const now = { over: formatNumber(over), lw: formatNumber(shape.lineWidth, 2), lh: formatNumber(shape.layerHeight, 2), pct: formatNumber(Math.max(0, support)) };
  if (support >= 50) {
    return { warn: false, fit: null, text: t('advice.fine', { ...now, half: formatNumber(halfLineTilt) }), apply: '' };
  }
  const fit = suggestPrint(over, params.nozzle);
  const supportWithFit = supportAt(over, fit.lh, fit.lw) * 100;
  if (supportWithFit <= support + 0.5) {
    return { warn: support < 40, fit: null, text: t('advice.stuck', now), apply: '' };
  }
  const next = { lh: formatNumber(fit.lh, 2), lw: formatNumber(fit.lw, 2), pct: formatNumber(Math.max(0, supportWithFit)) };
  const parts = [
    t(support >= 40 ? 'advice.currentOk' : support > 0 ? 'advice.currentLow' : 'advice.currentNone', now),
    t('advice.better', next),
  ];
  if (!fit.ok) parts.push(t('advice.best'));
  return { warn: support < 40, fit, text: parts.join(' '), apply: t('advice.apply', next) };
});

/* ---------- actions ---------- */
/* `designName` says which saved design the new parameters come from ('' for none). */
function replaceParams(next, designName = '') {
  for (const key of Object.keys(DEFAULTS)) params[key] = next[key];
  view.selected = 1;
  session.designName = designName;
}
function applyPreset(index) { replaceParams(presetParams(index, params)); }
function resetParams() { replaceParams({ ...DEFAULTS }); }
/* An imported file only overrides the keys it has; the rest keep their current value. */
function importParams(source) {
  const copy = (points) => (points ? points.map((point) => [...point]) : null);
  const next = applyParams({ ...params, pts: copy(params.pts), ptsL: copy(params.ptsL) }, source);
  replaceParams(next);
}
/* Independent, validated copy of the current parameters (for saving a design). */
function snapshotParams() { return cloneParams(params); }
/* Loads a saved design as a copy, so later edits do not touch the stored one. */
function loadDesignParams(source, designName) { replaceParams(cloneParams(source), designName); }
function applyFit() {
  const fit = advice.value.fit;
  if (!fit) return;
  params.lh = fit.lh; params.lw = fit.lw;
}
function setNozzle(diameter) { params.nozzle = diameter; fitToNozzle(params, true); }
/* The free profile starts as a copy of the current barrel shape. */
function setProfile(profile) {
  if (profile === 'free' && !(params.pts && params.pts.length)) { params.pts = seedPoints(params); view.selected = 3; }
  params.profile = profile;
}
function reseedPoints() { params.pts = seedPoints(params); params.ptsL = null; view.selected = 3; }
/* A closed bottom removes the bottom thread along with the neck that only existed for it. */
function setBase(base) {
  if (base === 'closed' && params.botThread) { params.botThread = false; params.botL = 0; }
  params.base = base;
}
/* Asking for a thread on a mouth whose neck is too short gives it a neck four pitches long. */
function setThread(which, on) {
  const threadKey = which === 'bottom' ? 'botThread' : 'topThread', neckKey = which === 'bottom' ? 'botL' : 'topL';
  params[threadKey] = on;
  if (on && params[neckKey] < 3 * params.pitch) params[neckKey] = Math.min(40, Math.ceil(4 * params.pitch));
}

/* Free-profile points, each [heightShare, radiusShare] of the body. `side` is 'R' (the right half,
   `pts`) or 'L' (the left half, `ptsL`, only while the sides differ). Handle index 0 is the base
   and count + 1 the top mouth, shared by both sides; heightShare and radius may be null.
   addPoint / addPointInGap / removePoint return the index, within its side, of the point to select
   next (0 when nothing changed). */
const sidePoints = (side) => (side === 'L' && params.ptsL ? params.ptsL : params.pts);
function movePoint(index, heightShare, radius, side = 'R') {
  const points = sidePoints(side), count = points.length, shape = model.value.shape;
  if (index === 0 || index === count + 1) {
    if (radius === null) return;
    params[index === 0 ? 'botD' : 'topD'] = G.clamp(Math.round(2 * radius), 6, Math.min(200, params.D));
    return;
  }
  const point = points[index - 1];
  if (!point) return;
  if (heightShare !== null) {
    const lowest = (index > 1 ? points[index - 2][0] : 0) + 0.03, highest = (index < count ? points[index][0] : 1) - 0.03;
    point[0] = +G.clamp(heightShare, lowest, highest).toFixed(4);
  }
  if (radius !== null) point[1] = +G.clamp(radius / shape.maxRadius, 0.06, 1).toFixed(4);
}
function canAddPoint(heightShare, side = 'R') {
  const points = sidePoints(side);
  return points.length < 10 && heightShare >= 0.03 && heightShare <= 0.97 && !points.some((point) => Math.abs(point[0] - heightShare) < 0.03);
}
function addPoint(heightShare, radius, side = 'R') {
  if (!canAddPoint(heightShare, side)) return 0;
  const points = sidePoints(side);
  points.push([+heightShare.toFixed(4), +G.clamp(radius / model.value.shape.maxRadius, 0.06, 1).toFixed(4)]);
  points.sort((a, b) => a[0] - b[0]);
  return 1 + points.findIndex((point) => Math.abs(point[0] - heightShare) < 1e-3);
}
/* Adds a point in the middle of the widest gap between points, on the current profile. */
function addPointInGap(side = 'R') {
  const shape = model.value.shape, points = sidePoints(side);
  const radii = side === 'L' && params.ptsL ? shape.radiiLeft : shape.radii;
  const heights = [0, ...points.map((point) => point[0]), 1];
  let widest = 0;
  for (let gap = 1; gap < heights.length - 1; gap++) if (heights[gap + 1] - heights[gap] > heights[widest + 1] - heights[widest]) widest = gap;
  const heightShare = (heights[widest] + heights[widest + 1]) / 2;
  return addPoint(heightShare, radii[Math.round((shape.bodyBottom + heightShare * shape.bodyHeight) / shape.sampleStep)], side);
}
function removePoint(index, side = 'R') {
  const points = sidePoints(side);
  if (index < 1 || index > points.length || points.length <= 1) return 0;
  points.splice(index - 1, 1);
  return Math.min(index, points.length);
}
/* Both halves of the free profile alike (ptsL = null) or each with its own points. Splitting
   starts the left half as a copy of the right one, so the part does not change until edited. */
function setSidesEqual(equal) {
  params.ptsL = equal ? null : params.pts.map((point) => [...point]);
}

export function useModel() {
  return {
    params, view, session, model, stats, advice, hasCaps, isFree, nozzle, lwMax,
    applyPreset, resetParams, importParams, snapshotParams, loadDesignParams, applyFit, setNozzle, setProfile, reseedPoints, setBase, setThread,
    movePoint, canAddPoint, addPoint, addPointInGap, removePoint, setSidesEqual,
  };
}
