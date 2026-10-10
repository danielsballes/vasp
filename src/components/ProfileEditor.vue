<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dropZ, undropZ } from '../core/geometry.js';
import { useModel } from '../composables/useModel.js';
import { nf } from '../i18n/index.js';
import SwitchField from './SwitchField.vue';

/* Free-profile editor: the silhouette with draggable points. The filled silhouette is the profile
   that gets printed (tilt limit applied) and the dashed line is the one that was drawn. With equal
   sides only the right half has points and the left half mirrors it; with different sides each
   half has its own points (the right one is the front of the part, θ = 0, the left one the back).
   Each half has its own mouth handle: dragging one down lowers the mouth on that side (an uneven
   mouth, see mouthDrop), and that half is drawn as low as it really is. */
const { t } = useI18n();
const { params, model, view, movePoint, canAddPoint, addPoint, addPointInGap, removePoint, reseedPoints, smoothProfile, setSidesEqual, mouthDropOf, setMouthDrop, moveMouth } = useModel();

const W = 320, H = 300, PAD = 18;
const svg = ref(null);
let drag = null;

const twoSides = computed(() => !!(params.ptsL && params.ptsL.length));
const sidePts = (side) => (side === 'L' && twoSides.value ? params.ptsL : params.pts) || [];

/* Handles, in order: base, right points, right mouth, the left points when the sides differ, and
   the left mouth. Each one knows its side ('R' / 'L') and its index within the side (0 base,
   n + 1 mouth). The two mouths share the diameter; each can be dragged down on its own. */
const geo = computed(() => {
  const q = model.value.q, pR = params.pts || [], two = twoSides.value, pL = two ? params.ptsL : [];
  const sc = Math.min((W - 2 * PAD) / (2 * q.Rmax), (H - 2 * PAD) / q.H);
  const cx = W / 2, y0 = H - PAD - (H - 2 * PAD - q.H * sc) / 2;
  const X = (r) => cx + r * sc, Y = (z) => y0 - z * sc;
  const YR = (z) => Y(dropZ(q, z, 0)), YL = (z) => Y(dropZ(q, z, Math.PI));   // each half as low as its mouth
  const n = pR.length;
  const mouth = (side) => {
    const drop = mouthDropOf(side) && q.uneven ? q.drop : 0;
    return {
      x: X((side === 'L' ? -1 : 1) * q.Rt), y: (side === 'L' ? YL : YR)(q.zt), end: true, side, i: sidePts(side).length + 1,
      label: t('editor.topLabel', { d: nf(2 * q.Rt) }) + ` (${t(side === 'L' ? 'editor.sideLeft' : 'editor.sideRight')})`
        + (drop ? ' · ' + t('editor.dropLabel', { mm: nf(drop) }) : ''),
    };
  };
  const sideName = (side) => (two ? t(side === 'L' ? 'editor.sideLeft' : 'editor.sideRight') : '');
  const point = (side, sign) => (p, i) => ({
    x: X(sign * p[1] * q.Rmax), y: (side === 'L' ? YL : YR)(q.zb + p[0] * q.hb), end: false, side, i: i + 1,
    label: t('editor.pointLabel', { i: i + 1, u: nf(p[0] * 100), d: nf(2 * p[1] * q.Rmax) }) + (two ? ` (${sideName(side)})` : ''),
  });
  const handles = [
    { x: X(q.Rb), y: Y(q.zb), end: true, side: 'R', i: 0, label: t('editor.baseLabel', { d: nf(2 * q.Rb) }) },
    ...pR.map(point('R', 1)),
    mouth('R'),
    ...pL.map(point('L', -1)),
    mouth('L'),
  ];
  const stepI = Math.max(1, Math.round(1 / q.dz));
  const baseL = two ? q.baseL : q.base, wantL = two ? q.wantL : q.want;
  const right = [], left = [], want = [], wantLeft = [];
  let clipped = 0;
  for (let i = 0; i <= q.M; i += stepI) {
    const y = YR(i * q.dz).toFixed(1), yL = YL(i * q.dz).toFixed(1);
    right.push(`${X(q.base[i]).toFixed(1)},${y}`);
    left.push(`${X(-baseL[i]).toFixed(1)},${yL}`);
    want.push(`${X(q.want[i]).toFixed(1)},${y}`);
    if (two) wantLeft.push(`${X(-wantL[i]).toFixed(1)},${yL}`);
    clipped = Math.max(clipped, q.want[i] - q.base[i], wantL[i] - baseL[i]);
  }
  return {
    cx, yTop: Y(q.H) - 6, yBot: Y(0) + 6, handles, n, nL: pL.length, clipped, sideName,
    shape: `M${right.join('L')}L${left.reverse().join('L')}Z`,
    want: `M${want.join('L')}` + (two ? `M${wantLeft.join('L')}` : ''),
    toZ: (y) => (y0 - y) / sc,
    /* undoes YR / YL (left = true): above the bottom neck the lowered half is squeezed */
    toU: (y, left) => (undropZ(q, (y0 - y) / sc, left ? Math.PI : 0) - q.zb) / q.hb,
    toR: (x) => Math.abs(x - cx) / sc,
    sideAt: (x) => (two && x < cx ? 'L' : 'R'),
  };
});

