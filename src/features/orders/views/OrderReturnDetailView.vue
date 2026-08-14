<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useOrderStore } from '../runtime/order-store'
import OrderFulfillmentSubnav from '../components/OrderFulfillmentSubnav.vue'

const route = useRoute()
const store = useOrderStore()
const row = computed(() => store.returnDetail)
const value = computed(() => row.value?.value ?? null)
const reviewReason = ref('')
const cancelReason = ref('')
const voidReason = ref('')
const locationId = ref('')
const tab = ref<'detail'|'inbound'|'refund'>('detail')
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
const quantity = (milli: number, rate: number) => milli / rate
const statusText = { 'pending-review': '待审核', returned: '已退回', approved: '已审核', completed: '已完成', cancelled: '已取消' }
const refundText = { 'not-created': '未形成', pending: '待退款', refunded: '已退款', rejected: '已拒绝', 'not-required': '无需退款' }
async function reload() { await store.loadReturnDetail(String(route.params.returnId)); locationId.value ||= store.returnLocations[0]?.id ?? '' }
async function review(action: 'approve' | 'return') { if (value.value && await store.reviewReturn(value.value.id, value.value.version, action, reviewReason.value || undefined)) reviewReason.value = '' }
async function cancel() { if (value.value && await store.cancelReturn(value.value.id, value.value.version, cancelReason.value)) cancelReason.value = '' }
async function inbound() { if (value.value) await store.confirmReturnInbound(value.value.id, value.value.version, locationId.value) }
async function voidInbound() { if (value.value && await store.voidReturnInbound(value.value.id, value.value.version, voidReason.value)) voidReason.value = '' }
onMounted(reload)
</script>

