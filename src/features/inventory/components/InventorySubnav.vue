<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
<template>
  <nav class="inventory-subnav" aria-label="库存二级导航">
    <RouterLink to="/inventory/stocks">库存查询</RouterLink><RouterLink to="/inventory/batches">批次库存</RouterLink>
    <RouterLink to="/inventory/movements">出入库明细</RouterLink><RouterLink to="/inventory/batch-movements">批次出入明细</RouterLink>
    <RouterLink to="/inventory/warehouses">仓库管理</RouterLink><RouterLink to="/inventory/locations">库位管理</RouterLink>
    <RouterLink to="/inventory/pending-outbound">待分拣订单</RouterLink><RouterLink to="/inventory/order-picking">按订单分拣</RouterLink><RouterLink to="/inventory/wave-picking">波次分拣</RouterLink>
    <RouterLink to="/inventory/delivery-tasks">配送任务</RouterLink><RouterLink to="/inventory/delivery-routes">配送线路</RouterLink><RouterLink to="/inventory/delivery-vehicles">车辆管理</RouterLink><RouterLink to="/inventory/picking-labels">分拣标签</RouterLink>
    <RouterLink to="/inventory/transfers">转仓单</RouterLink><RouterLink to="/inventory/other-outbounds">其他出库</RouterLink><RouterLink to="/inventory/other-inbounds">其他入库</RouterLink>
    <RouterLink to="/inventory/stocktakes">盘点记录</RouterLink><RouterLink to="/inventory/cost-adjustments">成本调整</RouterLink><RouterLink to="/inventory/closings">库存结转</RouterLink>
    <RouterLink to="/inventory/statistics">库存统计</RouterLink>
    <RouterLink to="/inventory/processing-recipes">加工配方</RouterLink><RouterLink to="/inventory/processing-plans">加工计划</RouterLink><RouterLink to="/inventory/processing-orders">加工单</RouterLink>
    <RouterLink to="/inventory/material-picks">加工领料</RouterLink><RouterLink to="/inventory/material-returns">加工退料</RouterLink><RouterLink to="/inventory/processing-yields">出成率</RouterLink>
  </nav>
</template>
<style scoped>
.inventory-subnav{display:flex;min-height:45px;gap:22px;align-items:center;padding:0 16px;overflow-x:auto;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.inventory-subnav a{display:flex;align-items:center;align-self:stretch;color:var(--color-muted);font-size:12px;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent}.inventory-subnav a.router-link-active{color:var(--color-primary-strong);font-weight:700;border-bottom-color:var(--color-primary)}
</style>
