<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute } from "vue-router";
import QRCode from "qrcode";
import OrderScenarioBar from "../components/OrderScenarioBar.vue";
import OrderFulfillmentSubnav from "../components/OrderFulfillmentSubnav.vue";
import { useOrderStore } from "../runtime/order-store";
import type { OrderProviderValue, OrderReviewAction, OrderStatus } from "../types";
import "./order-views.css";

const route = useRoute();
const store = useOrderStore();
const {
  detail,
  loading,
  saving,
  error,
  scenario,
  actor,
  canOutput,
  canManage,
  share,
  fulfillmentDetail,
  outboundPreview,
} = storeToRefs(store);
const tab = ref<"detail" | "fulfillment" | "receipt" | "payment">(route.query.tab==='fulfillment'?'fulfillment':route.query.tab==='receipt'?'receipt':route.query.tab==='payment'?'payment':'detail');
const printOpen = ref(false);
const shareOpen = ref(false);
const shareDuration = ref<1 | 7 | 30>(7);
const shareQr = ref("");
const sharePath = computed(() =>
  share.value
    ? `/share/orders/${encodeURIComponent(share.value.token)}`
    : "/orders",
);
const message = ref("");
const reviewAction = ref<OrderReviewAction | null>(null);
const reviewReason = ref("");
const outboundOpen=ref(false);const outboundWarehouseId=ref("");const outboundQuantities=ref<Record<string,number>>({});const finishShort=ref(false);const shortReason=ref("");const voidReason=ref<Record<string,string>>({});const logisticsCode=ref("");const shipmentRemark=ref("");const signer=ref("演示签收人");const signedAt=ref("2026-08-10T10:00");const receiptRemark=ref("");
const orderId = computed(() => String(route.params.orderId));
const statusLabels: Record<OrderStatus, string> = {
  "pending-order-review": "待订单审核",
  "pending-finance-review": "待财务审核",
  approved: "已审核（待出库）",
  "outbound-in-progress": "出库中",
  outbound: "已出库（待发货）",
  shipped: "已发货（待签收）",
  completed: "已完成",
  canceled: "已取消",
};
const reviewLabels:Record<OrderReviewAction,string>={"approve-order":"订单审核通过","return-order":"退回待修改","approve-finance":"财务审核通过","return-finance":"财务退回","cancel-order":"取消订单"};
const needsReason=(action:OrderReviewAction)=>["return-order","return-finance","cancel-order"].includes(action);
const currentStatusLabel=computed(()=>{const order=detail.value?.order;if(!order)return'';const latest=order.reviewRecords?.at(-1);return order.status==='pending-order-review'&&latest?.outcome==='returned'&&latest.round===(order.reviewRound??1)?'待订单审核（已退回待修改）':statusLabels[order.status]});
const money = (value: number | null) =>
  value === null ? "已遮蔽" : `¥${(value / 100).toFixed(2)}`;
const fulfillmentMoney=(value:number)=>actor.value.role==='warehouse'?'已遮蔽':money(value);
const receivableStatusLabels={open:'待收款',partial:'部分收款',settled:'已收清'} as const;
const canRecordPayment=computed(()=>['super-admin','finance'].includes(actor.value.role));
const quantity = (value: number) =>
  `${(value / 1000).toLocaleString("zh-CN", { maximumFractionDigits: 3 })}`;
