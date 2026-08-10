<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { findBusinessModule } from '@/app/module-catalog'

const route = useRoute()
const moduleInfo = computed(() => findBusinessModule(String(route.params.module)))
</script>

<template>
  <section v-if="moduleInfo" class="page" :aria-labelledby="`${moduleInfo.key}-title`">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ moduleInfo.key }}</p>
        <h1 :id="`${moduleInfo.key}-title`">{{ moduleInfo.label }}模块</h1>
        <p class="page-header__description">{{ moduleInfo.description }}</p>
      </div>
      <span class="status-badge status-badge--neutral">规划中</span>
    </header>

    <div class="placeholder-panel">
      <span class="placeholder-panel__mark" aria-hidden="true">{{ moduleInfo.shortLabel }}</span>
      <div>
        <h2>规格已建立，功能尚未实现</h2>
        <p>开始开发前，请从功能清单选择唯一的进行中功能，并阅读对应业务规格与 active plan。</p>
        <dl class="fact-list">
          <div>
            <dt>业务规格</dt>
            <dd><code>{{ moduleInfo.spec }}</code></dd>
          </div>
          <div>
            <dt>功能状态</dt>
            <dd><code>feature_list.json</code></dd>
          </div>
          <div>
            <dt>验收入口</dt>
            <dd><code>npm run verify</code></dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