/* view.selected indexes geo.handles; these convert to and from (side, index within the side). */
const handleIndex = (side, i) => (side === 'L' && twoSides.value ? geo.value.n + 1 + i : i);
const sel = computed(() => Math.min(Math.max(view.selected, 0), geo.value.handles.length - 1));
const selH = computed(() => geo.value.handles[sel.value]);
const selIsEnd = computed(() => selH.value.end);
const selCount = computed(() => sidePts(selH.value.side).length);
const selName = computed(() => {
  const h = selH.value;
  if (h.end) return t(h.i === 0 ? 'editor.base' : 'editor.top');
  const name = t('editor.point', { i: h.i, n: selCount.value });
  return twoSides.value ? `${name} · ${geo.value.sideName(h.side)}` : name;
});
const selU = computed(() => {
  const h = selH.value;
  return h.end ? (h.i === 0 ? 0 : 100) : Math.round(sidePts(h.side)[h.i - 1][0] * 100);
});
const selD = computed(() => {
  const q = model.value.q, h = selH.value;
  return Math.round(h.end ? 2 * (h.i === 0 ? q.Rb : q.Rt) : 2 * sidePts(h.side)[h.i - 1][1] * q.Rmax);
});
const note = computed(() => [
  geo.value.clipped > 0.6 ? t('editor.clipped', { mm: nf(geo.value.clipped, 1), limit: nf(params.shoulder) }) : t('editor.exact'),
  t(twoSides.value ? 'editor.helpTwo' : 'editor.help'),
].join(' '));

