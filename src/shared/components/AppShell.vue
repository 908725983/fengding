<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { businessModules, findBusinessModule } from '@/app/module-catalog'
import { moduleNavigation } from '@/app/module-navigation'
import { currentProcurementRole } from '@/features/procurement/runtime/procurement-access'
import ModuleContextNav from './ModuleContextNav.vue'

const route = useRoute()
const isPublicShare = computed(() => route.path.startsWith('/share/orders/'))
const currentModule = computed(() => {
  const key = route.path.split('/')[1] || 'dashboard'
  return findBusinessModule(key)
})
const visibleModules = computed(() => businessModules.filter((item) => item.key !== 'procurement' || ['super-admin', 'warehouse'].includes(currentProcurementRole.value)))
const openMenuKey = ref<string | null>(null)
let closeTimer: number | undefined
const activeMenu = computed(() => openMenuKey.value ? moduleNavigation[openMenuKey.value] ?? [] : [])
const activeMenuModule = computed(() => openMenuKey.value ? findBusinessModule(openMenuKey.value) : undefined)
const showFinanceTerminology = computed(() => route.path.startsWith('/finance/') || route.path.startsWith('/orders/'))

function openModuleMenu(key: string): void {
  if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  openMenuKey.value = key
}

function scheduleClose(): void {
  if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => { openMenuKey.value = null; closeTimer = undefined }, 120)
}

function cancelClose(): void {
  if (closeTimer !== undefined) { window.clearTimeout(closeTimer); closeTimer = undefined }
}

function closeModuleMenu(): void { cancelClose(); openMenuKey.value = null }

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeModuleMenu()
}

function isMenuItemActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}

onMounted(() => window.addEventListener('keydown', closeOnEscape))
onBeforeUnmount(() => { window.removeEventListener('keydown', closeOnEscape); cancelClose() })
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
          @mouseenter="openModuleMenu(item.key)"
          @focus="openModuleMenu(item.key)"
          @mouseleave="scheduleClose"
          @blur="scheduleClose"
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

    <section class="workspace" @click="closeModuleMenu">
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

      <div v-if="activeMenu.length" class="module-mega-menu" role="dialog" :aria-label="`${activeMenuModule?.label ?? '模块'}菜单`" @mouseenter="cancelClose" @mouseleave="scheduleClose" @click.stop>
        <header class="module-mega-menu__header">
          <div><strong>{{ activeMenuModule?.label }}</strong><small>{{ activeMenuModule?.description }}</small></div>
          <button class="module-mega-menu__close" type="button" aria-label="关闭模块菜单" @click="closeModuleMenu">×</button>
        </header>
        <div class="module-mega-menu__grid">
          <section v-for="group in activeMenu" :key="group.label" class="module-mega-menu__group">
            <h2>{{ group.label }}</h2>
            <RouterLink v-for="item in group.items" :key="item.path" :to="item.path" :class="{ active: isMenuItemActive(item.path) }" @click="closeModuleMenu">{{ item.label }}</RouterLink>
          </section>
        </div>
      </div>

      <main class="content">
        <ModuleContextNav />
        <p v-if="showFinanceTerminology" class="terminology-guide"><strong>金额字段说明：</strong>订单金额=整张订单应付款；客户已付款=已经到账并核销的金额；客户还欠金额=仍未付款的金额；本次退货商品金额=这次退回商品的成交价合计；实际要退给客户金额=客户已经付过且本次需要退回的金额。</p>
        <RouterView />
      </main>
    </section>
  </div>
</template>
