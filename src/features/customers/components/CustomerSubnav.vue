<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="subnav" aria-label="客户模块二级导航">
    <RouterLink to="/customers">客户列表</RouterLink>
    <RouterLink to="/customers/categories">客户分类</RouterLink>
    <RouterLink to="/customers/tags">客户标签</RouterLink>
    <RouterLink to="/customers/smart-tags">智能标签</RouterLink>
    <span>其余功能 · 规划中</span>
  </nav>
</template>

<style scoped>
.subnav { display: flex; gap: 24px; min-height: 44px; padding: 0 18px; overflow-x: auto; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.subnav a, .subnav span { display: flex; flex: 0 0 auto; align-items: center; color: var(--color-muted); text-decoration: none; }.subnav a.router-link-exact-active { color: var(--color-primary-strong); font-weight: 700; box-shadow: inset 0 -2px var(--color-primary); }.subnav span { margin-left: auto; font-size: 12px; }
</style>
