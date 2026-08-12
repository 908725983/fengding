<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
<template>
  <nav class="inventory-subnav" aria-label="库存二级导航">
    <RouterLink to="/inventory/stocks">库存查询</RouterLink><RouterLink to="/inventory/batches">批次库存</RouterLink>
    <RouterLink to="/inventory/movements">出入库明细</RouterLink><RouterLink to="/inventory/batch-movements">批次出入明细</RouterLink>
    <RouterLink to="/inventory/warehouses">仓库管理</RouterLink><RouterLink to="/inventory/locations">库位管理</RouterLink>
  </nav>
</template>
<style scoped>
.inventory-subnav{display:flex;min-height:45px;gap:22px;align-items:center;padding:0 16px;overflow-x:auto;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.inventory-subnav a{display:flex;align-items:center;align-self:stretch;color:var(--color-muted);font-size:12px;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent}.inventory-subnav a.router-link-active{color:var(--color-primary-strong);font-weight:700;border-bottom-color:var(--color-primary)}
</style>
