<script setup lang="ts">
import type { InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import type { InventoryRole } from '../types'
defineProps<{ scenario: InventoryScenarioName; role: InventoryRole }>()
const emit = defineEmits<{ scenario: [InventoryScenarioName]; role: [InventoryRole] }>()
</script>
<template>
  <div class="scenario-bar"><span>原型控制</span><label>场景<select :value="scenario" @change="emit('scenario', ($event.target as HTMLSelectElement).value as InventoryScenarioName)"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务异常</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option><option value="partial-failure">商品资料失败</option><option value="boundary">盘点锁定</option><option value="concurrent">并发版本</option></select></label><label>角色<select :value="role" @change="emit('role', ($event.target as HTMLSelectElement).value as InventoryRole)"><option value="super-admin">超级管理员</option><option value="warehouse">仓库人员</option><option value="sales-supervisor">销售主管</option><option value="salesperson">业务员</option><option value="finance">财务</option></select></label></div>
</template>
<style scoped>.scenario-bar{display:flex;gap:10px;align-items:flex-end}.scenario-bar>span{align-self:center;padding:4px 8px;color:var(--color-primary-strong);font-size:12px;background:var(--color-primary-soft);border-radius:999px}.scenario-bar label{display:grid;gap:2px;color:var(--color-muted);font-size:11px}.scenario-bar select{min-height:32px;padding:4px 7px;border:1px solid var(--color-border-strong);border-radius:4px;background:#fff}</style>