function select(side, i) { if (i > 0) view.selected = handleIndex(side, i); }
function at(e) {
  const b = svg.value.getBoundingClientRect();
  return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
}
function hitHandle(x, y) {
  let best = -1, bd = 22;
  geo.value.handles.forEach((h, i) => { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
function onDown(e) {
  if (e.button !== 0) return;   // the right button opens the context menu instead
  const [x, y] = at(e);
  const best = hitHandle(x, y);
  if (best < 0) return;
  e.preventDefault();
  svg.value.setPointerCapture(e.pointerId);
  drag = best;
  view.selected = best;
}
function onMove(e) {
  if (drag === null) return;
  const [x, y] = at(e), h = geo.value.handles[drag];
  if (!h) return;
  if (h.end && h.i > 0) moveMouth(h.side, geo.value.toZ(y));
  movePoint(h.i, geo.value.toU(y, h.side === 'L'), geo.value.toR(x), h.side);
}
function onUp() { drag = null; }
function onDbl(e) {
  const [x, y] = at(e), side = geo.value.sideAt(x);
  select(side, addPoint(geo.value.toU(y, x < geo.value.cx), geo.value.toR(x), side));
}
function onKey(e, idx) {
  const q = model.value.q, h = geo.value.handles[idx], big = e.shiftKey ? 5 : 1;
  const pts = sidePts(h.side);
  const u = h.end ? null : pts[h.i - 1][0];
  const r = h.end ? (h.i === 0 ? params.botD / 2 : params.topD / 2) : pts[h.i - 1][1] * q.Rmax;
  const out = h.side === 'L' ? -1 : 1;   // on the left half, ArrowLeft moves the wall outwards
  const isMouth = h.end && h.i > 0;
  if (e.key === 'ArrowUp') { if (!h.end) movePoint(h.i, u + 0.01 * big, null, h.side); else if (isMouth) setMouthDrop(h.side, mouthDropOf(h.side) - big); }
  else if (e.key === 'ArrowDown') { if (!h.end) movePoint(h.i, u - 0.01 * big, null, h.side); else if (isMouth) setMouthDrop(h.side, Math.max(1, mouthDropOf(h.side) + big)); }
  else if (e.key === 'ArrowRight') movePoint(h.i, null, r + 0.5 * big * out, h.side);
  else if (e.key === 'ArrowLeft') movePoint(h.i, null, r - 0.5 * big * out, h.side);
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (!h.end) select(h.side, removePoint(h.i, h.side)); }
  else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) onHandleMenu(e, idx);
  else return;
  e.preventDefault();
}

/* Context menu (right click, long press on touch, or the menu key on a focused point): add a point
   exactly where it was opened, on that half, or remove the point it was opened on. */
const wrap = ref(null);
const menu = ref(null);
const menuEl = ref(null);
let menuReturn = null;

/* Vertical span of the viewport (in client pixels) left visible by el's scrolling ancestors. */
function visibleSpan(el) {
  let top = 0, bottom = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(p).overflowY)) continue;
    const r = p.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return [top, bottom];
}
/* (x, y) are in SVG units; the menu is placed in CSS pixels inside the editor. */
async function openMenu(x, y, index, returnTo) {
  const b = svg.value.getBoundingClientRect(), w = wrap.value.getBoundingClientRect();
  const h = index >= 0 ? geo.value.handles[index] : null;
  const side = h ? h.side : geo.value.sideAt(x);
  const u = geo.value.toU(y, h ? h.side === 'L' : x < geo.value.cx), r = geo.value.toR(x);
  const count = sidePts(side).length;
  const onPoint = !!h && !h.end;
  menu.value = {
    left: b.left - w.left + (x * b.width) / W,
    top: b.top - w.top + (y * b.height) / H,
    index, side, u, r, onPoint,
    canAdd: !h && canAddPoint(u, side),
    full: count >= 10,
    canRemove: onPoint && count > 1,
    pointIndex: h ? h.i : 0,
  };
  if (index >= 0) view.selected = index;
  menuReturn = returnTo || null;
  await nextTick();
  /* Keep the menu inside the part of the editor that can be seen: the panel scrolls and would clip
     anything that sticks out. `dy` is the CSS translate the menu is drawn with. */
  if (menuEl.value) {
    const m = menuEl.value.getBoundingClientRect(), [visTop, visBottom] = visibleSpan(wrap.value);
    const dy = m.top - w.top - menu.value.top;
    const minTop = Math.max(0, visTop - w.top) - dy;
    const maxTop = Math.min(w.height, visBottom - w.top) - m.height - 4 - dy;
    const maxLeft = w.width - m.width - 4;
    if (menu.value.left > maxLeft) menu.value.left = Math.max(0, menu.value.left - m.width - 16);
    menu.value.top = Math.max(minTop, Math.min(menu.value.top, maxTop));
  }
  /* Unavailable items stay focusable (aria-disabled) so their reason can be read; start on an available one. */
  const first = menuEl.value && (menuEl.value.querySelector('button:not([aria-disabled="true"])') || menuEl.value.querySelector('button'));
  if (first) first.focus();
}
function closeMenu(restoreFocus = true) {
  if (!menu.value) return;
  menu.value = null;
  if (restoreFocus && menuReturn) menuReturn.focus();
  menuReturn = null;
}
function onContext(e) {
  e.preventDefault();
  const [x, y] = at(e), i = hitHandle(x, y);
  /* Escape returns focus to the point under the pointer, or to whatever had it before. */
  openMenu(x, y, i, i >= 0 ? svg.value.querySelectorAll('.pe-h')[i] : document.activeElement);
}
function onHandleMenu(e, idx) {
  const h = geo.value.handles[idx];
  openMenu(h.x, h.y, idx, e.currentTarget);
}
function menuAdd() {
  const m = menu.value;
  if (!m || !m.canAdd) return;
  closeMenu(false);
  const i = addPoint(m.u, m.r, m.side);
  if (i) { select(m.side, i); nextTick(() => focusHandle(view.selected)); }
}
function menuRemove() {
  const m = menu.value;
  if (!m || !m.canRemove) return;
  closeMenu(false);
  select(m.side, removePoint(m.pointIndex, m.side));
  nextTick(() => focusHandle(view.selected));
}
function menuReseed() { closeMenu(false); reseedPoints(); nextTick(() => focusHandle(view.selected)); }
function focusHandle(i) {
  const el = svg.value && svg.value.querySelectorAll('.pe-h')[i];
  if (el) el.focus();
}
function onMenuKey(e) {
  const items = [...menuEl.value.querySelectorAll('button')];
  const k = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  else if (e.key === 'Tab') closeMenu();   // focus goes back to the opener, then Tab moves on from there
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length].focus(); }
}
function onOutside(e) { if (menu.value && menuEl.value && !menuEl.value.contains(e.target)) closeMenu(false); }
onMounted(() => document.addEventListener('pointerdown', onOutside, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));

