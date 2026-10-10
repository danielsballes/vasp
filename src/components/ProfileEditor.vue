<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { formatNumber } from '../i18n/index.js';
import SwitchField from './SwitchField.vue';

/* Free-profile editor: the silhouette with draggable points. The filled silhouette is the profile
   that gets printed (tilt limit applied) and the dashed line is the one that was drawn. With equal
   sides only the right half has points and the left half mirrors it; with different sides each
   half has its own points (the right one is the front of the part, θ = 0, the left one the back).
   Points are [heightShare, radiusShare] of the body, as in `pts`. */
const { t } = useI18n();
const { params, model, view, movePoint, canAddPoint, addPoint, addPointInGap, removePoint, reseedPoints, setSidesEqual } = useModel();

const WIDTH = 320, HEIGHT = 300, PADDING = 18;   // SVG units
const svg = ref(null);
let dragged = null;   // position in layout.handles of the handle being dragged

const twoSides = computed(() => !!(params.ptsL && params.ptsL.length));
const sidePoints = (side) => (side === 'L' && twoSides.value ? params.ptsL : params.pts) || [];

/* Drawing of the profile in SVG units, and the handles, in order: base, right points, top, then
   the left points when the sides differ. Each handle knows its side ('R' / 'L') and its index
   within the side (0 base, count + 1 top). */
const layout = computed(() => {
  const shape = model.value.shape, two = twoSides.value;
  const rightPoints = params.pts || [], leftPoints = two ? params.ptsL : [];
  const scale = Math.min((WIDTH - 2 * PADDING) / (2 * shape.maxRadius), (HEIGHT - 2 * PADDING) / shape.height);   // SVG units per mm
  const cx = WIDTH / 2, floorY = HEIGHT - PADDING - (HEIGHT - 2 * PADDING - shape.height * scale) / 2;
  const toX = (radius) => cx + radius * scale, toY = (z) => floorY - z * scale;
  const count = rightPoints.length;
  const sideName = (side) => (two ? t(side === 'L' ? 'editor.sideLeft' : 'editor.sideRight') : '');
  const pointHandle = (side, direction) => (point, index) => ({
    x: toX(direction * point[1] * shape.maxRadius),
    y: toY(shape.bodyBottom + point[0] * shape.bodyHeight),
    end: false, side, index: index + 1,
    label: t('editor.pointLabel', { i: index + 1, u: formatNumber(point[0] * 100), d: formatNumber(2 * point[1] * shape.maxRadius) })
      + (two ? ` (${sideName(side)})` : ''),
  });
  const handles = [
    { x: toX(shape.bottomRadius), y: toY(shape.bodyBottom), end: true, side: 'R', index: 0, label: t('editor.baseLabel', { d: formatNumber(2 * shape.bottomRadius) }) },
    ...rightPoints.map(pointHandle('R', 1)),
    { x: toX(shape.topRadius), y: toY(shape.bodyTop), end: true, side: 'R', index: count + 1, label: t('editor.topLabel', { d: formatNumber(2 * shape.topRadius) }) },
    ...leftPoints.map(pointHandle('L', -1)),
  ];
  /* Outlines, one vertex per millimetre: the printed silhouette and the drawn (wanted) profile. */
  const sampleStride = Math.max(1, Math.round(1 / shape.sampleStep));
  const radiiLeft = two ? shape.radiiLeft : shape.radii, wantedLeft = two ? shape.wantedRadiiLeft : shape.wantedRadii;
  const rightOutline = [], leftOutline = [], wantedOutline = [], wantedLeftOutline = [];
  let clipped = 0;   // most the tilt limit takes off the drawn profile, in mm
  for (let sample = 0; sample <= shape.sampleCount; sample += sampleStride) {
    const y = toY(sample * shape.sampleStep).toFixed(1);
    rightOutline.push(`${toX(shape.radii[sample]).toFixed(1)},${y}`);
    leftOutline.push(`${toX(-radiiLeft[sample]).toFixed(1)},${y}`);
    wantedOutline.push(`${toX(shape.wantedRadii[sample]).toFixed(1)},${y}`);
    if (two) wantedLeftOutline.push(`${toX(-wantedLeft[sample]).toFixed(1)},${y}`);
    clipped = Math.max(clipped, shape.wantedRadii[sample] - shape.radii[sample], wantedLeft[sample] - radiiLeft[sample]);
  }
  return {
    cx, axisTop: toY(shape.height) - 6, axisBottom: toY(0) + 6, handles, count, leftCount: leftPoints.length, clipped, sideName,
    silhouette: `M${rightOutline.join('L')}L${leftOutline.reverse().join('L')}Z`,
    wanted: `M${wantedOutline.join('L')}` + (two ? `M${wantedLeftOutline.join('L')}` : ''),
    toHeightShare: (y) => ((floorY - y) / scale - shape.bodyBottom) / shape.bodyHeight,
    toRadius: (x) => Math.abs(x - cx) / scale,
    sideAt: (x) => (two && x < cx ? 'L' : 'R'),
  };
});

