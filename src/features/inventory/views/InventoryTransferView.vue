<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../runtime/inventory-store'
import InventorySubnav from '../components/InventorySubnav.vue'
import InventoryScenarioBar from '../components/InventoryScenarioBar.vue'
import type { InventoryDocumentListQuery, InventoryRole, InventoryTransferDraft } from '../types'
import type { InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import './inventory-views.css'

const store = useInventoryStore(); const route = useRoute(); const router = useRouter()
const { transfers, loading, error, saving, scenario, actor, workspace, canWrite } = storeToRefs(store)
const showForm = ref(false); const message = ref('')
const filters = reactive({ status: String(route.query.status ?? ''), fromDate: String(route.query.fromDate ?? ''), toDate: String(route.query.toDate ?? ''), keyword: String(route.query.keyword ?? '') })
const draft = ref<InventoryTransferDraft>({ sourceWarehouseId: '', targetWarehouseId: '', occurredAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: '', quantityMilli: 1000, costPerBaseUnitCents: 0 }], note: '' })
const sourceStocks = computed(() => workspace.value.stocks.items.filter((item) => !draft.value.sourceWarehouseId || item.warehouse.id === draft.value.sourceWarehouseId).filter((item) => item.currentMilli > 0))
const query = (): InventoryDocumentListQuery => ({ status: filters.status || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined, keyword: filters.keyword.trim() || undefined, page: 1, pageSize: 30 })
async function load() { await router.replace({ query: { status: filters.status || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined, keyword: filters.keyword.trim() || undefined } }); await store.loadTransfers(query()) }
async function save() { try { await store.createTransfer(draft.value); showForm.value = false; message.value = '转仓单已创建' } catch (e) { message.value = e instanceof Error ? e.message : '保存失败' } }
async function remove(id: string) { const item = transfers.value.find((row) => row.id === id); if (!item) return; try { await store.deleteTransfer(item); message.value = '待审核转仓单已删除' } catch (e) { message.value = e instanceof Error ? e.message : '删除失败' } }
async function changeScenario(value: InventoryScenarioName) { await store.setScenario(value); await load() }
async function changeRole(value: InventoryRole) { await store.setRole(value); await load() }
function enabledLocation(warehouseId: string) { return workspace.value.locations.find((item) => item.warehouseId === warehouseId && item.status === 'enabled')?.id ?? '' }
function download() { const url = URL.createObjectURL(new Blob([store.exportTransfers(query())], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'inventory-transfers.csv'; anchor.click(); URL.revokeObjectURL(url) }
onMounted(async () => { await store.load(); await load() })
</script>

<template>
  <section class="inventory-page">
    <header class="inventory-header"><div><p class="eyebrow">INV-002 · 库存流转</p><h1>转仓单</h1><p>源仓出库与目标仓入库分两步确认，批次和成本沿用实际出库流水。</p></div><InventoryScenarioBar :scenario="scenario" :role="actor.role" @scenario="changeScenario" @role="changeRole" /></header>
    <InventorySubnav />
    <form class="inventory-toolbar" @submit.prevent="load"><label>状态<select v-model="filters.status"><option value="">全部</option><option value="pending-review">待审核</option><option value="approved">已审核</option><option value="shipped">已出库</option><option value="received">已入库</option></select></label><label>开始日期<input v-model="filters.fromDate" type="date" /></label><label>结束日期<input v-model="filters.toDate" type="date" /></label><label>关键字<input v-model="filters.keyword" placeholder="单号 / SKU" /></label><button class="inv-button primary" type="submit">查询</button><button class="inv-button" type="button" @click="() => store.loadTransfers(query())">刷新</button><button v-if="canWrite" class="inv-button" type="button" @click="download">导出 CSV</button><button v-if="canWrite" class="inv-button primary" type="button" @click="showForm = true">新增</button></form>
    <p v-if="message" class="inventory-warning">{{ message }}</p><div v-if="error" class="inventory-state error"><strong>转仓单加载失败</strong><span>{{ error }}</span><button class="inv-button" @click="load">重试</button></div><div v-else-if="loading" class="inventory-state">正在加载转仓单…</div><div v-else-if="!transfers.length" class="inventory-state"><strong>暂无转仓单</strong><span>当前筛选没有记录。</span></div>
    <div v-else class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>单号</th><th>源仓</th><th>目标仓</th><th>时间</th><th>状态</th><th>商品种类</th><th>操作</th></tr></thead><tbody><tr v-for="item in transfers" :key="item.id"><td><strong>{{ item.code }}</strong></td><td>{{ workspace.warehouses.find(w => w.id === item.sourceWarehouseId)?.name ?? item.sourceWarehouseId }}</td><td>{{ workspace.warehouses.find(w => w.id === item.targetWarehouseId)?.name ?? item.targetWarehouseId }}</td><td>{{ item.occurredAt.slice(0, 16).replace('T', ' ') }}</td><td>{{ { 'pending-review': '待审核', approved: '已审核', shipped: '已出库', received: '已入库', rejected: '已驳回' }[item.status] }}</td><td>{{ item.lines.length }}</td><td><button v-if="canWrite && item.status === 'pending-review'" class="inv-button" :disabled="saving" @click="store.approveTransfer(item)">审核</button><button v-if="canWrite && item.status === 'pending-review'" class="inv-button" :disabled="saving" @click="remove(item.id)">删除</button><button v-else-if="canWrite && item.status === 'approved'" class="inv-button" :disabled="saving" @click="store.shipTransfer(item, enabledLocation(item.sourceWarehouseId))">源仓出库</button><button v-else-if="canWrite && item.status === 'shipped'" class="inv-button" :disabled="saving" @click="store.receiveTransfer(item, enabledLocation(item.targetWarehouseId))">目标仓入库</button></td></tr></tbody></table></div>
    <div v-if="showForm" class="inventory-dialog"><section><header><strong>新增转仓</strong><button class="inv-button" @click="showForm = false">关闭</button></header><form class="inventory-form" @submit.prevent="save"><label>源仓库<select v-model="draft.sourceWarehouseId" required><option value="">请选择</option><option v-for="w in workspace.warehouses.filter(item => item.status === 'enabled')" :key="w.id" :value="w.id">{{ w.name }}</option></select></label><label>目标仓库<select v-model="draft.targetWarehouseId" required><option value="">请选择</option><option v-for="w in workspace.warehouses.filter(item => item.status === 'enabled' && item.id !== draft.sourceWarehouseId)" :key="w.id" :value="w.id">{{ w.name }}</option></select></label><label class="wide">SKU<select v-model="draft.lines[0].skuId" required><option value="">请选择</option><option v-for="row in sourceStocks" :key="`${row.warehouse.id}-${row.skuId}`" :value="row.skuId">{{ row.sku?.productName ?? row.skuId }} · 可转 {{ row.currentMilli / 1000 }}</option></select></label><label>数量（基本单位千分量）<input v-model.number="draft.lines[0].quantityMilli" type="number" min="1" required /></label><label class="wide">备注<textarea v-model="draft.note" maxlength="500" /></label><button class="inv-button primary wide" :disabled="saving" type="submit">保存</button></form></section></div>
  </section>
</template>
