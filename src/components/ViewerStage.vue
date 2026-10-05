<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { createViewer } from '../viewer/viewer.js';

/* Preview stage: the three.js canvas with the view controls on top. */
const { t } = useI18n();
const { model, view, hasCaps } = useModel();
const canvas = ref(null);
const stage = ref(null);
const failed = ref(false);
let viewer = null;

/* Labels live in the message files under `viewer.modes.*`. */
const MODES = ['body', 'exploded', 'assembled'];

onMounted(() => {
  try {
    viewer = createViewer(canvas.value, stage.value);
  } catch {
    failed.value = true;
    return;
  }
  viewer.update(model.value, view);
});
watch([model, () => view.mode, () => view.heat, () => view.bodyColor, () => view.capColor], () => {
  if (viewer) viewer.update(model.value, view);
});
onBeforeUnmount(() => { if (viewer) viewer.dispose(); });
function resetView() { if (viewer) viewer.resetView(); }
</script>

<template>
  <div class="stage" id="stage" ref="stage">
    <canvas v-show="!failed" ref="canvas" id="view" tabindex="0" :aria-label="t('viewer.canvas')"></canvas>
    <p v-if="failed" class="stage-fallback">{{ t('viewer.noWebgl') }}</p>

    <div class="overlay top">
      <div class="btn-group btn-group-sm" role="group" :aria-label="t('viewer.show')">
        <template v-for="mode in MODES" :key="mode">
          <input
            type="radio" class="btn-check" name="view-mode" autocomplete="off" :id="'view-' + mode"
            :checked="view.mode === mode" :disabled="mode !== 'body' && !hasCaps" @change="view.mode = mode"
          >
          <label class="btn btn-seg glass" :for="'view-' + mode">{{ t('viewer.modes.' + mode) }}</label>
        </template>
      </div>
      <label class="chip glass"><input type="checkbox" class="form-check-input m-0" id="support-map" v-model="view.heat"> {{ t('viewer.supportMap') }}</label>
    </div>

    <div class="overlay bottom">
      <span v-if="!view.heat" class="tip" id="tip">{{ t('viewer.tip') }}</span>
      <span v-else class="legend" id="legend"><span>{{ t('viewer.legendFull') }}</span><i></i><span>{{ t('viewer.legendNone') }}</span></span>
      <div class="d-flex flex-wrap justify-content-end gap-2 ms-auto">
        <button v-if="!failed" type="button" class="chip glass" id="view-reset" @click="resetView">{{ t('viewer.reset') }}</button>
        <label class="chip glass"><input type="color" id="color-body" v-model="view.bodyColor"> {{ t('viewer.bodyColor') }}</label>
        <label class="chip glass"><input type="color" id="color-caps" v-model="view.capColor"> {{ t('viewer.capColor') }}</label>
      </div>
    </div>
  </div>
</template>
