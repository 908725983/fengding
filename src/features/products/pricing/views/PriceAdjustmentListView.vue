<script setup lang="ts">
import { reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import PriceSubnav from '../components/PriceSubnav.vue'
import { usePricingStore, type PricingRuntimeScenario } from '../runtime/pricing-store'
import type { AdjustmentStatus, AdjustmentType, PriceAdjustmentQuery } from '../types'

const props = defineProps<{ type: AdjustmentType }>()
const store = usePricingStore()
const { adjustments, loading, error, referenceError, isEmpty, scenario, clock, canWrite } = storeToRefs(store)
const filters = reactive({ number: '', status: '', createdBy: '', customerId: '', createdFrom: '', createdTo: '', effectiveFrom: '', effectiveTo: '' })
const labels: Record<AdjustmentType, { title: string; description: string }> = {
  level: { title: '等级调价单', description: '维护全局 SKU 完整售价矩阵，价格类型仅作为公式锚点。' },
  purchase: { title: '进价调价单', description: '只维护成本价与基准进货价，不改变四级售价。' },
  customer: { title: '客户调价单', description: '指定单个启用客户，生效后优先于分类等级价格。' },
}
const statusLabels: Record<AdjustmentStatus, string> = { pending: '待生效', effective: '已生效', expired: '已失效' }

function iso(value: string, end = false): string | undefined {
  if (!value) return undefined
  return `${value}T${end ? '23:59' : '00:00'}:00+08:00`
}

async function search(): Promise<void> {
  const query: PriceAdjustmentQuery = {
    type: props.type, number: filters.number || undefined, status: (filters.status || undefined) as AdjustmentStatus | undefined,
    createdBy: filters.createdBy || undefined, customerId: filters.customerId || undefined,
    createdFrom: iso(filters.createdFrom), createdTo: iso(filters.createdTo, true), effectiveFrom: iso(filters.effectiveFrom), effectiveTo: iso(filters.effectiveTo, true),
    pageSize: adjustments.value.pageSize as 10 | 30 | 50 | 100,
  }
  await store.applyAdjustmentQuery(query)
}

async function reset(): Promise<void> { Object.assign(filters, { number: '', status: '', createdBy: '', customerId: '', createdFrom: '', createdTo: '', effectiveFrom: '', effectiveTo: '' }); await search() }
async function switchScenario(event: Event): Promise<void> { await store.setScenario((event.target as HTMLSelectElement).value as PricingRuntimeScenario) }
function displayTime(value: string): string { return value.slice(0, 16).replace('T', ' ') }

watch(() => props.type, async () => { await reset() }, { immediate: true })
</script>

<template>
  <section class="price-page" :aria-labelledby="`${type}-price-title`">
    <header class="page-header"><div><p class="eyebrow">PRD-002 · 价格体系与调价</p><h1 :id="`${type}-price-title`">{{ labels[type].title }}</h1><p>{{ labels[type].description }}</p></div><div class="header-tools"><label><span>模拟场景</span><select :value="scenario" @change="switchScenario"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务错误</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option><option value="partial-failure">部分资料失败</option><option value="boundary">生效分钟边界</option></select></label><button v-if="canWrite" class="button primary" disabled title="下一检查点实现表单">新增调价单</button></div></header>
    <PriceSubnav />
    <div class="clock-bar"><strong>模拟时钟</strong><span>{{ displayTime(clock || '---- -- --T--:--') }}</span><small>调价只由此可控时钟生效，不使用真实后台定时器。</small></div>
    <form class="filters" @submit.prevent="search"><label><span>调价单号</span><input v-model="filters.number" placeholder="LPA / PPA / CPA"></label><label><span>状态</span><select v-model="filters.status"><option value="">全部状态</option><option value="pending">待生效</option><option value="effective">已生效</option><option value="expired">已失效</option></select></label><label><span>制单人 ID</span><input v-model="filters.createdBy" placeholder="例如 admin-demo"></label><label v-if="type==='customer'"><span>客户 ID</span><input v-model="filters.customerId" placeholder="例如 customer-1"></label><label><span>生成日期起</span><input v-model="filters.createdFrom" type="date"></label><label><span>生成日期止</span><input v-model="filters.createdTo" type="date"></label><label><span>生效日期起</span><input v-model="filters.effectiveFrom" type="date"></label><label><span>生效日期止</span><input v-model="filters.effectiveTo" type="date"></label><div class="filter-actions"><button class="button" type="button" @click="reset">重置</button><button class="button primary" type="submit">查询</button></div></form>
    <p v-if="referenceError" class="warning" role="status">{{ referenceError }}</p>
    <div v-if="error" class="state error" role="alert"><strong>价格数据加载失败</strong><p>{{ error }}</p><button class="button" type="button" @click="store.reload">重试</button></div>
    <div v-else-if="loading" class="state"><span class="spinner"></span><strong>正在加载调价单…</strong></div>
    <div v-else-if="isEmpty" class="state"><strong>暂无{{ labels[type].title }}</strong><p>当前筛选或模拟场景没有数据。</p></div>
    <template v-else><div class="table-tools"><span>共 {{ adjustments.total }} 张单据</span><button class="button" type="button" @click="store.reload">刷新</button></div><div class="table-wrap"><table><thead><tr><th>单号</th><th v-if="type==='customer'">客户名称</th><th>生成日期</th><th>状态</th><th>是否生效</th><th>制单人</th><th>制单时间</th><th>生效时间</th><th>备注</th><th>明细</th></tr></thead><tbody><tr v-for="item in adjustments.items" :key="item.id"><td class="mono">{{ item.number }}</td><td v-if="type==='customer'">{{ store.customerName(item.customerId) }}</td><td>{{ item.createdAt.slice(0,10) }}</td><td><span class="status" :class="`status-${item.status}`">{{ statusLabels[item.status] }}</span></td><td>{{ item.status==='effective'?'是':'否' }}</td><td>{{ item.createdBy }}</td><td>{{ displayTime(item.createdAt) }}</td><td>{{ displayTime(item.effectiveAt) }}</td><td class="note">{{ item.note || '—' }}</td><td>{{ item.lines.length }} 行</td></tr></tbody></table></div><footer class="pagination"><span>第 {{ adjustments.page }} 页</span><button class="button" :disabled="adjustments.page<=1" type="button" @click="store.setPage(adjustments.page-1)">上一页</button><button class="button" :disabled="adjustments.page*adjustments.pageSize>=adjustments.total" type="button" @click="store.setPage(adjustments.page+1)">下一页</button></footer></template>
  </section>
</template>

<style scoped>
.price-page{max-width:1680px;margin:0 auto}.page-header{display:flex;justify-content:space-between;gap:20px;margin-bottom:14px}.page-header h1{margin:3px 0}.page-header p{margin-bottom:0;color:var(--color-muted)}.header-tools{display:flex;align-items:flex-end;gap:10px}.header-tools label,.filters label{display:grid;gap:4px;color:var(--color-muted);font-size:12px}select,input{min-height:36px;padding:6px 9px;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}.button{min-height:36px;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);cursor:pointer}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.button:disabled{opacity:.5;cursor:not-allowed}.clock-bar{display:flex;align-items:center;gap:12px;padding:10px 15px;color:#53616f;background:#f4faf9;border:1px solid #cfe6e3;border-top:0}.clock-bar span{font-family:"Cascadia Code",Consolas,monospace}.clock-bar small{margin-left:auto;color:var(--color-muted)}.filters{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;padding:14px 16px;background:#fff;border:1px solid var(--color-border);border-top:0}.filter-actions{display:flex;align-items:flex-end;justify-content:flex-end;gap:8px}.warning{padding:9px 12px;color:#8a640d;background:#fff8e8;border:1px solid #eed99b}.state{display:grid;min-height:270px;place-items:center;align-content:center;gap:8px;margin-top:12px;background:#fff;border:1px solid var(--color-border)}.state p{margin:0}.state.error{color:var(--color-danger)}.spinner{width:24px;height:24px;border:3px solid #cfe8e6;border-top-color:var(--color-primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-tools{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 12px;background:#fff;border:1px solid var(--color-border);border-bottom:0}.table-tools span{color:var(--color-muted)}.table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--color-border)}table{width:100%;min-width:1250px;border-collapse:collapse}th,td{height:50px;padding:8px 11px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--color-border)}th{color:#4d5968;font-size:12px;background:var(--color-table-head)}.mono{font-family:"Cascadia Code",Consolas,monospace}.note{max-width:260px;overflow:hidden;text-overflow:ellipsis}.status{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:12px}.status-pending{color:#8a640d;background:#fff7e6}.status-effective{color:var(--color-success);background:var(--color-success-soft)}.status-expired{color:#697586;background:#eef1f5}.pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:11px;background:#fff;border:1px solid var(--color-border);border-top:0}.pagination span{margin-right:8px;color:var(--color-muted)}@media(max-width:1050px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.page-header{display:block}.header-tools{margin-top:12px}}@media(max-width:650px){.filters{grid-template-columns:1fr}.header-tools{align-items:stretch;flex-direction:column}.clock-bar{align-items:flex-start;flex-direction:column}.clock-bar small{margin-left:0}}
</style>
