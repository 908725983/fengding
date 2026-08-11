<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRouter } from 'vue-router'
import { useProductStore, type ProductRuntimeScenario } from '../runtime/product-store'
import type { ProductListQuery, ProductStatus } from '../types'
import { parseProductCsv, productCsvTemplate, productImportHeaders, type ProductCsvPreview } from '../services/product-csv'

const router = useRouter()
const store = useProductStore()
const { result, references, loading, saving, error, referenceError, isEmpty, scenario, query, canWrite } = storeToRefs(store)
const showMore = ref(false)
const selectedIds = ref<string[]>([])
const actionError = ref<string | null>(null)
const importOpen = ref(false)
const importSource = ref(productCsvTemplate())
const importPreview = ref<ProductCsvPreview | null>(null)
const importSuccess = ref<string | null>(null)
const filters = reactive({ categoryId: '', brandId: '', status: '', keyword: '', tagIds: [] as string[], priceMin: '', priceMax: '' })
const statusLabels = { draft: '草稿', 'on-sale': '上架', 'off-sale': '下架' } as const

const allCurrentSelected = computed(() => result.value.items.length > 0 && result.value.items.every((row) => selectedIds.value.includes(row.productId)))

function toggleTag(id: string): void {
  const index = filters.tagIds.indexOf(id)
  if (index >= 0) filters.tagIds.splice(index, 1); else filters.tagIds.push(id)
}

function toggleRow(id: string): void {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1); else selectedIds.value.push(id)
}

function togglePage(): void {
  const ids = [...new Set(result.value.items.map((row) => row.productId))]
  if (allCurrentSelected.value) selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
  else selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
}

function buildQuery(): ProductListQuery {
  return {
    view: query.value.view ?? 'spu', categoryId: filters.categoryId || undefined, brandId: filters.brandId || undefined,
    status: (filters.status || undefined) as ProductStatus | undefined, keyword: filters.keyword || undefined,
    tagIds: filters.tagIds.length ? [...filters.tagIds] : undefined,
    priceMinCents: filters.priceMin === '' ? undefined : Math.round(Number(filters.priceMin) * 100),
    priceMaxCents: filters.priceMax === '' ? undefined : Math.round(Number(filters.priceMax) * 100),
    pageSize: result.value.pageSize as 10 | 30 | 50 | 100,
  }
}

async function search(): Promise<void> {
  const next = buildQuery()
  await router.replace({ query: Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])) })
  await store.applyQuery(next)
  selectedIds.value = []
}

async function reset(): Promise<void> {
  Object.assign(filters, { categoryId: '', brandId: '', status: '', keyword: '', tagIds: [], priceMin: '', priceMax: '' })
  await router.replace({ query: {} }); selectedIds.value = []; await store.resetQuery()
}

async function switchView(view: 'spu' | 'sku'): Promise<void> {
  await store.setView(view); selectedIds.value = []
}

async function switchScenario(event: Event): Promise<void> {
  await store.setScenario((event.target as HTMLSelectElement).value as ProductRuntimeScenario); selectedIds.value = []
}

async function batchStatus(target: ProductStatus): Promise<void> {
  actionError.value = null
  try { await store.batchChangeStatus(selectedIds.value, target); selectedIds.value = [] }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '批量操作失败' }
}

function exportCsv(): void {
  actionError.value = null
  try {
    const blob = new Blob([store.exportCsv(selectedIds.value)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'prototype-products.csv'; link.click(); URL.revokeObjectURL(url)
  } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '导出失败' }
}

function showImport(): void { importSource.value = productCsvTemplate(); importPreview.value = null; importSuccess.value = null; importOpen.value = true }
function previewImport(): void { importPreview.value = parseProductCsv(importSource.value, references.value); importSuccess.value = null }
async function submitImport(): Promise<void> {
  if (!importPreview.value || importPreview.value.errors.length || !importPreview.value.drafts.length) return
  actionError.value = null
  try { const result = await store.importProducts(importPreview.value.drafts); importSuccess.value = `已原子导入 ${result.count} 个商品`; importPreview.value = null }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '整批导入失败'; importSuccess.value = null }
}
async function readImportFile(event: Event): Promise<void> { const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;importSource.value=await file.text();importPreview.value=null }

