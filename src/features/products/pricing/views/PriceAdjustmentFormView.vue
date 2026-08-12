<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import PriceSubnav from '../components/PriceSubnav.vue'
import { validatePriceAdjustmentDraft } from '../schemas/pricing-schema'
import { parsePricingCsv, pricingCsvTemplate, type PricingCsvPreview } from '../services/pricing-csv'
import { usePricingStore } from '../runtime/pricing-store'
import type { AdjustmentType, FormulaAnchor, FormulaMode, PriceAdjustmentDraft, PriceField, PriceValues } from '../types'

const props = defineProps<{ type: AdjustmentType }>()
const route = useRoute(); const router = useRouter(); const store = usePricingStore()
const { formOptions, loading, saving, error, referenceError } = storeToRefs(store)
const adjustmentId = computed(() => typeof route.params.adjustmentId === 'string' ? route.params.adjustmentId : null)
const isEdit = computed(() => Boolean(adjustmentId.value))
const committed = ref(false); const pageError = ref<string | null>(null); const selectedSkuId = ref('')
const csvOpen = ref(false); const csvSource = ref(''); const csvPreview = ref<PricingCsvPreview | null>(null)
const formula = reactive<{ field: PriceField; mode: FormulaMode; operand: string }>({ field: 'tierOnePriceCents', mode: 'set', operand: '' })
const draft = reactive<PriceAdjustmentDraft>({ type: props.type, customerId: null, formulaAnchor: props.type === 'purchase' ? null : 'base-order', effectiveAt: '', note: null, lines: [] })

const allFields = [
  ['costPriceCents', '成本价'], ['basePurchasePriceCents', '基准进货价'], ['baseOrderPriceCents', '基准订货价'],
  ['tierOnePriceCents', '一批价'], ['tierTwoPriceCents', '二批价'], ['storePriceCents', '门店价'], ['terminalPriceCents', '终端价'],
] as const satisfies ReadonlyArray<readonly [PriceField, string]>
const editableFields = computed(() => props.type === 'purchase' ? allFields.slice(0, 2) : allFields.filter(([field]) => field !== 'basePurchasePriceCents'))
const listPath = computed(() => `/products/prices/${props.type}-adjustments`)
const issues = computed(() => validatePriceAdjustmentDraft(draft))
const dirty = computed(() => draft.lines.length > 0 || Boolean(draft.effectiveAt || draft.note || draft.customerId))

function assignDraft(source: PriceAdjustmentDraft): void { Object.assign(draft, JSON.parse(JSON.stringify(source))) }
function money(value: number | null | undefined): string { return value === null || value === undefined ? '' : (value / 100).toFixed(2) }
function setMoney(lineIndex: number, field: PriceField, event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim()
  draft.lines[lineIndex]!.changes[field] = value === '' ? null : Math.round(Number(value) * 100)
}
function addSku(): void {
  const sku = formOptions.value.skus.find((item) => item.skuId === selectedSkuId.value)
  if (!sku || draft.lines.some((line) => line.skuId === sku.skuId)) return
  const matrix = formOptions.value.matrices[sku.skuId]
  const changes = Object.fromEntries(editableFields.value.map(([field]) => [field, matrix?.[field] ?? null])) as Partial<PriceValues>
  draft.lines.push({ skuId: sku.skuId, unitId: sku.baseUnitId, changes }); selectedSkuId.value = ''
}
function removeLine(index: number): void { draft.lines.splice(index, 1) }
function skuName(id: string): string { const sku = formOptions.value.skus.find((item) => item.skuId === id); return sku ? `${sku.productName} · ${sku.specification}` : id }
function skuCode(id: string): string { return formOptions.value.skus.find((item) => item.skuId === id)?.skuCode ?? id }

async function applyFormula(): Promise<void> {
  pageError.value = null
  const operand = Number(formula.operand) * (formula.mode.includes('percent') ? 1 : 100)
  try { assignDraft(await store.calculateDraft({ draft, field: formula.field, mode: formula.mode, operand })) }
  catch (caught) { pageError.value = caught instanceof Error ? caught.message : '公式计算失败' }
}

function openCsv(): void { csvSource.value = pricingCsvTemplate(props.type); csvPreview.value = null; csvOpen.value = true }
function previewCsv(): void {
  csvPreview.value = parsePricingCsv(csvSource.value, { type: props.type, customerId: draft.customerId, formulaAnchor: draft.formulaAnchor,
    effectiveAt: draft.effectiveAt, note: draft.note, skus: formOptions.value.skus.map((item) => ({ skuId: item.skuId, skuCode: item.skuCode, baseUnitId: item.baseUnitId })) })
}
function applyCsv(): void { if (csvPreview.value?.draft) { assignDraft(csvPreview.value.draft); csvOpen.value = false } }

async function save(): Promise<void> {
  pageError.value = null
  if (issues.value.length) { pageError.value = issues.value.map((item) => `${item.path}：${item.message}`).join('；'); return }
  try {
    const saved = adjustmentId.value ? await store.updateAdjustment(adjustmentId.value, draft) : await store.createAdjustment(draft)
    committed.value = true; await router.push(`${listPath.value}/${saved.id}`)
  } catch (caught) { pageError.value = caught instanceof Error ? caught.message : '调价单保存失败' }
}

