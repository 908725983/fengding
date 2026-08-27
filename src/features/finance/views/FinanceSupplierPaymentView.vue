<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FinanceScenarioBar from '../components/FinanceScenarioBar.vue'
import FinanceSubnav from '../components/FinanceSubnav.vue'
import { useFinanceStore } from '../runtime/finance-store'
import type { FinanceRole, SupplierPaymentMethod } from '../types'
import type { FinanceScenarioName } from '../../../../mock/handlers/finance-handler'
import './finance-views.css'

const store = useFinanceStore()
const { supplierPayments, supplierPayables, accounts, loading, saving, error, scenario, actor } = storeToRefs(store)
const showForm = ref(false); const actionError = ref(''); const voidingId = ref(''); const voidReason = ref('')
const form = reactive({ payableId: '', amountYuan: '', method: 'cash' as SupplierPaymentMethod, accountId: '', immediate: false, note: '' })
const money = (value: number) => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
const payable = computed(() => supplierPayables.value.find((item) => item.id === form.payableId) ?? null)
const accountOptions = computed(() => accounts.value.filter((item) => item.account.status === 'enabled' && item.account.type === form.method))
watch(() => form.method, () => { form.accountId = accountOptions.value[0]?.account.id ?? '' })
watch(payable, (value) => { if (value) form.amountYuan = (value.outstandingCents / 100).toFixed(2) })
async function load() { await Promise.all([store.loadSupplierPayments(), store.loadSupplierPayables(), store.loadAccounts()]) }
async function scenarioChange(value: FinanceScenarioName) { await store.setScenario(value); await load() }
async function roleChange(value: FinanceRole) { await store.setRole(value); await load() }
function open() { actionError.value = ''; form.payableId = supplierPayables.value.find((item) => item.outstandingCents > 0)?.id ?? ''; form.method = 'cash'; form.accountId = accounts.value.find((item) => item.account.status === 'enabled' && item.account.type === 'cash')?.account.id ?? ''; form.immediate = false; form.note = ''; showForm.value = true }
async function submit() { if (!payable.value) return; const amountCents = Math.round(Number(form.amountYuan) * 100); actionError.value = ''; try { await store.createSupplierPayment({ supplierSnapshot: payable.value.supplierSnapshot, occurredAt: '2026-08-10T10:00:00+08:00', amountCents, method: form.method, accountId: form.accountId, note: form.note || null, immediateAllocations: form.immediate ? [{ payableId: payable.value.id, amountCents }] : undefined }); showForm.value = false } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '付款失败' } }
async function confirmVoid() { const row = supplierPayments.value.find((item) => item.id === voidingId.value); if (!row) return; actionError.value = ''; try { await store.voidSupplierPayment(row.id, row.version, voidReason.value); voidingId.value = ''; voidReason.value = '' } catch (caught) { actionError.value = caught instanceof Error ? caught.message : '作废失败' } }
onMounted(load)
</script>

<template>
  <section class="finance-page">
    <header class="finance-header"><div><h1>供应商付款</h1><p>付款保存即确认并扣减资金账户；默认不立即核销，已确认金额不可编辑。</p></div><FinanceScenarioBar :scenario="scenario" :role="actor.role" @scenario="scenarioChange" @role="roleChange" /></header>
    <FinanceSubnav />
    <div class="finance-toolbar"><strong>共 {{ supplierPayments.length }} 张付款单</strong><button v-if="actor.role !== 'sales-supervisor'" class="fin-button primary" :disabled="!supplierPayables.some(item => item.outstandingCents > 0)" @click="open">新增付款</button></div>
    <p v-if="actionError || error" class="finance-warning">{{ actionError || error }}</p>
    <div v-if="loading" class="finance-state">正在加载供应商付款…</div>
    <div v-else class="finance-table-wrap"><table class="finance-table"><thead><tr><th>付款单号/日期</th><th>供应商</th><th>账户/方式</th><th class="fin-money">付款金额</th><th class="fin-money">已核销</th><th class="fin-money">可用</th><th>状态/操作</th></tr></thead><tbody><tr v-for="row in supplierPayments" :key="row.id"><td><strong>{{ row.paymentNo }}</strong><small>{{ row.occurredAt.slice(0, 16).replace('T', ' ') }}</small></td><td>{{ row.supplierSnapshot.name }}<small>{{ row.supplierSnapshot.code }}</small></td><td>{{ accounts.find(item => item.account.id === row.accountId)?.account.name ?? row.accountId }}<small>{{ row.method === 'cash' ? '现金' : '银行转账' }}</small></td><td class="fin-money">{{ money(row.amountCents) }}</td><td class="fin-money">{{ money(row.allocatedCents) }}</td><td class="fin-money">{{ money(row.availableCents) }}</td><td><span class="fin-status" :class="row.status === 'normal' ? 'enabled' : 'disabled'">{{ row.status === 'normal' ? '已确认' : '已作废' }}</span> <button v-if="row.status === 'normal' && row.allocatedCents === 0 && actor.role !== 'sales-supervisor'" class="fin-link-button danger" @click="voidingId = row.id">作废</button></td></tr><tr v-if="!supplierPayments.length"><td colspan="7">暂无供应商付款；可先对现有应付登记付款。</td></tr></tbody></table></div>
    <div v-if="showForm" class="finance-dialog"><form class="finance-panel finance-form" @submit.prevent="submit"><div class="wide"><h2>新增供应商付款</h2><p>默认只形成付款可用余额；开启立即核销后，付款和分配同事务提交。</p></div><label class="wide">目标应付<select v-model="form.payableId" required><option v-for="item in supplierPayables.filter(row => row.outstandingCents > 0)" :key="item.id" :value="item.id">{{ item.supplierSnapshot.name }} · {{ item.payableNo }} · 待付 {{ money(item.outstandingCents) }}</option></select></label><label>付款方式<select v-model="form.method"><option value="cash">现金</option><option value="bank">银行转账</option></select></label><label>资金账户<select v-model="form.accountId" required><option v-for="item in accountOptions" :key="item.account.id" :value="item.account.id">{{ item.account.name }} · {{ money(item.closingBalanceCents) }}</option></select></label><label>付款金额（元）<input v-model="form.amountYuan" type="number" min="0.01" step="0.01" required></label><label>立即核销<input v-model="form.immediate" type="checkbox"></label><label class="wide">备注<textarea v-model.trim="form.note" rows="3" maxlength="200"></textarea></label><div class="finance-actions"><button type="button" class="fin-button" @click="showForm = false">取消</button><button class="fin-button primary" :disabled="saving">{{ saving ? '付款中…' : '确认付款' }}</button></div></form></div>
    <div v-if="voidingId" class="finance-dialog"><form class="finance-panel finance-form" @submit.prevent="confirmVoid"><div class="wide"><h2>作废付款</h2><p>只允许当前开放月份且没有有效核销的付款；确认后追加反向资金流水。</p></div><label class="wide">作废原因<textarea v-model.trim="voidReason" required maxlength="200"></textarea></label><div class="finance-actions"><button type="button" class="fin-button" @click="voidingId = ''">取消</button><button class="fin-button danger" :disabled="saving">确认作废</button></div></form></div>
  </section>
</template>
