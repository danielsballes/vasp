import { computed, ref } from 'vue';
import { t } from '../i18n/index.js';

/* The status line in the header. It keeps the message key instead of the text, so the message
   follows the interface when the language changes. */

const current = ref({ key: '', named: {}, kind: '' });

/* kind: '' (neutral), 'ok' or 'bad'. Call it without arguments to clear the line. */
function setStatus(key = '', named = {}, kind = '') {
  current.value = { key, named, kind };
}

const status = computed(() => ({
  key: current.value.key,
  text: current.value.key ? t(current.value.key, current.value.named) : '',
  kind: current.value.kind,
}));

export function useStatus() {
  return { status, setStatus };
}