onMounted(async () => {
  await store.loadFormOptions()
  if (adjustmentId.value) {
    await store.loadAdjustment(adjustmentId.value)
    if (store.selectedAdjustment && store.selectedAdjustment.type !== props.type) pageError.value = '调价单类型与当前页面不一致'
    else if (store.selectedAdjustment?.status !== 'pending') { committed.value = true; await router.replace(`${listPath.value}/${store.selectedAdjustment?.id}`); return }
    else if (store.selectedAdjustment) assignDraft({ type: store.selectedAdjustment.type, customerId: store.selectedAdjustment.customerId,
        formulaAnchor: store.selectedAdjustment.formulaAnchor, effectiveAt: store.selectedAdjustment.effectiveAt, note: store.selectedAdjustment.note,
        lines: store.selectedAdjustment.lines.map(({ id: _id, ...line }) => line) })
  }
  if (!formula.field || !editableFields.value.some(([field]) => field === formula.field)) formula.field = editableFields.value[0]![0]
})
onBeforeRouteLeave(() => committed.value || !dirty.value || window.confirm('离开后未保存的调价内容将丢失，确定离开吗？'))
</script>

<template>
  <section class="form-page" aria-labelledby="price-form-title">
    <header class="page-header"><div><RouterLink class="back" :to="listPath">← 返回{{ type==='level'?'等级':type==='purchase'?'进价':'客户' }}调价</RouterLink><p class="eyebrow">PRD-002 · 价格体系与调价</p><h1 id="price-form-title">{{ isEdit?'编辑':'新增' }}{{ type==='level'?'等级':type==='purchase'?'进价':'客户' }}调价单</h1><p>金额按元录入、按整数分保存；整张单据要么全部成功，要么全部回滚。</p></div><div class="actions"><button class="button" type="button" @click="openCsv">UTF-8 CSV 导入</button><button class="button primary" :disabled="saving || loading" type="button" @click="save">{{ saving?'保存中…':'保存调价单' }}</button></div></header>
    <PriceSubnav />
    <div v-if="loading" class="state">正在加载表单资料…</div><div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else>
      <p v-if="referenceError" class="warning">{{ referenceError }}</p><p v-if="pageError" class="warning error" role="alert">{{ pageError }}</p>
      <section class="card head-fields"><label v-if="type==='customer'"><span>客户 *</span><select v-model="draft.customerId"><option :value="null">请选择启用客户</option><option v-for="customer in formOptions.customers" :key="customer.customerId" :value="customer.customerId">{{ customer.customerName }}</option></select></label><label><span>生效时间 *</span><input :value="draft.effectiveAt.slice(0,16)" type="datetime-local" :min="formOptions.clock.slice(0,16)" @input="draft.effectiveAt = ($event.target as HTMLInputElement).value ? `${($event.target as HTMLInputElement).value}:00+08:00` : ''"></label><label v-if="type!=='purchase'"><span>价格类型（公式锚点）*</span><select v-model="draft.formulaAnchor"><option value="base-order">基准订货价</option><option value="tier-one">一批价</option></select></label><label class="note"><span>备注</span><textarea v-model="draft.note" maxlength="500" rows="2"></textarea></label></section>
      <section class="card formula"><div><strong>批量公式</strong><small>以当前显示值为基数，结果四舍五入到分并执行售价上下限校验。</small></div><select v-model="formula.field" aria-label="公式目标字段"><option v-for="([field,label]) in editableFields" :key="field" :value="field">{{ label }}</option></select><select v-model="formula.mode" aria-label="公式类型"><option value="set">直接设值</option><option value="increase-fixed">固定额增加</option><option value="decrease-fixed">固定额减少</option><option value="increase-percent">百分比增加</option><option value="decrease-percent">百分比减少</option></select><input v-model="formula.operand" aria-label="公式参数" type="number" min="0" step="0.01" :placeholder="formula.mode.includes('percent')?'百分比':'金额（元）'"><button class="button" :disabled="!draft.lines.length || formula.operand===''" type="button" @click="applyFormula">应用到全部行</button></section>
      <section class="card matrix-card"><header><div><h2>价格矩阵</h2><p>{{ type==='purchase'?'进价调价只允许成本价和基准进货价。':'完整矩阵直接编辑；最低/最高售价来自 SKU 价格资料并由 Service 校验。' }}</p></div><div class="add-sku"><select v-model="selectedSkuId" aria-label="选择上架 SKU"><option value="">选择上架 SKU</option><option v-for="sku in formOptions.skus" :key="sku.skuId" :value="sku.skuId" :disabled="draft.lines.some(line=>line.skuId===sku.skuId)">{{ sku.skuCode }} · {{ sku.productName }} · {{ sku.specification }}</option></select><button class="button" :disabled="!selectedSkuId" type="button" @click="addSku">加入明细</button></div></header><div class="table-wrap"><table><thead><tr><th>SKU / 商品</th><th>规格 / 单位</th><th v-for="([field,label]) in editableFields" :key="field">{{ label }}（元）</th><th>操作</th></tr></thead><tbody><tr v-for="(line,index) in draft.lines" :key="`${line.skuId}-${line.unitId}`"><td><strong class="mono">{{ skuCode(line.skuId) }}</strong><small>{{ skuName(line.skuId).split(' · ')[0] }}</small></td><td>{{ skuName(line.skuId).split(' · ').slice(1).join(' · ') }}<small>{{ line.unitId }}</small></td><td v-for="([field]) in editableFields" :key="field"><input class="money" type="number" min="0" step="0.01" :aria-label="`${skuCode(line.skuId)} ${field}`" :value="money(line.changes[field])" @input="setMoney(index,field,$event)"></td><td><button class="danger" type="button" @click="removeLine(index)">移除</button></td></tr><tr v-if="!draft.lines.length"><td :colspan="editableFields.length+3" class="empty">请先选择至少一个上架 SKU，或通过 CSV 导入。</td></tr></tbody></table></div></section>
    </template>
    <div v-if="csvOpen" class="mask" role="dialog" aria-modal="true" aria-labelledby="csv-title"><section class="dialog"><header><div><h2 id="csv-title">UTF-8 CSV 导入（原型模拟）</h2><p>先逐行预览；任一行错误则不能应用到表单，最终保存仍整单原子提交。</p></div><button type="button" aria-label="关闭导入" @click="csvOpen=false">×</button></header><textarea v-model="csvSource" rows="9" aria-label="CSV 内容"></textarea><ul v-if="csvPreview?.errors.length" class="errors"><li v-for="item in csvPreview.errors" :key="item">{{ item }}</li></ul><p v-else-if="csvPreview" class="success">预览通过：{{ csvPreview.rows }} 行。</p><footer><button class="button" type="button" @click="csvOpen=false">取消</button><button class="button" type="button" @click="previewCsv">预览校验</button><button class="button primary" :disabled="!csvPreview?.draft" type="button" @click="applyCsv">应用到表单</button></footer></section></div>
  </section>
