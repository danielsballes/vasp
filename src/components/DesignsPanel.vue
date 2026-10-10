<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDesigns } from '../composables/useDesigns.js';
import { useModel } from '../composables/useModel.js';
import { useStatus } from '../composables/useStatus.js';
import { NAME_MAX } from '../core/designs.js';
import { formatDate } from '../i18n/index.js';
import PanelSection from './PanelSection.vue';

/* Saved designs: save the current parameters under a name, load or delete a saved design, and
   back the whole library up to a file. */
const { t } = useI18n();
const { session } = useModel();
const { designs, storageOk, saveDesign, loadDesign, deleteDesign, backupDesigns, restoreDesigns } = useDesigns();
const { status, setStatus } = useStatus();

/* The name box follows the design the session comes from, without wiping a name being typed. */
const name = ref(session.designName);
const nameInput = ref(null);
watch(() => session.designName, (now, before) => {
  if (now || name.value === before) name.value = now;
});

/* Messages about designs are repeated here, next to the controls that caused them. */
const feedback = computed(() => (status.value.key.startsWith('designs.') ? status.value : null));

function onSave() {
  if (!saveDesign(name.value) && !name.value.trim() && nameInput.value) nameInput.value.focus();
}

/* Deleting takes two clicks on the same button; the first one arms it for a few seconds. */
const armed = ref('');
let timer = 0;
function disarm() { armed.value = ''; clearTimeout(timer); }
function onRemove(design) {
  if (armed.value !== design.id) {
    disarm();
    armed.value = design.id;
    timer = setTimeout(disarm, 4000);
    return;
  }
  disarm();
  deleteDesign(design.id);
}
onBeforeUnmount(disarm);

function onFile(event) {
  const input = event.target, file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { restoreDesigns(String(reader.result)); input.value = ''; };
  reader.onerror = () => { setStatus('designs.unreadable', {}, 'bad'); input.value = ''; };
  reader.readAsText(file);
}
</script>

<template>
  <PanelSection id="designs" :title="t('sections.designs')" :summary="t('summary.designs', { n: designs.length })" :start-open="false">
    <p class="form-text mb-0">{{ t('designs.intro') }}</p>
    <p v-if="!storageOk" class="form-text text-warn mb-0" id="note-storage">{{ t('designs.noStorage') }}</p>

    <form class="design-save" @submit.prevent="onSave">
      <label class="visually-hidden" for="design-name">{{ t('designs.name') }}</label>
      <input
        ref="nameInput" v-model="name" type="text" class="form-control form-control-sm" id="design-name"
        list="design-names" autocomplete="off" :maxlength="NAME_MAX" :placeholder="t('designs.placeholder')"
      >
      <datalist id="design-names">
        <option v-for="design in designs" :key="design.id" :value="design.name" />
      </datalist>
      <button type="submit" class="btn btn-sm btn-primary" id="btn-design-save">{{ t('designs.save') }}</button>
    </form>
    <p v-if="feedback" class="status mb-0" :class="'is-' + (feedback.kind || 'plain')" id="note-designs">{{ feedback.text }}</p>

    <p v-if="!designs.length" class="form-text mb-0" id="designs-empty">{{ t('designs.empty') }}</p>
    <ul v-else class="design-list" id="design-list">
      <li v-for="design in designs" :key="design.id" class="design-item" :class="{ current: design.name === session.designName }">
        <div class="design-info">
          <span class="design-name">{{ design.name }}</span>
          <small>{{ t('designs.savedOn', { date: formatDate(design.savedAt) }) }}</small>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary design-load" @click="loadDesign(design.id)">{{ t('designs.load') }}</button>
        <button
          type="button" class="btn btn-sm design-remove" :class="armed === design.id ? 'btn-danger' : 'btn-outline-secondary'"
          @click="onRemove(design)" @blur="disarm"
        >{{ armed === design.id ? t('designs.confirmRemove') : t('designs.remove') }}</button>
      </li>
    </ul>

    <div class="d-flex flex-wrap align-items-center gap-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-designs-backup" @click="backupDesigns">{{ t('designs.backup') }}</button>
      <label class="btn btn-sm btn-outline-secondary file-btn">
        {{ t('designs.restore') }}
        <input type="file" id="file-designs" accept=".json,application/json" :aria-label="t('designs.restoreAria')" @change="onFile">
      </label>
    </div>
    <p class="form-text mb-0">{{ t('designs.backupHint') }}</p>
  </PanelSection>
</template>
