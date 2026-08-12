<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import PriceSubnav from '../components/PriceSubnav.vue'
import { usePricingStore, type PricingRuntimeScenario } from '../runtime/pricing-store'
import type { PriceField, PriceValues, PricingUnitPriceRow } from '../types'

const store = usePricingStore()
const { unitPrices, loading, saving, error, canWrite, scenario } = storeToRefs(store)
const keyword = ref('')
const editing = ref<PricingUnitPriceRow | null>(null)
const actionError = ref<string | null>(null)
const fields: Array<{ key: PriceField; label: string }> = [
  { key: 'basePurchasePriceCents', label: '基准进货价' }, { key: 'baseOrderPriceCents', label: '基准订货价' },
  { key: 'maximumSalePriceCents', label: '最高售价' }, { key: 'minimumSalePriceCents', label: '最低售价' },
  { key: 'tierOnePriceCents', label: '一批价' }, { key: 'tierTwoPriceCents', label: '二批价' },
  { key: 'storePriceCents', label: '门店价' }, { key: 'terminalPriceCents', label: '终端价' },
]
const form = reactive<Record<PriceField, string>>(Object.fromEntries([
  'costPriceCents', 'basePurchasePriceCents', 'baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents',
  'terminalPriceCents', 'minimumSalePriceCents', 'maximumSalePriceCents',
].map((key) => [key, ''])) as Record<PriceField, string>)
const filtered = computed(() => unitPrices.value.filter((row) => `${row.sku.skuCode} ${row.sku.productName} ${row.sku.specification} ${row.unitName}`.toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase())))

function money(value: number | null): string { return value === null ? '—' : `¥ ${(value / 100).toFixed(2)}` }
function edit(row: PricingUnitPriceRow): void { editing.value = row; actionError.value = null; for (const field of fields) form[field.key] = row.values[field.key] === null ? '' : (row.values[field.key]! / 100).toFixed(2) }
async function save(): Promise<void> {
  if (!editing.value) return
  actionError.value = null
  const prices: Partial<PriceValues> = {}
  for (const field of fields) prices[field.key] = form[field.key] === '' ? null : Math.round(Number(form[field.key]) * 100)
  try { await store.saveUnitOverride(editing.value.sku.skuId, editing.value.unitId, prices); editing.value = null }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '单位价格保存失败' }
}
async function switchScenario(event: Event): Promise<void> { await store.setScenario((event.target as HTMLSelectElement).value as PricingRuntimeScenario) }
watch(() => true, () => store.loadWorkspace('unit-prices'), { immediate: true })
</script>