/* Buttons and number boxes act on the selected point's side. */
function addInGap() { const side = selH.value.side; select(side, addPointInGap(side)); }
function removeSelected() { const h = selH.value; if (!h.end) select(h.side, removePoint(h.i, h.side)); }
function onSidesEqual(equal) {
  const h = selH.value, keepRight = h.side === 'R' ? sel.value : 1;
  setSidesEqual(equal);
  view.selected = equal ? Math.min(keepRight, (params.pts || []).length + 1) : keepRight;
}
function setU(e) {
  const v = parseFloat(e.target.value), h = selH.value;
  if (Number.isFinite(v)) movePoint(h.i, v / 100, null, h.side);
  e.target.value = selU.value;
}
function setD(e) {
  const v = parseFloat(e.target.value), h = selH.value;
  if (Number.isFinite(v)) movePoint(h.i, null, v / 2, h.side);
  e.target.value = selD.value;
}
</script>

<template>
  <div ref="wrap" class="profile-editor" id="pe">
    <SwitchField id="sidesEqual" :label="t('editor.sidesEqual')" :model-value="!twoSides" @update:model-value="onSidesEqual" />
    <svg
      ref="svg" id="pe-svg" :viewBox="`0 0 ${W} ${H}`" role="group"
      :aria-label="t('editor.aria')"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @dblclick="onDbl"
      @contextmenu="onContext"
    >
      <line class="pe-axis" :x1="geo.cx" :x2="geo.cx" :y1="geo.yTop" :y2="geo.yBot" />
      <path class="pe-shape" :d="geo.shape" />
      <path class="pe-want" :d="geo.want" />
      <template v-if="twoSides">
        <text class="pe-side" x="6" y="14">{{ t('editor.sideLeft') }}</text>
        <text class="pe-side" :x="W - 6" y="14" text-anchor="end">{{ t('editor.sideRight') }}</text>
      </template>
      <template v-for="(h, i) in geo.handles" :key="i">
        <rect
          v-if="h.end" class="pe-h end" :class="{ sel: i === sel }" :x="h.x - 6" :y="h.y - 6" width="12" height="12" rx="2"
          tabindex="0" role="button" :aria-label="h.label" @focus="view.selected = i" @keydown="onKey($event, i)"
        />
        <circle
          v-else class="pe-h" :class="{ sel: i === sel }" :cx="h.x" :cy="h.y" r="6.5"
          tabindex="0" role="button" :aria-label="h.label" @focus="view.selected = i" @keydown="onKey($event, i)"
        />
      </template>
    </svg>

    <div
      v-if="menu" ref="menuEl" class="pe-menu" id="pe-menu" role="menu" :aria-label="t('editor.menuAria')"
      :style="{ left: menu.left + 'px', top: menu.top + 'px' }" @keydown="onMenuKey" @contextmenu.prevent
    >
      <button v-if="menu.index < 0" type="button" role="menuitem" class="pe-menu-item" :aria-disabled="!menu.canAdd" @click="menuAdd">
        {{ t('editor.addHere') }}
        <small v-if="!menu.canAdd">{{ t(menu.full ? 'editor.addFull' : 'editor.addTooClose') }}</small>
      </button>
      <button v-if="menu.onPoint" type="button" role="menuitem" class="pe-menu-item" :aria-disabled="!menu.canRemove" @click="menuRemove">
        {{ t('editor.removeThis') }}
        <small v-if="!menu.canRemove">{{ t('editor.removeLast') }}</small>
      </button>
      <button type="button" role="menuitem" class="pe-menu-item" @click="menuReseed">{{ t('editor.reseed') }}</button>
    </div>

    <div class="d-flex flex-wrap align-items-center gap-2">
      <span class="fw-medium me-auto" id="pe-name">{{ selName }}</span>
      <span class="num-box">
        <input type="number" class="form-control form-control-sm" id="pe-u" min="0" max="100" step="1" inputmode="decimal"
          :aria-label="t('editor.heightAria')" :value="selU" :disabled="selIsEnd" @change="setU">
        <span class="unit">%</span>
      </span>
      <span class="num-box">
        <span class="unit">Ø</span>
        <input type="number" class="form-control form-control-sm" id="pe-d" min="6" max="260" step="1" inputmode="decimal"
          :aria-label="t('editor.diameterAria')" :value="selD" @change="setD">
        <span class="unit">mm</span>
      </span>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-add" :disabled="selCount >= 10" @click="addInGap">{{ t('editor.add') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-del" :disabled="selIsEnd || selCount <= 1" @click="removeSelected">{{ t('editor.remove') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-smooth" :title="t('editor.smoothHint')" @click="smoothProfile">{{ t('editor.smooth') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-seed" @click="reseedPoints">{{ t('editor.reseed') }}</button>
    </div>
    <p class="form-text mb-0" id="pe-note">{{ note }}</p>
  </div>
</template>
