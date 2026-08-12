<script setup lang="ts">
import type { DistributionRuntimeScenario } from '../runtime/distribution-store'
defineProps<{ modelValue: DistributionRuntimeScenario }>()
const emit = defineEmits<{ 'update:modelValue': [value: DistributionRuntimeScenario] }>()
</script>
<template><label class="scenario"><span>模拟场景</span><select :value="modelValue" @change="emit('update:modelValue',($event.target as HTMLSelectElement).value as DistributionRuntimeScenario)"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务错误</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option><option value="partial-failure">部分资料失败</option><option value="boundary">时间边界</option></select></label></template>
