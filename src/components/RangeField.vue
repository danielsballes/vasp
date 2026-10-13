<script setup>
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/* Slider paired with a number box. The box is driven by hand so it never overwrites what the user
   is typing: it only snaps to the real value when the field loses focus. */
const props = defineProps({
  modelValue: { type: Number, required: true },
  id: { type: String, required: true },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  step: { type: Number, default: 1 },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const numberBox = ref(null);
let typing = false;
const show = (value) => { if (numberBox.value) numberBox.value.value = String(value); };
onMounted(() => show(props.modelValue));
watch(() => props.modelValue, (value) => { if (!typing) show(value); });

function commit(raw) {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return;
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, value)));
}
function onRange(event) { typing = false; commit(event.target.value); }
function onNumber(event) { typing = true; commit(event.target.value); }
function onBlur() { typing = false; show(props.modelValue); }
</script>

<template>
  <div class="range-field" :id="'ctl-' + id" :class="{ 'is-off': disabled }">
    <div class="d-flex align-items-center justify-content-between gap-2">
      <label class="form-label mb-0" :for="'p-' + id">{{ label }}</label>
      <span class="num-box">
        <input
          ref="numberBox" type="number" class="form-control form-control-sm" inputmode="decimal"
          :id="'n-' + id" :min="min" :max="max" :step="step" :disabled="disabled"
          :aria-label="unit ? t('fields.withUnit', { label, unit }) : label"
          @input="onNumber" @blur="onBlur"
        >
        <span class="unit">{{ unit }}</span>
      </span>
    </div>
    <input
      type="range" class="form-range" :id="'p-' + id" :min="min" :max="max" :step="step"
      :value="modelValue" :disabled="disabled" @input="onRange"
    >
    <div v-if="hint || $slots.default" class="form-text" :id="'hint-' + id"><slot>{{ hint }}</slot></div>
  </div>
</template>