function money(min: number | null, max: number | null): string {
  if (min === null) return '—'
  if (max === null || min === max) return `¥ ${(min / 100).toFixed(2)}`
  return `¥ ${(min / 100).toFixed(2)}～${(max / 100).toFixed(2)}`
}

onMounted(() => store.load())
</script>

<template>
  <section class="product-page" aria-labelledby="product-title">
    <header class="product-header">
      <div><p class="eyebrow">PRD-001 · 商品、SKU 与多单位</p><h1 id="product-title">商品列表</h1><p>统一管理 SPU、SKU、基础价格资料和四维场景单位。最终客户价格与授权属于后续切片。</p></div>
      <div class="header-actions">
        <label class="scenario"><span>模拟场景</span><select :value="scenario" @change="switchScenario"><option value="normal">正常</option><option value="empty">空数据</option><option value="error">服务错误</option><option value="slow">慢响应</option><option value="permission-denied">无权限</option><option value="partial-failure">部分资料失败</option></select></label>
        <RouterLink v-if="canWrite" class="button primary link" to="/products/new">新增商品</RouterLink>
      </div>
    </header>

    <div class="product-subnav"><strong>商品管理</strong><span>价格管理 · PRD-002 规划中</span><span>商品授权 · PRD-003 规划中</span><span>辅助资料 · PRD-005 规划中</span></div>

    <div v-if="importOpen" class="import-mask" role="dialog" aria-modal="true" aria-labelledby="import-title"><section class="import-dialog"><header><div><h2 id="import-title">UTF-8 CSV 导入</h2><p>先逐行预览；任何错误或编码冲突都会拒绝整批数据。</p></div><button type="button" aria-label="关闭导入" @click="importOpen=false">×</button></header><label><span>选择 CSV 文件</span><input type="file" accept=".csv,text/csv" @change="readImportFile"></label><label><span>CSV 内容（原型可直接编辑）</span><textarea v-model="importSource" rows="9"></textarea></label><p>必需列：{{ productImportHeaders.join('、') }}</p><ul v-if="importPreview?.errors.length" class="import-errors"><li v-for="issue in importPreview.errors" :key="issue">{{issue}}</li></ul><p v-else-if="importPreview" class="import-ok">预览通过：{{importPreview.rows}} 行、{{importPreview.drafts.length}} 个商品，提交后整体成功或整体回滚。</p><p v-if="importSuccess" class="import-ok">{{importSuccess}}</p><footer><button class="button" type="button" @click="importOpen=false">取消</button><button class="button" type="button" @click="previewImport">预览校验</button><button class="button primary" type="button" :disabled="!importPreview||Boolean(importPreview.errors.length)||saving" @click="submitImport">确认整批导入</button></footer></section></div>

    <div class="workspace-grid">
      <aside class="category-panel">
        <div class="panel-title"><strong>商品分类</strong><span>含后代</span></div>
        <button :class="{ active: !filters.categoryId }" type="button" @click="filters.categoryId = ''; search()">全部商品</button>
        <button v-for="category in references.categories" :key="category.id" :class="{ active: filters.categoryId === category.id, child: category.parentId }" type="button" @click="filters.categoryId = category.id; search()">{{ category.parentId ? '└ ' : '' }}{{ category.name }}<small v-if="category.status === 'inactive'">停用</small></button>
      </aside>

      <main class="product-main">
        <form class="filter-panel" @submit.prevent="search">
          <div class="filter-grid">
            <label><span>商品品牌</span><select v-model="filters.brandId" :disabled="Boolean(referenceError)"><option value="">全部品牌</option><option v-for="brand in references.brands" :key="brand.id" :value="brand.id">{{ brand.name }}</option></select></label>
            <label><span>商品状态</span><select v-model="filters.status"><option value="">全部状态</option><option value="draft">草稿</option><option value="on-sale">上架</option><option value="off-sale">下架</option></select></label>
            <label class="keyword"><span>关键词</span><input v-model="filters.keyword" type="search" placeholder="SPU / 商品名称 / SKU / 条码"></label>
          </div>
          <div v-if="showMore" class="more-grid">
            <fieldset><legend>商品标签（任一命中）</legend><button v-for="tag in references.tags" :key="tag.id" type="button" :class="{ chosen: filters.tagIds.includes(tag.id) }" @click="toggleTag(tag.id)">{{ tag.name }}</button></fieldset>
            <label><span>最低基准订货价（元）</span><input v-model="filters.priceMin" type="number" min="0" step="0.01"></label>
            <label><span>最高基准订货价（元）</span><input v-model="filters.priceMax" type="number" min="0" step="0.01"></label>
            <label><span>供应商</span><input disabled placeholder="数据源未接入"></label>
          </div>
          <div class="filter-actions"><button class="text-button" type="button" @click="showMore = !showMore">{{ showMore ? '收起筛选' : '更多筛选' }}</button><div><button class="button" type="button" @click="reset">重置</button><button class="button primary" type="submit">查询</button></div></div>
        </form>

        <p v-if="referenceError" class="partial-warning" role="status">{{ referenceError }} <button type="button" @click="store.load">重试资料</button></p>
        <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
        <div v-if="error" class="state error" role="alert"><strong>商品数据加载失败</strong><p>{{ error }}</p><button class="button" type="button" @click="store.load">重试</button></div>
        <div v-else-if="loading" class="state"><span class="spinner"></span><strong>正在加载商品数据…</strong></div>
        <div v-else-if="isEmpty" class="state"><strong>暂无商品数据</strong><p>当前筛选或模拟场景没有商品。</p><RouterLink v-if="canWrite" class="button primary link" to="/products/new">新增商品</RouterLink></div>

        <template v-else>
          <div class="table-toolbar">
            <div class="view-toggle"><button :class="{ active: query.view !== 'sku' }" type="button" @click="switchView('spu')">按 SPU 展示</button><button :class="{ active: query.view === 'sku' }" type="button" @click="switchView('sku')">按 SKU 展示</button></div>
            <div class="toolbar-actions"><button class="button" type="button" @click="store.load">刷新</button><button v-if="canWrite" class="button" type="button" @click="showImport">导入</button><button v-if="canWrite" class="button" type="button" @click="exportCsv">导出</button></div>
          </div>
          <div v-if="selectedIds.length && canWrite" class="batch-bar"><strong>已选 {{ selectedIds.length }} 个商品</strong><button type="button" @click="batchStatus('on-sale')">批量上架</button><button type="button" @click="batchStatus('off-sale')">批量下架</button><button type="button" @click="exportCsv">批量导出</button><span>任一不合法则整体拒绝</span></div>
          <div class="table-wrap"><table><thead><tr><th><input type="checkbox" :checked="allCurrentSelected" aria-label="选择当前页" @change="togglePage"></th><th>图片</th><th>名称 / 规格</th><th>编码 / 条码</th><th>单位</th><th>基准进货价</th><th>市场价</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
            <tr v-for="row in result.items" :key="row.rowId"><td><input type="checkbox" :checked="selectedIds.includes(row.productId)" :aria-label="`选择${row.name}`" @change="toggleRow(row.productId)"></td><td><span class="image-placeholder">图</span></td><td><RouterLink :to="`/products/${row.productId}`"><strong>{{ row.name }}</strong></RouterLink><small>{{ row.specification ?? `${row.skuCount} 个 SKU` }}</small></td><td><span class="mono">{{ row.code }}</span><small>{{ row.barcode ?? '—' }}</small></td><td>{{ row.unitName }}</td><td class="money">{{ money(row.basePurchasePriceMinCents, row.basePurchasePriceMaxCents) }}</td><td class="money">{{ money(row.baseOrderPriceMinCents, row.baseOrderPriceMaxCents) }}</td><td><span class="status" :class="`status-${row.status}`">{{ statusLabels[row.status] }}</span></td><td>{{ row.createdAt.slice(0, 16).replace('T', ' ') }}</td><td><RouterLink :to="`/products/${row.productId}`">详情</RouterLink><RouterLink v-if="canWrite" :to="`/products/${row.productId}/edit${row.skuId ? `?sku=${row.skuId}` : ''}`">编辑</RouterLink></td></tr>
          </tbody></table></div>
          <footer class="pagination"><span>共 {{ result.total }} 条 · 第 {{ result.page }} 页</span><button class="button" :disabled="result.page <= 1" type="button" @click="store.setPage(result.page - 1)">上一页</button><button class="button" :disabled="result.page * result.pageSize >= result.total" type="button" @click="store.setPage(result.page + 1)">下一页</button></footer>
        </template>
      </main>
    </div>
  </section>
