<script setup>
import { useI18n } from 'vue-i18n';
import { useExport } from '../composables/useExport.js';
import { useParamsFile } from '../composables/useParamsFile.js';
import { useStatus } from '../composables/useStatus.js';
import { LOCALES, setLocale } from '../i18n/index.js';

const { t, locale } = useI18n();
const { status } = useStatus();
const { busy, exportAll } = useExport();
const { onParamsFile } = useParamsFile();
</script>

<template>
  <header class="app-top">
    <div class="brand">
      <!-- wasp: wings, head and thorax, and an abdomen crossed by three stripes -->
      <svg width="32" height="38" viewBox="0 0 32 38" aria-hidden="true">
        <defs>
          <clipPath id="wasp-abdomen"><path d="M16 17.5c4.6 0 7.4 4 7.4 8.2 0 4.8-3.6 8.4-7.4 11.3-3.8-2.9-7.4-6.5-7.4-11.3 0-4.2 2.8-8.2 7.4-8.2z" /></clipPath>
        </defs>
        <path d="M14.4 4.6C13.6 2.6 12 1.4 10 1.2M17.6 4.6c.8-2 2.4-3.2 4.4-3.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        <ellipse cx="8.6" cy="11" rx="6.6" ry="3" transform="rotate(-24 8.6 11)" fill="none" stroke="currentColor" stroke-width="1.4" />
        <ellipse cx="23.4" cy="11" rx="6.6" ry="3" transform="rotate(24 23.4 11)" fill="none" stroke="currentColor" stroke-width="1.4" />
        <circle cx="16" cy="7.2" r="2.9" fill="currentColor" />
        <ellipse cx="16" cy="13.4" rx="3.6" ry="3.4" fill="currentColor" />
        <path d="M16 17.5c4.6 0 7.4 4 7.4 8.2 0 4.8-3.6 8.4-7.4 11.3-3.8-2.9-7.4-6.5-7.4-11.3 0-4.2 2.8-8.2 7.4-8.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M6 22.6h20M6 26.6h20M6 30.6h20" clip-path="url(#wasp-abdomen)" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
      <div>
        <h1>Vasp</h1>
        <p class="sub">{{ t('app.tagline') }}</p>
      </div>
    </div>
    <div class="top-actions">
      <p class="status mb-0" :class="'is-' + (status.kind || 'plain')" id="status" role="status" aria-live="polite">{{ status.text }}</p>
      <select class="form-select form-select-sm lang-select" id="lang" :aria-label="t('app.language')" :value="locale" @change="setLocale($event.target.value)">
        <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">{{ l.label }}</option>
      </select>
      <button type="button" class="btn btn-primary top-export" id="btn-export" :disabled="busy" @click="exportAll">{{ t('app.exportStl') }}</button>
      <label class="btn btn-sm btn-outline-secondary file-btn">
        {{ t('exporting.loadParams') }}
        <input type="file" id="file-params-top" accept=".json,application/json" :aria-label="t('exporting.loadParamsAria')" @change="onParamsFile">
      </label>
    </div>
  </header>
</template>
