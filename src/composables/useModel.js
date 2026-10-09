import { reactive, shallowRef, computed, watch } from 'vue';
import * as G from '../core/geometry.js';
import { DEFAULTS, QUALITY, applyParams, cloneParams, fitToNozzle, presetParams, seedPoints } from '../core/params.js';
import { PLA, PLATE, lwMaxOf, nozzleOf, supportAt, supportLevel, suggestPrint } from '../core/print.js';
import { nf, t } from '../i18n/index.js';

/* Single application state: the parameters edited in the panel, the view options and the model
   computed from them. Every component shares it.

   The working state is written to the browser's local storage on every change, so the page comes
   back as it was left. Named designs are kept apart (see useDesigns.js). */

const STORE = 'vasp-v1';
const VIEW_MODES = ['body', 'exploded', 'assembled'];
const VIEW_DEFAULTS = { mode: 'exploded', heat: false, bodyColor: '#c9962e', capColor: '#6b4a32' };
const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function load() {
  const state = { params: { ...DEFAULTS }, view: { ...VIEW_DEFAULTS }, designName: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.params) applyParams(state.params, saved.params);
    const v = saved && saved.view;
    if (v && typeof v === 'object') {
      if (VIEW_MODES.includes(v.mode)) state.view.mode = v.mode;
      if (typeof v.heat === 'boolean') state.view.heat = v.heat;
      if (isColor(v.bodyColor)) state.view.bodyColor = v.bodyColor;
      if (isColor(v.capColor)) state.view.capColor = v.capColor;
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

/* Preview mesh: splits a vertex budget between the contour and the height. */
function compute(p) {
  const q = G.derive(p);
  const nT = G.segments(q, 192, 6);
  const g = G.buildBody(q, 192, Math.max(0.45, q.H / Math.min(380, Math.floor(115000 / nT))), 6);
  const m = G.measure(g, true);
  const caps = {};
  for (const which of ['bottom', 'top']) {
    const spec = G.capSpec(q, which);
    if (!spec) continue;
    const cg = G.buildCap(q, spec, 144, 0.35, true);
    caps[which] = { spec, g: cg, grams: (G.volume(cg) * PLA) / 1000 };
  }
  return { q, g, m, caps };
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
watch(model, (S) => {
  if (!S.caps.bottom && !S.caps.top && view.mode !== 'body') view.mode = 'body';
  for (const [which, sw, dk] of [['top', 'topHole', 'topHoleD'], ['bottom', 'botHole', 'botHoleD']]) {
    const cap = S.caps[which];
    if (!cap || !params[sw] || cap.spec.holeMax < 1) continue;
    const max = Math.max(2, Math.floor(2 * cap.spec.holeMax));
    if (params[dk] > max) params[dk] = max;
  }
}, { immediate: true });

watch([() => view.mode, () => view.heat, () => view.bodyColor, () => view.capColor, () => session.designName], save);

const hasCaps = computed(() => !!(model.value.caps.bottom || model.value.caps.top));
const isFree = computed(() => params.profile === 'free' && Array.isArray(params.pts) && params.pts.length > 0);
const nozzle = computed(() => nozzleOf(params.nozzle));
const lwMax = computed(() => lwMaxOf(params.nozzle));

/* Readout for the stats bar. The texts follow the interface language. */
const stats = computed(() => {
  const { q, g, m } = model.value;
  const dia = 2 * m.rMax;
  const over = m.over;
  const sup = supportAt(over, q.lh, q.lw) * 100;
  const where = t(m.overBody >= m.overBot && m.overBody >= m.overTop ? 'stats.where.body' : m.overBot >= m.overTop ? 'stats.where.bottomThread' : 'stats.where.topThread');
  const r0 = g.rr[0];
  const grams = (m.area * q.lw * PLA) / 1000 + (q.closed ? (Math.PI * r0 * r0 * q.baseT * PLA) / 1000 : 0);
  const Q = QUALITY[params.quality];
  const nT = G.segments(q, Q.seg), nZ = Math.max(3, Math.ceil(q.H / Q.dz) + 1);
  const tris = G.triCount(nT, nZ);
  const level = supportLevel(sup);
  return {
    size: t('stats.sizeValue', { h: nf(q.H), d: nf(dia, 1) }),
    fits: dia <= Math.min(PLATE.x, PLATE.y) && q.H <= PLATE.z,
    over, sup,
    overText: nf(over) + '°',
    levelClass: level.cls,
    levelText: t('support.' + level.level),
    overNote: sup > 0 ? t('stats.overhangSupported', { where, pct: nf(sup) }) : t('stats.overhangNone', { where }),
    grams,
    massText: t('stats.massValue', { g: nf(grams) }),
    massNote: q.closed
      ? t('stats.massClosed', { lw: nf(q.lw, 2), floor: nf(q.baseT, 1) })
      : t('stats.massOpen', { lw: nf(q.lw, 2), area: nf(m.area / 100, 0) }),
    tris, meshStep: 360 / nT, dz: Q.dz,
    meshText: t('stats.meshValue', { n: nf(tris / 1000) }),
    meshNote: t('stats.meshNote', { quality: t('quality.' + params.quality).toLowerCase(), mb: nf((84 + tris * 50) / 1e6, 1) }),
  };
});

/* Print advice: which layer height and line width support the steepest area. */
const advice = computed(() => {
  const { q, m } = model.value;
  const over = m.over;
  const sup = supportAt(over, q.lh, q.lw) * 100;
  const half = (Math.atan((0.5 * q.lw) / q.lh) * 180) / Math.PI;
  const now = { over: nf(over), lw: nf(q.lw, 2), lh: nf(q.lh, 2), pct: nf(Math.max(0, sup)) };
  if (sup >= 50) {
    return { warn: false, fit: null, text: t('advice.fine', { ...now, half: nf(half) }), apply: '' };
  }
  const fit = suggestPrint(over, params.nozzle);
  const s2 = supportAt(over, fit.lh, fit.lw) * 100;
  if (s2 <= sup + 0.5) {
    return { warn: sup < 40, fit: null, text: t('advice.stuck', now), apply: '' };
  }
  const next = { lh: nf(fit.lh, 2), lw: nf(fit.lw, 2), pct: nf(Math.max(0, s2)) };
  const parts = [
    t(sup >= 40 ? 'advice.currentOk' : sup > 0 ? 'advice.currentLow' : 'advice.currentNone', now),
    t('advice.better', next),
  ];
  if (!fit.ok) parts.push(t('advice.best'));
  return { warn: sup < 40, fit, text: parts.join(' '), apply: t('advice.apply', next) };
});

/* ---------- actions ---------- */
/* `designName` says which saved design the new parameters come from ('' for none). */
function replaceParams(next, designName = '') {
  for (const k of Object.keys(DEFAULTS)) params[k] = next[k];
  view.selected = 1;
  session.designName = designName;
}
function applyPreset(index) { replaceParams(presetParams(index, params)); }
function resetParams() { replaceParams({ ...DEFAULTS }); }
/* An imported file only overrides the keys it has; the rest keep their current value. */
function importParams(src) {
  const copy = (pts) => (pts ? pts.map((p) => [...p]) : null);
  const next = applyParams({ ...params, pts: copy(params.pts), ptsL: copy(params.ptsL) }, src);
  replaceParams(next);
}
/* Independent, validated copy of the current parameters (for saving a design). */
function snapshotParams() { return cloneParams(params); }
/* Loads a saved design as a copy, so later edits do not touch the stored one. */
function loadDesignParams(src, designName) { replaceParams(cloneParams(src), designName); }
function applyFit() {
  const fit = advice.value.fit;
  if (!fit) return;
  params.lh = fit.lh; params.lw = fit.lw;
}
function setNozzle(d) { params.nozzle = d; fitToNozzle(params, true); }
/* The free profile starts as a copy of the current barrel shape. */
function setProfile(v) {
  if (v === 'free' && !(params.pts && params.pts.length)) { params.pts = seedPoints(params); view.selected = 3; }
  params.profile = v;
}
function reseedPoints() { params.pts = seedPoints(params); params.ptsL = null; view.selected = 3; }
/* A closed bottom removes the bottom thread along with the neck that only existed for it. */
function setBase(v) {
  if (v === 'closed' && params.botThread) { params.botThread = false; params.botL = 0; }
  params.base = v;
}
/* Asking for a thread on a mouth whose neck is too short gives it a neck four pitches long. */
function setThread(which, on) {
  const key = which === 'bottom' ? 'botThread' : 'topThread', lk = which === 'bottom' ? 'botL' : 'topL';
  params[key] = on;
  if (on && params[lk] < 3 * params.pitch) params[lk] = Math.min(40, Math.ceil(4 * params.pitch));
}

/* Free-profile points. `side` is 'R' (the right half, `pts`) or 'L' (the left half, `ptsL`, only
   while the sides differ). i = 0 is the base and i = n + 1 the top mouth, shared by both sides;
   u and r may be null. addPoint / addPointInGap / removePoint return the index, within its side,
   of the point to select next (0 when nothing changed). */
const sidePts = (side) => (side === 'L' && params.ptsL ? params.ptsL : params.pts);
function movePoint(i, u, r, side = 'R') {
  const pts = sidePts(side), n = pts.length, q = model.value.q;
  if (i === 0 || i === n + 1) {
    if (r === null) return;
    params[i === 0 ? 'botD' : 'topD'] = G.clamp(Math.round(2 * r), 6, Math.min(200, params.D));
    return;
  }
  const pt = pts[i - 1];
  if (!pt) return;
  if (u !== null) pt[0] = +G.clamp(u, (i > 1 ? pts[i - 2][0] : 0) + 0.03, (i < n ? pts[i][0] : 1) - 0.03).toFixed(4);
  if (r !== null) pt[1] = +G.clamp(r / q.Rmax, 0.06, 1).toFixed(4);
}
function canAddPoint(u, side = 'R') {
  const pts = sidePts(side);
  return pts.length < 10 && u >= 0.03 && u <= 0.97 && !pts.some((p) => Math.abs(p[0] - u) < 0.03);
}
function addPoint(u, r, side = 'R') {
  if (!canAddPoint(u, side)) return 0;
  const pts = sidePts(side);
  pts.push([+u.toFixed(4), +G.clamp(r / model.value.q.Rmax, 0.06, 1).toFixed(4)]);
  pts.sort((a, b) => a[0] - b[0]);
  return 1 + pts.findIndex((p) => Math.abs(p[0] - u) < 1e-3);
}
function addPointInGap(side = 'R') {
  const q = model.value.q, pts = sidePts(side), base = side === 'L' && params.ptsL ? q.baseL : q.base;
  const us = [0, ...pts.map((p) => p[0]), 1];
  let k = 0;
  for (let i = 1; i < us.length - 1; i++) if (us[i + 1] - us[i] > us[k + 1] - us[k]) k = i;
  const u = (us[k] + us[k + 1]) / 2;
  return addPoint(u, base[Math.round((q.zb + u * q.hb) / q.dz)], side);
}
function removePoint(i, side = 'R') {
  const pts = sidePts(side);
  if (i < 1 || i > pts.length || pts.length <= 1) return 0;
  pts.splice(i - 1, 1);
  return Math.min(i, pts.length);
}
/* Both halves of the free profile alike (ptsL = null) or each with its own points. Splitting
   starts the left half as a copy of the right one, so the part does not change until edited. */
function setSidesEqual(equal) {
  params.ptsL = equal ? null : params.pts.map((p) => [...p]);
}

export function useModel() {
  return {
    params, view, session, model, stats, advice, hasCaps, isFree, nozzle, lwMax,
    applyPreset, resetParams, importParams, snapshotParams, loadDesignParams, applyFit, setNozzle, setProfile, reseedPoints, setBase, setThread,
    movePoint, canAddPoint, addPoint, addPointInGap, removePoint, setSidesEqual,
  };
}
