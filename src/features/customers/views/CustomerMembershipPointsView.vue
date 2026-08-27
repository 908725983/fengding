<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import CustomerSubnav from '../components/CustomerSubnav.vue'
import { useCustomerStore } from '../runtime/customer-store'
import type { MembershipLevelDraft, PointAdjustmentType, PointsSettingsDraft } from '../types'

const props = defineProps<{ mode: 'membership-levels' | 'points' | 'points-settings' }>()
const store = useCustomerStore(); const { membershipLevels, memberships, pointAccounts, selectedPointLedger, pointsSettings, loading, error } = storeToRefs(store)
const actionError = ref<string | null>(null); const selectedCustomerId = ref('customer-1')
const levelDraft = reactive<MembershipLevelDraft>({ name: '', code: '', icon: null, sortOrder: 1, conditionType: 'amount', conditionValue: 0, retainConditionValue: null, retainPeriodMonths: null, autoUpgrade: false, memberDiscountPercent: 100, pointsMultiplier: 1, benefits: { freeShipping: false, priorityShipping: false, dedicatedService: false, birthdayGift: false, birthdayCouponId: null, exclusiveProductIds: [] }, status: 'active' })
const adjustment = reactive({ type: 'increase' as PointAdjustmentType, points: 100, reason: '人工调整', requestId: 'point-ui-request-1' })
const settingsDraft = reactive<PointsSettingsDraft>({
  enabled: false,
  orderEarnPerYuan: 0,
  orderEarnCapPerOrder: 0,
  dailyEarnCap: 0,
  signInPoints: 0,
  consecutiveSignInBonus: 0,
  reviewPoints: 0,
  photoReviewBonus: 0,
  referralPoints: 0,
  referralFirstOrderBonus: 0,
  registrationPoints: 0,
  profileCompletionPoints: 0,
  redemptionPointsPerYuan: 0,
  orderRedemptionCapPercent: 0,
  minimumRedemptionPoints: 0,
  mallEnabled: false,
  exchangePointsRatio: null,
  expiryType: 'never',
  expiryDays: null,
  yearlyExpiryDate: null,
  expiryReminderDays: 30,
  ruleDescription: null,
  showRuleInMall: false,
})
const title = computed(() => props.mode === 'membership-levels' ? '会员等级' : props.mode === 'points' ? '积分管理' : '积分设置')
const currentMembership = computed(() => memberships.value.find((item) => item.customerId === selectedCustomerId.value))
const selectedLedger = computed(() => selectedPointLedger.value)
function run(action: () => Promise<void>): void { actionError.value = null; action().catch((caught) => { actionError.value = caught instanceof Error ? caught.message : '操作失败' }) }
function saveLevel(): void { if (!levelDraft.name.trim() || !levelDraft.code.trim()) { actionError.value = '请填写等级名称和编码'; return }; run(async () => { await store.saveMembershipLevel({ ...levelDraft, name: levelDraft.name.trim(), code: levelDraft.code.trim(), benefits: { ...levelDraft.benefits, exclusiveProductIds: [...levelDraft.benefits.exclusiveProductIds] } }); levelDraft.name = ''; levelDraft.code = '' }) }
function removeLevel(id: string): void { run(() => store.deleteMembershipLevel(id)) }
function adjust(): void { run(() => store.adjustPoints(selectedCustomerId.value, adjustment.type, Number(adjustment.points), adjustment.reason, adjustment.requestId)) }
function loadLedger(): void { run(() => store.loadPointLedger(selectedCustomerId.value)) }
watch(pointsSettings, (value) => {
  if (!value) return
  const { id: _id, enterpriseId: _enterpriseId, updatedAt: _updatedAt, ...draft } = value
  Object.assign(settingsDraft, draft)
}, { immediate: true })
function saveSettings(): void { run(() => store.savePointsSettings({ ...settingsDraft })) }
onMounted(() => { store.loadOperations(); store.loadPointLedger(selectedCustomerId.value) })
</script>

