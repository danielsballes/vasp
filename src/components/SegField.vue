<script setup>
/* One-of-a-few selector, rendered as a Bootstrap button group. */
defineProps({
  modelValue: { type: [String, Number], required: true },
  name: { type: String, required: true },
  label: { type: String, default: '' },
  options: { type: Array, required: true },        // [{ value, label, disabled? }]
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);
const idOf = (name, value) => name + '-' + String(value).replace('.', '');
</script>

<template>
  <div class="seg-field" :id="'ctl-' + name" :class="{ 'is-off': disabled }">
    <div v-if="label" class="form-label mb-1" :id="name + '-lbl'">{{ label }}</div>
    <div class="btn-group btn-group-sm" role="group" :aria-labelledby="label ? name + '-lbl' : null" :aria-label="label ? null : name">
      <template v-for="o in options" :key="o.value">
        <input
          type="radio" class="btn-check" autocomplete="off" :name="name" :id="idOf(name, o.value)"
          :checked="modelValue === o.value" :disabled="disabled || o.disabled"
          @change="$emit('update:modelValue', o.value)"
        >
        <label class="btn btn-seg" :for="idOf(name, o.value)">{{ o.label }}</label>
      </template>
    </div>
    <div v-if="hint" class="form-text">{{ hint }}</div>
  </div>
</template>
