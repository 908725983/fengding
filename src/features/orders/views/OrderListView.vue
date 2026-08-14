<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute, useRouter } from "vue-router";
import OrderScenarioBar from "../components/OrderScenarioBar.vue";
import { useOrderStore } from "../runtime/order-store";
import type { OrderQuery, OrderStatus, SettlementMethod } from "../types";
import "./order-views.css";

const store = useOrderStore();
const route = useRoute();
const router = useRouter();
const { result, loading, error, isEmpty, scenario, actor, canOutput, canManage } =
  storeToRefs(store);
const showMore = ref(false);
const selected = ref<string[]>([]);
const printIds = ref<string[]>([]);
const message = ref("");
const filters = reactive({
  status: String(route.query.status ?? ""),
  from: String(route.query.from ?? "2026-05-10"),
  to: String(route.query.to ?? "2026-08-10"),
  keyword: String(route.query.keyword ?? ""),
  categoryId: "",
  salespersonId: "",
  warehouseId: "",
  settlementMethod: "",
  amountMin: "",
  amountMax: "",
  deliveryFrom: "",
  deliveryTo: "",
  hasDifference: "",
});
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
const allSelected = computed(
  () =>
    result.value.items.length > 0 &&
    result.value.items.every((row) => selected.value.includes(row.order.id)),
);
function isoDay(day: string, next = false) {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00+08:00`);
  if (next) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
function buildQuery(): OrderQuery {
  return {
    statuses: filters.status ? [filters.status as OrderStatus] : undefined,
    orderedFrom: isoDay(filters.from),
    orderedTo: isoDay(filters.to, true),
    keyword: filters.keyword || undefined,
    customerCategoryId: filters.categoryId || undefined,
    salespersonId: filters.salespersonId || undefined,
    warehouseId: filters.warehouseId || undefined,
    settlementMethod: (filters.settlementMethod || undefined) as
      | SettlementMethod
      | undefined,
    amountMinCents: filters.amountMin
      ? Math.round(Number(filters.amountMin) * 100)
      : undefined,
    amountMaxCents: filters.amountMax
      ? Math.round(Number(filters.amountMax) * 100)
      : undefined,
    deliveryFrom: isoDay(filters.deliveryFrom),
    deliveryTo: isoDay(filters.deliveryTo, true),
    hasDifference:
      filters.hasDifference === ""
        ? undefined
        : filters.hasDifference === "true",
    page: 1,
    pageSize: store.query.pageSize ?? 30,
  };
}
async function search() {
  const query = buildQuery();
  await router.replace({
    query: Object.fromEntries(
      Object.entries({
        status: filters.status || undefined,
        from: filters.from,
        to: filters.to,
        keyword: filters.keyword || undefined,
      }).filter(([, v]) => v !== undefined),
    ),
  });
  selected.value = [];
  await store.applyQuery(query);
}
async function reset() {
  Object.assign(filters, {
    status: "",
    from: "2026-05-10",
    to: "2026-08-10",
    keyword: "",
    categoryId: "",
    salespersonId: "",
    warehouseId: "",
    settlementMethod: "",
    amountMin: "",
    amountMax: "",
    deliveryFrom: "",
    deliveryTo: "",
    hasDifference: "",
  });
  await router.replace({ query: {} });
  await store.applyQuery(buildQuery());
}
function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}
function toggleAll() {
  const ids = result.value.items.map((item) => item.order.id);
  selected.value = allSelected.value
    ? selected.value.filter((id) => !ids.includes(id))
    : [...new Set([...selected.value, ...ids])];
}
function download() {
  const blob = new Blob([store.exportCsv(selected.value)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "customer-orders.csv";
  a.click();
  URL.revokeObjectURL(url);
}
function openPrint(ids: string[]) {
  printIds.value = ids.length
    ? ids
    : result.value.items.map((item) => item.order.id);
}
async function confirmPrint() {
  await store.confirmPrint(printIds.value, `print-ui-${Date.now()}`);
  message.value = `已确认打印 ${printIds.value.length} 张订单（原型模拟）`;
  printIds.value = [];
}
onMounted(() => store.applyQuery(buildQuery()));
</script>
<template>
  <section class="order-page">
    <header class="order-header">
      <div>
        <p class="eyebrow">ORD-001 / ORD-002 · 客户订单</p>
        <h1>客户订单列表</h1>
        <p>订单历史快照可追溯；履约、资金和库荐未接入时明确标记。</p>
      </div>
      <div class="order-header-tools">
        <OrderScenarioBar :scenario="scenario" :role="actor.role" @scenario="store.setScenario" @role="store.setRole" />
        <RouterLink v-if="canManage" class="order-button primary" to="/orders/new">新增订单</RouterLink>
      </div>
    </header>
    <form class="order-panel order-filter" @submit.prevent="search">
      <label
        >订单状态<select v-model="filters.status">
          <option value="">全部订单</option>
          <option v-for="(label, key) in statusLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      ><label>下单开始<input v-model="filters.from" type="date" /></label
      ><label>下单结束<input v-model="filters.to" type="date" /></label
      ><label class="keyword"
        >关键词<input
          v-model="filters.keyword"
          type="search"
          placeholder="单号 / 客户编码 / 客户名称" /></label
      ><button class="order-button" type="button" @click="showMore = !showMore">
        {{ showMore ? "收起" : "更多筛选" }}</button
      ><button class="order-button" type="button" @click="reset">
        清空筛选</button
      ><button class="order-button primary">查询</button>
      <div v-if="showMore" class="order-filter__more">
        <label
          >客户分类<select v-model="filters.categoryId">
            <option value="">全部</option>
            <option value="category-retail">演示零售客户（含后代）</option>
            <option value="category-retail-east">演示华东零售</option>
          </select></label
        ><label
          >业务员<select v-model="filters.salespersonId">
            <option value="">全部</option>
            <option value="staff-demo-1">演示业务员甲</option>
            <option value="staff-demo-2">演示业务员乙</option>
          </select></label
        ><label
          >计划仓库<select v-model="filters.warehouseId">
            <option value="">全部</option>
            <option value="warehouse-main">演示中心仓</option>
            <option value="warehouse-virtual">演示虚拟禁售仓</option>
          </select></label
        ><label
          >结算方式<select v-model="filters.settlementMethod">
            <option value="">全部</option>
            <option value="cash">现结</option>
            <option value="monthly">月结</option>
            <option value="terms">账期</option>
          </select></label
        ><label
          >是否有差异<select v-model="filters.hasDifference">
            <option value="">全部</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select></label
        ><label
          >最低金额<input
            v-model="filters.amountMin"
            type="number"
            min="0"
            step="0.01" /></label
        ><label
          >最高金额<input
            v-model="filters.amountMax"
            type="number"
            min="0"
            step="0.01" /></label
        ><label
          >交货开始<input v-model="filters.deliveryFrom" type="date" /></label
        ><label
          >交货结束<input v-model="filters.deliveryTo" type="date"
        /></label>
      </div>
    </form>
    <p v-if="message" class="order-panel" style="padding: 9px 12px">
      {{ message }}
    </p>
    <div v-if="error" class="order-state error">
      <strong>订单数据加载失败</strong>
      <p>{{ error }}</p>
      <button class="order-button" @click="store.load">重试</button>
    </div>
    <div v-else-if="loading" class="order-state">
      <strong>正在加载订单数据…</strong>
    </div>
    <div v-else-if="isEmpty" class="order-state">
      <strong>暂无订单</strong>
      <p>当前筛选或模拟场景没有订单记录。</p>
      <button class="order-button" @click="reset">清空筛选</button>
    </div>
    <template v-else
      ><div class="order-toolbar">
        <strong
          >共 {{ result.total }} 条 · 已选 {{ selected.length }} 条</strong
        >
        <div>
          <button class="order-button" @click="store.load">刷新</button
          ><button
            class="order-button"
            @click="message = '本地教程：筛选订单后可查看、导出或预览打印。'"
          >
            视频教程</button
          ><button v-if="canOutput" class="order-button" @click="download">
            导出 CSV</button
          ><button
            v-if="canOutput"
            class="order-button primary"
            :disabled="!selected.length"
            @click="openPrint(selected)"
          >
            批量打印
          </button>
        </div>
      </div>
      <div class="order-table-wrap">
        <table class="order-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  :checked="allSelected"
                  aria-label="选择当前页"
                  @change="toggleAll"
                />
              </th>
              <th>状态</th>
              <th>单号</th>
              <th>下单时间</th>
              <th>客户名称</th>
              <th>收货信息</th>
              <th>结算客户</th>
              <th>订单打印</th>
              <th>出库打印</th>
              <th>预期交货</th>
              <th>物流编码</th>
              <th class="order-money">订单金额</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.items" :key="row.order.id">
              <td>
                <input
                  type="checkbox"
                  :checked="selected.includes(row.order.id)"
                  @change="toggle(row.order.id)"
                />
              </td>
              <td>
                <span
                  class="order-status"
                  :class="`order-status-${row.order.status}`"
                  >{{ statusLabels[row.order.status] }}</span
                >
              </td>
              <td>
                <RouterLink :to="`/orders/${row.order.id}`">{{
                  row.order.orderNo
                }}</RouterLink>
              </td>
              <td>{{ row.order.orderedAt.slice(0, 16).replace("T", " ") }}</td>
              <td>
                {{ row.order.customerSnapshot.name
                }}<small>{{ row.order.customerSnapshot.code }}</small>
              </td>
              <td>
                {{ row.order.shippingSnapshot.recipient }} ·
                {{ row.order.shippingSnapshot.phone ?? "已遮蔽"
                }}<small>{{
                  row.order.shippingSnapshot.address ?? "详细地址已遮蔽"
                }}</small>
              </td>
              <td>{{ row.order.settlementCustomerSnapshot.name }}</td>
              <td>{{ row.order.orderPrintCount }}</td>
              <td>
                {{
                  row.order.fulfillmentProjection.outboundPrintCount ?? "未接入"
                }}
              </td>
              <td>
                {{
                  row.order.requestedDeliveryAt.slice(0, 16).replace("T", " ")
                }}
              </td>
              <td>{{ row.logisticsSummary ?? "未接入" }}</td>
              <td class="order-money">
                {{ money(row.order.amounts.orderAmountCents) }}
              </td>
              <td>
                <RouterLink :to="`/orders/${row.order.id}`">详情</RouterLink>
                <RouterLink v-if="canManage && row.order.status === 'pending-order-review'" class="order-row-link" :to="`/orders/${row.order.id}/edit`">修改</RouterLink>
                <button
                  v-if="canOutput"
                  class="order-button"
                  style="min-height: 28px; margin-left: 8px"
                  @click="openPrint([row.order.id])"
                >
                  打印
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="order-pagination">
        <span>第 {{ result.page }} 页 · {{ result.pageSize }} 条/页</span
        ><button
          class="order-button"
          :disabled="result.page <= 1"
          @click="store.setPage(result.page - 1)"
        >
          上一页</button
        ><button
          class="order-button"
          :disabled="result.page * result.pageSize >= result.total"
          @click="store.setPage(result.page + 1)"
        >
          下一页
        </button>
      </footer></template
    >
    <div v-if="printIds.length" class="order-modal">
      <section class="order-modal__card">
        <h2>订单打印预览</h2>
        <p>
          以下 {{ printIds.length }} 张订单将使用本地 HTML
          模拟打印。确认后才累计订单打印次数并记录日志。
        </p>
        <ul>
          <li v-for="id in printIds" :key="id">
            {{
              result.items.find((row) => row.order.id === id)?.order.orderNo ??
              id
            }}
          </li>
        </ul>
        <div class="order-modal__actions">
          <button class="order-button" @click="printIds = []">取消</button
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
  </section>
</template>
