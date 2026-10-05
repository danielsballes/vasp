<script setup>
import { useModel } from '../composables/useModel.js';

/* Print advice: how much each layer is supported in the steepest area and which layer height and
   line width improve it. */
const { advice, applyFit } = useModel();
</script>

<template>
  <div class="advice" id="advice">
    <p class="form-text mb-0" :class="{ 'text-warn': advice.warn }" id="note-support">{{ advice.text }}</p>
    <button v-if="advice.fit" type="button" class="btn btn-sm btn-outline-secondary" id="btn-fit-print" @click="applyFit">{{ advice.apply }}</button>
  </div>
</template>
