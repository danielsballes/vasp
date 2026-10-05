<script setup>
import { computed } from 'vue';
import { useModel } from '../composables/useModel.js';
import { orcaLines } from '../core/notes.js';
import { nf, t } from '../i18n/index.js';

const { params, model } = useModel();
const lines = computed(() => orcaLines({ p: params, ...model.value }, { t, nf }));
</script>

<template>
  <ol class="orca-list" id="orca-list">
    <li v-for="[title, text] in lines" :key="title"><b>{{ title }}:</b> {{ text }}</li>
  </ol>
</template>
