<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { businessModules, findBusinessModule } from '@/app/module-catalog'
import { currentProcurementRole } from '@/features/procurement/runtime/procurement-access'

const route = useRoute()
const isPublicShare = computed(() => route.path.startsWith('/share/orders/'))
const currentModule = computed(() => {
  const key = route.path.split('/')[1] || 'dashboard'
  return findBusinessModule(key)
})
const visibleModules = computed(() => businessModules.filter((item) => item.key !== 'procurement' || ['super-admin', 'warehouse'].includes(currentProcurementRole.value)))
</script>

<template>
  <RouterView v-if="isPublicShare" />
  <div v-else class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">蜂</span>
        <div>
          <strong>蜂订原型</strong>
          <small>业务验证环境</small>
        </div>
      </div>

      <nav class="navigation">
        <RouterLink
          v-for="item in visibleModules"
          :key="item.key"
          :to="item.path"
          class="navigation__item"
          :aria-label="`${item.label}：${item.description}`"
        >
          <span class="navigation__icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__footer">
        <span class="status-dot" aria-hidden="true"></span>
        <span>Mock 环境</span>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar__location">
          <span class="eyebrow">蜂订业务原型</span>
          <strong>{{ currentModule?.label ?? '页面' }}</strong>
        </div>
        <div class="topbar__tools">
          <span class="prototype-chip">原型模拟</span>
          <button class="icon-button" type="button" aria-label="帮助">?</button>
          <div class="avatar" aria-label="当前模拟用户：系统管理员">管</div>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </section>
  </div>
</template>
