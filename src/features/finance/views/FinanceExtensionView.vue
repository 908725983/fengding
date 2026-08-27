<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import FinanceSubnav from "../components/FinanceSubnav.vue";
import { useFinanceStore } from "../runtime/finance-store";
import type { FinanceAccountPeriodRow } from "../types";
import "./finance-views.css";

type Mode =
  | "transfers"
  | "other"
  | "supplier-refunds"
  | "statistics"
  | "institutions"
  | "withdrawals";
const props = defineProps<{ mode: Mode }>();
const store = useFinanceStore();
const route = useRoute();
const router = useRouter();
const money = (value: number) =>
  `¥${(value / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
const date = ref("2026-08-10T15:00");
const transfer = reactive({
  from: "account-cash",
  to: "account-bank",
  amount: 1000,
  note: "",
});
const other = reactive({
  direction: "income" as "income" | "expense",
  counterparty: "演示往来单位",
  itemId: "",
  accountId: "account-cash",
  amount: 1000,
  note: "",
});
const item = reactive({
  name: "",
  direction: "income" as "income" | "expense",
});
const month = ref(String(route.query.month ?? "2026-08"));
const report = ref(String(route.query.report ?? "methods"));
const page = ref(Math.max(1, Number(route.query.page ?? 1)));
const pageSize = ref(
  [10, 30, 50, 100].includes(Number(route.query.pageSize))
    ? Number(route.query.pageSize)
    : 30,
);
const selectedSupplierCreditId = ref<string | null>(null);
const accounts = computed(() =>
  store.accounts
    .map((row: FinanceAccountPeriodRow) => row.account)
    .filter((account) => account.status === "enabled"),
);
const title = computed(
  () =>
    ({
      transfers: "账户转账",
      other: "其他收支",
      "supplier-refunds": "供应商退款到账",
      statistics: "资金统计",
      institutions: "机构收款",
      withdrawals: "拉新提现",
    })[props.mode],
);
const statusLabel: Record<string, string> = {
  "pending-review": "待审核",
  completed: "已完成",
  cancelled: "已取消",
  approved: "已批准",
  rejected: "已拒绝",
  pending: "待退款",
  refunded: "已退款",
};
const accountName = (id: string) =>
  accounts.value.find((account) => account.id === id)?.name ?? id;
const methodRows = computed(
  () =>
    store.methodStatistics?.rows.slice(
      (page.value - 1) * pageSize.value,
      page.value * pageSize.value,
    ) ?? [],
);
const orderRows = computed(
  () =>
    store.orderPaymentStatistics?.rows.slice(
      (page.value - 1) * pageSize.value,
      page.value * pageSize.value,
    ) ?? [],
);
const ledgerRows = computed(() =>
  store.ledgerStatistics.slice(
    (page.value - 1) * pageSize.value,
    page.value * pageSize.value,
  ),
);
const summaryRows = computed(() =>
  store.accounts.slice(
    (page.value - 1) * pageSize.value,
    page.value * pageSize.value,
  ),
);
const totalRows = computed(() =>
  report.value === "methods"
    ? (store.methodStatistics?.rows.length ?? 0)
    : report.value === "orders"
      ? (store.orderPaymentStatistics?.rows.length ?? 0)
      : report.value === "ledger"
        ? store.ledgerStatistics.length
        : store.accounts.length,
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(totalRows.value / pageSize.value)),
);
const load = async () => {
  if (props.mode === "transfers") {
    await store.loadAccounts();
    await store.loadTransfers();
  }
  if (props.mode === "other") {
    await store.loadAccounts();
    await store.loadOtherTransactions();
    if (!other.itemId)
      other.itemId =
        store.incomeExpenseItems.find(
          (entry) => entry.direction === other.direction,
        )?.id ?? "";
  }
  if (props.mode === "supplier-refunds") {
    await store.loadAccounts();
    await store.loadSupplierRefunds();
  }
  if (props.mode === "statistics") await store.loadStatistics(month.value);
};
onMounted(load);
async function changeMonth(value: string) {
  month.value = value;
  page.value = 1;
  await router.replace({
    query: {
      month: value,
      report: report.value,
      page: "1",
      pageSize: String(pageSize.value),
    },
  });
  await store.loadStatistics(value);
}
async function changeReport(value: string) {
  report.value = value;
  page.value = 1;
  await router.replace({
    query: {
      month: month.value,
      report: value,
      page: "1",
      pageSize: String(pageSize.value),
    },
  });
}
async function changePage(next: number) {
  page.value = Math.min(Math.max(1, next), pageCount.value);
  await router.replace({
    query: {
      month: month.value,
      report: report.value,
      page: String(page.value),
      pageSize: String(pageSize.value),
    },
  });
}
async function changePageSize(value: string) {
  pageSize.value = Number(value);
  page.value = 1;
  await changePage(1);
}
async function showSupplierDetail(creditId: string) {
  selectedSupplierCreditId.value = creditId;
  await store.loadSupplierRefundDetail(creditId);
}
function downloadStatistics() {
  const csv =
    report.value === "ledger"
      ? `\uFEFF日期,账户,单据类型,单据号,往来单位,方向,金额分,余额分\r\n${store.ledgerStatistics.map((row) => [row.occurredAt, row.accountName, row.kind, row.sourceNo, row.counterparty ?? "—", row.direction, row.amountCents, row.balanceAfterCents].join(",")).join("\r\n")}`
      : report.value === "summary"
        ? `\uFEFF账户,期初分,收入分,支出分,期末分\r\n${store.accounts.map((row) => [row.account.name, row.openingBalanceCents, row.periodIncomeCents, row.periodExpenseCents, row.closingBalanceCents].join(",")).join("\r\n")}`
        : store.exportStatistics(
            report.value === "orders" ? "orders" : "methods",
          );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finance-${report.value}-${month.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
async function createTransfer() {
  await store.createTransfer({
    fromAccountId: transfer.from,
    toAccountId: transfer.to,
    amountCents: Math.round(transfer.amount * 100),
    occurredAt: date.value,
    note: transfer.note || null,
  });
  transfer.amount = 0;
  transfer.note = "";
}
async function createOther() {
  await store.createOtherTransaction({
    direction: other.direction,
    occurredAt: date.value,
    counterparty: other.counterparty,
    itemId: other.itemId,
    amountCents: Math.round(other.amount * 100),
    accountId: other.accountId,
    note: other.note || null,
  });
  other.amount = 0;
  other.note = "";
}
async function saveItem() {
  await store.saveIncomeExpenseItem({
    direction: item.direction,
    name: item.name,
    status: "enabled",
  });
  item.name = "";
  await store.loadOtherTransactions();
}
</script>

<template>
  <section class="finance-page">
    <header class="finance-header">
      <div>
        <p class="eyebrow">FIN-004 · FIN-005</p>
        <h1>{{ title }}</h1>
        <p>所有账户变化均由 Finance 唯一账本产生，页面只提交业务命令。</p>
      </div>
    </header>
    <FinanceSubnav />
    <div v-if="store.error" class="finance-state error">
      <strong>资金数据加载失败</strong><span>{{ store.error }}</span
      ><button class="fin-button" @click="load">重试</button>
    </div>
    <div v-else-if="store.loading" class="finance-state">正在加载资金数据…</div>

    <template v-else-if="props.mode === 'transfers'">
      <section class="finance-panel extension-form">
        <h2>新建转账</h2>
        <div class="finance-form">
          <label
            >转出账户<select v-model="transfer.from">
              <option
                v-for="account in accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </select></label
          ><label
            >转入账户<select v-model="transfer.to">
              <option
                v-for="account in accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </select></label
          ><label
            >金额（元）<input
              v-model.number="transfer.amount"
              type="number"
              min="0.01"
              step="0.01" /></label
          ><label>业务时间<input v-model="date" type="datetime-local" /></label
          ><label class="wide"
            >备注<input v-model="transfer.note" maxlength="200"
          /></label>
          <div class="finance-actions">
            <button
              class="fin-button primary"
              :disabled="store.saving"
              @click="createTransfer"
            >
              保存待审核
            </button>
          </div>
        </div>
      </section>
      <section class="finance-panel">
        <h2>转账记录</h2>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>转账单号</th>
                <th>日期</th>
                <th>转出账户</th>
                <th>转入账户</th>
                <th class="fin-money">金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in store.transfers" :key="row.id">
                <td>{{ row.transferNo }}</td>
                <td>{{ row.occurredAt }}</td>
                <td>{{ accountName(row.fromAccountId) }}</td>
                <td>{{ accountName(row.toAccountId) }}</td>
                <td class="fin-money">{{ money(row.amountCents) }}</td>
                <td>{{ statusLabel[row.status] }}</td>
                <td>
                  <button
                    v-if="row.status === 'pending-review'"
                    class="fin-button primary"
                    :disabled="store.saving"
                    @click="store.approveTransfer(row.id, row.version)"
                  >
                    审核完成</button
                  ><button
                    v-if="row.status === 'pending-review'"
                    class="fin-button"
                    :disabled="store.saving"
                    @click="
                      store.cancelTransfer(row.id, row.version, '演示取消')
                    "
                  >
                    取消</button
                  ><span v-if="row.status === 'completed'">已写入双边流水</span>
                </td>
              </tr>
              <tr v-if="!store.transfers.length">
                <td colspan="7" class="finance-empty-cell">暂无转账记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <template v-else-if="props.mode === 'other'">
      <section class="finance-panel extension-form">
        <h2>新建其他收支</h2>
        <div class="finance-form">
          <label
            >方向<select v-model="other.direction">
              <option value="income">其他收款</option>
              <option value="expense">其他付款</option>
            </select></label
          ><label
            >收支项目<select v-model="other.itemId">
              <option
                v-for="entry in store.incomeExpenseItems.filter(
                  (value) => value.direction === other.direction,
                )"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.name }}
              </option>
            </select></label
          ><label>往来单位<input v-model="other.counterparty" /></label
          ><label
            >账户<select v-model="other.accountId">
              <option
                v-for="account in accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </select></label
          ><label
            >金额（元）<input
              v-model.number="other.amount"
              type="number"
              min="0.01"
              step="0.01" /></label
          ><label>业务时间<input v-model="date" type="datetime-local" /></label
          ><label class="wide">备注<input v-model="other.note" /></label>
          <div class="finance-actions">
            <button
              class="fin-button primary"
              :disabled="store.saving || !other.itemId"
              @click="createOther"
            >
              保存待审核
            </button>
          </div>
        </div>
      </section>
      <section class="finance-panel extension-form">
        <h2>收支项目</h2>
        <div class="inline-form">
          <select v-model="item.direction">
            <option value="income">收入项目</option>
            <option value="expense">支出项目</option></select
          ><input v-model="item.name" placeholder="新增项目名称" /><button
            class="fin-button"
            :disabled="store.saving || !item.name.trim()"
            @click="saveItem"
          >
            新增
          </button>
        </div>
      </section>
      <section class="finance-panel">
        <h2>其他收支记录</h2>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>方向</th>
                <th>日期</th>
                <th>往来单位</th>
                <th>项目</th>
                <th class="fin-money">金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in store.otherTransactions" :key="row.id">
                <td>{{ row.documentNo }}</td>
                <td>
                  {{ row.direction === "income" ? "其他收款" : "其他付款" }}
                </td>
                <td>{{ row.occurredAt }}</td>
                <td>{{ row.counterpartySnapshot }}</td>
                <td>{{ row.itemNameSnapshot }}</td>
                <td class="fin-money">{{ money(row.amountCents) }}</td>
                <td>{{ statusLabel[row.status] }}</td>
                <td>
                  <button
                    v-if="row.status === 'pending-review'"
                    class="fin-button primary"
                    @click="
                      store.reviewOtherTransaction(
                        row.id,
                        row.version,
                        'approve',
                      )
                    "
                  >
                    批准入账</button
                  ><button
                    v-if="row.status === 'pending-review'"
                    class="fin-button"
                    @click="
                      store.reviewOtherTransaction(
                        row.id,
                        row.version,
                        'reject',
                        '演示拒绝',
                      )
                    "
                  >
                    拒绝
                  </button>
                </td>
              </tr>
              <tr v-if="!store.otherTransactions.length">
                <td colspan="8" class="finance-empty-cell">暂无其他收支记录</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>已批准项目汇总</h3>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>项目</th>
                <th class="fin-money">收入</th>
                <th class="fin-money">支出</th>
                <th class="fin-money">净额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in store.otherSummary" :key="row.itemId">
                <td>{{ row.itemName }}</td>
                <td class="fin-money fin-income">
                  {{ money(row.incomeCents) }}
                </td>
                <td class="fin-money fin-expense">
                  {{ money(row.expenseCents) }}
                </td>
                <td class="fin-money">{{ money(row.netCents) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section v-if="store.supplierRefundDetail && selectedSupplierCreditId" class="finance-detail-panel">
          <h3>退款到账详情</h3>
          <dl class="finance-detail-grid">
            <div><dt>义务来源</dt><dd>{{ store.supplierRefundDetail.obligation.credit.sourceNo }}</dd></div>
            <div><dt>退款金额</dt><dd>{{ money(store.supplierRefundDetail.obligation.credit.refundObligationCents) }}</dd></div>
            <div><dt>供应商</dt><dd>{{ store.supplierRefundDetail.obligation.supplier?.name ?? '资料不可用' }}</dd></div>
            <div><dt>到账账户</dt><dd>{{ store.supplierRefundDetail.accountName ?? '尚未到账' }}</dd></div>
            <div><dt>到账流水</dt><dd>{{ store.supplierRefundDetail.movement?.sourceNoSnapshot ?? '尚未到账' }}</dd></div>
            <div><dt>到账时间</dt><dd>{{ store.supplierRefundDetail.receipt?.occurredAt ?? '尚未到账' }}</dd></div>
          </dl>
          <p v-if="store.supplierRefundDetail.audit.length" class="finance-muted">审计：{{ store.supplierRefundDetail.audit.map(item => item.detail).join('；') }}</p>
        </section>
      </section>
    </template>

    <template v-else-if="props.mode === 'supplier-refunds'"
      ><section class="finance-panel">
        <h2>待确认供应商退款</h2>
        <p class="finance-warning">
          退款到账只允许从采购退单形成的退款义务发起，金额整笔确认，不能手工输入。
        </p>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>来源单号</th>
                <th>供应商</th>
                <th class="fin-money">退款义务</th>
                <th class="fin-money">待到账</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in store.supplierRefundObligations"
                :key="row.credit.id"
              >
                <td>{{ row.credit.sourceNo }}</td>
                <td>{{ row.supplier?.name ?? "资料不可用" }}</td>
                <td class="fin-money">
                  {{ money(row.credit.refundObligationCents) }}
                </td>
                <td class="fin-money">{{ money(row.outstandingCents) }}</td>
                <td>{{ statusLabel[row.status] }}</td>
                <td>
                  <button class="fin-button" @click="showSupplierDetail(row.credit.id)">查看详情</button>
                  <button
                    v-if="row.status === 'pending'"
                    class="fin-button primary"
                    @click="
                      store.confirmSupplierRefund(
                        row.credit.id,
                        'account-cash',
                        date,
                      )
                    "
                  >
                    确认现金到账
                  </button>
                </td>
              </tr>
              <tr v-if="!store.supplierRefundObligations.length">
                <td colspan="6" class="finance-empty-cell">
                  暂无供应商退款义务
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <template v-else-if="props.mode === 'statistics'"
      ><section class="finance-toolbar">
        <label
          >统计月份<input
            :value="month"
            type="month"
            max="2026-08"
            @change="
              changeMonth(($event.target as HTMLInputElement).value)
            " /></label
        ><label
          >报表<select
            :value="report"
            @change="changeReport(($event.target as HTMLSelectElement).value)"
          >
            <option value="methods">收款方式</option>
            <option value="orders">订单支付</option>
            <option value="ledger">账户交易明细</option>
            <option value="summary">账户汇总</option>
          </select></label
        ><button
          v-if="['super-admin', 'finance'].includes(store.actor.role)"
          class="fin-button"
          @click="downloadStatistics"
        >
          导出当前报表
        </button>
      </section>
      <section
        v-if="report === 'methods' && store.methodStatistics"
        class="finance-panel"
      >
        <h2>收款方式统计 · {{ money(store.methodStatistics.totalCents) }}</h2>
        <table class="finance-table">
          <thead>
            <tr>
              <th>收款方式</th>
              <th class="fin-money">金额</th>
              <th>笔数</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in methodRows" :key="row.method">
              <td>
                {{
                  {
                    cash: "现金",
                    wechat: "微信",
                    alipay: "支付宝",
                    bank: "银行转账",
                  }[row.method]
                }}
              </td>
              <td class="fin-money">{{ money(row.amountCents) }}</td>
              <td>{{ row.receiptCount }}</td>
              <td>
                {{
                  row.ratioBasisPoints === null
                    ? "不可用"
                    : `${(row.ratioBasisPoints / 100).toFixed(2)}%`
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section
        v-else-if="report === 'orders' && store.orderPaymentStatistics"
        class="finance-panel"
      >
        <h2>订单支付统计</h2>
        <div class="finance-summary">
          <article>
            <span>应收</span
            ><strong>{{
              money(store.orderPaymentStatistics.receivableCents)
            }}</strong>
          </article>
          <article>
            <span>已收</span
            ><strong>{{
              money(store.orderPaymentStatistics.receivedCents)
            }}</strong>
          </article>
          <article>
            <span>待收</span
            ><strong>{{
              money(store.orderPaymentStatistics.outstandingCents)
            }}</strong>
          </article>
        </div>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>下单时间</th>
                <th>订单号</th>
                <th>退单号</th>
                <th>客户</th>
                <th class="fin-money">净应收</th>
                <th class="fin-money">净已收</th>
                <th class="fin-money">待收</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in orderRows" :key="row.receivableId">
                <td>{{ row.orderedAt ?? "不可用" }}</td>
                <td>{{ row.orderNo }}</td>
                <td>{{ row.returnNos.join("、") || "—" }}</td>
                <td>{{ row.customerSnapshot.name }}</td>
                <td class="fin-money">{{ money(row.netReceivableCents) }}</td>
                <td class="fin-money">{{ money(row.netReceivedCents) }}</td>
                <td class="fin-money">{{ money(row.outstandingCents) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-else-if="report === 'ledger'" class="finance-panel">
        <h2>账户交易明细</h2>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>账户</th>
                <th>单据类型</th>
                <th>单据号</th>
                <th>往来单位</th>
                <th>方向</th>
                <th class="fin-money">金额</th>
                <th class="fin-money">余额</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledgerRows"
                :key="`${row.sourceNo}-${row.occurredAt}`"
              >
                <td>{{ row.occurredAt }}</td>
                <td>{{ row.accountName }}</td>
                <td>{{ row.kind }}</td>
                <td>{{ row.sourceNo }}</td>
                <td>{{ row.counterparty ?? "—" }}</td>
                <td>{{ row.direction === "income" ? "收入" : "支出" }}</td>
                <td class="fin-money">{{ money(row.amountCents) }}</td>
                <td class="fin-money">{{ money(row.balanceAfterCents) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-else class="finance-panel">
        <h2>账户汇总</h2>
        <div class="finance-table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>账户</th>
                <th class="fin-money">期初</th>
                <th class="fin-money">本期收入</th>
                <th class="fin-money">本期支出</th>
                <th class="fin-money">期末</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summaryRows" :key="row.account.id">
                <td>{{ row.account.name }}</td>
                <td class="fin-money">{{ money(row.openingBalanceCents) }}</td>
                <td class="fin-money">{{ money(row.periodIncomeCents) }}</td>
                <td class="fin-money">{{ money(row.periodExpenseCents) }}</td>
                <td class="fin-money">{{ money(row.closingBalanceCents) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div class="finance-pagination" aria-label="统计分页">
        <span>共 {{ totalRows }} 条</span>
        <label
          >每页<select
            :value="pageSize"
            @change="changePageSize(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="size in [10, 30, 50, 100]" :key="size" :value="size">
              {{ size }}
            </option>
          </select></label
        >
        <button
          class="fin-button"
          :disabled="page <= 1"
          @click="changePage(page - 1)"
        >
          上一页
        </button>
        <span>第 {{ page }} / {{ pageCount }} 页</span>
        <button
          class="fin-button"
          :disabled="page >= pageCount"
          @click="changePage(page + 1)"
        >
          下一页
        </button>
      </div>
    </template>

    <template v-else
      ><section class="finance-state">
        <strong>{{
          props.mode === "institutions"
            ? "机构收款暂不可用"
            : "拉新提现暂不可用"
        }}</strong
        ><span>{{
          props.mode === "institutions"
            ? "机构主数据提供方尚未接入，系统不会把未知收款归入总部。"
            : "奖励账本、申请人与可提现余额提供方尚未接入，系统不会创建虚假提现或资金流水。"
        }}</span>
      </section></template
    >
  </section>
</template>