function providerMoney(value: OrderProviderValue<number>) {
  return value.state === "available" ? money(value.value) : value.message;
}
const timeline = computed(() => {
  const status = detail.value?.order.status;
  const stage =
    status === "completed"
      ? 4
      : status === "shipped"
        ? 3
        : status === "outbound" || status === "outbound-in-progress"
          ? 2
          : status === "approved"
            ? 1
            : status === "pending-finance-review" ||
                status === "pending-order-review"
              ? 0
              : 0;
  return stage;
});
async function confirmPrint() {
  if (!detail.value) return;
  await store.confirmPrint(
    [detail.value.order.id],
    `print-detail-${Date.now()}`,
  );
  message.value = "已确认打印订单（原型模拟）";
  printOpen.value = false;
}
async function generateShare() {
  if (!detail.value) return;
  const result = await store.createShare(
    detail.value.order.id,
    shareDuration.value,
  );
  if (result) {
    shareQr.value = await QRCode.toDataURL(result.qrValue, {
      width: 220,
      margin: 1,
      color: { dark: "#183146", light: "#ffffff" },
    });
    shareOpen.value = true;
  }
}
async function copyShare() {
  if (!share.value) return;
  try {
    await navigator.clipboard.writeText(share.value.url);
    message.value = "分享链接已复制";
  } catch {
    message.value = "浏览器未授权复制，请手工复制分享链接";
  }
}
function openReview(action:OrderReviewAction){reviewAction.value=action;reviewReason.value=""}
async function confirmReview(){if(!detail.value||!reviewAction.value)return;const action=reviewAction.value;const ok=await store.reviewOrder(detail.value.order.id,action,detail.value.order.updatedAt,reviewReason.value||null);if(ok){message.value=reviewLabels[action];reviewAction.value=null;reviewReason.value=""}}
const hasPermission=(permission:string)=>fulfillmentDetail.value?.permissions.includes(permission as never)??false;
function openOutbound(){if(!fulfillmentDetail.value)return;outboundWarehouseId.value=fulfillmentDetail.value.order.fulfillmentWarehouseSnapshot.id;const actual=fulfillmentDetail.value.order.fulfillmentProjection.outboundQuantityMilliByLine??{};outboundQuantities.value=Object.fromEntries(fulfillmentDetail.value.order.lines.map(line=>[line.id,Math.max(0,(line.quantityMilli-(actual[line.id]??0))/line.unitSnapshot.conversionRateMilli)]));finishShort.value=false;shortReason.value="";outboundOpen.value=true;outboundPreview.value=null}
function outboundInput(){return{orderId:orderId.value,warehouseId:outboundWarehouseId.value,lines:Object.entries(outboundQuantities.value).filter(([,value])=>Number(value)>0).map(([orderLineId,value])=>({orderLineId,quantity:Number(value)})),finishShort:finishShort.value,reason:finishShort.value?shortReason.value:null}}
async function previewOutbound(){await store.previewFulfillment(outboundInput())}
async function confirmOutbound(){if(await store.confirmFulfillment(outboundInput())){message.value=outboundPreview.value?.differenceLines.length?'出库与短装差异已确认':'销售出库已确认';outboundOpen.value=false}}
async function voidOutbound(id:string){const reason=voidReason.value[id]?.trim();if(reason&&await store.voidFulfillment(id,reason)){message.value='出库单已作废并精确恢复库存';voidReason.value[id]=""}}
async function resolveDifference(id:string,outcome:'reship'|'ignore'|'refund'){if(await store.resolveDifference(id,outcome))message.value=outcome==='reship'?'差异已转补发':'已接受短装，可继续发货'}
async function ship(){if(await store.shipOrder({orderId:orderId.value,logisticsCode:logisticsCode.value||null,remark:shipmentRemark.value||null}))message.value='已确认发货并形成一次订单全额应收'}
async function receive(){const value=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(signedAt.value)?`${signedAt.value}:00+08:00`:signedAt.value;if(await store.receiveOrder({orderId:orderId.value,signedAt:value,signer:signer.value,remark:receiptRemark.value||null}))message.value='订单已确认签收并完成'}
onMounted(() => Promise.all([store.loadDetail(orderId.value),store.loadFulfillment(orderId.value)]));
</script>
<template>
  <section class="order-page">
    <div v-if="loading" class="order-state">
      <strong>正在加载订单详情…</strong>
    </div>
    <div v-else-if="error || !detail" class="order-state error">
      <strong>无法打开订单详情</strong>
      <p>{{ error ?? "订单不存在" }}</p>
      <RouterLink class="order-button" to="/orders">返回订单列表</RouterLink>
    </div>
    <template v-else
      ><header class="order-detail-header">
        <div>
          <RouterLink class="order-back" to="/orders"
            >← 客户订单列表</RouterLink
          >
          <p class="eyebrow">{{ detail.order.orderNo }}</p>
          <h1>{{ detail.order.customerSnapshot.name }}</h1>
          <span
            class="order-status"
            :class="`order-status-${detail.order.status}`"
            >{{ currentStatusLabel }}</span
          >
          <span v-if="detail.order.specialPrice" class="order-special-badge">特价订单</span>
        </div>
        <div>
          <OrderScenarioBar
            :scenario="scenario"
            :role="actor.role"
            @scenario="
              async (value) => {
                await store.setScenario(value);
                await store.loadDetail(orderId);
                await store.loadFulfillment(orderId);
              }
            "
            @role="
              async (value) => {
                await store.setRole(value);
                await store.loadDetail(orderId);
                await store.loadFulfillment(orderId);
              }
            "
          />
          <div class="order-detail-actions">
            <button class="order-button" @click="store.loadDetail(orderId);store.loadFulfillment(orderId)">
              刷新</button
            ><RouterLink
              v-if="canManage && detail.order.status === 'pending-order-review'"
              class="order-button"
              :to="`/orders/${orderId}/edit`"
              >修改</RouterLink
            ><button
              v-if="canManage && detail.order.status !== 'canceled'"
              class="order-button"
              :disabled="saving"
              @click="generateShare"
            >
              分享</button
            ><button
              v-if="canOutput"
              class="order-button"
              @click="printOpen = true"
            >
              打印</button
            ><button
              v-if="canOutput"
              class="order-button"
              @click="
                message = '详情导出请从列表选中该订单后执行（原型 CSV）。'
              "
            >
              导出说明
            </button>
            <button v-for="action in detail.reviewActions" :key="action" class="order-button" :class="action === 'cancel-order' ? 'danger' : 'primary'" :disabled="saving" @click="openReview(action)">{{ reviewLabels[action] }}</button>
          </div>
        </div>
      </header>
      <OrderFulfillmentSubnav />
      <p v-if="message" class="order-panel" style="padding: 9px 12px">
        {{ message }}
      </p>
      <div class="order-timeline" aria-label="订单流程时间轴">
        <span :class="{ done: timeline >= 1 }">审核</span
        ><span :class="{ done: timeline >= 2 }">出库</span
        ><span :class="{ done: timeline >= 3 }">发货</span
        ><span :class="{ done: timeline >= 4 }">完成</span>
      </div>
      <nav class="order-tabs">
        <button :class="{ active: tab === 'detail' }" @click="tab = 'detail'">
          订单详情</button
        ><button
          :class="{ active: tab === 'fulfillment' }"
          @click="tab = 'fulfillment'"
        >
          出库发货记录</button
        ><button
          :class="{ active: tab === 'receipt' }"
          @click="tab = 'receipt'"
        >
          签收记录</button
        ><button
          :class="{ active: tab === 'payment' }"
          @click="tab = 'payment'"
        >
          收款记录
        </button>
      </nav>
      <main v-if="tab === 'detail'" class="order-detail-body">
        <section class="order-card">
          <h2>基础信息</h2>
          <dl class="order-grid">
            <div>
              <dt>订单状态</dt>
              <dd>{{ currentStatusLabel }}</dd>
            </div>
            <div>
              <dt>客户</dt>
              <dd>{{ detail.order.customerSnapshot.name }}</dd>
            </div>
            <div>
              <dt>客户编码</dt>
              <dd>{{ detail.order.customerSnapshot.code }}</dd>
            </div>
            <div>
              <dt>结算客户</dt>
              <dd>{{ detail.order.settlementCustomerSnapshot.name }}</dd>
            </div>
            <div>
              <dt>结算方式</dt>
              <dd>
                {{
                  { cash: "现结", monthly: "月结", terms: "账期" }[
                    detail.order.settlementSnapshot.method
                  ]
                }}
              </dd>
            </div>
            <div>
              <dt>业务员</dt>
              <dd>{{ detail.order.salespersonSnapshot.name }}</dd>
            </div>
            <div>
              <dt>制单人</dt>
              <dd>{{ detail.order.creatorSnapshot.name }}</dd>
            </div>
            <div>
              <dt>下单时间</dt>
              <dd>
                {{ detail.order.orderedAt.slice(0, 16).replace("T", " ") }}
              </dd>
            </div>
          </dl>
        </section>
        <section v-if="detail.order.specialPrice" class="order-card order-special-card">
          <h2>特价审批依据</h2>
          <p><strong>申请原因：</strong>{{ detail.order.specialPriceReason ?? "价格依据已遮蔽" }}</p>
          <div v-if="detail.order.specialPriceEvidence?.length" class="order-table-wrap">
            <table class="order-table"><thead><tr><th>SKU</th><th>单位</th><th class="order-money">成交价</th><th class="order-money">最低 / 最高</th><th>越界方向</th></tr></thead><tbody><tr v-for="item in detail.order.specialPriceEvidence" :key="item.lineId"><td>{{ item.skuCodeSnapshot }}</td><td>{{ item.unitNameSnapshot }}</td><td class="order-money">{{ money(item.dealUnitPriceCents) }}</td><td class="order-money">{{ item.minimumSalePriceCents === null ? "—" : money(item.minimumSalePriceCents) }} / {{ item.maximumSalePriceCents === null ? "—" : money(item.maximumSalePriceCents) }}</td><td>{{ item.direction === "below-minimum" ? "低于最低售价" : "高于最高售价" }}</td></tr></tbody></table>
          </div>
          <p v-else class="order-unavailable">本单为人工标记特价，没有越界商品行；财务按申请原因强化确认。</p>
        </section>
        <section class="order-card">
          <h2>审核历史 · 第 {{ detail.order.reviewRound ?? 1 }} 轮</h2>
          <ol v-if="detail.order.reviewRecords?.length" class="order-review-history">
            <li v-for="item in detail.order.reviewRecords" :key="item.id"><strong>第 {{ item.round }} 轮 · {{ item.stage === "order" ? "业务审核" : "财务审核" }} · {{ { approved:"通过", returned:"退回", canceled:"取消" }[item.outcome] }}</strong><span>{{ item.occurredAt.slice(0,16).replace("T"," ") }} · {{ item.actorSnapshot.name }}</span><p>{{ item.reason ?? "无备注" }}<template v-if="item.releasedPrepaymentCents"> · 已释放预收 {{ money(item.releasedPrepaymentCents) }}</template></p></li>
          </ol>
          <p v-else class="order-unavailable">尚无审核记录。</p>
        </section>
        <section class="order-card">
          <h2>客户财务实时数据</h2>
          <div class="order-financials">
            <div>
              <span>应收额度</span
              ><strong>{{
                providerMoney(detail.financials.creditLimitCents)
              }}</strong>
            </div>
            <div>
              <span>应收总额</span
              ><strong>{{
                providerMoney(detail.financials.receivablesCents)
              }}</strong>
            </div>
            <div>
              <span>可用预收</span
              ><strong>{{
                providerMoney(detail.financials.availablePrepaymentCents)
              }}</strong>
            </div>
            <div>
              <span>订单占用预收</span
              ><strong>{{
                providerMoney(detail.financials.occupiedPrepaymentCents)
              }}</strong>
            </div>
          </div>
        </section>
        <section class="order-card">
          <h2>商品明细</h2>
          <div class="order-table-wrap">
            <table class="order-table" style="min-width: 1050px">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>商品 / 编码</th>
                  <th>规格</th>
                  <th class="order-money">数量</th>
                  <th>单位</th>
                  <th class="order-money">折扣</th>
                  <th class="order-money">单价 / 原价</th>
                  <th class="order-money">小计</th>
                  <th>库荐</th>
                  <th class="order-money">重量(kg)</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in detail.order.lines" :key="line.id">
                  <td>{{ line.sequence }}</td>
                  <td>
                    <strong>{{ line.productNameSnapshot }}</strong
                    ><small
                      >{{ line.productCodeSnapshot }} /
                      {{ line.skuCodeSnapshot }}</small
                    >
                  </td>
                  <td>{{ line.specificationSnapshot }}</td>
                  <td class="order-money">
                    {{ quantity(line.quantityMilli) }}
                  </td>
                  <td>{{ line.unitSnapshot.name }}</td>
                  <td class="order-money">
                    {{
                      line.discountBasisPoints === null
                        ? "已遮蔽"
                        : `${line.discountBasisPoints / 100}%`
                    }}
                  </td>
                  <td class="order-money">
                    {{ money(line.dealUnitPriceCents) }} /
                    {{ money(line.originalUnitPriceCents) }}
                  </td>
                  <td class="order-money">{{ money(line.subtotalCents) }}</td>
                  <td>
                    <span class="order-unavailable">{{
                      detail.inventoryRecommendation.message
                    }}</span>
                  </td>
                  <td class="order-money">
                    {{
                      line.weightSubtotalGrams === null
                        ? "—"
                        : (line.weightSubtotalGrams / 1000).toFixed(3)
                    }}
                  </td>
                  <td>{{ line.reason ?? "—" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="order-card">
          <h2>金额汇总</h2>
          <dl class="order-grid">
            <div>
              <dt>原价金额</dt>
              <dd>{{ money(detail.order.amounts.originalAmountCents) }}</dd>
            </div>
            <div>
              <dt>商品优惠（含赠品）</dt>
              <dd>{{ money(detail.order.amounts.productDiscountCents) }}</dd>
            </div>
            <div>
              <dt>整单优惠</dt>
              <dd>{{ money(detail.order.amounts.orderDiscountCents) }}</dd>
            </div>
            <div>
              <dt>运费</dt>
              <dd>{{ money(detail.order.amounts.freightCents) }}</dd>
            </div>
            <div>
              <dt>订单金额</dt>
              <dd>
                <strong>{{
                  money(detail.order.amounts.orderAmountCents)
                }}</strong>
              </dd>
            </div>
          </dl>
        </section>
        <section class="order-card">
          <h2>收货与开票</h2>
          <dl class="order-grid">
            <div>
              <dt>预期交货</dt>
              <dd>
                {{
                  detail.order.requestedDeliveryAt
                    .slice(0, 16)
                    .replace("T", " ")
                }}
              </dd>
            </div>
            <div>
              <dt>配送方式</dt>
              <dd>
                {{
                  {
                    "door-delivery": "送货上门",
                    logistics: "物流配送",
                    "customer-pickup": "客户自提",
                  }[detail.order.shippingSnapshot.deliveryMethod]
                }}
              </dd>
            </div>
            <div>
              <dt>收货人 / 电话</dt>
              <dd>
                {{ detail.order.shippingSnapshot.recipient }} /
                {{ detail.order.shippingSnapshot.phone ?? "已遮蔽" }}
              </dd>
            </div>
            <div>
              <dt>计划仓库</dt>
              <dd>{{ detail.order.fulfillmentWarehouseSnapshot.name }}</dd>
            </div>
            <div style="grid-column: 1/-1">
              <dt>详细地址</dt>
              <dd>
                {{ detail.order.shippingSnapshot.province
                }}{{ detail.order.shippingSnapshot.city
                }}{{ detail.order.shippingSnapshot.district
                }}{{
                  detail.order.shippingSnapshot.address ?? "（详细地址已遮蔽）"
                }}
              </dd>
            </div>
            <div>
              <dt>开票状态</dt>
              <dd>
                {{
                  { none: "不开票", pending: "待开票", invoiced: "已开票" }[
                    detail.order.invoiceStatus
                  ]
                }}
              </dd>
            </div>
            <div>
              <dt>发票抬头</dt>
              <dd>{{ detail.order.invoiceTitleSnapshot ?? "—" }}</dd>
            </div>
          </dl>
        </section>
        <section class="order-card">
          <h2>自定义属性</h2>
          <dl class="order-grid">
            <div v-for="item in detail.order.customAttributes" :key="item.key">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value?.slice(0, 16).replace("T", " ") ?? "—" }}</dd>
            </div>
          </dl>
        </section>
        <section class="order-card">
          <h2>备注、附件与操作日志</h2>
          <p>{{ detail.order.remark ?? "暂无备注" }}</p>
          <ul>
            <li v-for="item in detail.order.attachments" :key="item.id">
              {{ item.name }} · {{ item.sizeBytes }} bytes
            </li>
            <li v-if="!detail.order.attachments.length">暂无附件</li>
          </ul>
          <ol>
            <li v-for="item in detail.order.activityLogs" :key="item.id">
              {{ item.occurredAt.slice(0, 16).replace("T", " ") }} ·
              {{ item.actor.name }} · {{ item.summary }}
            </li>
          </ol>
        </section>
      </main>
      <main v-else-if="tab==='fulfillment'&&fulfillmentDetail" class="order-detail-body">
        <section class="order-card"><div class="order-toolbar"><div><h2>待出库与履约动作</h2><p>当前计划仓：{{ fulfillmentDetail.order.fulfillmentWarehouseSnapshot.name }}；在途/预购未接入，不计入可出量。</p></div><div class="order-detail-actions"><button v-if="hasPermission('orders.outbound')&&['approved','outbound-in-progress'].includes(fulfillmentDetail.order.status)" class="order-button primary" :disabled="saving" @click="openOutbound">{{ fulfillmentDetail.order.status==='outbound-in-progress'?'继续出库':'销售出库' }}</button><button v-if="hasPermission('orders.ship')&&fulfillmentDetail.order.status==='outbound'" class="order-button primary" :disabled="saving" @click="ship">确认发货</button></div></div><div v-if="hasPermission('orders.ship')&&fulfillmentDetail.order.status==='outbound'" class="order-grid"><label class="order-field"><span>物流编码（物流配送必填）</span><input v-model="logisticsCode" maxlength="80" placeholder="MOCK-SF-20260810"/></label><label class="order-field"><span>发货备注</span><input v-model="shipmentRemark" maxlength="500"/></label></div></section>
        <section class="order-card"><h2>销售出库记录</h2><div v-if="!fulfillmentDetail.outbounds.length" class="order-state"><strong>尚无出库记录</strong></div><div v-else class="order-table-wrap"><table class="order-table" style="min-width:1050px"><thead><tr><th>出库单</th><th>时间 / 仓库</th><th>商品</th><th>FIFO 批次 / 库位</th><th class="order-money">金额</th><th>状态 / 操作</th></tr></thead><tbody><tr v-for="item in fulfillmentDetail.outbounds" :key="item.id"><td><RouterLink :to="`/orders/outbounds/${item.id}`">{{ item.outboundNo }}</RouterLink></td><td>{{ item.confirmedAt.slice(0,16).replace('T',' ') }}<small>{{ item.warehouseSnapshot.name }}</small></td><td><small v-for="line in item.lines" :key="line.id">{{ line.productNameSnapshot }} × {{ line.quantity }} {{ line.unitSnapshot.name }}</small></td><td><template v-for="line in item.lines" :key="line.id"><small v-for="part in line.allocations" :key="part.movementId">{{ part.batchNumber }} · {{ part.locationName }} · {{ quantity(part.quantityMilli) }}</small></template><span v-if="item.lines.every(line=>!line.allocations.length)">当前角色已遮蔽</span></td><td class="order-money">{{ fulfillmentMoney(item.documentAmountCents) }}</td><td>{{ item.status==='confirmed'?'已确认':'已作废' }}<template v-if="item.status==='confirmed'&&hasPermission('orders.void-outbound')&&!fulfillmentDetail.shipment"><input v-model="voidReason[item.id]" maxlength="200" placeholder="作废原因"/><button class="order-row-link" :disabled="saving||!voidReason[item.id]?.trim()" @click="voidOutbound(item.id)">作废</button></template><small v-if="item.voidInfo">{{ item.voidInfo.reason }}</small></td></tr></tbody></table></div></section>
        <section v-if="fulfillmentDetail.differences.length" class="order-card"><h2>差异单</h2><div class="order-table-wrap"><table class="order-table"><thead><tr><th>差异单</th><th>原因</th><th class="order-money">差异金额</th><th>状态 / 处理</th></tr></thead><tbody><tr v-for="item in fulfillmentDetail.differences" :key="item.id"><td><RouterLink :to="`/orders/differences/${item.id}`">{{ item.differenceNo }}</RouterLink></td><td>{{ item.reason }}</td><td class="order-money">{{ fulfillmentMoney(item.differenceAmountCents) }}</td><td>{{ item.status==='pending-confirmation'?'待确认':item.outcome==='reship'?'已转补发':item.outcome==='ignore'?'已忽略':'已作废' }}<div v-if="item.status==='pending-confirmation'&&hasPermission('orders.confirm-difference')" class="order-detail-actions"><button class="order-row-link" @click="resolveDifference(item.id,'reship')">补发</button><button class="order-row-link" @click="resolveDifference(item.id,'ignore')">忽略</button><button class="order-row-link" disabled title="等待 ORD-005 / FIN-004">退款（后续）</button></div></td></tr></tbody></table></div></section>
        <section v-if="fulfillmentDetail.shipment" class="order-card"><h2>发货记录</h2><dl class="order-grid"><div><dt>发货时间</dt><dd>{{ fulfillmentDetail.shipment.shippedAt.slice(0,16).replace('T',' ') }}</dd></div><div><dt>配送方式</dt><dd>{{ fulfillmentDetail.shipment.deliveryMethod }}</dd></div><div><dt>物流编码</dt><dd>{{ fulfillmentDetail.shipment.logisticsCode??'不适用' }}</dd></div><div><dt>关联出库单</dt><dd>{{ fulfillmentDetail.shipment.outboundIds.length }} 张</dd></div></dl></section>
      </main>
      <main v-else-if="tab==='receipt'&&fulfillmentDetail" class="order-detail-body"><section class="order-card"><h2>签收记录</h2><dl v-if="fulfillmentDetail.receipt" class="order-grid"><div><dt>签收时间</dt><dd>{{ fulfillmentDetail.receipt.signedAt.slice(0,16).replace('T',' ') }}</dd></div><div><dt>签收人</dt><dd>{{ fulfillmentDetail.receipt.signer }}</dd></div><div><dt>操作人</dt><dd>{{ fulfillmentDetail.receipt.operatorSnapshot.name }}</dd></div><div><dt>备注</dt><dd>{{ fulfillmentDetail.receipt.remark??'—' }}</dd></div></dl><div v-else-if="fulfillmentDetail.order.status==='shipped'&&hasPermission('orders.confirm-receipt')" class="order-grid"><label class="order-field"><span>签收时间</span><input v-model="signedAt" type="datetime-local"/></label><label class="order-field"><span>签收人</span><input v-model="signer" maxlength="80"/></label><label class="order-field"><span>备注</span><input v-model="receiptRemark" maxlength="500"/></label><div><button class="order-button primary" :disabled="saving||!signer.trim()" @click="receive">确认签收</button></div></div><p v-else class="order-unavailable">无签收记录；只有已发货订单可以确认一次成功签收。</p></section></main>
      <main v-else-if="tab==='payment'&&fulfillmentDetail" class="order-detail-body"><section class="order-card"><div class="order-toolbar"><div><h2>订单应收投影</h2><p>数据来自资金域唯一事实源，订单域不保存可变余额。</p></div><div v-if="fulfillmentDetail.receivable" class="order-detail-actions"><RouterLink class="order-button" :to="`/finance/receivables/documents?keyword=${encodeURIComponent(fulfillmentDetail.receivable.orderNo)}`">查看应收明细</RouterLink><RouterLink v-if="canRecordPayment&&fulfillmentDetail.receivable.outstandingCents>0" class="order-button primary" :to="`/finance/receipts/new?customerId=${encodeURIComponent(fulfillmentDetail.receivable.customerSnapshot.id)}&orderId=${encodeURIComponent(fulfillmentDetail.receivable.orderId)}`">登记收款</RouterLink></div></div><dl v-if="fulfillmentDetail.receivable" class="order-grid"><div><dt>形成时点</dt><dd>{{ fulfillmentDetail.receivable.occurredAt.slice(0,16).replace('T',' ') }}</dd></div><div><dt>应收金额</dt><dd>{{ money(fulfillmentDetail.receivable.amountCents) }}</dd></div><div><dt>已收/优惠</dt><dd>{{ money(fulfillmentDetail.receivable.receivedCents) }}</dd></div><div><dt>待收金额</dt><dd>{{ money(fulfillmentDetail.receivable.outstandingCents) }}</dd></div><div><dt>状态</dt><dd>{{ receivableStatusLabels[fulfillmentDetail.receivable.status] }}</dd></div><div><dt>收款 / 核销</dt><dd>{{ fulfillmentDetail.receivable.receiptCount }} / {{ fulfillmentDetail.receivable.writeoffCount }}</dd></div><div><dt>来源</dt><dd>订单确认发货</dd></div></dl><p v-else class="order-unavailable">尚未确认发货，因此未形成客户应收。</p></section></main>
      <section v-else class="order-tab-unavailable"><strong>履约数据暂不可用</strong><p>请刷新或切换到有权限的角色。</p></section>
      <div v-if="outboundOpen&&fulfillmentDetail" class="order-modal"><section class="order-modal__card" style="width:min(980px,94vw)"><h2>销售出库</h2><div class="order-grid"><label class="order-field"><span>出库仓库</span><select v-model="outboundWarehouseId"><option v-for="warehouse in fulfillmentDetail.warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.code }} · {{ warehouse.name }}</option></select></label><label class="order-field"><span>结束剩余</span><span><input v-model="finishShort" type="checkbox"/> 按实出结束并生成一张差异单</span></label></div><div class="order-table-wrap"><table class="order-table"><thead><tr><th>商品</th><th>订货数量</th><th>已出数量</th><th>本次数量（订单单位正整数）</th></tr></thead><tbody><tr v-for="line in fulfillmentDetail.order.lines" :key="line.id"><td>{{ line.productNameSnapshot }}<small>{{ line.skuCodeSnapshot }} · {{ line.unitSnapshot.name }}</small></td><td>{{ line.quantityMilli/line.unitSnapshot.conversionRateMilli }}</td><td>{{ (fulfillmentDetail.order.fulfillmentProjection.outboundQuantityMilliByLine?.[line.id]??0)/line.unitSnapshot.conversionRateMilli }}</td><td><input v-model.number="outboundQuantities[line.id]" type="number" min="0" step="1"/></td></tr></tbody></table></div><label v-if="finishShort" class="order-field"><span>短装原因（1～200字）</span><textarea v-model="shortReason" maxlength="200"/></label><section v-if="outboundPreview" class="order-notice"><strong>FIFO 预览 · {{ outboundPreview.warehouse.name }}</strong><p>出库金额 {{ fulfillmentMoney(outboundPreview.documentAmountCents) }}；差异行 {{ outboundPreview.differenceLines.length }} 条。</p><small v-for="line in outboundPreview.lines" :key="line.id">{{ line.productNameSnapshot }}：<template v-for="part in line.allocations" :key="part.balanceId">{{ part.batchNumber }} / {{ part.locationName }} / {{ quantity(part.quantityMilli) }}；</template></small></section><div class="order-modal__actions"><button class="order-button" @click="outboundOpen=false;outboundPreview=null">取消</button><button class="order-button" :disabled="saving" @click="previewOutbound">FIFO 预览</button><button class="order-button primary" :disabled="saving||!outboundPreview" @click="confirmOutbound">确认扣库并生成出库单</button></div></section></div>
      <div v-if="printOpen" class="order-modal">
        <section class="order-modal__card">
          <h2>订单打印预览</h2>
          <p>
            {{ detail.order.orderNo }} ·
            {{ detail.order.customerSnapshot.name }} ·
            {{ money(detail.order.amounts.orderAmountCents) }}
          </p>
          <p>确认后才增加打印次数并记录操作日志；取消不会写入。</p>
          <div class="order-modal__actions">
            <button class="order-button" @click="printOpen = false">取消</button
            ><button
              class="order-button primary"
              :disabled="store.saving"
              @click="confirmPrint"
            >
              确认打印
            </button>
          </div>
        </section>
      </div>
      <div v-if="reviewAction" class="order-modal">
        <section class="order-modal__card">
          <h2>{{ reviewLabels[reviewAction] }}</h2>
          <p>{{ detail.order.orderNo }} · {{ detail.order.customerSnapshot.name }} · {{ money(detail.order.amounts.orderAmountCents) }}</p>
          <p v-if="detail.order.specialPrice" class="order-notice">特价申请：{{ detail.order.specialPriceReason }}；保存依据 {{ detail.order.specialPriceEvidence?.length ?? 0 }} 行。</p>
          <label class="order-review-reason">{{ needsReason(reviewAction) ? "原因（必填）" : "审核备注（选填）" }}<textarea v-model="reviewReason" maxlength="200" rows="3"></textarea></label>
          <p v-if="reviewAction === 'cancel-order'" class="order-notice error">取消不可恢复，将释放预收占用并撤销分享；库存不会变化。</p>
          <div class="order-modal__actions"><button class="order-button" @click="reviewAction = null">返回</button><button class="order-button" :class="reviewAction === 'cancel-order' ? 'danger' : 'primary'" :disabled="saving || (needsReason(reviewAction) && !reviewReason.trim())" @click="confirmReview">确认执行</button></div>
        </section>
      </div>
      <div v-if="shareOpen && share" class="order-modal">
        <section class="order-modal__card order-share-modal">
          <h2>订单分享</h2>
          <label
            >有效期
            <select v-model="shareDuration" @change="generateShare">
              <option :value="1">1天</option>
              <option :value="7">7天</option>
              <option :value="30">30天</option>
            </select></label
          >
          <img v-if="shareQr" :src="shareQr" alt="订单分享二维码" />
          <p class="order-share-url">{{ share.url }}</p>
          <p>
            重发会立即撤销上一条链接；公开页不会展示电话、详细地址、信用或预收信息。
          </p>
          <div class="order-modal__actions">
            <button class="order-button" @click="shareOpen = false">关闭</button
            ><button class="order-button" @click="copyShare">复制链接</button
            ><RouterLink class="order-button primary" :to="sharePath"
              >打开手机页</RouterLink
            >
          </div>
        </section>
      </div></template
    >
  </section>
</template>