<template>
  <section class="order-page">
    <OrderFulfillmentSubnav />
    <div v-if="store.loading" class="order-state"><strong>正在加载退单详情…</strong></div>
    <div v-else-if="store.error || !value" class="order-state error"><strong>无法打开客户退单</strong><p>{{ store.error ?? '退单不存在' }}</p></div>
    <template v-else>
      <header class="order-detail-header">
        <div><RouterLink class="order-back" to="/orders/returns">← 客户退单列表</RouterLink><p class="eyebrow">{{ value.returnNo }}</p><h1>{{ value.customerSnapshot.name }}</h1><span class="order-status">{{ statusText[value.status] }}</span></div>
        <div class="order-detail-actions"><RouterLink class="order-button" :to="`/orders/${value.orderId}`">原订单</RouterLink><RouterLink v-if="row?.canEdit" class="order-button primary" :to="`/orders/returns/${value.id}/edit`">修改</RouterLink></div>
      </header>
      <div v-if="store.error" class="order-notice error">{{ store.error }}</div>
      <nav class="order-tabs" aria-label="退单详情页签"><button :class="{active:tab==='detail'}" @click="tab='detail'">退单详情</button><button :class="{active:tab==='inbound'}" @click="tab='inbound'">收货入库</button><button :class="{active:tab==='refund'}" @click="tab='refund'">退款记录</button></nav>
      <section v-if="tab==='detail'" class="order-card">
        <h2>退单与三态进度</h2>
        <dl class="order-grid"><div><dt>原订单</dt><dd>{{ value.orderNoSnapshot }}</dd></div><div><dt>退货仓库</dt><dd>{{ value.warehouseSnapshot.name }}</dd></div><div><dt>退单状态</dt><dd>{{ statusText[value.status] }}</dd></div><div><dt>收货状态</dt><dd>{{ value.receivingStatus === 'received' ? '已收货入库' : '待收货' }}</dd></div><div><dt>退款状态</dt><dd>{{ refundText[value.refundStatus] }}</dd></div><div><dt>退款偏好</dt><dd>{{ {original:'原路退回',cash:'现金',balance:'余额'}[value.refundPreference] }}</dd></div><div><dt>退货原因</dt><dd>{{ value.reason }}</dd></div><div><dt>备注</dt><dd>{{ value.remark ?? '—' }}</dd></div></dl>
      </section>
      <section v-if="tab==='detail'" class="order-card">
        <h2>退货商品</h2>
        <div class="order-table-wrap"><table class="order-table"><thead><tr><th>商品</th><th>规格</th><th>退货数量</th><th class="order-money">默认权益</th><th class="order-money">退货金额</th></tr></thead><tbody><tr v-for="item in value.items" :key="item.id"><td>{{ item.productNameSnapshot }}<small>{{ item.skuCodeSnapshot }}</small></td><td>{{ item.specificationSnapshot }} / {{ item.unitSnapshot.name }}</td><td>{{ quantity(item.returnQuantityMilli,item.unitSnapshot.conversionRateMilli) }}</td><td class="order-money">{{ row?.amountsVisible ? money(item.defaultReturnAmountCents) : '已遮蔽' }}</td><td class="order-money">{{ row?.amountsVisible ? money(item.returnAmountCents) : '已遮蔽' }}</td></tr></tbody></table></div>
        <div v-if="row?.amountsVisible" class="order-financials order-form-financials"><div><span>退货毛额</span><strong>{{ money(value.grossAmountCents) }}</strong></div><div><span>优惠分摊</span><strong>-{{ money(value.allocatedOrderDiscountCents) }}</strong></div><div><span>退单金额</span><strong>{{ money(value.returnAmountCents) }}</strong></div><div><span>运费 / 赠品</span><strong>不退 / 0 元</strong></div></div>
      </section>
      <section v-if="tab==='inbound'" class="order-card"><h2>退货入库记录</h2><dl v-if="value.inboundProjection" class="order-grid"><div><dt>收货时间</dt><dd>{{ value.inboundProjection.receivedAt }}</dd></div><div><dt>收货人</dt><dd>{{ value.inboundProjection.receivedBy.name }}</dd></div><div><dt>库存流水</dt><dd>{{ value.inboundProjection.movementIds.length }} 条</dd></div><div><dt>作废状态</dt><dd>{{ value.inboundProjection.voidInfo ? `已作废：${value.inboundProjection.voidInfo.reason}` : '有效' }}</dd></div></dl><p v-else class="order-unavailable">尚未确认退货入库。</p></section>
      <section v-if="tab==='refund'" class="order-card"><h2>贷项与退款投影</h2><dl v-if="value.refundProjection" class="order-grid"><div><dt>贷项金额</dt><dd>{{ money(value.refundProjection.creditAmountCents) }}</dd></div><div><dt>退款义务</dt><dd>{{ money(value.refundProjection.obligationAmountCents) }}</dd></div><div><dt>退款单号</dt><dd>{{ value.refundProjection.refundNo ?? '未生成' }}</dd></div><div><dt>已退金额</dt><dd>{{ money(value.refundProjection.refundedAmountCents) }}</dd></div></dl><p v-else class="order-unavailable">退货入库前不会形成应收贷项或退款申请。</p><RouterLink v-if="value.refundProjection?.refundId" class="order-button" :to="`/finance/refunds/${value.refundProjection.refundId}`">前往资金退款</RouterLink></section>
      <section v-if="value.status==='pending-review' && ['super-admin','sales-supervisor'].includes(store.actor.role)" class="order-card"><h2>审核退单</h2><label class="order-review-reason">退回原因<input v-model="reviewReason" maxlength="200" placeholder="退回时必填"></label><div class="order-detail-actions"><button class="order-button" :disabled="store.saving || !reviewReason.trim()" @click="review('return')">退回修改</button><button class="order-button primary" :disabled="store.saving" @click="review('approve')">审核通过</button></div></section>
      <section v-if="value.status==='approved' && value.receivingStatus==='pending' && ['super-admin','warehouse'].includes(store.actor.role)" class="order-card"><h2>确认退货入库</h2><label class="order-review-reason">实际库位<select v-model="locationId"><option v-for="item in store.returnLocations" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><button class="order-button primary" :disabled="store.saving || !locationId" @click="inbound">确认入库并形成应收贷项</button></section>
      <section v-if="value.receivingStatus==='received' && value.refundStatus!=='refunded' && ['super-admin','warehouse'].includes(store.actor.role)" class="order-card"><h2>作废退货入库</h2><p class="order-notice">会精确冲销库存流水、贷项和未完成退款；已完成退款时禁止作废。</p><label class="order-review-reason">作废原因<input v-model="voidReason" maxlength="200"></label><button class="order-button danger" :disabled="store.saving || !voidReason.trim()" @click="voidInbound">确认作废</button></section>
      <section v-if="['pending-review','returned','approved'].includes(value.status) && value.receivingStatus==='pending' && ['super-admin','sales-supervisor','salesperson'].includes(store.actor.role)" class="order-card"><h2>取消退单</h2><label class="order-review-reason">取消原因<input v-model="cancelReason" maxlength="200"></label><button class="order-button danger" :disabled="store.saving || !cancelReason.trim()" @click="cancel">取消并释放可退数量</button></section>
      <section class="order-card"><h2>操作记录</h2><ul class="order-review-history"><li v-for="log in [...value.activityLogs].reverse()" :key="log.id"><strong>{{ log.summary }}</strong><span>{{ log.occurredAt }} · {{ log.actorSnapshot.name }}</span><p v-if="log.reason">{{ log.reason }}</p></li></ul></section>
    </template>
  </section>
</template>
