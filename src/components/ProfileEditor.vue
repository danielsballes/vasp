<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { nf } from '../i18n/index.js';

/* Free-profile editor: a half silhouette with draggable points. The filled silhouette is the
   profile that gets printed (tilt limit applied) and the dashed line is the one that was drawn. */
const { t } = useI18n();
const { params, model, view, movePoint, addPoint, addPointInGap, removePoint, reseedPoints } = useModel();

const W = 320, H = 300, PAD = 18;
const svg = ref(null);
let drag = null;

const geo = computed(() => {
  const q = model.value.q, pts = params.pts || [];
  const sc = Math.min((W - 2 * PAD) / (2 * q.Rmax), (H - 2 * PAD) / q.H);
  const cx = W / 2, y0 = H - PAD - (H - 2 * PAD - q.H * sc) / 2;
  const X = (r) => cx + r * sc, Y = (z) => y0 - z * sc;
  const n = pts.length;
  const handles = [
    { x: X(q.Rb), y: Y(q.zb), end: true, label: t('editor.baseLabel', { d: nf(2 * q.Rb) }) },
    ...pts.map((p, i) => ({ x: X(p[1] * q.Rmax), y: Y(q.zb + p[0] * q.hb), end: false, label: t('editor.pointLabel', { i: i + 1, u: nf(p[0] * 100), d: nf(2 * p[1] * q.Rmax) }) })),
    { x: X(q.Rt), y: Y(q.zt), end: true, label: t('editor.topLabel', { d: nf(2 * q.Rt) }) },
  ];
  const stepI = Math.max(1, Math.round(1 / q.dz));
  const right = [], left = [], want = [];
  let clipped = 0;
  for (let i = 0; i <= q.M; i += stepI) {
    const y = Y(i * q.dz).toFixed(1);
    right.push(`${X(q.base[i]).toFixed(1)},${y}`);
    left.push(`${X(-q.base[i]).toFixed(1)},${y}`);
    want.push(`${X(q.want[i]).toFixed(1)},${y}`);
    clipped = Math.max(clipped, q.want[i] - q.base[i]);
  }
  return {
    cx, yTop: Y(q.H) - 6, yBot: Y(0) + 6, handles, n, clipped,
    shape: `M${right.join('L')}L${left.reverse().join('L')}Z`,
    want: `M${want.join('L')}`,
    toU: (y) => ((y0 - y) / sc - q.zb) / q.hb,
    toR: (x) => Math.abs(x - cx) / sc,
  };
});

const sel = computed(() => Math.min(Math.max(view.selected, 0), geo.value.n + 1));
const selIsEnd = computed(() => sel.value === 0 || sel.value === geo.value.n + 1);
const selName = computed(() => (sel.value === 0 ? t('editor.base') : sel.value === geo.value.n + 1 ? t('editor.top') : t('editor.point', { i: sel.value, n: geo.value.n })));
const selU = computed(() => (sel.value === 0 ? 0 : selIsEnd.value ? 100 : Math.round(params.pts[sel.value - 1][0] * 100)));
const selD = computed(() => {
  const q = model.value.q;
  return Math.round(sel.value === 0 ? 2 * q.Rb : selIsEnd.value ? 2 * q.Rt : 2 * params.pts[sel.value - 1][1] * q.Rmax);
});
const note = computed(() => [
  geo.value.clipped > 0.6 ? t('editor.clipped', { mm: nf(geo.value.clipped, 1), limit: nf(params.shoulder) }) : t('editor.exact'),
  t('editor.help'),
].join(' '));

function at(e) {
  const b = svg.value.getBoundingClientRect();
  return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
}
function onDown(e) {
  const [x, y] = at(e);
  let best = -1, bd = 22;
  geo.value.handles.forEach((h, i) => { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return;
  e.preventDefault();
  svg.value.setPointerCapture(e.pointerId);
  drag = best;
  view.selected = best;
}
function onMove(e) {
  if (drag === null) return;
  const [x, y] = at(e);
  movePoint(drag, geo.value.toU(y), geo.value.toR(x));
}
function onUp() { drag = null; }
function onDbl(e) {
  const [x, y] = at(e);
  addPoint(geo.value.toU(y), geo.value.toR(x));
}
function onKey(e, i) {
  const q = model.value.q, n = params.pts.length, big = e.shiftKey ? 5 : 1;
  const end = i === 0 || i === n + 1;
  const u = end ? null : params.pts[i - 1][0];
  const r = i === 0 ? params.botD / 2 : i === n + 1 ? params.topD / 2 : params.pts[i - 1][1] * q.Rmax;
  if (e.key === 'ArrowUp') { if (!end) movePoint(i, u + 0.01 * big, null); }
  else if (e.key === 'ArrowDown') { if (!end) movePoint(i, u - 0.01 * big, null); }
  else if (e.key === 'ArrowRight') movePoint(i, null, r + 0.5 * big);
  else if (e.key === 'ArrowLeft') movePoint(i, null, r - 0.5 * big);
  else if (e.key === 'Delete' || e.key === 'Backspace') removePoint(i);
  else return;
  e.preventDefault();
}
function setU(e) { const v = parseFloat(e.target.value); if (Number.isFinite(v)) movePoint(sel.value, v / 100, null); e.target.value = selU.value; }
function setD(e) { const v = parseFloat(e.target.value); if (Number.isFinite(v)) movePoint(sel.value, null, v / 2); e.target.value = selD.value; }
</script>

<template>
  <div class="profile-editor" id="pe">
    <svg
      ref="svg" id="pe-svg" :viewBox="`0 0 ${W} ${H}`" role="group"
      :aria-label="t('editor.aria')"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @dblclick="onDbl"
    >
      <line class="pe-axis" :x1="geo.cx" :x2="geo.cx" :y1="geo.yTop" :y2="geo.yBot" />
      <path class="pe-shape" :d="geo.shape" />
      <path class="pe-want" :d="geo.want" />
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
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-add" :disabled="geo.n >= 10" @click="addPointInGap">{{ t('editor.add') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-del" :disabled="selIsEnd || geo.n <= 1" @click="removePoint(sel)">{{ t('editor.remove') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-seed" @click="reseedPoints">{{ t('editor.reseed') }}</button>
    </div>
    <p class="form-text mb-0" id="pe-note">{{ note }}</p>
  </div>
</template>
