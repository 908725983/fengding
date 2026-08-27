<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import { validateCustomerDraft } from '../schemas/customer-schema'
import { applyCategoryToDraft, changeSettlementMethod, createEmptyCustomerDraft } from '../services/customer-service'
import { useCustomerStore } from '../runtime/customer-store'
import type { Customer, CustomerDraft, PaymentMethod, SettlementMethod } from '../types'

const route = useRoute()
const router = useRouter()
const store = useCustomerStore()
const { categories, tags, selectedCustomer, loading } = storeToRefs(store)
const isEdit = computed(() => Boolean(route.params.customerId))
const draft = reactive<CustomerDraft>(createEmptyCustomerDraft())
const errors = reactive<Record<string, string>>({})
const saveError = ref<string | null>(null)
const saving = ref(false)
const committed = ref(false)
const initialSnapshot = ref('')
const dirty = computed(() => initialSnapshot.value !== '' && JSON.stringify(draft) !== initialSnapshot.value)

function customerToDraft(customer: Customer): CustomerDraft {
  const { id: _id, enterpriseId: _enterpriseId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = toRaw(customer)
  return { ...structuredClone(fields), codeMode: 'manual', code: customer.code }
}

function setDraft(value: CustomerDraft): void {
  Object.assign(draft, structuredClone(value))
  initialSnapshot.value = JSON.stringify(draft)
  Object.keys(errors).forEach((key) => delete errors[key])
  saveError.value = null
}

function onCategoryChange(): void {
  const category = categories.value.find((item) => item.id === draft.categoryId)
  if (category) Object.assign(draft, applyCategoryToDraft(draft, category))
}

function onSettlementChange(): void {
  Object.assign(draft, changeSettlementMethod(draft, draft.settlementMethod as SettlementMethod))
}

function fieldError(path: string): string | undefined { return errors[path] }
function plainDraft(): CustomerDraft { return structuredClone(toRaw(draft)) }

function togglePayment(method: PaymentMethod): void {
  const index = draft.paymentMethods.indexOf(method)
  if (index >= 0) draft.paymentMethods.splice(index, 1)
  else draft.paymentMethods.push(method)
}

function showTutorial(): void { window.alert('原型模拟：视频教程尚未接入') }
function showAttachmentHelp(): void { window.alert('原型模拟：仅记录虚构的 PDF/JPG/PNG 元数据，不上传真实文件') }

function clearForm(): void {
  if (dirty.value && !window.confirm('当前内容尚未保存，确认清空表单吗？')) return
  if (isEdit.value && selectedCustomer.value) setDraft(customerToDraft(selectedCustomer.value))
  else setDraft(createEmptyCustomerDraft())
}

async function save(saveAndNew: boolean): Promise<void> {
  Object.keys(errors).forEach((key) => delete errors[key])
  for (const issue of validateCustomerDraft(draft)) if (!errors[issue.path]) errors[issue.path] = issue.message
  if (Object.keys(errors).length) {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  saveError.value = null
  try {
    const saved = isEdit.value
      ? await store.updateCustomer(String(route.params.customerId), plainDraft())
      : await store.createCustomer(plainDraft())
    committed.value = true
    if (saveAndNew) {
      if (isEdit.value) await router.push('/customers/new')
      setDraft(createEmptyCustomerDraft())
      await nextTick()
      committed.value = false
    } else await router.push(`/customers/${saved.id}`)
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : '客户保存失败'
  } finally { saving.value = false }
}

onBeforeRouteLeave(() => {
  if (!committed.value && dirty.value && !window.confirm('存在未保存内容，确认离开吗？')) return false
})

onMounted(async () => {
  if (isEdit.value) {
    await store.loadCustomer(String(route.params.customerId))
    if (selectedCustomer.value) setDraft(customerToDraft(selectedCustomer.value))
  } else {
    await store.load()
    setDraft(createEmptyCustomerDraft())
  }
})
</script>

<template>
  <section class="form-page">
    <header class="form-header">
      <div><RouterLink class="back-link" :to="isEdit ? `/customers/${route.params.customerId}` : '/customers'">← 返回</RouterLink><p class="eyebrow">CUS-001 · 客户档案</p><h1>{{ isEdit ? '编辑客户' : '新增客户' }}</h1><p>带 * 为必填项。保存由 Service 原子提交，失败不会留下半成品数据。</p></div>
      <div class="form-actions"><button class="button" type="button" @click="clearForm">清空表单</button><button class="button" type="button" @click="showTutorial">视频教程</button><button class="button" type="button" :disabled="saving" @click="save(true)">保存并新增</button><button class="button button--primary" type="button" :disabled="saving" @click="save(false)">{{ saving ? '保存中…' : '保存' }}</button></div>
    </header>
    <div v-if="loading" class="form-state">正在加载表单资料…</div>
    <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>

    <form v-if="!loading" class="customer-form" @submit.prevent="save(false)">
      <main class="form-main">
        <section class="form-card"><h2>基本信息</h2><div class="form-grid">
          <label><span>客户编码 *</span><input v-model="draft.code" :disabled="isEdit" placeholder="请输入唯一编码" :aria-invalid="Boolean(fieldError('code'))"><em>{{ fieldError('code') }}</em></label>
          <label><span>客户名称 *</span><input v-model="draft.name" maxlength="50" :aria-invalid="Boolean(fieldError('name'))"><em>{{ fieldError('name') }}</em></label>
          <label><span>客户分类 *</span><select v-model="draft.categoryId" data-test="category" :aria-invalid="Boolean(fieldError('categoryId'))" @change="onCategoryChange"><option value="">请选择分类</option><option v-for="item in categories.filter((category) => category.status === 'active')" :key="item.id" :value="item.id">{{ item.name }}</option></select><em>{{ fieldError('categoryId') }}</em></label>
          <label><span>客户类型</span><select v-model="draft.customerType"><option :value="null">请选择</option><option value="enterprise">企业客户</option><option value="individual">个人客户</option></select></label>
          <label><span>客户来源</span><select v-model="draft.source"><option :value="null">请选择</option><option value="online-registration">线上注册</option><option value="offline-development">线下开发</option><option value="referral">客户转介绍</option><option value="other">其他</option></select></label>
          <label><span>客户级别</span><select v-model="draft.importanceLevel"><option :value="null">请选择</option><option value="A">A · 重点</option><option value="B">B · 普通</option><option value="C">C · 潜在</option></select></label>
        </div></section>

        <section class="form-card"><h2>联系信息</h2><div class="form-grid">
          <label><span>联系人 *</span><input v-model="draft.primaryContactName" :aria-invalid="Boolean(fieldError('primaryContactName'))"><em>{{ fieldError('primaryContactName') }}</em></label>
          <label><span>联系电话 *</span><input v-model="draft.primaryPhone" :aria-invalid="Boolean(fieldError('primaryPhone'))"><em>{{ fieldError('primaryPhone') }}</em></label>
          <label><span>备用电话</span><input v-model="draft.backupPhone"></label><label><span>邮箱</span><input v-model="draft.email" type="email" :aria-invalid="Boolean(fieldError('email'))"><em>{{ fieldError('email') }}</em></label>
          <label><span>市编码 *</span><input v-model="draft.cityCode" placeholder="请输入市编码" :aria-invalid="Boolean(fieldError('cityCode'))"><em>{{ fieldError('cityCode') }}</em></label>
          <label><span>地址标签</span><select v-model="draft.addressLabel"><option :value="null">请选择</option><option value="company">公司地址</option><option value="warehouse">仓库地址</option><option value="delivery">收货地址</option></select></label>
          <label class="form-wide"><span>详细地址 *</span><input v-model="draft.address" maxlength="100" :aria-invalid="Boolean(fieldError('address'))"><em>{{ fieldError('address') }}</em></label>
          <label><span>微信号</span><input v-model="draft.wechatId"></label>
        </div></section>

        <section class="form-card"><h2>财务信息</h2><div class="form-grid">
          <label><span>业务员 *</span><select v-model="draft.salespersonId" :aria-invalid="Boolean(fieldError('salespersonId'))"><option value="">请选择业务员</option><option value="staff-demo-1">演示业务员甲</option><option value="staff-demo-2">演示业务员乙</option></select><em>{{ fieldError('salespersonId') }}</em></label>
          <label><span>信用额度（元）</span><input :value="draft.creditLimitCents === null ? '' : draft.creditLimitCents / 100" type="number" min="0" @input="draft.creditLimitCents = ($event.target as HTMLInputElement).value === '' ? null : Math.round(Number(($event.target as HTMLInputElement).value) * 100)"><small>0 表示不限制</small></label>
          <label><span>结算方式 *</span><select v-model="draft.settlementMethod" data-test="settlement" @change="onSettlementChange"><option value="cash">现结</option><option value="monthly">月结</option><option value="terms">账期结算</option></select></label>
          <label><span>账期（天）</span><input v-model.number="draft.paymentTermDays" data-test="payment-term" type="number" min="1" max="365" :disabled="draft.settlementMethod !== 'terms'" :aria-invalid="Boolean(fieldError('paymentTermDays'))"><em>{{ fieldError('paymentTermDays') }}</em></label>
          <fieldset class="form-wide"><legend>付款方式</legend><label v-for="item in ([['bank-transfer','银行转账'],['cheque','支票'],['cash','现金'],['wechat','微信'],['alipay','支付宝']] as const)" :key="item[0]" class="check-inline"><input type="checkbox" :checked="draft.paymentMethods.includes(item[0])" @change="togglePayment(item[0])">{{ item[1] }}</label></fieldset>
          <label><span>开户行</span><input v-model="draft.bankName"></label><label><span>银行账号</span><input v-model="draft.bankAccount" inputmode="numeric" maxlength="19" placeholder="选择银行转账时填写 16～19 位数字" :aria-invalid="Boolean(fieldError('bankAccount'))"><em>{{ fieldError('bankAccount') }}</em></label>
          <label><span>税号</span><input v-model="draft.taxId" maxlength="18" :aria-invalid="Boolean(fieldError('taxId'))"><em>{{ fieldError('taxId') }}</em></label><label><span>开票抬头</span><input v-model="draft.invoiceTitle"></label>
        </div></section>

        <section class="form-card"><h2>附加信息</h2><div class="form-grid"><label class="form-wide"><span>客户简介</span><textarea v-model="draft.description" maxlength="500" rows="3"></textarea><small>{{ draft.description?.length ?? 0 }}/500</small></label><label class="form-wide"><span>备注</span><textarea v-model="draft.remark" rows="3"></textarea></label><div class="form-wide upload-field"><span>附件上传</span><button class="button" type="button" @click="showAttachmentHelp">模拟上传</button><small>PDF/JPG/PNG，单文件不超过 5MB；请勿使用真实资料</small></div></div></section>

        <section class="form-card"><h2>预置属性</h2><div class="form-grid"><label><span>法人代表</span><input v-model="draft.legalRepresentative"></label><label><span>注册资本</span><input v-model="draft.registeredCapital"></label><label><span>成立日期</span><input v-model="draft.establishedDate" type="date"></label><label><span>店铺面积</span><input v-model.number="draft.storeArea" type="number" min="0"><small>原需求未定义单位</small></label><label><span>员工人数</span><input v-model.number="draft.employeeCount" type="number" min="0"></label><label class="form-wide"><span>经营范围</span><textarea v-model="draft.businessScope" rows="3"></textarea></label></div><p class="scope-note">动态自定义字段不属于本切片；这里只实现六个已确认预置字段。</p></section>
      </main>

      <aside class="form-aside">
        <section class="form-card"><h2>客户标签</h2><label v-for="tag in tags.filter((item) => item.status === 'active')" :key="tag.id" class="tag-check"><input v-model="draft.tagIds" type="checkbox" :value="tag.id"><i :style="{ backgroundColor: tag.color }"></i>{{ tag.name }}</label></section>
        <section class="form-card"><h2>业务设置</h2><label class="switch-row"><input v-model="draft.businessSettings.canViewInventory" type="checkbox">允许查看库存</label><label class="switch-row"><input v-model="draft.businessSettings.canSelfOrder" type="checkbox">允许自主下单</label><label class="switch-row"><input v-model="draft.businessSettings.canViewPrice" type="checkbox">允许查看价格</label><label class="switch-row"><input v-model="draft.businessSettings.acceptsMarketing" type="checkbox">接收营销消息</label><label class="switch-row"><input v-model="draft.businessSettings.autoAssignOrders" type="checkbox">自动分配订单</label><p v-if="draft.businessSettings.autoAssignOrders" class="simulation-note">原型模拟：自动分配规则尚未配置，不产生真实分配。</p></section>
      </aside>
    </form>
  </section>
</template>

<style scoped>
.form-page { max-width: 1500px; margin: 0 auto; }.form-header { display: flex; gap: 22px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }.form-header h1 { margin: 3px 0; }.form-header p { margin-bottom: 0; color: var(--color-muted); }.back-link { color: var(--color-primary-strong); text-decoration: none; }.form-actions { display: flex; gap: 8px; }.button { min-height: 36px; padding: 0 14px; color: #4d5968; cursor: pointer; background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.button--primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }.button:disabled { cursor: not-allowed; opacity: .55; }.form-error { padding: 10px 12px; color: var(--color-danger); background: #fff0f0; border: 1px solid #efcaca; }.customer-form { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; }.form-main, .form-aside { display: grid; align-content: start; gap: 14px; }.form-card { padding: 18px; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }.form-card h2 { margin-bottom: 16px; font-size: 16px; }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }.form-grid > label, .map-field, .upload-field { display: grid; align-content: start; gap: 5px; color: var(--color-muted); font-size: 12px; }.form-grid input, .form-grid select, .form-grid textarea { width: 100%; min-height: 36px; padding: 7px 9px; color: var(--color-text); background: #fff; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); }.form-grid textarea { resize: vertical; }.form-grid [aria-invalid="true"] { border-color: var(--color-danger); }.form-grid em { min-height: 14px; color: var(--color-danger); font-size: 11px; font-style: normal; }.form-grid small, .map-field small, .upload-field small { color: #8993a1; }.form-wide { grid-column: 1 / -1; }.form-grid fieldset { padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }.form-grid legend { padding: 0 5px; color: var(--color-muted); font-size: 12px; }.check-inline { display: inline-flex; gap: 5px; align-items: center; margin-right: 18px; color: var(--color-text); }.check-inline input { width: auto; min-height: auto; }.tag-check, .switch-row { display: flex; gap: 8px; align-items: center; min-height: 34px; }.tag-check i { width: 8px; height: 8px; border-radius: 50%; }.simulation-note { margin: 10px 0 0; color: var(--color-warning); font-size: 12px; }.scope-note { margin: 14px 0 0; padding-top: 12px; color: var(--color-muted); font-size: 12px; border-top: 1px dashed var(--color-border); }.form-summary ul { padding-left: 18px; margin: 0; color: var(--color-muted); font-size: 12px; }.form-summary li + li { margin-top: 6px; }.form-state { display: grid; min-height: 300px; place-items: center; background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
@media (max-width: 1100px) { .customer-form { grid-template-columns: 1fr; }.form-aside { grid-template-columns: repeat(2, minmax(0, 1fr)); }.form-header { align-items: flex-start; flex-direction: column; }.form-actions { flex-wrap: wrap; } } @media (max-width: 640px) { .form-grid, .form-aside { grid-template-columns: 1fr; }.form-wide { grid-column: auto; }.form-actions { display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; }.form-actions .button { padding: 0 8px; } }
</style>
