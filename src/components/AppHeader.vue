<script setup>
import { useI18n } from 'vue-i18n';
import { useExport } from '../composables/useExport.js';
import { useStatus } from '../composables/useStatus.js';
import { LOCALES, setLocale } from '../i18n/index.js';

const { t, locale } = useI18n();
const { status } = useStatus();
const { busy, exportAll } = useExport();
</script>

<template>
  <header class="app-top">
    <div class="brand">
      <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true">
        <rect x="10" y="1" width="10" height="4" rx="1" fill="currentColor" />
        <rect x="10" y="33" width="10" height="4" rx="1" fill="currentColor" />
        <path d="M10 5h10l8 7v14l-8 7H10l-8-7V12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path d="M3 15h24M3 19h24M3 23h24" fill="none" stroke="currentColor" stroke-width="1.4" />
      </svg>
      <div>
        <h1>Torno Espiral</h1>
        <p class="sub">{{ t('app.tagline') }}</p>
      </div>
    </div>
    <div class="top-actions">
      <p class="status mb-0" :class="'is-' + (status.kind || 'plain')" id="status" role="status" aria-live="polite">{{ status.text }}</p>
      <select class="form-select form-select-sm lang-select" id="lang" :aria-label="t('app.language')" :value="locale" @change="setLocale($event.target.value)">
        <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">{{ l.label }}</option>
      </select>
      <button type="button" class="btn btn-primary top-export" id="btn-export" :disabled="busy" @click="exportAll">{{ t('app.exportStl') }}</button>
    </div>
  </header>
</template>