</template>

<style scoped>
.product-page{max-width:1680px;margin:0 auto}.product-header{display:flex;gap:20px;align-items:flex-start;justify-content:space-between;margin-bottom:14px}.product-header h1{margin:3px 0}.product-header p{margin-bottom:0;color:var(--color-muted)}.header-actions{display:flex;gap:10px;align-items:flex-end}.scenario{display:grid;gap:4px;color:var(--color-muted);font-size:12px}.product-subnav{display:flex;gap:24px;min-height:44px;align-items:center;padding:0 16px;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md) var(--radius-md) 0 0}.product-subnav strong{color:var(--color-primary-strong);border-bottom:2px solid var(--color-primary);align-self:stretch;display:flex;align-items:center}.product-subnav span{color:var(--color-muted);font-size:12px}.workspace-grid{display:grid;grid-template-columns:190px minmax(0,1fr)}.category-panel{padding:14px;background:#fff;border:1px solid var(--color-border);border-top:0}.panel-title{display:flex;justify-content:space-between;margin-bottom:10px}.panel-title span{color:var(--color-muted);font-size:11px}.category-panel button{display:flex;width:100%;min-height:34px;align-items:center;justify-content:space-between;padding:0 8px;color:#566273;cursor:pointer;background:transparent;border:0;border-radius:5px;text-align:left}.category-panel button:hover,.category-panel button.active{color:var(--color-primary-strong);background:var(--color-primary-soft)}.category-panel button.child{padding-left:20px}.category-panel small{color:#999}.product-main{min-width:0}.filter-panel{padding:14px 16px;background:#fff;border-bottom:1px solid var(--color-border)}.filter-grid{display:grid;grid-template-columns:180px 160px minmax(250px,1fr);gap:12px}.filter-panel label{display:grid;gap:4px;color:var(--color-muted);font-size:12px}select,input{min-height:36px;padding:6px 9px;color:var(--color-text);background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}.more-grid{display:grid;grid-template-columns:minmax(250px,1fr) 180px 180px 180px;gap:12px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--color-border)}.more-grid fieldset{padding:7px;border:1px solid var(--color-border);border-radius:5px}.more-grid legend{color:var(--color-muted);font-size:12px}.more-grid fieldset button{margin:2px;padding:3px 8px;background:#fff;border:1px solid var(--color-border);border-radius:999px}.more-grid fieldset button.chosen{color:var(--color-primary-strong);background:var(--color-primary-soft)}.filter-actions,.table-toolbar,.pagination{display:flex;align-items:center;justify-content:space-between}.filter-actions{padding-top:12px}.button{min-height:36px;padding:0 13px;color:#4d5968;cursor:pointer;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}.button+.button{margin-left:7px}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.button:disabled{opacity:.5}.link{display:inline-flex;align-items:center;text-decoration:none}.text-button{color:var(--color-primary-strong);background:transparent;border:0;cursor:pointer}.partial-warning,.action-error{margin:10px 0 0;padding:9px 12px}.partial-warning{color:#8a640d;background:#fff8e8;border:1px solid #eed99b}.partial-warning button{color:inherit;background:transparent;border:0;text-decoration:underline}.action-error{color:var(--color-danger);background:#fff0f0}.state{display:grid;min-height:270px;place-items:center;align-content:center;gap:8px;margin-top:12px;background:#fff;border:1px solid var(--color-border)}.state p{margin:0}.state.error{color:var(--color-danger)}.spinner{width:24px;height:24px;border:3px solid #cfe8e6;border-top-color:var(--color-primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.table-toolbar{margin-top:12px;padding:10px 12px;background:#fff;border:1px solid var(--color-border);border-bottom:0}.view-toggle{display:flex;padding:2px;background:#eef2f5;border-radius:6px}.view-toggle button{min-height:30px;padding:0 12px;color:var(--color-muted);background:transparent;border:0;border-radius:5px}.view-toggle button.active{color:var(--color-primary-strong);font-weight:700;background:#fff}.batch-bar{display:flex;gap:12px;align-items:center;padding:9px 12px;color:#49676a;background:var(--color-primary-soft);border:1px solid #c6e8e5}.batch-bar button{color:var(--color-primary-strong);background:transparent;border:0}.batch-bar span{margin-left:auto;font-size:12px}.table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--color-border)}table{width:100%;min-width:1250px;border-collapse:collapse}th,td{height:50px;padding:8px 11px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--color-border)}th{color:#4d5968;font-size:12px;background:var(--color-table-head)}td a{margin-right:10px;color:var(--color-primary-strong);text-decoration:none}td strong,td small{display:block}td small{margin-top:2px;color:var(--color-muted)}.image-placeholder{display:grid;width:34px;height:34px;place-items:center;color:#8793a2;background:#eef2f5;border-radius:5px}.mono{font-family:"Cascadia Code",Consolas,monospace}.money{text-align:right;font-variant-numeric:tabular-nums}.status{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:12px}.status-draft{color:#697586;background:#eef1f5}.status-on-sale{color:var(--color-success);background:var(--color-success-soft)}.status-off-sale{color:var(--color-warning);background:#fff7e6}.pagination{justify-content:flex-end;gap:8px;padding:11px;background:#fff;border:1px solid var(--color-border);border-top:0}.pagination span{margin-right:8px;color:var(--color-muted)}
.import-mask{position:fixed;z-index:30;inset:0;display:grid;place-items:center;padding:24px;background:rgba(20,34,46,.46)}.import-dialog{display:grid;width:min(760px,100%);gap:13px;padding:20px;background:#fff;border-radius:9px;box-shadow:0 18px 60px rgba(0,0,0,.2)}.import-dialog header,.import-dialog footer{display:flex;align-items:flex-start;justify-content:space-between}.import-dialog h2,.import-dialog p{margin:0}.import-dialog header>button{font-size:24px;background:transparent;border:0}.import-dialog label{display:grid;gap:5px;color:var(--color-muted);font-size:12px}.import-dialog textarea{width:100%;padding:9px;border:1px solid var(--color-border-strong);border-radius:5px;font-family:"Cascadia Code",Consolas,monospace}.import-dialog footer{justify-content:flex-end}.import-errors{max-height:110px;overflow:auto;color:var(--color-danger)}.import-ok{padding:8px;color:var(--color-success);background:var(--color-success-soft)}
@media(max-width:1100px){.workspace-grid{grid-template-columns:1fr}.category-panel{display:flex;gap:5px;overflow-x:auto;border-top:0}.category-panel .panel-title{display:none}.category-panel button{flex:0 0 auto;width:auto}.filter-grid,.more-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.product-header{display:block}.header-actions{margin-top:12px}}@media(max-width:650px){.filter-grid,.more-grid{grid-template-columns:1fr}.header-actions{align-items:stretch;flex-direction:column}.table-toolbar{align-items:stretch;gap:8px;flex-direction:column}.batch-bar{align-items:flex-start;flex-wrap:wrap}.batch-bar span{width:100%;margin-left:0}}
</style>
