<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { useExport } from '../composables/useExport.js';
import { useParamsFile } from '../composables/useParamsFile.js';
import { useStatus } from '../composables/useStatus.js';
import { PRESETS, QUALITY } from '../core/params.js';
import { NOZZLE_SIZES, supportAt } from '../core/print.js';
import { formatNumber } from '../i18n/index.js';
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

const shape = computed(() => model.value.shape);
const measures = computed(() => model.value.measures);
const caps = computed(() => model.value.caps);
const anyThread = computed(() => shape.value.bottomThread || shape.value.topThread);
const hasRibs = computed(() => shape.value.ribs > 0 && shape.value.ribRelief !== 0);

/* Options of the segmented selectors; the labels follow the interface language. */
const options = (group, values) => values.map((value) => ({ value, label: t(`options.${group}.${value}`) }));
const nozzleOptions = computed(() => NOZZLE_SIZES.map((diameter) => ({ value: diameter, label: t('fields.nozzleSize', { d: formatNumber(diameter, 1) }) })));
const qualityOptions = computed(() => Object.keys(QUALITY).map((value) => ({ value, label: t('quality.' + value) })));
const profileOptions = computed(() => options('profile', ['barrel', 'free']));
const curveOptions = computed(() => options('curve', ['smooth', 'round']));
const ribOptions = computed(() => options('ribShape', ['wave', 'crest']));
const baseOptions = computed(() => options('base', ['open', 'closed']));

/* Summaries shown next to each section title. */
const summaries = computed(() => {
  const current = shape.value;
  const relief = (count, mm) => ({ n: count, relief: formatNumber(mm, 1) });
  return {
    printing: t('summary.printing', { nozzle: formatNumber(params.nozzle, 1), lh: formatNumber(current.layerHeight, 2) }),
    shape: t('summary.shape', { h: formatNumber(current.height), d: formatNumber(2 * current.maxRadius), profile: t(current.freeProfile ? 'summary.profileFree' : 'summary.profileBarrel') }),
    rings: current.rings && current.ringRelief ? t('summary.relief', relief(current.rings, current.ringRelief)) : t('summary.noRings'),
    ribs: !hasRibs.value ? t('summary.noRibs')
      : params.twist ? t('summary.reliefTwist', { ...relief(current.ribs, current.ribRelief), twist: formatNumber(params.twist) })
      : t('summary.relief', relief(current.ribs, current.ribRelief)),
    base: t('summary.mouth', { d: formatNumber(2 * current.bottomRadius), state: t(current.closedBase ? 'summary.closed' : current.bottomThread ? 'summary.threaded' : 'summary.open') }),
    top: t('summary.mouth', { d: formatNumber(2 * current.topRadius), state: t(current.topThread ? 'summary.threaded' : 'summary.plain') }),
    thread: anyThread.value ? t('summary.thread', { pitch: formatNumber(current.pitch, 1) }) : t('summary.noThread'),
    export: t('quality.' + params.quality),
  };
});

const lhHint = computed(() => t('hints.lh', {
  nozzle: formatNumber(params.nozzle, 1),
  min: formatNumber(nozzle.value.lhMin, 2),
  max: formatNumber(nozzle.value.lhMax, 2),
  profiles: nozzle.value.profiles.map((height) => formatNumber(height, 2)).join(' · '),
}));
const lwHint = computed(() => t('hints.lw', { def: formatNumber(nozzle.value.lwDef, 2), max: formatNumber(lwMax.value, 2) }));
const shoulderHint = computed(() => (shape.value.wantedTilt > shape.value.maxTilt + 0.5
  ? t('hints.shoulderClipped', { want: formatNumber(shape.value.wantedTilt), limit: formatNumber(shape.value.maxTilt) })
  : t('hints.shoulderFree', { want: formatNumber(shape.value.wantedTilt) })));

