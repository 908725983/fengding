<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PriceSubnav from '../components/PriceSubnav.vue'
import { usePricingStore } from '../runtime/pricing-store'
import type { AdjustmentStatus, AdjustmentType, PriceAdjustmentDraft, PriceField } from '../types'

const props = defineProps<{ type: AdjustmentType }>()
const route = useRoute(); const router = useRouter(); const store = usePricingStore()
const { selectedAdjustment: item, draftMatrix: matrix, loading, saving, error, canWrite } = storeToRefs(store)
const actionError = ref<string | null>(null)
const listPath = computed(() => `/products/prices/${props.type}-adjustments`)
const labels: Record<AdjustmentType, string> = { level: '等级调价单', purchase: '进价调价单', customer: '客户调价单' }
const statusLabels: Record<AdjustmentStatus, string> = { pending: '待生效', effective: '已生效', expired: '已失效' }
const fieldLabels: Record<PriceField, string> = { costPriceCents: '成本价', basePurchasePriceCents: '基准进货价', baseOrderPriceCents: '基准订货价', tierOnePriceCents: '一批价', tierTwoPriceCents: '二批价', storePriceCents: '门店价', terminalPriceCents: '终端价', minimumSalePriceCents: '最低售价', maximumSalePriceCents: '最高售价' }
const displayFields = computed(() => props.type === 'purchase' ? ['costPriceCents', 'basePurchasePriceCents'] as PriceField[] : ['costPriceCents', 'baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents'] as PriceField[])
function displayTime(value: string): string { return value.slice(0,16).replace('T',' ') }
function money(value: number | null | undefined): string { return value === null || value === undefined ? '—' : `¥ ${(value/100).toFixed(2)}` }
async function remove(): Promise<void> {
  if (!item.value || !window.confirm(`删除待生效调价单 ${item.value.number} 后无法恢复，确定删除吗？`)) return
  actionError.value = null
  try { await store.deleteAdjustment(item.value.id); await router.push(listPath.value) }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '删除失败' }
}
onMounted(async () => {
  await store.loadAdjustment(String(route.params.adjustmentId))
  if (item.value?.type !== props.type) { actionError.value = '调价单类型与当前页面不一致'; return }
  if (item.value) {
    const draft: PriceAdjustmentDraft = { type: item.value.type, customerId: item.value.customerId, formulaAnchor: item.value.formulaAnchor, effectiveAt: item.value.effectiveAt, note: item.value.note, lines: item.value.lines.map(({id:_id,...line})=>line) }
    await store.previewDraft(draft)
  }
})
</script>

<template>
  <section class="detail-page" aria-labelledby="adjustment-title">
    <header class="page-header"><div><RouterLink class="back" :to="listPath">← 返回{{ labels[type] }}</RouterLink><p class="eyebrow">PRD-002 · 价格体系与调价</p><h1 id="adjustment-title">{{ item?.number || labels[type] }}</h1><p v-if="item">{{ labels[type] }} · {{ statusLabels[item.status] }}</p></div><div v-if="item && canWrite && item.status==='pending'" class="actions"><RouterLink class="button" :to="`${listPath}/${item.id}/edit`">编辑待生效单据</RouterLink><button class="button danger" :disabled="saving" type="button" @click="remove">删除</button></div></header>
    <PriceSubnav />
    <div v-if="loading" class="state">正在加载调价单详情…</div><div v-else-if="error || !item" class="state error">{{ error || '调价单不存在' }}</div>
    <template v-else><p v-if="actionError" class="alert">{{ actionError }}</p><section class="summary"><div><span>状态</span><strong class="status" :class="`status-${item.status}`">{{ statusLabels[item.status] }}</strong></div><div v-if="type==='customer'"><span>客户</span><strong>{{ store.customerName(item.customerId) }}</strong></div><div><span>生效时间</span><strong>{{ displayTime(item.effectiveAt) }}</strong></div><div><span>制单人 / 时间</span><strong>{{ item.createdBy }} · {{ displayTime(item.createdAt) }}</strong></div><div><span>公式锚点</span><strong>{{ item.formulaAnchor==='base-order'?'基准订货价':item.formulaAnchor==='tier-one'?'一批价':'—' }}</strong></div><div><span>备注</span><strong>{{ item.note || '—' }}</strong></div></section><section class="card"><header><div><h2>价格明细</h2><p>展示该单据保存值；最低/最高售价仅作为 Service 校验边界。</p></div><span>{{ item.lines.length }} 行</span></header><div class="table-wrap"><table><thead><tr><th>SKU 编码</th><th>商品 / 规格</th><th>单位</th><th v-for="field in displayFields" :key="field">{{ fieldLabels[field] }}</th></tr></thead><tbody><tr v-for="(line,index) in item.lines" :key="line.id"><td class="mono">{{ matrix[index]?.sku.skuCode || line.skuId }}</td><td><strong>{{ matrix[index]?.sku.productName || '商品资料不可用' }}</strong><small>{{ matrix[index]?.sku.specification || '—' }}</small></td><td>{{ line.unitId }}</td><td v-for="field in displayFields" :key="field" class="money">{{ money(line.changes[field]) }}</td></tr></tbody></table></div></section><section class="related"><h2>相关订单</h2><p>数据源未接入。订单关系由后续 ORD provider 提供，本切片不制造关联订单。</p></section></template>
  </section>
</template>

<style scoped>
.detail-page{max-width:1680px;margin:0 auto}.page-header,.actions,.card header{display:flex;align-items:center;justify-content:space-between;gap:10px}.page-header{align-items:flex-end;margin-bottom:14px}.page-header h1{margin:3px 0}.page-header p{margin-bottom:0;color:var(--color-muted)}.back{color:var(--color-primary-strong);text-decoration:none}.button{display:inline-flex;align-items:center;min-height:36px;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);text-decoration:none;cursor:pointer}.button.danger,.alert{color:var(--color-danger)}.state{display:grid;min-height:280px;place-items:center;background:#fff;border:1px solid var(--color-border)}.state.error{color:var(--color-danger)}.alert{padding:10px;background:#fff0f0}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--color-border);border:1px solid var(--color-border);border-top:0}.summary div{display:grid;gap:5px;padding:14px;background:#fff}.summary span,.card p,.related p{color:var(--color-muted);font-size:12px}.status{justify-self:start;padding:3px 8px;border-radius:999px}.status-pending{color:#8a640d;background:#fff7e6}.status-effective{color:var(--color-success);background:var(--color-success-soft)}.status-expired{color:#697586;background:#eef1f5}.card,.related{margin-top:12px;background:#fff;border:1px solid var(--color-border)}.card header,.related{padding:14px}.card h2,.card p,.related h2,.related p{margin:0}.table-wrap{overflow-x:auto}table{width:100%;min-width:1050px;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;white-space:nowrap;border-top:1px solid var(--color-border)}th{font-size:12px;background:var(--color-table-head)}td strong,td small{display:block}td small{color:var(--color-muted)}.mono{font-family:Consolas,monospace}.money{text-align:right;font-variant-numeric:tabular-nums}@media(max-width:850px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.page-header{align-items:flex-start;flex-direction:column}}@media(max-width:560px){.summary{grid-template-columns:1fr}}
</style>
