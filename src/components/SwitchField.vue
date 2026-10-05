<script setup>
/* Bootstrap switch. */
defineProps({
  modelValue: { type: Boolean, required: true },
  id: { type: String, required: true },
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="form-check form-switch mb-0" :class="{ 'is-off': disabled }">
    <input
      class="form-check-input" type="checkbox" role="switch" :id="'p-' + id"
      :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)"
    >
    <label class="form-check-label" :for="'p-' + id">{{ label }}</label>
  </div>
</template>
