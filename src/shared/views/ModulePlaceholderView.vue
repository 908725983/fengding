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
        <h2>原始需求与领域规则已登记，字段契约尚未提取</h2>
        <p>开始开发前，请从功能目录选择切片，按指定原文章节完成字段与交互契约，再建立对应 active plan 进入实现。</p>
        <dl class="fact-list">
          <div>
            <dt>业务规格</dt>
            <dd><code>{{ moduleInfo.spec }}</code></dd>
          </div>
          <div>
            <dt>功能与来源</dt>
            <dd><code>docs/product-specs/index.md</code></dd>
          </div>
          <div>
            <dt>当前质量</dt>
            <dd><code>docs/QUALITY_SCORE.md</code></dd>
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
