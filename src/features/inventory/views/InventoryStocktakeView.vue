<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../runtime/inventory-store'
import InventorySubnav from '../components/InventorySubnav.vue'
import InventoryScenarioBar from '../components/InventoryScenarioBar.vue'
import type { InventoryDocumentListQuery, InventoryRole, InventoryStocktake, InventoryStocktakeDraft } from '../types'
import type { InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import './inventory-views.css'

const store = useInventoryStore(); const route = useRoute(); const router = useRouter()
const { stocktakes, stocktakePage, loading, saving, error, actor, scenario, workspace, canWrite } = storeToRefs(store)
const showForm = ref(false); const message = ref(''); const selected = ref<InventoryStocktake | null>(null)
const filters = reactive({ status: String(route.query.status ?? ''), fromDate: String(route.query.fromDate ?? ''), toDate: String(route.query.toDate ?? ''), keyword: String(route.query.keyword ?? '') })
const currentPage = ref(Math.max(1, Number(route.query.page ?? 1)))
const draft = ref<InventoryStocktakeDraft>({ warehouseId: '', type: 'full', scopeKind: 'all', scopeValue: null, scopeSkuIds: [], operatorId: actor.value.actorId, occurredAt: '2026-08-10T09:00' })
const skuOptions = computed(() => workspace.value.stocks.items.filter((item) => item.warehouse.id === draft.value.warehouseId))
const categoryOptions = computed(() => [...new Set(skuOptions.value.map((item) => item.sku?.categoryId).filter((value): value is string => Boolean(value)))])
const brandOptions = computed(() => [...new Set(skuOptions.value.map((item) => item.sku?.brandId).filter((value): value is string => Boolean(value)))])
const query = (): InventoryDocumentListQuery => ({ status: filters.status || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined, keyword: filters.keyword.trim() || undefined, page: currentPage.value, pageSize: 30 })
async function load() { await router.replace({ query: Object.fromEntries(Object.entries(query()).filter(([key, value]) => value !== undefined && key !== 'pageSize')) }); await store.loadStocktakes(query()) }
async function search() { currentPage.value = 1; await load() }
async function changePage(next: number) { currentPage.value = next; await load() }
async function create() { try { draft.value.operatorId = actor.value.actorId; const full = draft.value.type === 'full'; await store.createStocktake({ ...draft.value, scopeKind: full ? 'all' : draft.value.scopeKind, scopeValue: full ? null : draft.value.scopeValue, scopeSkuIds: !full && draft.value.scopeKind === 'skus' ? draft.value.scopeSkuIds : [] }); showForm.value = false; message.value = '盘点单已创建'; await load() } catch (e) { message.value = e instanceof Error ? e.message : '保存失败' } }
async function action(fn: () => Promise<void>, ok: string) { try { await fn(); message.value = ok; await load() } catch (e) { message.value = e instanceof Error ? e.message : '操作失败' } }
function open(item: InventoryStocktake) { selected.value = structuredClone(toRaw(item)) }
function skuText(skuId: string) { const sku = workspace.value.stocks.items.find((row) => row.skuId === skuId)?.sku; return sku ? `${sku.skuCode} · ${sku.productName} · ${sku.specification}` : skuId }
function skuUnit(skuId: string) { return workspace.value.stocks.items.find((row) => row.skuId === skuId)?.sku?.baseUnitName ?? '基本单位' }
function updateCount(lineId: string, event: Event) {
  if (!selected.value) return
  const input = event.target as HTMLInputElement
  const line = selected.value.lines.find((item) => item.id === lineId)
  if (!line) return
  line.countedQuantityMilli = input.value === '' ? null : Math.round(Number(input.value) * 1000)
}
function variance(item: InventoryStocktake) { return item.lines.reduce((sum, line) => sum + Math.round((line.deltaQuantityMilli ?? 0) * (line.costPerBaseUnitCents ?? 0) / 1000), 0) / 100 }
function download() { const url = URL.createObjectURL(new Blob([store.exportStocktakes(query())], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'inventory-stocktakes.csv'; anchor.click(); URL.revokeObjectURL(url) }
async function role(value: InventoryRole) { await store.setRole(value); await load() }; async function scene(value: InventoryScenarioName) { await store.setScenario(value); await load() }
onMounted(async () => { await store.load(); await load() })
</script>
<template>
  <section class="inventory-page"><header class="inventory-header"><div><p class="eyebrow">INV-003 · 库存盘点</p><h1>盘点记录</h1><p>开始时冻结仓库×SKU范围，实盘数量全部录入后才可审核生成盈亏流水。</p></div><InventoryScenarioBar :scenario="scenario" :role="actor.role" @scenario="scene" @role="role" /></header><InventorySubnav />
    <form class="inventory-toolbar" @submit.prevent="search"><label>状态<select v-model="filters.status" aria-label="状态"><option value="">全部</option><option value="pending">待盘点</option><option value="counting">盘点中</option><option value="pending-review">待审核</option><option value="completed">已完成</option></select></label><label>开始日期<input v-model="filters.fromDate" type="date" /></label><label>结束日期<input v-model="filters.toDate" type="date" /></label><label>关键字<input v-model="filters.keyword" placeholder="单号 / SKU" /></label><button class="inv-button primary" type="submit">查询</button><button class="inv-button" type="button" @click="load">刷新</button><button v-if="canWrite" class="inv-button" type="button" @click="download">导出 CSV</button><button v-if="canWrite" class="inv-button primary" type="button" @click="showForm = true">新增盘点</button></form>
    <p v-if="message" class="inventory-warning">{{ message }}</p><div v-if="error" class="inventory-state error"><strong>盘点加载失败</strong><span>{{ error }}</span><button class="inv-button" @click="load">重试</button></div><div v-else-if="loading" class="inventory-state">正在加载盘点…</div><div v-else-if="!stocktakes.length" class="inventory-state"><strong>暂无盘点记录</strong><span>当前筛选没有记录。</span></div>
    <div v-else class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>单号</th><th>仓库</th><th>类型</th><th>状态</th><th>盘点人</th><th>时间</th><th>盈亏金额</th><th>操作</th></tr></thead><tbody><tr v-for="item in stocktakes" :key="item.id"><td><strong>{{ item.code }}</strong></td><td>{{ workspace.warehouses.find(w => w.id === item.warehouseId)?.name ?? item.warehouseId }}</td><td>{{ item.type === 'full' ? '全盘' : '抽盘' }}</td><td>{{ { pending:'待盘点', counting:'盘点中', 'pending-review':'待审核', completed:'已完成' }[item.status] }}</td><td>{{ item.operatorId }}</td><td>{{ item.occurredAt.slice(0,16).replace('T',' ') }}</td><td>{{ actor.role === 'sales-supervisor' ? '—' : `¥${variance(item).toFixed(2)}` }}</td><td><button class="inv-button" @click="open(item)">查看明细</button><button v-if="canWrite && item.status === 'pending'" class="inv-button" :disabled="saving" @click="action(() => store.startStocktake(item), '盘点已开始')">开始</button><button v-if="canWrite && item.status === 'pending-review'" class="inv-button" :disabled="saving" @click="action(() => store.approveStocktake(item), '盘点已完成')">审核完成</button></td></tr></tbody></table></div>
    <nav v-if="stocktakePage.total > stocktakePage.pageSize" class="inventory-pagination" aria-label="盘点分页"><button class="inv-button" :disabled="currentPage <= 1" @click="changePage(currentPage - 1)">上一页</button><span>第 {{ currentPage }} 页 · 共 {{ stocktakePage.total }} 条</span><button class="inv-button" :disabled="currentPage * stocktakePage.pageSize >= stocktakePage.total" @click="changePage(currentPage + 1)">下一页</button></nav>
    <div v-if="selected" class="inventory-dialog"><section><header><strong>{{ selected.code }} · 盘点明细</strong><button class="inv-button" @click="selected = null">关闭</button></header><div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>商品</th><th>单位</th><th>账面数量</th><th>实盘数量</th><th>盈亏数量</th><th>盈亏金额</th><th>类型</th></tr></thead><tbody><tr v-for="line in selected.lines" :key="line.id"><td>{{ skuText(line.skuId) }}</td><td>{{ skuUnit(line.skuId) }}</td><td>{{ (line.bookQuantityMilli / 1000).toLocaleString() }}</td><td><input v-if="selected.status === 'counting' && canWrite" :value="line.countedQuantityMilli === null ? '' : line.countedQuantityMilli / 1000" type="number" min="0" step="0.001" class="count-input" :aria-label="`${line.skuId} 实盘数量`" @input="updateCount(line.id, $event)" /><span v-else>{{ line.countedQuantityMilli === null ? '未录入' : (line.countedQuantityMilli / 1000).toLocaleString() }}</span></td><td>{{ line.countedQuantityMilli === null ? '—' : ((line.countedQuantityMilli - line.bookQuantityMilli) / 1000).toLocaleString() }}</td><td>{{ actor.role === 'sales-supervisor' || line.countedQuantityMilli === null || line.costPerBaseUnitCents === null ? '—' : `¥${(((line.countedQuantityMilli - line.bookQuantityMilli) * line.costPerBaseUnitCents) / 100000).toFixed(2)}` }}</td><td>{{ line.countedQuantityMilli === null ? '未录入' : line.countedQuantityMilli > line.bookQuantityMilli ? '盘盈' : line.countedQuantityMilli < line.bookQuantityMilli ? '盘亏' : '一致' }}</td></tr></tbody></table></div><p v-if="selected.status === 'counting'" class="status-muted">数量按页面所示单位录入；空白表示未录入，0 表示实际库存为零。</p><div class="inventory-form-actions"><button v-if="canWrite && selected.status === 'counting'" class="inv-button primary" :disabled="saving" @click="action(async () => { await store.saveStocktakeCounts(selected!); selected = null }, '盘点已提交')">提交盘点</button><button class="inv-button" @click="selected = null">取消</button></div></section></div>
    <div v-if="showForm" class="inventory-dialog"><section><header><strong>新增盘点</strong><button class="inv-button" @click="showForm = false">关闭</button></header><form class="inventory-form" @submit.prevent="create">
      <label>盘点仓库<select v-model="draft.warehouseId" required @change="draft.scopeValue = null; draft.scopeSkuIds = []"><option value="">请选择</option><option v-for="w in workspace.warehouses.filter(w => w.status === 'enabled')" :key="w.id" :value="w.id">{{ w.name }}</option></select></label>
      <label>盘点类型<select v-model="draft.type"><option value="full">全盘</option><option value="sample">抽盘</option></select></label>
      <label>盘点范围<select v-model="draft.scopeKind" :disabled="draft.type === 'full'"><option value="all">全部库存</option><option value="skus">指定 SKU</option><option value="category">按分类</option><option value="brand">按品牌</option></select></label>
      <label v-if="draft.type === 'sample' && draft.scopeKind === 'category'">商品分类<select v-model="draft.scopeValue" required><option value="">请选择</option><option v-for="value in categoryOptions" :key="value" :value="value">{{ value }}</option></select></label>
      <label v-if="draft.type === 'sample' && draft.scopeKind === 'brand'">商品品牌<select v-model="draft.scopeValue" required><option value="">请选择</option><option v-for="value in brandOptions" :key="value" :value="value">{{ value }}</option></select></label>
      <label v-if="draft.type === 'sample' && draft.scopeKind === 'skus'" class="wide">选择 SKU<select v-model="draft.scopeSkuIds" multiple required><option v-for="row in skuOptions" :key="row.skuId" :value="row.skuId">{{ row.sku?.productName ?? row.skuId }} · {{ row.skuId }}</option></select></label>
      <label class="wide">盘点时间<input v-model="draft.occurredAt" type="datetime-local" required /></label><button class="inv-button primary wide" :disabled="saving" type="submit">保存</button>
    </form></section></div>
  </section>
</template>
