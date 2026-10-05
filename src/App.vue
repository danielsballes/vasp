<script setup>
import { useI18n } from 'vue-i18n';
import AppHeader from './components/AppHeader.vue';
import ViewerStage from './components/ViewerStage.vue';
import StatsBar from './components/StatsBar.vue';
import ParamPanel from './components/ParamPanel.vue';

const { t } = useI18n();
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <section class="app-left" :aria-label="t('app.preview')">
        <ViewerStage />
        <StatsBar />
      </section>
      <aside class="app-panel" id="panel" :aria-label="t('app.parameters')">
        <ParamPanel />
      </aside>
    </main>
  </div>
</template>
