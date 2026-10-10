<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { useExport } from '../composables/useExport.js';
import { useParamsFile } from '../composables/useParamsFile.js';
import { useStatus } from '../composables/useStatus.js';
import { PRESETS, QUALITY } from '../core/params.js';
import { NOZZLE_SIZES, supportAt } from '../core/print.js';
import { nf } from '../i18n/index.js';
import PanelSection from './PanelSection.vue';
import RangeField from './RangeField.vue';
import SegField from './SegField.vue';
import SwitchField from './SwitchField.vue';
import ProfileEditor from './ProfileEditor.vue';
import SupportAdvice from './SupportAdvice.vue';
import OrcaNotes from './OrcaNotes.vue';
import DesignsPanel from './DesignsPanel.vue';

/* Parameter panel: every section of the right-hand side. */
const { t } = useI18n();
const {
  params, model, stats, isFree, nozzle, lwMax,
  applyPreset, resetParams, setNozzle, setProfile, setBase, setThread,
} = useModel();
const { busy, exportAll } = useExport();
const { onParamsFile } = useParamsFile();
const { setStatus } = useStatus();

const q = computed(() => model.value.q);
const m = computed(() => model.value.m);
const caps = computed(() => model.value.caps);
const anyThread = computed(() => q.value.thB || q.value.thT);
const hasRibs = computed(() => q.value.ribs > 0 && q.value.ribA !== 0);

/* Options of the segmented selectors; the labels follow the interface language. */
const options = (group, values) => values.map((value) => ({ value, label: t(`options.${group}.${value}`) }));
const nozzleOptions = computed(() => NOZZLE_SIZES.map((d) => ({ value: d, label: t('fields.nozzleSize', { d: nf(d, 1) }) })));
const qualityOptions = computed(() => Object.keys(QUALITY).map((value) => ({ value, label: t('quality.' + value) })));
const profileOptions = computed(() => options('profile', ['barrel', 'free']));
const curveOptions = computed(() => options('curve', ['smooth', 'round']));
const ribOptions = computed(() => options('ribShape', ['wave', 'crest']));
const baseOptions = computed(() => options('base', ['open', 'closed']));

/* Summaries shown next to each section title. */
const sums = computed(() => {
  const Q = q.value;
  const relief = (n, a) => ({ n, relief: nf(a, 1) });
  return {
    printing: t('summary.printing', { nozzle: nf(params.nozzle, 1), lh: nf(Q.lh, 2) }),
    shape: t('summary.shape', { h: nf(Q.H), d: nf(2 * Q.Rmax), profile: t(Q.free ? 'summary.profileFree' : 'summary.profileBarrel') }),
    rings: Q.rings && Q.ringA ? t('summary.relief', relief(Q.rings, Q.ringA)) : t('summary.noRings'),
    ribs: !hasRibs.value ? t('summary.noRibs')
      : params.twist ? t('summary.reliefTwist', { ...relief(Q.ribs, Q.ribA), twist: nf(params.twist) })
      : t('summary.relief', relief(Q.ribs, Q.ribA)),
    base: t('summary.mouth', { d: nf(2 * Q.Rb), state: t(Q.closed ? 'summary.closed' : Q.thB ? 'summary.threaded' : 'summary.open') }),
    top: t('summary.mouth', { d: nf(2 * Q.Rt), state: t(Q.thT ? 'summary.threaded' : Q.uneven ? 'summary.uneven' : 'summary.plain') }),
    thread: anyThread.value ? t('summary.thread', { pitch: nf(Q.pitch, 1) }) : t('summary.noThread'),
    export: t('quality.' + params.quality),
  };
});

const lhHint = computed(() => t('hints.lh', {
  nozzle: nf(params.nozzle, 1),
  min: nf(nozzle.value.lhMin, 2),
  max: nf(nozzle.value.lhMax, 2),
  profiles: nozzle.value.profiles.map((v) => nf(v, 2)).join(' · '),
}));
const lwHint = computed(() => t('hints.lw', { def: nf(nozzle.value.lwDef, 2), max: nf(lwMax.value, 2) }));
const shoulderHint = computed(() => (q.value.wantDeg > q.value.limit + 0.5
  ? t('hints.shoulderClipped', { want: nf(q.value.wantDeg), limit: nf(q.value.limit) })
  : t('hints.shoulderFree', { want: nf(q.value.wantDeg) })));

