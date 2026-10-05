import { createI18n } from 'vue-i18n';
import es from './locales/es.js';
import en from './locales/en.js';
import { formatDate, formatNumber } from '../core/format.js';

/* Languages of the interface. `tag` is the locale used to format numbers and dates.
   To add a language: write its message file under locales/, import it here and add it to both
   LOCALES and `messages`. tests/i18n.test.js checks that every file has the same keys. */
export const LOCALES = [
  { code: 'es', label: 'Español', tag: 'es-CO' },
  { code: 'en', label: 'English', tag: 'en-US' },
];
export const DEFAULT_LOCALE = 'es';

const STORE = 'torno-espiral-vue-locale';
const known = (code) => LOCALES.some((l) => l.code === code);

/* The language chosen earlier, else the first browser language the app speaks, else Spanish. */
function initialLocale() {
  try {
    const saved = localStorage.getItem(STORE);
    if (known(saved)) return saved;
  } catch { /* no storage available */ }
  const wanted = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const lang of wanted) {
    const code = String(lang || '').slice(0, 2).toLowerCase();
    if (known(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { es, en },
});

/* Current language as a ref. Reading it inside a computed or a template makes that code re-run
   when the language changes. */
export const locale = i18n.global.locale;
const tag = () => (LOCALES.find((l) => l.code === locale.value) || LOCALES[0]).tag;

/* Translation and formatting for code outside components. Components use useI18n(). */
export const t = (key, named) => i18n.global.t(key, named || {});
export const nf = (value, digits = 0) => formatNumber(value, digits, tag());
export const df = (ms) => formatDate(ms, tag());

export function setLocale(code) {
  if (!known(code)) return;
  locale.value = code;
  document.documentElement.lang = code;
  try { localStorage.setItem(STORE, code); } catch { /* remembering the language is optional */ }
}

document.documentElement.lang = locale.value;
