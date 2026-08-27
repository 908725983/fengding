<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProcurementStore } from '../runtime/procurement-store'
import ProcurementSubnav from '../components/ProcurementSubnav.vue'
import ProcurementScenarioBar from '../components/ProcurementScenarioBar.vue'
import type { PurchaseOrderDraft } from '../types'
import './procurement-views.css'

const store = useProcurementStore()
const { purchaseOrders, purchaseOrderTotal, purchaseWarehouses, purchaseLocations, workspace, loading, saving, error, scenario, actor, canWrite } = storeToRefs(store)
const workflowStatus = ref<'all' | 'pending-review' | 'approved' | 'voided' | 'cancelled'>('all')
const inboundStatus = ref<'all' | 'not-received' | 'partially-received' | 'received'>('all')
const keyword = ref('')
const showCreate = ref(false)
const showInbound = ref(false)
const selected = ref<PurchaseOrderDraft | null>(null)
const selectedOrder = ref<(typeof purchaseOrders.value)[number] | null>(null)
const formError = ref('')
const draft = reactive<PurchaseOrderDraft>({ supplierId: '', warehouseId: '', lines: [], otherFeeCents: 0, productDiscountCents: 0, source: 'manual' })
const inboundQty = ref(1)
const inboundLocationId = ref('')
const inboundBatchNumber = ref('')
const inboundProductionDate = ref('')

const suppliers = computed(() => workspace.value.suppliers.items.filter((item) => item.status === 'enabled' && item.deliveryMode !== 'direct'))
const skus = computed(() => workspace.value.skus.filter((item) => item.productStatus === 'on-sale' && !item.deleted && workspace.value.supplierProducts.some((relation) => relation.supplierId === draft.supplierId && relation.skuId === item.skuId && relation.status === 'enabled')))
const warehouses = computed(() => purchaseWarehouses.value)

function query() { void store.loadPurchaseOrders({ workflowStatus: workflowStatus.value, inboundStatus: inboundStatus.value, keyword: keyword.value || undefined }) }
function syncSupply() {
  const line = draft.lines[0]
  if (!line) return
  let relation = workspace.value.supplierProducts.find((item) => item.supplierId === draft.supplierId && item.skuId === line.skuId && item.status === 'enabled')
  if (!relation) {
    relation = workspace.value.supplierProducts.find((item) => item.supplierId === draft.supplierId && item.status === 'enabled')
    if (relation) line.skuId = relation.skuId
  }
  line.supplierRelationId = relation?.id
  line.unitPriceCents = relation?.supplyPriceCents ?? 0
}
function openCreate() {
  formError.value = ''; const relation = workspace.value.supplierProducts.find((item) => suppliers.value.some((supplier) => supplier.id === item.supplierId) && item.status === 'enabled' && workspace.value.skus.some((sku) => sku.skuId === item.skuId && sku.productStatus === 'on-sale' && !sku.deleted)); draft.supplierId = relation?.supplierId ?? suppliers.value[0]?.id ?? ''; draft.warehouseId = warehouses.value[0]?.id ?? ''; draft.lines = relation ? [{ skuId: relation.skuId, supplierRelationId: relation.id, quantity: 1, unitPriceCents: relation.supplyPriceCents, isGift: false, note: null }] : []; showCreate.value = true
}
async function save() { formError.value = ''; try { await store.createPurchaseOrder(structuredClone(toRaw(draft))); showCreate.value = false } catch (caught) { formError.value = caught instanceof Error ? caught.message : '保存采购订单失败' } }
function openInbound(order: (typeof purchaseOrders.value)[number]) { selectedOrder.value = order; inboundQty.value = Math.max(1, order.lines[0]?.quantity - order.lines[0]?.receivedQuantity || 1); inboundLocationId.value = ''; inboundBatchNumber.value = ''; inboundProductionDate.value = ''; showInbound.value = true }
async function receive() { if (!selectedOrder.value || !inboundLocationId.value) { formError.value = '请选择入库库位'; return }; try { await store.receivePurchaseOrder({ orderId: selectedOrder.value.id, warehouseId: selectedOrder.value.warehouseId, locationId: inboundLocationId.value, lines: [{ lineId: selectedOrder.value.lines[0]!.id, quantity: inboundQty.value, batchNumber: inboundBatchNumber.value || undefined, productionDate: inboundProductionDate.value || null }] }); showInbound.value = false } catch (caught) { formError.value = caught instanceof Error ? caught.message : '入库失败' } }
const workflowLabel = (value: string) => ({ 'pending-review': '待审核', approved: '已审核', voided: '已作废', cancelled: '已取消' } as Record<string, string>)[value] ?? value
const inboundLabel = (value: string) => ({ 'not-received': '未入库', 'partially-received': '部分入库', received: '已入库' } as Record<string, string>)[value] ?? value
onMounted(() => { void store.load(); void store.loadPurchaseOrders() })
watch(() => [draft.supplierId, draft.lines[0]?.skuId], syncSupply)
</script>

