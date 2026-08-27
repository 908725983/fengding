<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FinanceScenarioBar from '../components/FinanceScenarioBar.vue'
import FinanceSubnav from '../components/FinanceSubnav.vue'
import { useFinanceStore } from '../runtime/finance-store'
import type { FinanceRole } from '../types'
import type { FinanceScenarioName } from '../../../../mock/handlers/finance-handler'
import './finance-views.css'
import './finance-receivable-views.css'

const store = useFinanceStore()
const { supplierPaymentWriteoffs, supplierPayments, supplierPayables, loading, saving, error, scenario, actor } = storeToRefs(store)
const showForm = ref(false); const supplierId = ref(''); const actionError = ref(''); const cancelId = ref(''); const cancelReason = ref('')
const rows = reactive<Array<{ paymentId: string; payableId: string; amountYuan: string }>>([])
const money = (value: number) => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
const suppliers = computed(() => [...new Map(supplierPayments.value.filter((item) => item.availableCents > 0).map((item) => [item.supplierSnapshot.id, item.supplierSnapshot])).values()])
const sources = computed(() => supplierPayments.value.filter((item) => item.status === 'normal' && item.availableCents > 0 && item.supplierSnapshot.id === supplierId.value))
const targets = computed(() => supplierPayables.value.filter((item) => item.outstandingCents > 0 && item.supplierSnapshot.id === supplierId.value))
watch(supplierId, () => { rows.splice(0, rows.length); addRow() })
function addRow() { rows.push({ paymentId: sources.value[0]?.id ?? '', payableId: targets.value[0]?.id ?? '', amountYuan: '' }) }
async function load() { await Promise.all([store.loadSupplierPaymentWriteoffs(), store.loadSupplierPayments(), store.loadSupplierPayables()]) }
async function scenarioChange(value: FinanceScenarioName) { await store.setScenario(value); await load() }
async function roleChange(value: FinanceRole) { await store.setRole(value); await load() }
function open() { supplierId.value = suppliers.value[0]?.id ?? ''; rows.splice(0, rows.length); addRow(); showForm.value = true; actionError.value = '' }
async function submit() { actionError.value = ''; try { await store.createSupplierPaymentWriteoff({ supplierId: supplierId.value, occurredAt: '2026-08-10T10:00:00+08:00', allocations: rows.map((item) => ({ paymentId: item.paymentId, payableId: item.payableId, amountCents: Math.round(Number(item.amountYuan) * 100) })) }); showForm.value = false } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '核销失败' } }
async function confirmCancel() { const row = supplierPaymentWriteoffs.value.find((item) => item.id === cancelId.value); if (!row) return; actionError.value = ''; try { await store.cancelSupplierPaymentWriteoff(row.id, row.version, cancelReason.value); cancelId.value = ''; cancelReason.value = '' } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '取消失败' } }
onMounted(load)
</script>

<template>
  <section class="finance-page">
    <header class="finance-header"><div><h1>付款核销</h1><p>同供应商手工多对多分配，支持部分核销；系统不自动 FIFO，也不重复移动现金。</p></div><FinanceScenarioBar :scenario="scenario" :role="actor.role" @scenario="scenarioChange" @role="roleChange" /></header>
    <FinanceSubnav />
    <div class="finance-toolbar"><strong>共 {{ supplierPaymentWriteoffs.length }} 张付款核销单</strong><button v-if="actor.role !== 'sales-supervisor'" class="fin-button primary" :disabled="!suppliers.length" @click="open">新增核销</button></div>
    <p v-if="actionError || error" class="finance-warning">{{ actionError || error }}</p>
    <div v-if="loading" class="finance-state">正在加载付款核销…</div>
    <div v-else class="finance-table-wrap"><table class="finance-table"><thead><tr><th>核销单号/日期</th><th>供应商</th><th class="fin-money">核销金额</th><th>分配数</th><th>操作人</th><th>状态/操作</th></tr></thead><tbody><tr v-for="row in supplierPaymentWriteoffs" :key="row.id"><td><strong>{{ row.writeoffNo }}</strong><small>{{ row.occurredAt.slice(0, 16).replace('T', ' ') }}</small></td><td>{{ supplierPayments.find(item => item.supplierSnapshot.id === row.supplierId)?.supplierSnapshot.name ?? row.supplierId }}</td><td class="fin-money">{{ money(row.amountCents) }}</td><td>{{ row.allocations.length }}</td><td>{{ row.operatorSnapshot.name }}</td><td><span class="fin-status" :class="row.status === 'active' ? 'enabled' : 'disabled'">{{ row.status === 'active' ? '有效' : '已取消' }}</span> <button v-if="row.status === 'active' && actor.role !== 'sales-supervisor'" class="fin-link-button danger" @click="cancelId = row.id">取消</button></td></tr><tr v-if="!supplierPaymentWriteoffs.length"><td colspan="6">暂无付款核销；先登记一笔未立即核销的供应商付款。</td></tr></tbody></table></div>
    <div v-if="showForm" class="finance-dialog"><form class="finance-panel finance-form wide-form" @submit.prevent="submit"><div class="wide"><h2>新增付款核销</h2><p>每行指定付款来源、应付目标和本次分配金额。</p></div><label class="wide">供应商<select v-model="supplierId" required><option v-for="item in suppliers" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label><div class="wide allocation-editor"><div class="allocation-head"><strong>手工分配矩阵</strong><button type="button" class="fin-button" @click="addRow">添加一行</button></div><div v-for="(row, index) in rows" :key="index" class="allocation-row"><label>付款来源<select v-model="row.paymentId" required><option v-for="item in sources" :key="item.id" :value="item.id">{{ item.paymentNo }} · 可用 {{ money(item.availableCents) }}</option></select></label><label>目标应付<select v-model="row.payableId" required><option v-for="item in targets" :key="item.id" :value="item.id">{{ item.payableNo }} · 待付 {{ money(item.outstandingCents) }}</option></select></label><label>核销金额（元）<input v-model="row.amountYuan" type="number" min="0.01" step="0.01" required></label><button v-if="rows.length > 1" type="button" class="fin-link-button danger" @click="rows.splice(index, 1)">移除</button></div></div><div class="finance-actions"><button type="button" class="fin-button" @click="showForm = false">取消</button><button class="fin-button primary" :disabled="saving">{{ saving ? '核销中…' : '确认核销' }}</button></div></form></div>
    <div v-if="cancelId" class="finance-dialog"><form class="finance-panel finance-form" @submit.prevent="confirmCancel"><div class="wide"><h2>取消付款核销</h2><p>整张取消后恢复付款可用余额和应付待付金额，不重复移动现金。</p></div><label class="wide">取消原因<textarea v-model.trim="cancelReason" required maxlength="200"></textarea></label><div class="finance-actions"><button type="button" class="fin-button" @click="cancelId = ''">返回</button><button class="fin-button danger" :disabled="saving">确认取消</button></div></form></div>
  </section>
</template>