/* Note for each mouth: thread, cap and inner clearance. */
function neckNote(which) {
  const Q = q.value, bottom = which === 'bottom';
  const on = bottom ? params.botThread : params.topThread;
  const active = bottom ? Q.thB : Q.thT;
  const L = bottom ? Q.Lb : Q.Lt, R = bottom ? Q.Rb : Q.Rt;
  const cap = caps.value[which];
  const inner = nf(Math.max(0, 2 * (R - Q.lw)), 1);
  if (!bottom && Q.uneven) {
    return { warn: params.topThread, text: t(params.topThread ? 'notes.unevenThread' : 'notes.uneven', { drop: nf(Q.drop), where: t(Q.dropBack ? 'editor.dropBack' : 'editor.dropFront'), wall: nf(Q.shellWall, 2) }) };
  }
  if (bottom && Q.closed) {
    return { warn: false, text: t(Q.uneven ? 'notes.closedBottomWalls' : 'notes.closedBottom', { floor: nf(Q.baseT, 1), layers: Math.max(1, Math.round(Q.baseT / Q.lh)) }) };
  }
  if (on && !active && R < 5) {
    return { warn: true, text: t('notes.tooNarrow', { d: nf(2 * R), inner }) };
  }
  if (on && !active) {
    return { warn: true, text: t('notes.neckTooShort', { neck: nf(L, 1), pitch: nf(Q.pitch, 1) }) };
  }
  if (active && cap) {
    const spec = cap.spec;
    return {
      warn: false,
      text: t(spec.hole > 0 ? 'notes.threadedHole' : 'notes.threaded', {
        turns: nf(spec.turns, 1),
        d: nf(2 * spec.Rout, 1),
        h: nf(spec.H, 1),
        hole: nf(2 * spec.hole, 1),
        g: nf(cap.grams),
        inner: nf(2 * (R - spec.dep - Q.lw), 1),
      }),
    };
  }
  return { warn: false, text: L > 0 ? t('notes.plainNeck', { neck: nf(L), inner }) : t('notes.noNeck', { inner }) };
}
const noteBot = computed(() => neckNote('bottom'));
const noteTop = computed(() => neckNote('top'));

const threadNote = computed(() => {
  const Q = q.value, over = Math.max(m.value.overBot, m.value.overTop);
  if (!anyThread.value) return { warn: false, text: t('notes.threadOff') };
  const sup = supportAt(over, Q.lh, Q.lw);
  if (sup < 0.4) return { warn: true, text: t('notes.threadSteep', { over: nf(over), pct: nf(Math.max(0, sup * 100)) }) };
  return { warn: false, text: t('notes.threadOk', { over: nf(over) }) };
});

/* Hole in each cap: only when the cap exists, and at most up to a lip that sits on the neck rim. */
function hole(which) {
  const cap = caps.value[which];
  const usable = !!cap && cap.spec.holeMax >= 1;
  return { usable, max: usable ? Math.max(2, Math.floor(2 * cap.spec.holeMax)) : 2 };
}
const holeTop = computed(() => hole('top'));
const holeBot = computed(() => hole('bottom'));
const holeHint = (h) => t('hints.hole', { max: nf(h.max) });

const exportNote = computed(() => t('notes.exportInfo', {
  deg: nf(stats.value.meshStep, 2),
  dz: nf(stats.value.dz, 2),
  count: 1 + Object.keys(caps.value).length,
}));

function onPreset(i) { applyPreset(i); setStatus(); }
function onReset() { resetParams(); setStatus('exporting.resetDone'); }
</script>