<template>
  <section class="member-page">
    <header class="page-header"><div><p class="eyebrow">客户运营 · 原型模拟</p><h1>{{ title }}</h1><p>会员与积分只维护领域事实；订单最终价格和商城兑换由 provider 决定。</p></div><RouterLink class="button" to="/customers">返回客户</RouterLink></header>
    <CustomerSubnav /><p v-if="actionError || error" class="alert" role="alert">{{ actionError || error }}</p><div v-if="loading" class="state">正在加载会员与积分资料…</div>
    <template v-else-if="props.mode === 'membership-levels'"><section class="card"><h2>等级列表 <small>{{ membershipLevels.length }} 个</small></h2><table><thead><tr><th>等级</th><th>编码</th><th>升级条件</th><th>会员折扣</th><th>积分倍数</th><th>权益</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="level in membershipLevels" :key="level.id"><td><strong>{{ level.name }}</strong></td><td>{{ level.code }}</td><td>{{ level.conditionType }} ≥ {{ level.conditionValue }}</td><td>{{ level.memberDiscountPercent }}%</td><td>{{ level.pointsMultiplier }}x</td><td>{{ [level.benefits.freeShipping && '包邮', level.benefits.priorityShipping && '优先发货', level.benefits.dedicatedService && '专属客服'].filter(Boolean).join('、') || '—' }}</td><td><span class="badge">{{ level.status === 'active' ? '启用' : '停用' }}</span></td><td><button class="link" @click="run(() => store.assignMembership(selectedCustomerId, level.id))">分配演示客户</button><button class="link danger" @click="removeLevel(level.id)">删除</button></td></tr></tbody></table><p class="hint">会员数量与订单价格未接入时显示 unavailable；停用/历史引用等级不能物理删除。</p></section><form class="card form" @submit.prevent="saveLevel"><h2>新增会员等级</h2><label>等级名称<input v-model="levelDraft.name" required></label><label>等级编码<input v-model="levelDraft.code" required></label><label>排序<input v-model.number="levelDraft.sortOrder" type="number" min="0"></label><label>升级条件<select v-model="levelDraft.conditionType"><option value="amount">累计消费金额</option><option value="orders">累计订单数</option><option value="points">累计积分</option></select></label><label>条件值<input v-model.number="levelDraft.conditionValue" type="number" min="0"></label><label>会员折扣（%）<input v-model.number="levelDraft.memberDiscountPercent" type="number" min="1" max="100"></label><label>积分倍数<input v-model.number="levelDraft.pointsMultiplier" type="number" min="0" step="0.1"></label><button class="button button--primary" type="submit">保存等级</button></form></template>
    <template v-else-if="props.mode === 'points'"><section class="card"><div class="toolbar"><button class="button" @click="run(() => store.expirePoints().then(() => undefined))">按受控时钟处理过期</button><span class="hint">账本不可编辑/删除；未接入订单自动积分时显示 unavailable。</span></div><table><thead><tr><th>客户</th><th>累计获得</th><th>累计使用</th><th>累计过期</th><th>退款返还</th><th>可用积分</th><th>30 天内过期</th><th>操作</th></tr></thead><tbody><tr v-for="account in pointAccounts" :key="account.id"><td>{{ account.customerId }}</td><td>{{ account.totalEarned }}</td><td>{{ account.totalRedeemed }}</td><td>{{ account.totalExpired }}</td><td>{{ account.totalRefunded }}</td><td><strong>{{ account.availablePoints }}</strong></td><td>{{ account.expiringWithin30Days }}</td><td><button class="link" @click="selectedCustomerId = account.customerId; loadLedger()">查看明细</button></td></tr></tbody></table></section><section class="split"><section class="card"><h2>积分调整</h2><label>客户 ID<input v-model="selectedCustomerId"></label><label>调整类型<select v-model="adjustment.type"><option value="increase">增加</option><option value="decrease">扣减</option></select></label><label>积分数量<input v-model.number="adjustment.points" type="number" min="1"></label><label>调整原因<input v-model="adjustment.reason"></label><label>requestId<input v-model="adjustment.requestId"></label><button class="button button--primary" @click="adjust">提交调整</button><small>仅超级管理员/销售主管可调整；重复 requestId 幂等。</small></section><section class="card"><h2>积分明细 <small>{{ selectedLedger.length }} 条</small></h2><p v-if="!selectedLedger.length" class="hint">请选择客户查看</p><table v-else><thead><tr><th>时间</th><th>类型</th><th>积分</th><th>余额</th><th>来源</th></tr></thead><tbody><tr v-for="entry in selectedLedger" :key="entry.id"><td>{{ entry.occurredAt }}</td><td>{{ entry.type }}</td><td>{{ entry.points }}</td><td>{{ entry.balanceAfter }}</td><td>{{ entry.source }}</td></tr></tbody></table></section></section></template>
    <template v-else><form class="card settings-form" @submit.prevent="saveSettings"><h2>积分获取与使用</h2><label class="check"><input v-model="settingsDraft.enabled" type="checkbox"> 开启积分系统</label><label>每消费 1 元获得积分<input v-model.number="settingsDraft.orderEarnPerYuan" type="number" min="0"></label><label>单笔获取上限（0=不限）<input v-model.number="settingsDraft.orderEarnCapPerOrder" type="number" min="0"></label><label>每日获取上限<input v-model.number="settingsDraft.dailyEarnCap" type="number" min="0"></label><label>积分抵现比例（积分/元）<input v-model.number="settingsDraft.redemptionPointsPerYuan" type="number" min="0"></label><label>订单抵扣上限（%）<input v-model.number="settingsDraft.orderRedemptionCapPercent" type="number" min="0" max="100"></label><label>最低使用积分<input v-model.number="settingsDraft.minimumRedemptionPoints" type="number" min="0"></label><label>有效期<select v-model="settingsDraft.expiryType"><option value="never">永不过期</option><option value="fixed-days">固定天数</option><option value="yearly">按年度</option></select></label><label v-if="settingsDraft.expiryType === 'fixed-days'">有效期天数<input v-model.number="settingsDraft.expiryDays" type="number" min="1"></label><label v-if="settingsDraft.expiryType === 'yearly'">年度清零日期<input v-model="settingsDraft.yearlyExpiryDate" type="date"></label><label class="check"><input v-model="settingsDraft.mallEnabled" type="checkbox"> 开启积分商城</label><label v-if="settingsDraft.mallEnabled">兑换比例<input v-model.number="settingsDraft.exchangePointsRatio" type="number" min="1"></label><button class="button button--primary" type="submit">保存积分设置</button><p class="hint">订单价格顺序：会员/分类/促销/优惠券完成后，才使用积分抵扣；页面不重算订单金额。</p></form></template>
  </section>