<template>
  <section class="procurement-page">
    <header class="procurement-header"><div><h1>采购订单</h1><p>采购订单、审核状态与入库进度；付款状态由资金模块接入后提供。</p></div><ProcurementScenarioBar :scenario="scenario" :role="actor.role" @scenario="store.setScenario" @role="store.setRole" /></header>
    <ProcurementSubnav />
    <form class="procurement-toolbar" @submit.prevent="query"><label>订单状态<select v-model="workflowStatus"><option value="all">全部</option><option value="pending-review">待审核</option><option value="approved">已审核</option><option value="voided">已作废</option><option value="cancelled">已取消</option></select></label><label>入库状态<select v-model="inboundStatus"><option value="all">全部</option><option value="not-received">未入库</option><option value="partially-received">部分入库</option><option value="received">已入库</option></select></label><label class="grow">单号 / 供应商 / 商品<input v-model="keyword" type="search" /></label><button class="pur-button" type="submit">查询</button><div class="actions"><button v-if="canWrite" class="pur-button primary" type="button" @click="openCreate">新增采购订单</button></div></form>
    <p class="procurement-warning">付款状态：<span class="pur-status unavailable">未接入</span>；直送采购不在本切片创建库存事实。</p>
    <div v-if="error" class="procurement-state error" role="alert">{{ error }}<button class="pur-button" @click="query">重试</button></div><div v-else-if="loading" class="procurement-state">正在加载采购订单…</div><div v-else-if="!purchaseOrders.length" class="procurement-state"><strong>暂无采购订单</strong><span>可从补货候选或手工新增采购订单。</span></div>
    <div v-else class="procurement-table-wrap"><table class="procurement-table"><thead><tr><th>单号</th><th>下单时间</th><th>供应商</th><th>商品明细</th><th>订单状态</th><th>入库状态</th><th>金额</th><th>付款状态</th><th>操作</th></tr></thead><tbody><tr v-for="order in purchaseOrders" :key="order.id"><td><strong>{{ order.code }}</strong></td><td>{{ order.createdAt }}</td><td>{{ order.supplierNameSnapshot }}</td><td>{{ order.lines.length }} 行<small>{{ order.lines[0]?.productNameSnapshot }}</small></td><td><span class="pur-status" :class="order.workflowStatus">{{ workflowLabel(order.workflowStatus) }}</span></td><td><span class="pur-status" :class="order.inboundStatus">{{ inboundLabel(order.inboundStatus) }}</span></td><td class="pur-money">¥{{ (order.orderAmountCents / 100).toFixed(2) }}</td><td><span class="pur-status unavailable">未接入</span></td><td><button v-if="canWrite && order.workflowStatus === 'pending-review'" class="pur-button" @click="store.approvePurchaseOrder(order)">审核</button><button v-if="canWrite && order.workflowStatus === 'pending-review'" class="pur-button danger" @click="store.voidPurchaseOrder(order)">作废</button><button v-if="canWrite && order.workflowStatus === 'approved' && order.inboundStatus !== 'received'" class="pur-button" @click="openInbound(order)">入库</button><button v-if="canWrite && order.workflowStatus === 'approved' && order.inboundStatus === 'not-received'" class="pur-button danger" @click="store.cancelPurchaseOrder(order)">取消</button></td></tr></tbody></table></div>
    <div class="procurement-pagination">共 {{ purchaseOrderTotal }} 条</div>
    <div v-if="showCreate" class="procurement-dialog" role="dialog" aria-modal="true"><section><header><strong>新增采购订单</strong><button class="pur-button" @click="showCreate = false">关闭</button></header><form class="procurement-form" @submit.prevent="save"><label>供应商 *<select v-model="draft.supplierId"><option v-for="item in suppliers" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label>入库仓库 *<select v-model="draft.warehouseId"><option v-for="item in warehouses" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><template v-if="draft.lines[0]"><label>商品 *<select v-model="draft.lines[0].skuId"><option v-for="item in skus" :key="item.skuId" :value="item.skuId">{{ item.productName }} · {{ item.skuCode }}</option></select></label><label>采购数量 *<input v-model.number="draft.lines[0].quantity" type="number" min="1" step="1" /></label><label>采购单价（供货价，分）*<input :value="draft.lines[0].unitPriceCents || ''" type="number" readonly aria-describedby="purchase-price-help" /></label><p id="purchase-price-help" class="procurement-hint wide">由当前供应商与商品的启用供货关系自动带出，保存时以服务端当前供货价为准。</p></template><p v-else class="procurement-warning wide">暂无可用于仓库采购的供货关系，不能创建采购订单。</p><label>其他费用（分）<input v-model.number="draft.otherFeeCents" type="number" min="0" step="1" /></label><label class="wide">备注<textarea v-model="draft.note" rows="2" /></label><p v-if="formError" class="procurement-warning wide">{{ formError }}</p><div class="procurement-actions"><button class="pur-button" type="button" @click="showCreate = false">取消</button><button class="pur-button primary" :disabled="saving || !draft.lines[0]?.supplierRelationId" type="submit">保存</button></div></form></section></div>
    <div v-if="showInbound && selectedOrder" class="procurement-dialog" role="dialog" aria-modal="true"><section><header><strong>确认采购入库</strong><button class="pur-button" @click="showInbound = false">关闭</button></header><form class="procurement-form" @submit.prevent="receive"><p class="wide">{{ selectedOrder.code }} · {{ selectedOrder.lines[0]?.productNameSnapshot }}</p><label>入库数量（采购单位）*<input v-model.number="inboundQty" type="number" min="1" :max="selectedOrder.lines[0]!.quantity - selectedOrder.lines[0]!.receivedQuantity" /></label><label>库位 *<select v-model="inboundLocationId"><option value="">请选择库位</option><option v-for="item in purchaseLocations.filter((location) => location.warehouseId === selectedOrder!.warehouseId)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label>批次号（追踪商品必填）<input v-model="inboundBatchNumber" /></label><label>生产日期（追踪商品必填）<input v-model="inboundProductionDate" type="date" /></label><p class="procurement-warning wide">入库成功后通过库存公开命令增加目标仓库存；数量不能超过待入库数量。批次和生产日期遵循库存规则。</p><p v-if="formError" class="procurement-warning wide">{{ formError }}</p><div class="procurement-actions"><button class="pur-button" type="button" @click="showInbound = false">取消</button><button class="pur-button primary" :disabled="saving" type="submit">确认入库</button></div></form></section></div>
  </section>
</template>