<template>
  <section class="page" aria-labelledby="unit-price-title">
    <header class="page-header"><div><p class="eyebrow">PRD-002 · 按订单批量调价</p><h1 id="unit-price-title">单位价格</h1><p>显式单位价格优先；未设置时按“1 该单位 = N 基本单位”换算并四舍五入到分。</p></div><label><span>模拟场景</span><select :value="scenario" @change="switchScenario"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务错误</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option></select></label></header>
    <PriceSubnav />
    <div class="toolbar"><input v-model="keyword" aria-label="搜索商品或 SKU" placeholder="搜索商品、SKU、规格或单位"><span>共 {{ filtered.length }} 个 SKU/单位</span><button class="button" type="button" @click="store.loadWorkspace('unit-prices')">刷新</button></div>
    <div v-if="error" class="state error" role="alert"><strong>单位价格加载失败</strong><p>{{ error }}</p><button class="button" @click="store.loadWorkspace('unit-prices')">重试</button></div>
    <div v-else-if="loading" class="state">正在加载单位价格…</div>
    <div v-else class="workspace"><div class="table-wrap"><table><thead><tr><th>商品 / SKU</th><th>规格</th><th>单位 / 换算率</th><th>价格来源</th><th v-for="field in fields" :key="field.key">{{ field.label }}</th><th>操作</th></tr></thead><tbody><tr v-for="row in filtered" :key="`${row.sku.skuId}-${row.unitId}`"><td><strong>{{ row.sku.productName }}</strong><small>{{ row.sku.skuCode }}</small></td><td>{{ row.sku.specification }}</td><td>{{ row.unitName }}<small>1 {{ row.unitName }} = {{ row.conversionRate }} 基本单位</small></td><td><span class="source" :class="{explicit:row.explicitOverride}">{{ row.explicitOverride ? '显式覆盖' : row.conversionRate===1 ? '基本单位' : '换算派生' }}</span></td><td v-for="field in fields" :key="field.key">{{ money(row.values[field.key]) }}</td><td><button v-if="canWrite" class="link" type="button" @click="edit(row)">设置价格</button><span v-else>只读</span></td></tr></tbody></table></div><aside><h2>相关订单</h2><p>数据源未接入。订单关系由后续 ORD provider 提供，本切片不制造关联订单。</p><h2>规则说明</h2><p>显式覆盖按 SKU + 销售单位保存；售价必须落在同单位换算后的最低/最高售价边界内。</p></aside></div>
    <div v-if="editing" class="mask"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="unit-dialog-title"><header><div><h2 id="unit-dialog-title">设置单位价格</h2><p>{{ editing.sku.skuCode }} · {{ editing.unitName }}</p></div><button aria-label="关闭" @click="editing=null">×</button></header><p class="hint">当前展示值可能来自换算；保存后成为显式覆盖，并写入历史调价。</p><div class="form-grid"><label v-for="field in fields" :key="field.key"><span>{{ field.label }}（元）</span><input v-model="form[field.key]" :aria-label="field.label" type="number" min="0" step="0.01"></label></div><p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p><footer><button class="button" @click="editing=null">取消</button><button class="button primary" :disabled="saving" @click="save">保存显式价格</button></footer></section></div>
  </section>
</template>

<style scoped>
.page{max-width:1680px;margin:0 auto}.page-header{display:flex;justify-content:space-between;gap:20px;margin-bottom:14px}.page-header h1{margin:3px 0}.page-header p{margin:0;color:var(--color-muted)}label{display:grid;gap:5px;color:var(--color-muted);font-size:12px}input,select{min-height:36px;padding:7px 10px;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}.toolbar{display:flex;gap:10px;align-items:center;padding:13px;background:#fff;border:1px solid var(--color-border);border-top:0}.toolbar input{width:330px}.toolbar span{margin-left:auto;color:var(--color-muted)}.button{min-height:36px;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);cursor:pointer}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;margin-top:12px}.table-wrap{overflow:auto;background:#fff;border:1px solid var(--color-border)}table{min-width:1600px;width:100%;border-collapse:collapse}th,td{height:54px;padding:8px 11px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--color-border)}th{font-size:12px;background:var(--color-table-head)}td small{display:block;color:var(--color-muted)}aside{padding:16px;background:#fff;border:1px solid var(--color-border)}aside h2{font-size:15px}aside p{color:var(--color-muted);line-height:1.7}.source{padding:3px 8px;color:#526070;background:#eef1f5;border-radius:999px}.source.explicit{color:#087f75;background:#e9f8f6}.link{color:var(--color-primary);background:none;border:0;cursor:pointer}.state{min-height:260px;margin-top:12px;padding:50px;text-align:center;background:#fff;border:1px solid var(--color-border)}.state.error,.error-text{color:var(--color-danger)}.mask{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#14223599}.dialog{width:min(760px,100%);padding:20px;background:#fff;border-radius:8px;box-shadow:0 20px 60px #14223555}.dialog header,.dialog footer{display:flex;justify-content:space-between;align-items:center;gap:10px}.dialog h2,.dialog p{margin:0}.dialog header>button{font-size:24px;background:none;border:0}.hint{padding:10px;margin:14px 0!important;color:#53616f;background:#f4faf9}.form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dialog footer{justify-content:flex-end;margin-top:18px}@media(max-width:900px){.workspace{grid-template-columns:1fr}.page-header{display:block}.form-grid{grid-template-columns:1fr}}
</style>