/* view.selected is a position in layout.handles; these convert to and from (side, index within the side). */
const handlePosition = (side, index) => (side === 'L' && twoSides.value ? layout.value.count + 1 + index : index);
const selectedPosition = computed(() => Math.min(Math.max(view.selected, 0), layout.value.handles.length - 1));
const selectedHandle = computed(() => layout.value.handles[selectedPosition.value]);
const selectedIsEnd = computed(() => selectedHandle.value.end);
const selectedSideCount = computed(() => sidePoints(selectedHandle.value.side).length);
const selectedName = computed(() => {
  const handle = selectedHandle.value;
  if (handle.end) return t(handle.index === 0 ? 'editor.base' : 'editor.top');
  const name = t('editor.point', { i: handle.index, n: selectedSideCount.value });
  return twoSides.value ? `${name} · ${layout.value.sideName(handle.side)}` : name;
});
const selectedHeightPercent = computed(() => {
  const handle = selectedHandle.value;
  return handle.end ? (handle.index === 0 ? 0 : 100) : Math.round(sidePoints(handle.side)[handle.index - 1][0] * 100);
});
const selectedDiameter = computed(() => {
  const shape = model.value.shape, handle = selectedHandle.value;
  if (handle.end) return Math.round(2 * (handle.index === 0 ? shape.bottomRadius : shape.topRadius));
  return Math.round(2 * sidePoints(handle.side)[handle.index - 1][1] * shape.maxRadius);
});
const note = computed(() => [
  layout.value.clipped > 0.6 ? t('editor.clipped', { mm: formatNumber(layout.value.clipped, 1), limit: formatNumber(params.shoulder) }) : t('editor.exact'),
  t(twoSides.value ? 'editor.helpTwo' : 'editor.help'),
].join(' '));

function select(side, index) { if (index > 0) view.selected = handlePosition(side, index); }
/* Pointer position in SVG units. */
function svgPoint(event) {
  const box = svg.value.getBoundingClientRect();
  return [((event.clientX - box.left) * WIDTH) / box.width, ((event.clientY - box.top) * HEIGHT) / box.height];
}
/* Position of the handle nearest to (x, y) within reach, or -1. */
function hitHandle(x, y) {
  let nearest = -1, nearestDistance = 22;
  layout.value.handles.forEach((handle, position) => {
    const distance = Math.hypot(handle.x - x, handle.y - y);
    if (distance < nearestDistance) { nearestDistance = distance; nearest = position; }
  });
  return nearest;
}
function onDown(event) {
  if (event.button !== 0) return;   // the right button opens the context menu instead
  const [x, y] = svgPoint(event);
  const hit = hitHandle(x, y);
  if (hit < 0) return;
  event.preventDefault();
  svg.value.setPointerCapture(event.pointerId);
  dragged = hit;
  view.selected = hit;
}
function onMove(event) {
  if (dragged === null) return;
  const [x, y] = svgPoint(event), handle = layout.value.handles[dragged];
  if (handle) movePoint(handle.index, layout.value.toHeightShare(y), layout.value.toRadius(x), handle.side);
}
function onUp() { dragged = null; }
function onDoubleClick(event) {
  const [x, y] = svgPoint(event), side = layout.value.sideAt(x);
  select(side, addPoint(layout.value.toHeightShare(y), layout.value.toRadius(x), side));
}
function onKey(event, position) {
  const shape = model.value.shape, handle = layout.value.handles[position], step = event.shiftKey ? 5 : 1;
  const points = sidePoints(handle.side);
  const heightShare = handle.end ? null : points[handle.index - 1][0];
  const radius = handle.end ? (handle.index === 0 ? params.botD / 2 : params.topD / 2) : points[handle.index - 1][1] * shape.maxRadius;
  const outwards = handle.side === 'L' ? -1 : 1;   // on the left half, ArrowLeft moves the wall outwards
  if (event.key === 'ArrowUp') { if (!handle.end) movePoint(handle.index, heightShare + 0.01 * step, null, handle.side); }
  else if (event.key === 'ArrowDown') { if (!handle.end) movePoint(handle.index, heightShare - 0.01 * step, null, handle.side); }
  else if (event.key === 'ArrowRight') movePoint(handle.index, null, radius + 0.5 * step * outwards, handle.side);
  else if (event.key === 'ArrowLeft') movePoint(handle.index, null, radius - 0.5 * step * outwards, handle.side);
  else if (event.key === 'Delete' || event.key === 'Backspace') { if (!handle.end) select(handle.side, removePoint(handle.index, handle.side)); }
  else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) onHandleMenu(event, position);
  else return;
  event.preventDefault();
}

