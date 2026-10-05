<script setup>
import { useI18n } from 'vue-i18n';
import { useModel } from '../composables/useModel.js';
import { PLATE } from '../core/print.js';

/* Stats bar below the preview. */
const { t } = useI18n();
const { stats } = useModel();
</script>

<template>
  <dl class="stats">
    <div>
      <dt>{{ t('stats.size') }}</dt>
      <dd id="st-size">{{ stats.size }}</dd>
      <small id="st-fit">
        <template v-if="stats.fits">{{ t('stats.fits', { printer: PLATE.name }) }} <span class="pill ok">{{ t('stats.fitsBadge') }}</span></template>
        <template v-else>{{ t('stats.tooBig', { printer: PLATE.name, x: PLATE.x, y: PLATE.y, z: PLATE.z }) }} <span class="pill bad">{{ t('stats.tooBigBadge') }}</span></template>
      </small>
    </div>
    <div>
      <dt>{{ t('stats.overhang') }}</dt>
      <dd id="st-over">{{ stats.overText }} <span class="pill" :class="stats.levelClass">{{ stats.levelText }}</span></dd>
      <small id="st-over-where">{{ stats.overNote }}</small>
    </div>
    <div>
      <dt>{{ t('stats.mass') }}</dt>
      <dd id="st-mass">{{ stats.massText }}</dd>
      <small id="st-mass-note">{{ stats.massNote }}</small>
    </div>
    <div>
      <dt>{{ t('stats.mesh') }}</dt>
      <dd id="st-mesh">{{ stats.meshText }}</dd>
      <small id="st-mesh-note">{{ stats.meshNote }}</small>
    </div>
  </dl>
</template>
