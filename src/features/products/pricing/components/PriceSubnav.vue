<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const links = [
  { path: '/products', label: '商品档案' },
  { path: '/products/prices/level-adjustments', label: '等级调价' },
  { path: '/products/prices/purchase-adjustments', label: '进价调价' },
  { path: '/products/prices/customer-adjustments', label: '客户调价' },
  { path: '/products/prices/history', label: '历史调价' },
]
const isActive = (path: string) => route.path === path || route.path.startsWith(`${path}/`)
</script>

<template>
  <nav class="price-subnav" aria-label="商品与价格子导航">
    <RouterLink v-for="item in links" :key="item.path" :to="item.path" :class="{ active: isActive(item.path) }">{{ item.label }}</RouterLink>
    <span title="后续检查点实现">单位价格</span><span title="后续检查点实现">自动调价</span>
  </nav>
</template>

<style scoped>
.price-subnav{display:flex;min-height:44px;align-items:stretch;padding:0 14px;overflow-x:auto;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.price-subnav a,.price-subnav span{display:flex;flex:0 0 auto;align-items:center;padding:0 13px;color:#667383;font-size:13px;text-decoration:none;border-bottom:2px solid transparent}.price-subnav a:hover,.price-subnav a.active{color:var(--color-primary-strong);border-bottom-color:var(--color-primary)}.price-subnav span{color:#a1a9b3}
</style>
