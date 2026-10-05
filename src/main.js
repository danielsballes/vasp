import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import './assets/theme.css';
import App from './App.vue';
import { i18n } from './i18n/index.js';

/* Bootstrap light or dark theme following the system. If the page lives inside a viewer that pins
   the theme with data-theme on the root (as Claude artifacts do), that value wins. */
const root = document.documentElement;
const dark = window.matchMedia('(prefers-color-scheme: dark)');
function syncTheme() {
  const forced = root.getAttribute('data-theme');
  root.setAttribute('data-bs-theme', forced === 'dark' || forced === 'light' ? forced : dark.matches ? 'dark' : 'light');
}
syncTheme();
dark.addEventListener('change', syncTheme);
new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

createApp(App).use(i18n).mount('#app');