/* Context menu (right click, long press on touch, or the menu key on a focused point): add a point
   exactly where it was opened, on that half, or remove the point it was opened on. */
const wrap = ref(null);
const menu = ref(null);
const menuElement = ref(null);
let menuReturnFocus = null;

/* Vertical span of the viewport (in client pixels) left visible by the element's scrolling ancestors. */
function visibleSpan(element) {
  let top = 0, bottom = window.innerHeight;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(ancestor).overflowY)) continue;
    const box = ancestor.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  return [top, bottom];
}
/* (x, y) are in SVG units; the menu is placed in CSS pixels inside the editor. */
async function openMenu(x, y, position, returnFocusTo) {
  const svgBox = svg.value.getBoundingClientRect(), editorBox = wrap.value.getBoundingClientRect();
  const heightShare = layout.value.toHeightShare(y), radius = layout.value.toRadius(x);
  const handle = position >= 0 ? layout.value.handles[position] : null;
  const side = handle ? handle.side : layout.value.sideAt(x);
  const count = sidePoints(side).length;
  const onPoint = !!handle && !handle.end;
  menu.value = {
    left: svgBox.left - editorBox.left + (x * svgBox.width) / WIDTH,
    top: svgBox.top - editorBox.top + (y * svgBox.height) / HEIGHT,
    position, side, heightShare, radius, onPoint,
    canAdd: !handle && canAddPoint(heightShare, side),
    full: count >= 10,
    canRemove: onPoint && count > 1,
    pointIndex: handle ? handle.index : 0,
  };
  if (position >= 0) view.selected = position;
  menuReturnFocus = returnFocusTo || null;
  await nextTick();
  /* Keep the menu inside the part of the editor that can be seen: the panel scrolls and would clip
     anything that sticks out. `shift` is the CSS translate the menu is drawn with. */
  if (menuElement.value) {
    const menuBox = menuElement.value.getBoundingClientRect(), [visibleTop, visibleBottom] = visibleSpan(wrap.value);
    const shift = menuBox.top - editorBox.top - menu.value.top;
    const minTop = Math.max(0, visibleTop - editorBox.top) - shift;
    const maxTop = Math.min(editorBox.height, visibleBottom - editorBox.top) - menuBox.height - 4 - shift;
    const maxLeft = editorBox.width - menuBox.width - 4;
    if (menu.value.left > maxLeft) menu.value.left = Math.max(0, menu.value.left - menuBox.width - 16);
    menu.value.top = Math.max(minTop, Math.min(menu.value.top, maxTop));
  }
  /* Unavailable items stay focusable (aria-disabled) so their reason can be read; start on an available one. */
  const first = menuElement.value
    && (menuElement.value.querySelector('button:not([aria-disabled="true"])') || menuElement.value.querySelector('button'));
  if (first) first.focus();
}
function closeMenu(restoreFocus = true) {
  if (!menu.value) return;
  menu.value = null;
  if (restoreFocus && menuReturnFocus) menuReturnFocus.focus();
  menuReturnFocus = null;
}
function onContext(event) {
  event.preventDefault();
  const [x, y] = svgPoint(event), hit = hitHandle(x, y);
  /* Escape returns focus to the point under the pointer, or to whatever had it before. */
  openMenu(x, y, hit, hit >= 0 ? svg.value.querySelectorAll('.pe-h')[hit] : document.activeElement);
}
function onHandleMenu(event, position) {
  const handle = layout.value.handles[position];
  openMenu(handle.x, handle.y, position, event.currentTarget);
}
function menuAdd() {
  const opened = menu.value;
  if (!opened || !opened.canAdd) return;
  closeMenu(false);
  const index = addPoint(opened.heightShare, opened.radius, opened.side);
  if (index) { select(opened.side, index); nextTick(() => focusHandle(view.selected)); }
}
function menuRemove() {
  const opened = menu.value;
  if (!opened || !opened.canRemove) return;
  closeMenu(false);
  select(opened.side, removePoint(opened.pointIndex, opened.side));
  nextTick(() => focusHandle(view.selected));
}
function menuReseed() { closeMenu(false); reseedPoints(); nextTick(() => focusHandle(view.selected)); }
function focusHandle(position) {
  const element = svg.value && svg.value.querySelectorAll('.pe-h')[position];
  if (element) element.focus();
}
function onMenuKey(event) {
  const items = [...menuElement.value.querySelectorAll('button')];
  const focused = items.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
  else if (event.key === 'Tab') closeMenu();   // focus goes back to the opener, then Tab moves on from there
  else if (event.key === 'ArrowDown') { event.preventDefault(); items[(focused + 1) % items.length].focus(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); items[(focused - 1 + items.length) % items.length].focus(); }
}
function onOutside(event) { if (menu.value && menuElement.value && !menuElement.value.contains(event.target)) closeMenu(false); }
onMounted(() => document.addEventListener('pointerdown', onOutside, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));