</template>

<style scoped>
.form-page{max-width:1680px;margin:0 auto}.page-header,.actions,.card header,.add-sku,.formula,.dialog header,.dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.page-header{align-items:flex-end;margin-bottom:14px}.page-header h1{margin:3px 0}.page-header p{margin-bottom:0;color:var(--color-muted)}.back{color:var(--color-primary-strong);text-decoration:none}.button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);cursor:pointer}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.button:disabled{opacity:.5}.card{padding:15px;background:#fff;border:1px solid var(--color-border)}.head-fields{display:grid;grid-template-columns:220px 230px 210px minmax(240px,1fr);gap:13px;border-top:0}.card label{display:grid;gap:4px;color:var(--color-muted);font-size:12px}.note{grid-column:auto}.card input,.card select,.card textarea,.dialog textarea{min-height:36px;padding:7px 9px;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}.formula{justify-content:flex-start;margin-top:12px}.formula div{margin-right:auto}.formula strong,.formula small{display:block}.formula small{color:var(--color-muted)}.matrix-card{margin-top:12px;padding:0}.matrix-card header{padding:14px}.matrix-card h2,.matrix-card p{margin:0}.matrix-card p{color:var(--color-muted);font-size:12px}.table-wrap{overflow-x:auto}table{width:100%;min-width:1120px;border-collapse:collapse}th,td{padding:9px 11px;text-align:left;white-space:nowrap;border-top:1px solid var(--color-border)}th{color:#4d5968;font-size:12px;background:var(--color-table-head)}td strong,td small{display:block}td small{color:var(--color-muted)}td input.money{width:115px;text-align:right}.mono{font-family:Consolas,monospace}.danger{color:var(--color-danger);background:transparent;border:0;cursor:pointer}.empty{height:120px;text-align:center;color:var(--color-muted)}.state{display:grid;min-height:260px;place-items:center;background:#fff;border:1px solid var(--color-border)}.warning{padding:10px;color:#8a640d;background:#fff8e8;border:1px solid #eed99b}.warning.error,.state.error,.errors{color:var(--color-danger)}.mask{position:fixed;z-index:30;inset:0;display:grid;place-items:center;padding:24px;background:rgba(20,34,46,.46)}.dialog{display:grid;width:min(760px,100%);gap:12px;padding:20px;background:#fff;border-radius:9px}.dialog h2,.dialog p{margin:0}.dialog header>button{font-size:24px;background:transparent;border:0}.dialog textarea{font-family:Consolas,monospace}.dialog footer{justify-content:flex-end}.success{color:var(--color-success)}@media(max-width:1100px){.head-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.formula{align-items:stretch;flex-wrap:wrap}.page-header{align-items:flex-start;flex-direction:column}}@media(max-width:650px){.head-fields{grid-template-columns:1fr}.actions,.add-sku{align-items:stretch;flex-direction:column}}
</style>
