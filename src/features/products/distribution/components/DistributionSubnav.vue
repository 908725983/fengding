<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
const route = useRoute()
const links = [
  { path: '/products/distribution/plans', label: '铺货方案' },
  { path: '/products/order-templates', label: '订单模板' },
  { path: '/products/distribution/preview', label: '解析预览' },
  { path: '/products/distribution/statistics', label: '执行统计' },
]
const active = (path: string) => path === '/products/distribution/plans' ? route.path.startsWith(path) : route.path.startsWith(path)
</script>
<template><nav class="distribution-subnav" aria-label="铺货与订单模板子导航"><RouterLink v-for="item in links" :key="item.path" :to="item.path" :class="{active:active(item.path)}">{{item.label}}</RouterLink></nav></template>
<style scoped>.distribution-subnav{display:flex;min-height:44px;align-items:stretch;padding:0 14px;overflow-x:auto;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.distribution-subnav a{display:flex;align-items:center;padding:0 16px;color:#667383;font-size:13px;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent}.distribution-subnav a:hover,.distribution-subnav a.active{color:var(--color-primary-strong);border-bottom-color:var(--color-primary)}</style>
