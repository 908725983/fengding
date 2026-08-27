import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  createFinanceMockSession,
  type FinanceScenarioName,
} from "../../../../mock/handlers/finance-handler";
import { getApplicationMockRuntimeController } from "../../../app/runtime/app-mock-runtime";
import type {
  CreateCustomerReceiptInput,
  CreateReceiptWriteoffInput,
  CreateSupplierPaymentInput,
  CreateSupplierPaymentWriteoffInput,
  CustomerReceivableSummary,
  CustomerReceipt,
  FinanceAccountDetail,
  FinanceAccountDraft,
  FinanceAccountPeriodRow,
  FinanceActor,
  FinanceBankDraft,
  FinancePeriodCard,
  ReceiptWriteoff,
  ReceivableAgingRow,
  ReceivableProductRow,
  ReceivableProjection,
  SaveFinanceAccountInput,
  SettlementSource,
  VisibleBankProfile,
  SupplierPayableProjection,
  SupplierPayableProductRow,
  SupplierPayableAgingRow,
  SupplierPayment,
  SupplierPaymentWriteoff,
} from "../types";
import type {
  CreateFinanceOtherTransactionInput,
  CreateFinanceTransferInput,
  FinanceIncomeExpenseItem,
  FinanceLedgerStatisticRow,
  FinanceMethodStatisticRow,
  FinanceOrderPaymentStatistics,
  FinanceOtherSummaryRow,
  FinanceOtherTransaction,
  FinanceTransfer,
  SaveFinanceIncomeExpenseItemInput,
  SupplierRefundObligation,
  SupplierRefundDetail,
} from "../types";
import { setCurrentFinanceRole } from "./finance-access";

type ChannelRow = ReturnType<
  ReturnType<typeof createFinanceMockSession>["service"]["listPaymentChannels"]
>[number];

