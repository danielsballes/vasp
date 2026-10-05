<script setup>
import { ref } from 'vue';

/* Collapsible panel section, using Bootstrap's accordion markup without its JavaScript:
   Vue owns the open/closed state. */
const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  startOpen: { type: Boolean, default: true },
});
const open = ref(props.startOpen);
</script>

<template>
  <div class="accordion-item" :id="'sec-' + id">
    <h2 class="accordion-header">
      <button
        class="accordion-button" :class="{ collapsed: !open }" type="button"
        :aria-expanded="open" :aria-controls="'body-' + id" @click="open = !open"
      >
        <span class="section-title">{{ title }}</span>
        <span class="section-summary" :id="'sum-' + id">{{ summary }}</span>
      </button>
    </h2>
    <div class="accordion-collapse collapse" :class="{ show: open }" :id="'body-' + id">
      <div class="accordion-body"><slot /></div>
    </div>
  </div>
</template>