</template>

<style scoped>
.member-page{max-width:1680px;margin:0 auto}.page-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px}.page-header h1{margin:3px 0}.page-header p{margin-bottom:0;color:var(--color-muted)}.button{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);text-decoration:none;cursor:pointer}.button--primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.alert{padding:10px;color:var(--color-danger);background:#fff0f0;border:1px solid #efcaca}.card{padding:16px;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md)}.card h2{margin:0 0 14px;font-size:16px}.card h2 small{margin-left:8px;color:var(--color-muted);font-size:12px;font-weight:400}.form,.settings-form{display:grid;gap:10px;align-content:start;margin-top:14px}.form label,.settings-form label{display:grid;gap:4px;color:var(--color-muted);font-size:12px}.check{display:flex!important;grid-template-columns:auto 1fr;align-items:center;gap:8px!important}.form input,.form select,.settings-form input,.settings-form select{min-height:35px;padding:6px 8px;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm)}table{width:100%;border-collapse:collapse}th,td{padding:10px 11px;text-align:left;border-bottom:1px solid var(--color-border);white-space:nowrap}th{color:var(--color-muted);font-size:12px;background:var(--color-table-head)}.badge{display:inline-flex;padding:3px 8px;color:var(--color-primary-strong);background:var(--color-primary-soft);border-radius:999px;font-size:12px}.link{padding:0;color:var(--color-primary-strong);cursor:pointer;background:transparent;border:0}.danger{margin-left:8px;color:var(--color-danger)}.hint{color:var(--color-muted);font-size:12px}.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.state{display:grid;min-height:220px;place-items:center;color:var(--color-muted)}.split{display:grid;grid-template-columns:330px minmax(0,1fr);gap:14px;margin-top:14px}.split .card{min-width:0;overflow:auto}.split table{min-width:700px}@media(max-width:900px){.page-header{align-items:flex-start;flex-direction:column;gap:10px}.split{grid-template-columns:1fr}table{min-width:1000px}}
</style>