/* Buttons and number boxes act on the selected point's side. */
function addInGap() { const side = selectedHandle.value.side; select(side, addPointInGap(side)); }
function removeSelected() {
  const handle = selectedHandle.value;
  if (!handle.end) select(handle.side, removePoint(handle.index, handle.side));
}
function onSidesEqual(equal) {
  const handle = selectedHandle.value, keepRight = handle.side === 'R' ? selectedPosition.value : 1;
  setSidesEqual(equal);
  view.selected = equal ? Math.min(keepRight, (params.pts || []).length + 1) : keepRight;
}
function setHeightPercent(event) {
  const value = parseFloat(event.target.value), handle = selectedHandle.value;
  if (Number.isFinite(value)) movePoint(handle.index, value / 100, null, handle.side);
  event.target.value = selectedHeightPercent.value;
}
function setDiameter(event) {
  const value = parseFloat(event.target.value), handle = selectedHandle.value;
  if (Number.isFinite(value)) movePoint(handle.index, null, value / 2, handle.side);
  event.target.value = selectedDiameter.value;
}
</script>

<template>
  <div ref="wrap" class="profile-editor" id="pe">
    <SwitchField id="sidesEqual" :label="t('editor.sidesEqual')" :model-value="!twoSides" @update:model-value="onSidesEqual" />
    <svg
      ref="svg" id="pe-svg" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="group"
      :aria-label="t('editor.aria')"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @dblclick="onDoubleClick"
      @contextmenu="onContext"
    >
      <line class="pe-axis" :x1="layout.cx" :x2="layout.cx" :y1="layout.axisTop" :y2="layout.axisBottom" />
      <path class="pe-shape" :d="layout.silhouette" />
      <path class="pe-want" :d="layout.wanted" />
      <template v-if="twoSides">
        <text class="pe-side" x="6" y="14">{{ t('editor.sideLeft') }}</text>
        <text class="pe-side" :x="WIDTH - 6" y="14" text-anchor="end">{{ t('editor.sideRight') }}</text>
      </template>
      <template v-for="(handle, position) in layout.handles" :key="position">
        <rect
          v-if="handle.end" class="pe-h end" :class="{ sel: position === selectedPosition }" :x="handle.x - 6" :y="handle.y - 6" width="12" height="12" rx="2"
          tabindex="0" role="button" :aria-label="handle.label" @focus="view.selected = position" @keydown="onKey($event, position)"
        />
        <circle
          v-else class="pe-h" :class="{ sel: position === selectedPosition }" :cx="handle.x" :cy="handle.y" r="6.5"
          tabindex="0" role="button" :aria-label="handle.label" @focus="view.selected = position" @keydown="onKey($event, position)"
        />
      </template>
    </svg>

    <div
      v-if="menu" ref="menuElement" class="pe-menu" id="pe-menu" role="menu" :aria-label="t('editor.menuAria')"
      :style="{ left: menu.left + 'px', top: menu.top + 'px' }" @keydown="onMenuKey" @contextmenu.prevent
    >
      <button v-if="menu.position < 0" type="button" role="menuitem" class="pe-menu-item" :aria-disabled="!menu.canAdd" @click="menuAdd">
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
      <span class="fw-medium me-auto" id="pe-name">{{ selectedName }}</span>
      <span class="num-box">
        <input type="number" class="form-control form-control-sm" id="pe-u" min="0" max="100" step="1" inputmode="decimal"
          :aria-label="t('editor.heightAria')" :value="selectedHeightPercent" :disabled="selectedIsEnd" @change="setHeightPercent">
        <span class="unit">%</span>
      </span>
      <span class="num-box">
        <span class="unit">Ø</span>
        <input type="number" class="form-control form-control-sm" id="pe-d" min="6" max="260" step="1" inputmode="decimal"
          :aria-label="t('editor.diameterAria')" :value="selectedDiameter" @change="setDiameter">
        <span class="unit">mm</span>
      </span>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-add" :disabled="selectedSideCount >= 10" @click="addInGap">{{ t('editor.add') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-del" :disabled="selectedIsEnd || selectedSideCount <= 1" @click="removeSelected">{{ t('editor.remove') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-seed" @click="reseedPoints">{{ t('editor.reseed') }}</button>
    </div>
    <p class="form-text mb-0" id="pe-note">{{ note }}</p>
  </div>
</template>
