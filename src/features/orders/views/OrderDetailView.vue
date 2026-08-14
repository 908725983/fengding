<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute } from "vue-router";
import QRCode from "qrcode";
import OrderScenarioBar from "../components/OrderScenarioBar.vue";
import { useOrderStore } from "../runtime/order-store";
import type { OrderProviderValue, OrderStatus } from "../types";
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
} = storeToRefs(store);
const tab = ref<"detail" | "fulfillment" | "receipt" | "payment">("detail");
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
const money = (value: number | null) =>
  value === null ? "已遮蔽" : `¥${(value / 100).toFixed(2)}`;
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
onMounted(() => store.loadDetail(orderId.value));
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
            >{{ statusLabels[detail.order.status] }}</span
          >
        </div>
        <div>
          <OrderScenarioBar
            :scenario="scenario"
            :role="actor.role"
            @scenario="
              async (value) => {
                await store.setScenario(value);
                await store.loadDetail(orderId);
              }
            "
            @role="
              async (value) => {
                await store.setRole(value);
                await store.loadDetail(orderId);
              }
            "
          />
          <div class="order-detail-actions">
            <button class="order-button" @click="store.loadDetail(orderId)">
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
          </div>
        </div>
      </header>
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
              <dd>{{ statusLabels[detail.order.status] }}</dd>
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
      <section v-else class="order-tab-unavailable">
        <strong>{{
          tab === "fulfillment"
            ? "出库发货记录由 ORD-004 提供"
            : tab === "receipt"
              ? "签收记录由 ORD-004 提供"
              : "收款记录由资金切片提供"
        }}</strong>
        <p>数据源尚未接入；此处不以空表或 0 冒充真实查询。</p>
      </section>
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