<template>
  <div class="presets">
    <span class="eyebrow">{{ t('presets.title') }}</span>
    <button v-for="(ps, i) in PRESETS" :key="ps.id" type="button" class="btn btn-sm btn-outline-secondary" :id="'preset-' + i" @click="onPreset(i)">{{ t('presets.' + ps.id) }}</button>
  </div>

  <div class="accordion accordion-flush">
    <DesignsPanel />

    <PanelSection id="printing" :title="t('sections.printing')" :summary="sums.printing">
      <SegField name="nozzle" :label="t('fields.nozzle')" :options="nozzleOptions" :model-value="params.nozzle" @update:model-value="setNozzle" />
      <RangeField id="lh" :label="t('fields.lh')" unit="mm" :min="nozzle.lhMin" :max="nozzle.lhMax" :step="0.02" :hint="lhHint" v-model="params.lh" />
      <RangeField id="lw" :label="t('fields.lw')" unit="mm" :min="params.nozzle" :max="lwMax" :step="0.02" :hint="lwHint" v-model="params.lw" />
      <SupportAdvice />
      <SwitchField id="protect" :label="t('fields.protect')" v-model="params.protect" />
    </PanelSection>

    <PanelSection id="shape" :title="t('sections.shape')" :summary="sums.shape">
      <SegField name="sg-profile" :label="t('fields.profile')" :options="profileOptions" :model-value="params.profile" @update:model-value="setProfile" />
      <RangeField id="H" :label="t('fields.height')" unit="mm" :min="30" :max="256" :step="1" v-model="params.H" />
      <RangeField id="D" :label="t('fields.diameter')" unit="mm" :min="30" :max="260" :step="1" v-model="params.D" />
      <template v-if="!isFree">
        <RangeField id="n" :label="t('fields.squareness')" :min="1.5" :max="10" :step="0.1" :hint="t('hints.squareness')" v-model="params.n" />
        <RangeField id="belly" :label="t('fields.belly')" unit="%" :min="25" :max="75" :step="1" v-model="params.belly" />
      </template>
      <template v-else>
        <ProfileEditor />
        <SegField name="sg-curve" :label="t('fields.curve')" :options="curveOptions" :hint="t('hints.curve')" v-model="params.curve" />
      </template>
      <RangeField id="shoulder" :label="t('fields.shoulder')" unit="°" :min="20" :max="80" :step="1" :hint="shoulderHint" v-model="params.shoulder" />
    </PanelSection>

    <PanelSection id="rings" :title="t('sections.rings')" :summary="sums.rings">
      <RangeField id="rings" :label="t('fields.count')" :min="0" :max="80" :step="1" v-model="params.rings" />
      <RangeField id="ringRelief" :label="t('fields.relief')" unit="mm" :min="-2" :max="3" :step="0.1" :hint="t('hints.ringRelief')" v-model="params.ringRelief" />
      <RangeField id="ringWidth" :label="t('fields.width')" unit="mm" :min="1" :max="20" :step="0.5" v-model="params.ringWidth" />
    </PanelSection>

    <PanelSection id="ribs" :title="t('sections.ribs')" :summary="sums.ribs">
      <RangeField id="ribs" :label="t('fields.count')" :min="0" :max="120" :step="1" v-model="params.ribs" />
      <SegField name="sg-ribShape" :label="t('fields.ribShape')" :options="ribOptions" :disabled="!hasRibs" v-model="params.ribShape" />
      <RangeField id="ribRelief" :label="t('fields.relief')" unit="mm" :min="-3" :max="4" :step="0.1" v-model="params.ribRelief" />
      <RangeField id="ribWidth" :label="t('fields.width')" unit="%" :min="10" :max="100" :step="1" :hint="t('hints.ribWidth')" v-model="params.ribWidth" />
      <RangeField id="twist" :label="t('fields.twist')" unit="°" :min="-360" :max="360" :step="5" v-model="params.twist" />
      <SwitchField id="ribProp" :label="t('fields.ribProp')" v-model="params.ribProp" />
    </PanelSection>

    <PanelSection id="base" :title="t('sections.base')" :summary="sums.base">
      <SegField name="sg-base" :label="t('fields.baseKind')" :options="baseOptions" :model-value="params.base" @update:model-value="setBase" />
      <RangeField v-if="q.closed" id="baseT" :label="t('fields.baseThickness')" unit="mm" :min="0.4" :max="4" :step="0.1" v-model="params.baseT" />
      <SwitchField id="botThread" :label="t('fields.thread')" :disabled="q.closed" :model-value="params.botThread" @update:model-value="setThread('bottom', $event)" />
      <RangeField id="botD" :label="t('fields.baseDiameter')" unit="mm" :min="6" :max="200" :step="1" v-model="params.botD" />
      <RangeField id="botL" :label="t('fields.neckLength')" unit="mm" :min="0" :max="40" :step="1" v-model="params.botL" />
      <RangeField id="patternStart" :label="t('fields.patternStart')" unit="mm" :min="0" :max="60" :step="0.5" :hint="t('hints.patternStart')" v-model="params.patternStart" />
      <p class="form-text mb-0" :class="{ 'text-warn': noteBot.warn }" id="note-bot">{{ noteBot.text }}</p>
    </PanelSection>

    <PanelSection id="top" :title="t('sections.top')" :summary="sums.top">
      <SwitchField id="topThread" :label="t('fields.thread')" :disabled="q.uneven" :model-value="params.topThread" @update:model-value="setThread('top', $event)" />
      <RangeField id="topD" :label="t('fields.mouthDiameter')" unit="mm" :min="6" :max="200" :step="1" v-model="params.topD" />
      <RangeField id="topL" :label="t('fields.neckLength')" unit="mm" :min="0" :max="40" :step="1" v-model="params.topL" />
      <RangeField id="patternStop" :label="t('fields.patternStop')" unit="mm" :min="0" :max="60" :step="0.5" :hint="t('hints.patternStop')" v-model="params.patternStop" />
      <p class="form-text mb-0" :class="{ 'text-warn': noteTop.warn }" id="note-top">{{ noteTop.text }}</p>
    </PanelSection>

    <PanelSection id="thread" :title="t('sections.thread')" :summary="sums.thread">
      <RangeField id="pitch" :label="t('fields.pitch')" unit="mm" :min="2" :max="8" :step="0.5" :disabled="!anyThread" v-model="params.pitch" />
      <RangeField id="depth" :label="t('fields.depth')" unit="mm" :min="0.6" :max="2.5" :step="0.1" :disabled="!anyThread" v-model="params.depth" />
      <RangeField id="clearance" :label="t('fields.clearance')" unit="mm" :min="0.1" :max="0.8" :step="0.05" :disabled="!anyThread" v-model="params.clearance" />
      <RangeField id="capWall" :label="t('fields.capWall')" unit="mm" :min="1.2" :max="5" :step="0.1" :disabled="!anyThread" :hint="t('hints.capWall')" v-model="params.capWall" />
      <RangeField id="capFloor" :label="t('fields.capFloor')" unit="mm" :min="0.8" :max="5" :step="0.1" :disabled="!anyThread" v-model="params.capFloor" />
      <SwitchField id="topHole" :label="t('fields.topHole')" :disabled="!holeTop.usable" v-model="params.topHole" />
      <RangeField v-if="holeTop.usable && params.topHole" id="topHoleD" :label="t('fields.topHoleDiameter')" unit="mm" :min="2" :max="holeTop.max" :step="1" :hint="holeHint(holeTop)" v-model="params.topHoleD" />
      <SwitchField id="botHole" :label="t('fields.bottomHole')" :disabled="!holeBot.usable" v-model="params.botHole" />
      <RangeField v-if="holeBot.usable && params.botHole" id="botHoleD" :label="t('fields.bottomHoleDiameter')" unit="mm" :min="2" :max="holeBot.max" :step="1" :hint="holeHint(holeBot)" v-model="params.botHoleD" />
      <p class="form-text mb-0" :class="{ 'text-warn': threadNote.warn }" id="note-thread">{{ threadNote.text }}</p>
    </PanelSection>

    <PanelSection id="export" :title="t('sections.export')" :summary="sums.export">
      <SegField name="quality" :label="t('fields.quality')" :options="qualityOptions" v-model="params.quality" />
      <p class="form-text mb-0" id="note-export">{{ exportNote }}</p>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <button type="button" class="btn btn-primary" id="btn-export-2" :disabled="busy" @click="exportAll">{{ t('app.exportStl') }}</button>
        <label class="btn btn-sm btn-outline-secondary file-btn">
          {{ t('exporting.loadParams') }}
          <input type="file" id="file-params" accept=".json,application/json" :aria-label="t('exporting.loadParamsAria')" @change="onParamsFile">
        </label>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-reset" @click="onReset">{{ t('exporting.reset') }}</button>
      </div>
    </PanelSection>

    <PanelSection id="orca" :title="t('sections.orca')" :start-open="false">
      <OrcaNotes />
    </PanelSection>
  </div>
</template>