export const useFinanceStore = defineStore("finance", () => {
  const runtimeController = getApplicationMockRuntimeController();
  const session = runtimeController.finance;
  const scenario = computed<FinanceScenarioName>(() => session.scenarioName);
  const actor = ref<FinanceActor>({
    role: "super-admin",
    actorId: "admin-demo",
  });
  const month = ref("2026-08");
  const accounts = ref<FinanceAccountPeriodRow[]>([]);
  const detail = ref<FinanceAccountDetail | null>(null);
  const periods = ref<FinancePeriodCard[]>([]);
  const banks = ref<VisibleBankProfile[]>([]);
  const channels = ref<ChannelRow[]>([]);
  const customerReceivables = ref<CustomerReceivableSummary[]>([]);
  const receivableDocuments = ref<ReceivableProjection[]>([]);
  const receivableProducts = ref<ReceivableProductRow[]>([]);
  const agingRows = ref<ReceivableAgingRow[]>([]);
  const receipts = ref<
    Array<CustomerReceipt & { allocatedCents: number; availableCents: number }>
  >([]);
  const writeoffs = ref<ReceiptWriteoff[]>([]);
  const settlementSources = ref<SettlementSource[]>([]);
  const supplierPayables = ref<SupplierPayableProjection[]>([]);
  const supplierPayableProducts = ref<SupplierPayableProductRow[]>([]);
  const supplierPayableAging = ref<SupplierPayableAgingRow[]>([]);
  const supplierPayments = ref<
    Array<SupplierPayment & { allocatedCents: number; availableCents: number }>
  >([]);
  const supplierPaymentWriteoffs = ref<SupplierPaymentWriteoff[]>([]);
  const transfers = ref<FinanceTransfer[]>([]);
  const incomeExpenseItems = ref<FinanceIncomeExpenseItem[]>([]);
  const otherTransactions = ref<FinanceOtherTransaction[]>([]);
  const otherSummary = ref<FinanceOtherSummaryRow[]>([]);
  const supplierRefundObligations = ref<SupplierRefundObligation[]>([]);
  const supplierRefundDetail = ref<SupplierRefundDetail | null>(null);
  const methodStatistics = ref<{
    rows: FinanceMethodStatisticRow[];
    totalCents: number;
    snapshotVersion: number;
  } | null>(null);
  const orderPaymentStatistics = ref<FinanceOrderPaymentStatistics | null>(
    null,
  );
  const ledgerStatistics = ref<FinanceLedgerStatisticRow[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const canManage = computed(() =>
    ["super-admin", "finance"].includes(actor.value.role),
  );
  const stateVersion = () => session.repository.read().version;
  async function execute<T>(operation: () => T): Promise<T | null> {
    loading.value = true;
    error.value = null;
    try {
      return await session.run(operation);
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "资金数据加载失败";
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function loadAccounts(next = month.value): Promise<void> {
    month.value = next;
    const value = await execute(() =>
      session.service.listAccounts(actor.value, next),
    );
    accounts.value = value ?? [];
  }
  async function loadDetail(id: string, next = month.value): Promise<void> {
    month.value = next;
    detail.value = await execute(() =>
      session.service.getAccountDetail(actor.value, id, next),
    );
  }
  async function loadPeriods(year: number): Promise<void> {
    periods.value =
      (await execute(() =>
        session.service.listPeriodCards(actor.value, year),
      )) ?? [];
  }
  async function loadBanks(): Promise<void> {
    banks.value =
      (await execute(() => session.service.listBanks(actor.value))) ?? [];
  }
  async function loadChannels(): Promise<void> {
    channels.value =
      (await execute(() => session.service.listPaymentChannels(actor.value))) ??
      [];
  }
  async function loadReceivables(
    query: { keyword?: string; startDate?: string; endDate?: string } = {},
  ): Promise<void> {
    const value = await execute(() => ({
      customers: session.service.listCustomerReceivables(actor.value, query),
      documents: session.service.listReceivableDocuments(actor.value, query),
      products: session.service.listReceivableProducts(actor.value, query),
      aging: session.service.listReceivableAging(actor.value),
    }));
    customerReceivables.value = value?.customers ?? [];
    receivableDocuments.value = value?.documents ?? [];
    receivableProducts.value = value?.products ?? [];
    agingRows.value = value?.aging ?? [];
  }
  async function loadReceipts(): Promise<void> {
    receipts.value =
      (await execute(() => session.service.listReceipts(actor.value))) ?? [];
  }
  async function loadWriteoffs(): Promise<void> {
    writeoffs.value =
      (await execute(() => session.service.listWriteoffs(actor.value))) ?? [];
  }
  async function loadSettlementSources(customerId: string): Promise<void> {
    settlementSources.value =
      (await execute(() =>
        session.service.listSettlementSources(actor.value, customerId),
      )) ?? [];
  }
  async function loadSupplierPayables(
    query: { keyword?: string; startDate?: string; endDate?: string } = {},
  ): Promise<void> {
    const value = await execute(() => ({
      payables: session.service.listSupplierPayables(actor.value, query),
      products: session.service.listSupplierPayableProducts(actor.value, query),
      aging: session.service.listSupplierPayableAging(actor.value),
    }));
    supplierPayables.value = value?.payables ?? [];
    supplierPayableProducts.value = value?.products ?? [];
    supplierPayableAging.value = value?.aging ?? [];
  }
  async function loadSupplierPayments(): Promise<void> {
    supplierPayments.value =
      (await execute(() =>
        session.service.listSupplierPayments(actor.value),
      )) ?? [];
  }
  async function loadSupplierPaymentWriteoffs(): Promise<void> {
    supplierPaymentWriteoffs.value =
      (await execute(() =>
        session.service.listSupplierPaymentWriteoffs(actor.value),
      )) ?? [];
  }
  async function loadTransfers(): Promise<void> {
    transfers.value =
      (await execute(() => session.service.listTransfers(actor.value))) ?? [];
  }
  async function loadOtherTransactions(): Promise<void> {
    const value = await execute(() => ({
      items: session.service.listIncomeExpenseItems(actor.value),
      transactions: session.service.listOtherTransactions(actor.value),
      summary: session.service.summarizeOtherTransactions(actor.value),
    }));
    incomeExpenseItems.value = value?.items ?? [];
    otherTransactions.value = value?.transactions ?? [];
    otherSummary.value = value?.summary ?? [];
  }
  async function loadSupplierRefunds(): Promise<void> {
    supplierRefundObligations.value =
      (await execute(() =>
        session.service.listSupplierRefundObligations(actor.value),
      )) ?? [];
  }
  async function loadSupplierRefundDetail(creditId: string): Promise<void> {
    supplierRefundDetail.value = await execute(() => session.service.getSupplierRefundDetail(actor.value, creditId));
  }
  async function loadStatistics(next = month.value): Promise<void> {
    month.value = next;
    const value = await execute(() => ({
      methods: session.service.getMethodStatistics(actor.value, next),
      orders: session.service.getOrderPaymentStatistics(actor.value, next),
      ledger: session.service.listLedgerStatistics(actor.value, next),
    }));
    methodStatistics.value = value?.methods ?? null;
    orderPaymentStatistics.value = value?.orders ?? null;
    ledgerStatistics.value = value?.ledger ?? [];
    await loadAccounts(next);
  }
  async function createSupplierPayment(
    input: Omit<CreateSupplierPaymentInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createSupplierPayment(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await Promise.all([
      loadSupplierPayments(),
      loadSupplierPayables(),
      loadAccounts(),
    ]);
    return value;
  }
  async function voidSupplierPayment(
    paymentId: string,
    expectedVersion: number,
    reason: string,
  ) {
    const value = await mutate(() =>
      session.service.voidSupplierPayment(actor.value, {
        requestId: crypto.randomUUID(),
        paymentId,
        expectedVersion,
        reason,
      }),
    );
    await Promise.all([
      loadSupplierPayments(),
      loadSupplierPayables(),
      loadAccounts(),
    ]);
    return value;
  }
  async function createSupplierPaymentWriteoff(
    input: Omit<CreateSupplierPaymentWriteoffInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createSupplierPaymentWriteoff(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await Promise.all([
      loadSupplierPaymentWriteoffs(),
      loadSupplierPayments(),
      loadSupplierPayables(),
    ]);
    return value;
  }
  async function cancelSupplierPaymentWriteoff(
    writeoffId: string,
    expectedVersion: number,
    reason: string,
  ) {
    const value = await mutate(() =>
      session.service.cancelSupplierPaymentWriteoff(actor.value, {
        requestId: crypto.randomUUID(),
        writeoffId,
        expectedVersion,
        reason,
      }),
    );
    await Promise.all([
      loadSupplierPaymentWriteoffs(),
      loadSupplierPayments(),
      loadSupplierPayables(),
    ]);
    return value;
  }
  async function createTransfer(
    input: Omit<CreateFinanceTransferInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createTransfer(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await loadTransfers();
    return value;
  }
  async function approveTransfer(transferId: string, expectedVersion: number) {
    const value = await mutate(() =>
      session.service.approveTransfer(actor.value, {
        requestId: crypto.randomUUID(),
        transferId,
        expectedVersion,
      }),
    );
    await Promise.all([loadTransfers(), loadAccounts()]);
    return value;
  }
  async function cancelTransfer(
    transferId: string,
    expectedVersion: number,
    reason: string,
  ) {
    const value = await mutate(() =>
      session.service.cancelTransfer(actor.value, {
        requestId: crypto.randomUUID(),
        transferId,
        expectedVersion,
        reason,
      }),
    );
    await loadTransfers();
    return value;
  }
  async function saveIncomeExpenseItem(
    input: Omit<SaveFinanceIncomeExpenseItemInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.saveIncomeExpenseItem(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await loadOtherTransactions();
    return value;
  }
  async function createOtherTransaction(
    input: Omit<CreateFinanceOtherTransactionInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createOtherTransaction(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await loadOtherTransactions();
    return value;
  }
  async function reviewOtherTransaction(
    transactionId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
    reason?: string,
  ) {
    const value = await mutate(() =>
      session.service.reviewOtherTransaction(actor.value, {
        requestId: crypto.randomUUID(),
        transactionId,
        expectedVersion,
        decision,
        reason,
      }),
    );
    await Promise.all([loadOtherTransactions(), loadAccounts()]);
    return value;
  }
  async function confirmSupplierRefund(
    creditId: string,
    accountId: string,
    occurredAt: string,
  ) {
    const value = await mutate(() =>
      session.service.confirmSupplierRefund(actor.value, {
        requestId: crypto.randomUUID(),
        creditId,
        accountId,
        occurredAt,
      }),
    );
    await Promise.all([loadSupplierRefunds(), loadAccounts()]);
    return value;
  }
  function exportStatistics(
    report: "methods" | "orders",
    monthValue = month.value,
  ): string {
    return session.service.exportStatisticsCsv(actor.value, report, monthValue);
  }
  async function setScenario(next: FinanceScenarioName): Promise<void> {
    actor.value =
      next === "permission-denied"
        ? { role: "warehouse", actorId: "warehouse-demo" }
        : { role: "super-admin", actorId: "admin-demo" };
    setCurrentFinanceRole(actor.value.role);
    runtimeController.reset(next);
    await loadAccounts();
  }
  async function setRole(role: FinanceActor["role"]): Promise<void> {
    actor.value = { role, actorId: `${role}-demo` };
    setCurrentFinanceRole(role);
    await loadAccounts();
  }
  async function mutate<T>(operation: () => T): Promise<T> {
    saving.value = true;
    error.value = null;
    try {
      return await session.run(operation);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "保存失败";
      throw caught;
    } finally {
      saving.value = false;
    }
  }
  async function saveAccount(input: SaveFinanceAccountInput) {
    const value = await mutate(() =>
      session.service.saveAccount(actor.value, input),
    );
    await loadAccounts();
    return value;
  }
  async function saveBank(
    requestId: string,
    draft: FinanceBankDraft,
    existing?: VisibleBankProfile,
  ) {
    const value = await mutate(() =>
      session.service.saveBank(actor.value, {
        requestId,
        bankId: existing?.id,
        expectedUpdatedAt: existing?.updatedAt,
        draft,
      }),
    );
    await loadBanks();
    return value;
  }
  async function closePeriod(monthValue: string) {
    const value = await mutate(() =>
      session.service.closePeriod(actor.value, {
        requestId: crypto.randomUUID(),
        month: monthValue,
        expectedStateVersion: stateVersion(),
      }),
    );
    await loadPeriods(Number(monthValue.slice(0, 4)));
    return value;
  }
  async function reversePeriod(monthValue: string, reason: string) {
    const value = await mutate(() =>
      session.service.reversePeriod(actor.value, {
        requestId: crypto.randomUUID(),
        month: monthValue,
        reason,
        expectedStateVersion: stateVersion(),
      }),
    );
    await loadPeriods(Number(monthValue.slice(0, 4)));
    return value;
  }
  async function applyChannel(channelId: string) {
    const value = await mutate(() =>
      session.service.submitPaymentApplication(actor.value, {
        requestId: crypto.randomUUID(),
        channelId,
      }),
    );
    await loadChannels();
    return value;
  }
  async function createReceipt(
    input: Omit<CreateCustomerReceiptInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createReceipt(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await Promise.all([loadReceipts(), loadWriteoffs(), loadReceivables()]);
    return value;
  }
  async function createWriteoff(
    input: Omit<CreateReceiptWriteoffInput, "requestId">,
  ) {
    const value = await mutate(() =>
      session.service.createWriteoff(actor.value, {
        ...input,
        requestId: crypto.randomUUID(),
      }),
    );
    await Promise.all([loadWriteoffs(), loadReceipts(), loadReceivables()]);
    return value;
  }
  async function voidReceipt(
    receiptId: string,
    expectedVersion: number,
    reason: string,
  ) {
    const value = await mutate(() =>
      session.service.voidReceipt(actor.value, {
        requestId: crypto.randomUUID(),
        receiptId,
        expectedVersion,
        reason,
      }),
    );
    await Promise.all([loadReceipts(), loadAccounts()]);
    return value;
  }
  async function cancelWriteoff(
    writeoffId: string,
    expectedVersion: number,
    reason: string,
  ) {
    const value = await mutate(() =>
      session.service.cancelWriteoff(actor.value, {
        requestId: crypto.randomUUID(),
        writeoffId,
        expectedVersion,
        reason,
      }),
    );
    await Promise.all([loadWriteoffs(), loadReceipts(), loadReceivables()]);
    return value;
  }
  function receiptById(id: string) {
    return receipts.value.find((item) => item.id === id) ?? null;
  }
  function writeoffById(id: string) {
    return writeoffs.value.find((item) => item.id === id) ?? null;
  }
  function accountDraft(
    id: string,
  ): {
    account: FinanceAccountPeriodRow["account"];
    draft: FinanceAccountDraft;
  } | null {
    const account = accounts.value.find(
      (item) => item.account.id === id,
    )?.account;
    return account
      ? {
          account,
          draft: {
            name: account.name,
            type: account.type,
            status: account.status,
            openingMonth: account.openingMonth,
            openingBalanceCents: account.openingBalanceCents,
          },
        }
      : null;
  }
  return {
    scenario,
    actor,
    month,
    accounts,
    detail,
    periods,
    banks,
    channels,
    customerReceivables,
    receivableDocuments,
    receivableProducts,
    agingRows,
    receipts,
    writeoffs,
    settlementSources,
    supplierPayables,
    supplierPayableProducts,
    supplierPayableAging,
    supplierPayments,
    supplierPaymentWriteoffs,
    transfers,
    incomeExpenseItems,
    otherTransactions,
    otherSummary,
    supplierRefundObligations,
    supplierRefundDetail,
    methodStatistics,
    orderPaymentStatistics,
    ledgerStatistics,
    loading,
    saving,
    error,
    canManage,
    loadAccounts,
    loadDetail,
    loadPeriods,
    loadBanks,
    loadChannels,
    loadReceivables,
    loadReceipts,
    loadWriteoffs,
    loadSettlementSources,
    loadSupplierPayables,
    loadSupplierPayments,
    loadSupplierPaymentWriteoffs,
    loadTransfers,
    loadOtherTransactions,
    loadSupplierRefunds,
    loadSupplierRefundDetail,
    loadStatistics,
    setScenario,
    setRole,
    saveAccount,
    saveBank,
    closePeriod,
    reversePeriod,
    applyChannel,
    createReceipt,
    createWriteoff,
    voidReceipt,
    cancelWriteoff,
    createSupplierPayment,
    voidSupplierPayment,
    createSupplierPaymentWriteoff,
    cancelSupplierPaymentWriteoff,
    createTransfer,
    approveTransfer,
    cancelTransfer,
    saveIncomeExpenseItem,
    createOtherTransaction,
    reviewOtherTransaction,
    confirmSupplierRefund,
    exportStatistics,
    receiptById,
    writeoffById,
    accountDraft,
  };
});