/* Note for each mouth: thread, cap and inner clearance. */
function neckNote(which) {
  const current = shape.value, bottom = which === 'bottom';
  const wanted = bottom ? params.botThread : params.topThread;
  const active = bottom ? current.bottomThread : current.topThread;
  const neckLength = bottom ? current.bottomNeck : current.topNeck;
  const neckRadius = bottom ? current.bottomRadius : current.topRadius;
  const cap = caps.value[which];
  const inner = formatNumber(Math.max(0, 2 * (neckRadius - current.lineWidth)), 1);   // inner diameter of the neck
  if (bottom && current.closedBase) {
    const layers = Math.max(1, Math.round(current.baseThickness / current.layerHeight));
    return { warn: false, text: t('notes.closedBottom', { floor: formatNumber(current.baseThickness, 1), layers }) };
  }
  if (wanted && !active && neckRadius < 5) {
    return { warn: true, text: t('notes.tooNarrow', { d: formatNumber(2 * neckRadius), inner }) };
  }
  if (wanted && !active) {
    return { warn: true, text: t('notes.neckTooShort', { neck: formatNumber(neckLength, 1), pitch: formatNumber(current.pitch, 1) }) };
  }
  if (active && cap) {
    const spec = cap.spec;
    return {
      warn: false,
      text: t(spec.hole > 0 ? 'notes.threadedHole' : 'notes.threaded', {
        turns: formatNumber(spec.turns, 1),
        d: formatNumber(2 * spec.outerRadius, 1),
        h: formatNumber(spec.height, 1),
        hole: formatNumber(2 * spec.hole, 1),
        g: formatNumber(cap.grams),
        inner: formatNumber(2 * (neckRadius - spec.threadDepth - current.lineWidth), 1),
      }),
    };
  }
  return { warn: false, text: neckLength > 0 ? t('notes.plainNeck', { neck: formatNumber(neckLength), inner }) : t('notes.noNeck', { inner }) };
}
const noteBottom = computed(() => neckNote('bottom'));
const noteTop = computed(() => neckNote('top'));

const threadNote = computed(() => {
  const current = shape.value, over = Math.max(measures.value.overBottom, measures.value.overTop);
  if (!anyThread.value) return { warn: false, text: t('notes.threadOff') };
  const support = supportAt(over, current.layerHeight, current.lineWidth);
  if (support < 0.4) return { warn: true, text: t('notes.threadSteep', { over: formatNumber(over), pct: formatNumber(Math.max(0, support * 100)) }) };
  return { warn: false, text: t('notes.threadOk', { over: formatNumber(over) }) };
});

/* Hole in each cap: only when the cap exists, and at most up to a lip that sits on the neck rim. */
function hole(which) {
  const cap = caps.value[which];
  const usable = !!cap && cap.spec.holeMax >= 1;
  return { usable, max: usable ? Math.max(2, Math.floor(2 * cap.spec.holeMax)) : 2 };
}
const holeTop = computed(() => hole('top'));
const holeBottom = computed(() => hole('bottom'));
const holeHint = (limits) => t('hints.hole', { max: formatNumber(limits.max) });

const exportNote = computed(() => t('notes.exportInfo', {
  deg: formatNumber(stats.value.meshStep, 2),
  dz: formatNumber(stats.value.ringStep, 2),
  count: 1 + Object.keys(caps.value).length,
}));

function onPreset(index) { applyPreset(index); setStatus(); }
function onReset() { resetParams(); setStatus('exporting.resetDone'); }
</script>

