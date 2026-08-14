<script setup lang="ts">
import type { OrderScenarioName } from "../../../../mock/handlers/order-handler";
import type { OrderRole } from "../types";
defineProps<{ scenario: OrderScenarioName; role: OrderRole }>();
const emit = defineEmits<{
  scenario: [OrderScenarioName];
  role: [OrderRole];
}>();
</script>
<template>
  <div class="order-scenario">
    <label
      >场景<select
        :value="scenario"
        @change="
          emit(
            'scenario',
            ($event.target as HTMLSelectElement).value as OrderScenarioName,
          )
        "
      >
        <option value="normal">正常</option>
        <option value="empty">空数据</option>
        <option value="error">服务错误</option>
        <option value="slow">慢响应</option>
        <option value="permission-denied">无权限</option>
        <option value="partial-failure">跨域失败</option>
        <option value="boundary">授权边界</option>
        <option value="concurrent">并发冲突</option>
      </select></label
    ><label
      >角色<select
        :value="role"
        @change="
          emit('role', ($event.target as HTMLSelectElement).value as OrderRole)
        "
      >
        <option value="super-admin">管理员</option>
        <option value="sales-supervisor">销售主管</option>
        <option value="salesperson">业务员</option>
        <option value="warehouse">仓库</option>
        <option value="finance">财务</option>
      </select></label
    >
  </div>
</template>