<template>
  <div class="presets">
    <span class="eyebrow">{{ t('presets.title') }}</span>
    <button v-for="(preset, index) in PRESETS" :key="preset.id" type="button" class="btn btn-sm btn-outline-secondary" :id="'preset-' + index" @click="onPreset(index)">{{ t('presets.' + preset.id) }}</button>
  </div>

  <div class="accordion accordion-flush">
    <DesignsPanel />

    <PanelSection id="printing" :title="t('sections.printing')" :summary="summaries.printing">
      <SegField name="nozzle" :label="t('fields.nozzle')" :options="nozzleOptions" :model-value="params.nozzle" @update:model-value="setNozzle" />
      <RangeField id="lh" :label="t('fields.lh')" unit="mm" :min="nozzle.lhMin" :max="nozzle.lhMax" :step="0.02" :hint="lhHint" v-model="params.lh" />
      <RangeField id="lw" :label="t('fields.lw')" unit="mm" :min="params.nozzle" :max="lwMax" :step="0.02" :hint="lwHint" v-model="params.lw" />
      <SupportAdvice />
      <SwitchField id="protect" :label="t('fields.protect')" v-model="params.protect" />
    </PanelSection>

    <PanelSection id="shape" :title="t('sections.shape')" :summary="summaries.shape">
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

    <PanelSection id="rings" :title="t('sections.rings')" :summary="summaries.rings">
      <RangeField id="rings" :label="t('fields.count')" :min="0" :max="80" :step="1" v-model="params.rings" />
      <RangeField id="ringRelief" :label="t('fields.relief')" unit="mm" :min="-2" :max="3" :step="0.1" :hint="t('hints.ringRelief')" v-model="params.ringRelief" />
      <RangeField id="ringWidth" :label="t('fields.width')" unit="mm" :min="1" :max="20" :step="0.5" v-model="params.ringWidth" />
    </PanelSection>

    <PanelSection id="ribs" :title="t('sections.ribs')" :summary="summaries.ribs">
      <RangeField id="ribs" :label="t('fields.count')" :min="0" :max="120" :step="1" v-model="params.ribs" />
      <SegField name="sg-ribShape" :label="t('fields.ribShape')" :options="ribOptions" :disabled="!hasRibs" v-model="params.ribShape" />
      <RangeField id="ribRelief" :label="t('fields.relief')" unit="mm" :min="-3" :max="4" :step="0.1" v-model="params.ribRelief" />
      <RangeField id="ribWidth" :label="t('fields.width')" unit="%" :min="10" :max="100" :step="1" :hint="t('hints.ribWidth')" v-model="params.ribWidth" />
      <RangeField id="twist" :label="t('fields.twist')" unit="°" :min="-360" :max="360" :step="5" v-model="params.twist" />
      <SwitchField id="ribProp" :label="t('fields.ribProp')" v-model="params.ribProp" />
    </PanelSection>

    <PanelSection id="base" :title="t('sections.base')" :summary="summaries.base">
      <SegField name="sg-base" :label="t('fields.baseKind')" :options="baseOptions" :model-value="params.base" @update:model-value="setBase" />
      <RangeField v-if="shape.closedBase" id="baseT" :label="t('fields.baseThickness')" unit="mm" :min="0.4" :max="4" :step="0.1" v-model="params.baseT" />
      <SwitchField id="botThread" :label="t('fields.thread')" :disabled="shape.closedBase" :model-value="params.botThread" @update:model-value="setThread('bottom', $event)" />
      <RangeField id="botD" :label="t('fields.baseDiameter')" unit="mm" :min="6" :max="200" :step="1" v-model="params.botD" />
      <RangeField id="botL" :label="t('fields.neckLength')" unit="mm" :min="0" :max="40" :step="1" v-model="params.botL" />
      <p class="form-text mb-0" :class="{ 'text-warn': noteBottom.warn }" id="note-bot">{{ noteBottom.text }}</p>
    </PanelSection>

    <PanelSection id="top" :title="t('sections.top')" :summary="summaries.top">
      <SwitchField id="topThread" :label="t('fields.thread')" :model-value="params.topThread" @update:model-value="setThread('top', $event)" />
      <RangeField id="topD" :label="t('fields.mouthDiameter')" unit="mm" :min="6" :max="200" :step="1" v-model="params.topD" />
      <RangeField id="topL" :label="t('fields.neckLength')" unit="mm" :min="0" :max="40" :step="1" v-model="params.topL" />
      <p class="form-text mb-0" :class="{ 'text-warn': noteTop.warn }" id="note-top">{{ noteTop.text }}</p>
    </PanelSection>

    <PanelSection id="thread" :title="t('sections.thread')" :summary="summaries.thread">
      <RangeField id="pitch" :label="t('fields.pitch')" unit="mm" :min="2" :max="8" :step="0.5" :disabled="!anyThread" v-model="params.pitch" />
      <RangeField id="depth" :label="t('fields.depth')" unit="mm" :min="0.6" :max="2.5" :step="0.1" :disabled="!anyThread" v-model="params.depth" />
      <RangeField id="clearance" :label="t('fields.clearance')" unit="mm" :min="0.1" :max="0.8" :step="0.05" :disabled="!anyThread" v-model="params.clearance" />
      <RangeField id="capWall" :label="t('fields.capWall')" unit="mm" :min="1.2" :max="5" :step="0.1" :disabled="!anyThread" :hint="t('hints.capWall')" v-model="params.capWall" />
      <RangeField id="capFloor" :label="t('fields.capFloor')" unit="mm" :min="0.8" :max="5" :step="0.1" :disabled="!anyThread" v-model="params.capFloor" />
      <SwitchField id="topHole" :label="t('fields.topHole')" :disabled="!holeTop.usable" v-model="params.topHole" />
      <RangeField v-if="holeTop.usable && params.topHole" id="topHoleD" :label="t('fields.topHoleDiameter')" unit="mm" :min="2" :max="holeTop.max" :step="1" :hint="holeHint(holeTop)" v-model="params.topHoleD" />
      <SwitchField id="botHole" :label="t('fields.bottomHole')" :disabled="!holeBottom.usable" v-model="params.botHole" />
      <RangeField v-if="holeBottom.usable && params.botHole" id="botHoleD" :label="t('fields.bottomHoleDiameter')" unit="mm" :min="2" :max="holeBottom.max" :step="1" :hint="holeHint(holeBottom)" v-model="params.botHoleD" />
      <p class="form-text mb-0" :class="{ 'text-warn': threadNote.warn }" id="note-thread">{{ threadNote.text }}</p>
    </PanelSection>

    <PanelSection id="export" :title="t('sections.export')" :summary="summaries.export">
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
