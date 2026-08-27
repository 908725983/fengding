import type { FinanceRepository } from "../repositories/finance-repository";
import { FinanceValidationError } from "../schemas/finance-schema";
import { FinanceDomainError } from "./finance-service";
import type {
  ActorSnapshot,
  CancelFinanceTransferInput,
  ConfirmSupplierRefundInput,
  CreateRefundRecoveryInput,
  CreateFinanceOtherTransactionInput,
  CreateFinanceTransferInput,
  FinanceActor,
  FinanceFeatureState,
  FinanceIncomeExpenseItem,
  FinanceMethodStatisticRow,
  FinanceOrderPaymentStatistics,
  FinanceOtherSummaryRow,
  FinanceOtherTransaction,
  FinancePermission,
  FinanceTransfer,
  FinanceLedgerStatisticRow,
  FundAccount,
  FundMovement,
  PrototypeAttachment,
  ReviewFinanceOtherTransactionInput,
  ReviewFinanceTransferInput,
  SaveFinanceIncomeExpenseItemInput,
  SupplierRefundObligation,
  SupplierRefundReceipt,
  SupplierRefundDetail,
} from "../types";

type ExtensionIdKind =
  | "transfer"
  | "other-item"
  | "other-transaction"
  | "supplier-refund"
  | "movement"
  | "audit";
export interface FinanceExtensionServiceDependencies {
  repository: FinanceRepository;
  now: () => string;
  nextId: (kind: ExtensionIdKind) => string;
  actorName?: (actor: FinanceActor) => string;
  assertInstitutionProvider?: () => void;
}

const fullPermissions: FinancePermission[] = [
  "finance.view-transfers",
  "finance.manage-transfers",
  "finance.view-other-transactions",
  "finance.manage-other-transactions",
  "finance.view-supplier-refunds",
  "finance.manage-supplier-refunds",
  "finance.view-statistics",
  "finance.export-statistics",
  "finance.view-institutions",
];
const rolePermissions: Record<FinanceActor["role"], FinancePermission[]> = {
  "super-admin": fullPermissions,
  finance: fullPermissions,
  "sales-supervisor": [
    "finance.view-transfers",
    "finance.view-other-transactions",
    "finance.view-supplier-refunds",
    "finance.view-statistics",
    "finance.view-institutions",
  ],
  salesperson: [],
  warehouse: [],
};
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePart = (value: string) => value.slice(0, 10);
const monthPart = (value: string) => value.slice(0, 7);
const normalize = (value: string) => value.trim().toLocaleLowerCase();

function permission(actor: FinanceActor, value: FinancePermission): void {
  if (!(actor.permissions ?? rolePermissions[actor.role]).includes(value))
    throw new FinanceDomainError(
      "PERMISSION_DENIED",
      "当前角色没有该资金操作权限",
    );
}
function snapshot(
  actor: FinanceActor,
  deps: FinanceExtensionServiceDependencies,
): ActorSnapshot {
  return {
    id: actor.actorId,
    name: deps.actorName?.(actor) ?? actor.actorId,
    role: actor.role,
  };
}
function assertPositive(value: number, path = "amountCents"): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new FinanceValidationError([{ path, message: "必须是正整数分" }]);
}
function assertOccurredAt(
  state: FinanceFeatureState,
  value: string,
  now: string,
  accounts: FundAccount[],
): void {
  if (!Number.isFinite(Date.parse(value)) || value > now)
    throw new FinanceValidationError([
      { path: "occurredAt", message: "时间无效或晚于当前时间" },
    ]);
  if (
    state.periods.some(
      (item) => item.month === monthPart(value) && item.status === "closed",
    )
  )
    throw new FinanceDomainError("INVALID_STATE", "已结转月份禁止资金操作");
  for (const account of accounts) {
    const latest = state.movements
      .filter((item) => item.accountId === account.id)
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      )[0];
    if (latest && value < latest.occurredAt)
      throw new FinanceDomainError(
        "INVALID_STATE",
        "业务时间不能早于相关账户最近流水",
      );
  }
}
function assertAttachment(
  value?: PrototypeAttachment | null,
): PrototypeAttachment | null {
  if (!value) return null;
  if (
    value.sizeBytes < 1 ||
    value.sizeBytes > 5 * 1024 * 1024 ||
    !["application/pdf", "image/jpeg", "image/png"].includes(value.mimeType) ||
    !/(mock|demo|fake|演示|虚构)/i.test(value.name)
  )
    throw new FinanceValidationError([
      {
        path: "attachment",
        message: "仅允许单个不超过 5MB 的虚构 pdf/jpg/png 元数据",
      },
    ]);
  return structuredClone(value);
}
function account(state: FinanceFeatureState, id: string): FundAccount {
  const value = state.accounts.find((item) => item.id === id);
  if (!value) throw new FinanceDomainError("NOT_FOUND", "资金账户不存在");
  if (value.status !== "enabled")
    throw new FinanceDomainError("INVALID_STATE", "资金账户已停用");
  return value;
}
function balance(state: FinanceFeatureState, value: FundAccount): number {
  return state.movements
    .filter((item) => item.accountId === value.id)
    .reduce(
      (sum, item) =>
        sum +
        (item.direction === "income" ? item.amountCents : -item.amountCents),
      value.openingBalanceCents,
    );
}
function replay<T>(
  state: FinanceFeatureState,
  requestId: string,
  kind: FinanceFeatureState["requests"][number]["kind"],
  resolve: (targetIds: string[]) => T,
): T | null {
  const found = state.requests.find((item) => item.requestId === requestId);
  if (!found) return null;
  if (found.kind !== kind)
    throw new FinanceDomainError("CONFLICT", "requestId 已被其他操作使用");
  return resolve(found.targetIds);
}
function record(
  state: FinanceFeatureState,
  requestId: string,
  kind: FinanceFeatureState["requests"][number]["kind"],
  targetIds: string[],
  now: string,
): void {
  state.requests.push({ requestId, kind, targetIds, appliedAt: now });
}
function nextNo(
  state: FinanceFeatureState,
  kind: "transfer" | "otherReceipt" | "otherPayment" | "supplierRefund",
  occurredAt: string,
): string {
  const date = datePart(occurredAt);
  let sequence = state.dailySequences.find((item) => item.date === date);
  if (!sequence) {
    sequence = { date, receivable: 1, receipt: 1, writeoff: 1 };
    state.dailySequences.push(sequence);
  }
  const current = sequence[kind] ?? 1;
  sequence[kind] = current + 1;
  const prefix =
    kind === "transfer"
      ? "ZZ"
      : kind === "otherReceipt"
        ? "QTSK"
        : kind === "otherPayment"
          ? "QTFK"
          : "GYSTK";
  return `${prefix}-${date.slice(2).replaceAll("-", "")}-${String(current).padStart(5, "0")}`;
}
function appendMovement(
  state: FinanceFeatureState,
  actor: FinanceActor,
  deps: FinanceExtensionServiceDependencies,
  input: {
    requestId: string;
    account: FundAccount;
    direction: "income" | "expense";
    kind: FundMovement["kind"];
    amountCents: number;
    sourceId: string;
    sourceNo: string;
    counterparty: string | null;
    summary: string;
    occurredAt: string;
  },
): FundMovement {
  const before = balance(state, input.account);
  const after =
    before +
    (input.direction === "income" ? input.amountCents : -input.amountCents);
  if (after < 0) throw new FinanceDomainError("INVALID_STATE", "账户余额不足");
  const movement: FundMovement = {
    id: deps.nextId("movement"),
    enterpriseId: state.enterpriseId,
    accountId: input.account.id,
    direction: input.direction,
    kind: input.kind,
    amountCents: input.amountCents,
    balanceAfterCents: after,
    sourceId: input.sourceId,
    sourceNoSnapshot: input.sourceNo,
    counterpartySnapshot: input.counterparty,
    summary: input.summary,
    requestId: input.requestId,
    operatorSnapshot: snapshot(actor, deps),
    occurredAt: input.occurredAt,
  };
  state.movements.push(movement);
  return movement;
}
function audit(
  state: FinanceFeatureState,
  actor: FinanceActor,
  deps: FinanceExtensionServiceDependencies,
  action: FinanceFeatureState["auditLogs"][number]["action"],
  targetId: string,
  detail: string,
): void {
  state.auditLogs.push({
    id: deps.nextId("audit"),
    enterpriseId: state.enterpriseId,
    action,
    targetId,
    operatorSnapshot: snapshot(actor, deps),
    detail,
    createdAt: deps.now(),
  });
}

export function createFinanceExtensionService(
  deps: FinanceExtensionServiceDependencies,
) {
  function listTransfers(actor: FinanceActor): FinanceTransfer[] {
    permission(actor, "finance.view-transfers");
    return deps.repository
      .read()
      .transfers.sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      )
      .map((item) => structuredClone(item));
  }
  function createTransfer(
    actor: FinanceActor,
    input: CreateFinanceTransferInput,
  ): FinanceTransfer {
    permission(actor, "finance.manage-transfers");
    assertPositive(input.amountCents);
    const attachment = assertAttachment(input.attachment);
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "transfer-create", (ids) =>
        state.transfers.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const from = account(state, input.fromAccountId);
      const to = account(state, input.toAccountId);
      if (from.id === to.id)
        throw new FinanceDomainError("INVALID_STATE", "转出和转入账户不能相同");
      assertOccurredAt(state, input.occurredAt, deps.now(), [from, to]);
      let sourceTransferId: string | null = null;
      if (input.sourceTransferId) {
        const source = state.transfers.find(
          (item) => item.id === input.sourceTransferId,
        );
        if (
          !source ||
          source.status !== "completed" ||
          source.fromAccountId !== to.id ||
          source.toAccountId !== from.id ||
          source.amountCents !== input.amountCents
        )
          throw new FinanceDomainError(
            "INVALID_STATE",
            "反向转账必须与原完成转账账户和金额完全对应",
          );
        sourceTransferId = source.id;
      }
      const value: FinanceTransfer = {
        id: deps.nextId("transfer"),
        enterpriseId: state.enterpriseId,
        transferNo: nextNo(state, "transfer", input.occurredAt),
        occurredAt: input.occurredAt,
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: input.amountCents,
        attachment,
        note: input.note?.trim() || null,
        status: "pending-review",
        sourceTransferId,
        movementIds: [],
        requestId: input.requestId,
        operatorSnapshot: snapshot(actor, deps),
        reviewedAt: null,
        reviewedBy: null,
        cancelReason: null,
        version: 1,
      };
      state.transfers.push(value);
      state.version += 1;
      record(state, input.requestId, "transfer-create", [value.id], deps.now());
      audit(
        state,
        actor,
        deps,
        "transfer.created",
        value.id,
        `新增转账 ${value.transferNo}`,
      );
      return value;
    });
  }
  function approveTransfer(
    actor: FinanceActor,
    input: ReviewFinanceTransferInput,
  ): FinanceTransfer {
    permission(actor, "finance.manage-transfers");
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "transfer-approve", (ids) =>
        state.transfers.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const value = state.transfers.find(
        (item) => item.id === input.transferId,
      );
      if (!value) throw new FinanceDomainError("NOT_FOUND", "转账单不存在");
      if (value.version !== input.expectedVersion)
        throw new FinanceDomainError("CONFLICT", "转账单已变化，请刷新");
      if (value.status !== "pending-review")
        throw new FinanceDomainError("INVALID_STATE", "只有待审核转账可以批准");
      const from = account(state, value.fromAccountId);
      const to = account(state, value.toAccountId);
      assertOccurredAt(state, value.occurredAt, deps.now(), [from, to]);
      const out = appendMovement(state, actor, deps, {
        requestId: `${input.requestId}:out`,
        account: from,
        direction: "expense",
        kind: "transfer-out",
        amountCents: value.amountCents,
        sourceId: value.id,
        sourceNo: value.transferNo,
        counterparty: to.name,
        summary: `转账转出 ${value.transferNo}`,
        occurredAt: value.occurredAt,
      });
      const incoming = appendMovement(state, actor, deps, {
        requestId: `${input.requestId}:in`,
        account: to,
        direction: "income",
        kind: "transfer-in",
        amountCents: value.amountCents,
        sourceId: value.id,
        sourceNo: value.transferNo,
        counterparty: from.name,
        summary: `转账转入 ${value.transferNo}`,
        occurredAt: value.occurredAt,
      });
      value.status = "completed";
      value.movementIds = [out.id, incoming.id];
      value.reviewedAt = deps.now();
      value.reviewedBy = snapshot(actor, deps);
      value.version += 1;
      state.version += 1;
      record(
        state,
        input.requestId,
        "transfer-approve",
        [value.id],
        deps.now(),
      );
      audit(
        state,
        actor,
        deps,
        "transfer.approved",
        value.id,
        `审核转账 ${value.transferNo}`,
      );
      return value;
    });
  }
  function cancelTransfer(
    actor: FinanceActor,
    input: CancelFinanceTransferInput,
  ): FinanceTransfer {
    permission(actor, "finance.manage-transfers");
    const reason = input.reason.trim();
    if (!reason)
      throw new FinanceValidationError([
        { path: "reason", message: "取消原因不能为空" },
      ]);
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "transfer-cancel", (ids) =>
        state.transfers.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const value = state.transfers.find(
        (item) => item.id === input.transferId,
      );
      if (!value) throw new FinanceDomainError("NOT_FOUND", "转账单不存在");
      if (value.version !== input.expectedVersion)
        throw new FinanceDomainError("CONFLICT", "转账单已变化，请刷新");
      if (value.status !== "pending-review")
        throw new FinanceDomainError("INVALID_STATE", "只有待审核转账可以取消");
      value.status = "cancelled";
      value.cancelReason = reason;
      value.reviewedAt = deps.now();
      value.reviewedBy = snapshot(actor, deps);
      value.version += 1;
      state.version += 1;
      record(state, input.requestId, "transfer-cancel", [value.id], deps.now());
      audit(
        state,
        actor,
        deps,
        "transfer.cancelled",
        value.id,
        `取消转账 ${value.transferNo}：${reason}`,
      );
      return value;
    });
  }

  function listIncomeExpenseItems(
    actor: FinanceActor,
    direction?: "income" | "expense",
  ): FinanceIncomeExpenseItem[] {
    permission(actor, "finance.view-other-transactions");
    return deps.repository
      .read()
      .incomeExpenseItems.filter(
        (item) => !direction || item.direction === direction,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((item) => structuredClone(item));
  }
  function saveIncomeExpenseItem(
    actor: FinanceActor,
    input: SaveFinanceIncomeExpenseItemInput,
  ): FinanceIncomeExpenseItem {
    permission(actor, "finance.manage-other-transactions");
    const name = input.name.trim();
    if (!name || name.length > 80)
      throw new FinanceValidationError([
        { path: "name", message: "名称必须为 1～80 个字符" },
      ]);
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "other-item-save", (ids) =>
        state.incomeExpenseItems.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      if (
        state.incomeExpenseItems.some(
          (item) =>
            item.id !== input.itemId &&
            item.direction === input.direction &&
            normalize(item.name) === normalize(name),
        )
      )
        throw new FinanceDomainError("DUPLICATE", "同方向收支项目名称已存在");
      let value = input.itemId
        ? state.incomeExpenseItems.find((item) => item.id === input.itemId)
        : undefined;
      if (input.itemId && !value)
        throw new FinanceDomainError("NOT_FOUND", "收支项目不存在");
      if (value) {
        if (value.version !== input.expectedVersion)
          throw new FinanceDomainError("CONFLICT", "收支项目已变化");
        if (value.direction !== input.direction)
          throw new FinanceDomainError(
            "INVALID_STATE",
            "历史收支项目不能改变方向",
          );
        value.name = name;
        value.status = input.status;
        value.updatedAt = deps.now();
        value.version += 1;
      } else {
        value = {
          id: deps.nextId("other-item"),
          enterpriseId: state.enterpriseId,
          direction: input.direction,
          name,
          status: input.status,
          createdAt: deps.now(),
          updatedAt: deps.now(),
          version: 1,
        };
        state.incomeExpenseItems.push(value);
      }
      state.version += 1;
      record(state, input.requestId, "other-item-save", [value.id], deps.now());
      audit(
        state,
        actor,
        deps,
        "other-item.saved",
        value.id,
        `保存${input.direction === "income" ? "收入" : "支出"}项目 ${value.name}`,
      );
      return value;
    });
  }
  function listOtherTransactions(
    actor: FinanceActor,
    direction?: "income" | "expense",
  ): FinanceOtherTransaction[] {
    permission(actor, "finance.view-other-transactions");
    return deps.repository
      .read()
      .otherTransactions.filter(
        (item) => !direction || item.direction === direction,
      )
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      )
      .map((item) => structuredClone(item));
  }
  function createOtherTransaction(
    actor: FinanceActor,
    input: CreateFinanceOtherTransactionInput,
  ): FinanceOtherTransaction {
    permission(actor, "finance.manage-other-transactions");
    assertPositive(input.amountCents);
    const counterparty = input.counterparty.trim();
    if (!counterparty || counterparty.length > 100)
      throw new FinanceValidationError([
        { path: "counterparty", message: "往来单位必须为 1～100 个字符" },
      ]);
    const attachment = assertAttachment(input.attachment);
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "other-create", (ids) =>
        state.otherTransactions.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const targetAccount = account(state, input.accountId);
      assertOccurredAt(state, input.occurredAt, deps.now(), [targetAccount]);
      const item = state.incomeExpenseItems.find(
        (entry) => entry.id === input.itemId,
      );
      if (
        !item ||
        item.direction !== input.direction ||
        item.status !== "enabled"
      )
        throw new FinanceDomainError(
          "INVALID_STATE",
          "收支项目不存在、方向不匹配或已停用",
        );
      let correctionOfId: string | null = null;
      if (input.correctionOfId) {
        const source = state.otherTransactions.find(
          (entry) => entry.id === input.correctionOfId,
        );
        if (
          !source ||
          source.status !== "approved" ||
          source.direction === input.direction ||
          source.amountCents !== input.amountCents
        )
          throw new FinanceDomainError(
            "INVALID_STATE",
            "更正单必须与原批准单据金额相等且方向相反",
          );
        correctionOfId = source.id;
      }
      const kind =
        input.direction === "income" ? "otherReceipt" : "otherPayment";
      const value: FinanceOtherTransaction = {
        id: deps.nextId("other-transaction"),
        enterpriseId: state.enterpriseId,
        documentNo: nextNo(state, kind, input.occurredAt),
        direction: input.direction,
        occurredAt: input.occurredAt,
        counterpartySnapshot: counterparty,
        itemId: item.id,
        itemNameSnapshot: item.name,
        amountCents: input.amountCents,
        accountId: targetAccount.id,
        attachment,
        note: input.note?.trim() || null,
        status: "pending-review",
        correctionOfId,
        movementId: null,
        requestId: input.requestId,
        operatorSnapshot: snapshot(actor, deps),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        version: 1,
      };
      state.otherTransactions.push(value);
      state.version += 1;
      record(state, input.requestId, "other-create", [value.id], deps.now());
      audit(
        state,
        actor,
        deps,
        "other.created",
        value.id,
        `新增其他${input.direction === "income" ? "收款" : "付款"} ${value.documentNo}`,
      );
      return value;
    });
  }

  function createRefundRecovery(actor: FinanceActor, input: CreateRefundRecoveryInput): FinanceOtherTransaction {
    permission(actor, "finance.manage-other-transactions"); assertPositive(input.amountCents)
    const reason = input.reason.trim(); if (!reason || reason.length > 200) throw new FinanceValidationError([{ path: "reason", message: "追回原因须为 1～200 个字符" }])
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "other-create", (ids) => state.otherTransactions.find((item) => item.id === ids[0])!)
      if (prior) return prior
      const refund = state.refunds.find((item) => item.id === input.refundId)
      if (!refund) throw new FinanceDomainError("NOT_FOUND", "原退款单不存在")
      if (refund.version !== input.expectedVersion) throw new FinanceDomainError("CONFLICT", "原退款单已变化，请刷新")
      if (refund.status !== "refunded") throw new FinanceDomainError("INVALID_STATE", "只有已完成退款可以追回")
      if (input.amountCents > refund.refundedAmountCents) throw new FinanceDomainError("INVALID_STATE", "追回金额不能超过原实退金额")
      if (state.otherTransactions.some((item) => item.correctionOfId === refund.id && item.status !== "rejected")) throw new FinanceDomainError("CONFLICT", "原退款已有未完成追回单")
      const item = state.incomeExpenseItems.find((entry) => entry.id === input.itemId)
      if (!item || item.direction !== "income" || item.status !== "enabled") throw new FinanceDomainError("INVALID_STATE", "退款追回项目不存在、方向不匹配或已停用")
      const targetAccount = account(state, input.accountId); assertOccurredAt(state, input.occurredAt, deps.now(), [targetAccount])
      const value: FinanceOtherTransaction = { id: deps.nextId("other-transaction"), enterpriseId: state.enterpriseId, documentNo: nextNo(state, "otherReceipt", input.occurredAt), direction: "income", occurredAt: input.occurredAt, counterpartySnapshot: refund.customerSnapshot.name, itemId: item.id, itemNameSnapshot: item.name, amountCents: input.amountCents, accountId: targetAccount.id, attachment: null, note: reason, status: "pending-review", correctionOfId: refund.id, movementId: null, requestId: input.requestId, operatorSnapshot: snapshot(actor, deps), reviewedAt: null, reviewedBy: null, rejectionReason: null, version: 1 }
      state.otherTransactions.push(value); state.version += 1; record(state, input.requestId, "other-create", [value.id], deps.now()); audit(state, actor, deps, "other.created", value.id, `退款追回 ${refund.refundNo}：${value.documentNo}`); return value
    })
  }
  function reviewOtherTransaction(
    actor: FinanceActor,
    input: ReviewFinanceOtherTransactionInput,
  ): FinanceOtherTransaction {
    permission(actor, "finance.manage-other-transactions");
    const reason = input.reason?.trim() || null;
    if (input.decision === "reject" && !reason)
      throw new FinanceValidationError([
        { path: "reason", message: "拒绝原因不能为空" },
      ]);
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, "other-review", (ids) =>
        state.otherTransactions.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const value = state.otherTransactions.find(
        (item) => item.id === input.transactionId,
      );
      if (!value) throw new FinanceDomainError("NOT_FOUND", "其他收支单不存在");
      if (value.version !== input.expectedVersion)
        throw new FinanceDomainError("CONFLICT", "单据已变化，请刷新");
      if (value.status !== "pending-review")
        throw new FinanceDomainError("INVALID_STATE", "只有待审核单据可以处理");
      if (input.decision === "approve") {
        const targetAccount = account(state, value.accountId);
        assertOccurredAt(state, value.occurredAt, deps.now(), [targetAccount]);
        const movement = appendMovement(state, actor, deps, {
          requestId: `${input.requestId}:movement`,
          account: targetAccount,
          direction: value.direction,
          kind: value.direction === "income" ? "other-income" : "other-expense",
          amountCents: value.amountCents,
          sourceId: value.id,
          sourceNo: value.documentNo,
          counterparty: value.counterpartySnapshot,
          summary: `${value.direction === "income" ? "其他收款" : "其他付款"} ${value.documentNo}`,
          occurredAt: value.occurredAt,
        });
        value.status = "approved";
        value.movementId = movement.id;
      } else {
        value.status = "rejected";
        value.rejectionReason = reason;
      }
      value.reviewedAt = deps.now();
      value.reviewedBy = snapshot(actor, deps);
      value.version += 1;
      state.version += 1;
      record(state, input.requestId, "other-review", [value.id], deps.now());
      audit(
        state,
        actor,
        deps,
        value.status === "approved" ? "other.approved" : "other.rejected",
        value.id,
        `${value.status === "approved" ? "批准" : "拒绝"}其他收支 ${value.documentNo}`,
      );
      return value;
    });
  }
  function summarizeOtherTransactions(
    actor: FinanceActor,
  ): FinanceOtherSummaryRow[] {
    const rows = listOtherTransactions(actor).filter(
      (item) => item.status === "approved",
    );
    const map = new Map<string, FinanceOtherSummaryRow>();
    for (const item of rows) {
      const row = map.get(item.itemId) ?? {
        itemId: item.itemId,
        itemName: item.itemNameSnapshot,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
      };
      row[`${item.direction}Cents` as "incomeCents" | "expenseCents"] +=
        item.amountCents;
      row.netCents = row.incomeCents - row.expenseCents;
      map.set(item.itemId, row);
    }
    return [...map.values()].sort(
      (a, b) =>
        Math.abs(b.netCents) - Math.abs(a.netCents) ||
        a.itemName.localeCompare(b.itemName, "zh-CN"),
    );
  }

  function listSupplierRefundObligations(
    actor: FinanceActor,
  ): SupplierRefundObligation[] {
    permission(actor, "finance.view-supplier-refunds");
    const state = deps.repository.read();
    return state.supplierPayableCredits
      .filter(
        (item) => item.status === "active" && item.refundObligationCents > 0,
      )
      .map((credit) => {
        const receivedCents = state.supplierRefundReceipts
          .filter((item) => item.creditId === credit.id)
          .reduce((sum, item) => sum + item.amountCents, 0);
        const payable = credit.payableId
          ? state.payables.find((item) => item.id === credit.payableId)
          : null;
        return {
          credit: structuredClone(credit),
          supplier: payable ? structuredClone(payable.supplierSnapshot) : null,
          receivedCents,
          outstandingCents: Math.max(
            0,
            credit.refundObligationCents - receivedCents,
          ),
          status:
            receivedCents >= credit.refundObligationCents
              ? ("refunded" as const)
              : ("pending" as const),
        };
      })
      .sort((a, b) => b.credit.occurredAt.localeCompare(a.credit.occurredAt));
  }

  function getSupplierRefundDetail(actor: FinanceActor, creditId: string): SupplierRefundDetail {
    permission(actor, "finance.view-supplier-refunds")
    const state = deps.repository.read(); const row = listSupplierRefundObligations(actor).find((item) => item.credit.id === creditId)
    if (!row) throw new FinanceDomainError("NOT_FOUND", "供应商退款义务不存在")
    const receipt = state.supplierRefundReceipts.find((item) => item.creditId === creditId) ?? null
    const movement = receipt ? state.movements.find((item) => item.id === receipt.movementId) ?? null : null
    const accountName = receipt ? state.accounts.find((item) => item.id === receipt.accountId)?.name ?? null : null
    const auditLogs = state.auditLogs.filter((item) => item.targetId === creditId || item.targetId === receipt?.id).map((item) => structuredClone(item))
    return { obligation: row, receipt: receipt ? structuredClone(receipt) : null, accountName, movement: movement ? structuredClone(movement) : null, audit: auditLogs }
  }
  function confirmSupplierRefund(
    actor: FinanceActor,
    input: ConfirmSupplierRefundInput,
  ): SupplierRefundReceipt {
    permission(actor, "finance.manage-supplier-refunds");
    return deps.repository.transact((state) => {
      const prior = replay(
        state,
        input.requestId,
        "supplier-refund-confirm",
        (ids) =>
          state.supplierRefundReceipts.find((item) => item.id === ids[0])!,
      );
      if (prior) return prior;
      const credit = state.supplierPayableCredits.find(
        (item) => item.id === input.creditId && item.status === "active",
      );
      if (!credit || credit.refundObligationCents <= 0)
        throw new FinanceDomainError("NOT_FOUND", "供应商退款义务不存在");
      if (
        state.supplierRefundReceipts.some((item) => item.creditId === credit.id)
      )
        throw new FinanceDomainError("DUPLICATE", "该供应商退款义务已确认到账");
      const targetAccount = account(state, input.accountId);
      if (!["cash", "bank"].includes(targetAccount.type))
        throw new FinanceDomainError(
          "INVALID_STATE",
          "供应商退款只能进入现金或银行账户",
        );
      assertOccurredAt(state, input.occurredAt, deps.now(), [targetAccount]);
      const receiptId = deps.nextId("supplier-refund");
      const receiptNo = nextNo(state, "supplierRefund", input.occurredAt);
      const payable = credit.payableId
        ? state.payables.find((item) => item.id === credit.payableId)
        : null;
      const movement = appendMovement(state, actor, deps, {
        requestId: `${input.requestId}:movement`,
        account: targetAccount,
        direction: "income",
        kind: "refund",
        amountCents: credit.refundObligationCents,
        sourceId: receiptId,
        sourceNo: receiptNo,
        counterparty: payable?.supplierSnapshot.name ?? null,
        summary: `供应商退款到账 ${receiptNo}`,
        occurredAt: input.occurredAt,
      });
      const value: SupplierRefundReceipt = {
        id: receiptId,
        enterpriseId: state.enterpriseId,
        receiptNo,
        creditId: credit.id,
        supplierId: credit.supplierId,
        sourceNo: credit.sourceNo,
        amountCents: credit.refundObligationCents,
        method: targetAccount.type as "cash" | "bank",
        accountId: targetAccount.id,
        movementId: movement.id,
        occurredAt: input.occurredAt,
        requestId: input.requestId,
        operatorSnapshot: snapshot(actor, deps),
        version: 1,
      };
      state.supplierRefundReceipts.push(value);
      state.version += 1;
      record(
        state,
        input.requestId,
        "supplier-refund-confirm",
        [value.id],
        deps.now(),
      );
      audit(
        state,
        actor,
        deps,
        "supplier-refund.confirmed",
        value.id,
        `确认供应商退款到账 ${value.receiptNo}`,
      );
      return value;
    });
  }

  function assertMonth(month: string): void {
    if (!monthPattern.test(month))
      throw new FinanceValidationError([
        { path: "month", message: "必须为 YYYY-MM" },
      ]);
    if (month > monthPart(deps.now()))
      throw new FinanceDomainError("INVALID_STATE", "不能查询未来月份");
  }
  function getMethodStatistics(
    actor: FinanceActor,
    month: string,
  ): {
    rows: FinanceMethodStatisticRow[];
    totalCents: number;
    snapshotVersion: number;
  } {
    permission(actor, "finance.view-statistics");
    assertMonth(month);
    const state = deps.repository.read();
    const methods = ["cash", "wechat", "alipay", "bank"] as const;
    const valid = state.customerReceipts.filter(
      (item) =>
        item.status === "normal" &&
        item.method !== "balance" &&
        monthPart(item.occurredAt) === month,
    );
    const totalCents = valid.reduce((sum, item) => sum + item.amountCents, 0);
    const rows = methods.map((method) => {
      const matches = valid.filter((item) => item.method === method);
      const amountCents = matches.reduce(
        (sum, item) => sum + item.amountCents,
        0,
      );
      return {
        method,
        amountCents,
        receiptCount: new Set(matches.map((item) => item.id)).size,
        ratioBasisPoints: totalCents
          ? Math.round((amountCents * 10000) / totalCents)
          : null,
      };
    });
    return { rows, totalCents, snapshotVersion: state.version };
  }
  function getOrderPaymentStatistics(
    actor: FinanceActor,
    month: string,
  ): FinanceOrderPaymentStatistics {
    permission(actor, "finance.view-statistics");
    assertMonth(month);
    const state = deps.repository.read();
    const rows = state.receivables
      .filter((item) => item.orderedAt && monthPart(item.orderedAt) === month)
      .map((receivable) => {
        const credits = state.creditAdjustments.filter(
          (item) =>
            item.receivableId === receivable.id && item.status === "active",
        );
        const writeoffs = state.receiptWriteoffs
          .filter((item) => item.status === "active")
          .flatMap((item) => item.allocations)
          .filter((item) => item.receivableId === receivable.id);
        const credited = credits.reduce(
          (sum, item) => sum + item.amountCents,
          0,
        );
        const creditSettled = credits.reduce(
          (sum, item) =>
            sum + item.amountCents - item.outstandingReductionCents,
          0,
        );
        const netReceivableCents = Math.max(
          0,
          receivable.amountCents - credited,
        );
        const netReceivedCents = Math.max(
          0,
          writeoffs.reduce(
            (sum, item) => sum + item.cashCents + item.discountCents,
            0,
          ) - creditSettled,
        );
        return {
          receivableId: receivable.id,
          orderedAt: receivable.orderedAt ?? null,
          orderNo: receivable.orderNo,
          returnNos: credits.map((item) => item.sourceNo),
          customerSnapshot: structuredClone(receivable.customerSnapshot),
          goodsAmountCents: receivable.goodsAmountCents,
          freightCents: receivable.freightCents,
          netReceivableCents,
          netReceivedCents,
          outstandingCents: Math.max(0, netReceivableCents - netReceivedCents),
        };
      })
      .sort(
        (a, b) =>
          (b.orderedAt ?? "").localeCompare(a.orderedAt ?? "") ||
          b.receivableId.localeCompare(a.receivableId),
      );
    return {
      rows,
      receivableCents: rows.reduce(
        (sum, item) => sum + item.netReceivableCents,
        0,
      ),
      receivedCents: rows.reduce((sum, item) => sum + item.netReceivedCents, 0),
      outstandingCents: rows.reduce(
        (sum, item) => sum + item.outstandingCents,
        0,
      ),
      snapshotVersion: state.version,
    };
  }
  function listLedgerStatistics(
    actor: FinanceActor,
    month: string,
  ): FinanceLedgerStatisticRow[] {
    permission(actor, "finance.view-statistics");
    assertMonth(month);
    const state = deps.repository.read();
    return state.movements
      .filter((item) => monthPart(item.occurredAt) === month)
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      )
      .map((item) => ({
        occurredAt: item.occurredAt,
        accountName:
          state.accounts.find((account) => account.id === item.accountId)
            ?.name ?? "资料不可用",
        kind: item.kind,
        sourceNo: item.sourceNoSnapshot,
        counterparty: item.counterpartySnapshot,
        direction: item.direction,
        amountCents: item.amountCents,
        balanceAfterCents: item.balanceAfterCents,
      }));
  }
  function exportStatisticsCsv(
    actor: FinanceActor,
    report: "methods" | "orders",
    month: string,
  ): string {
    permission(actor, "finance.export-statistics");
    if (report === "methods") {
      const value = getMethodStatistics(actor, month);
      return `\uFEFF${["收款方式,收款金额分,收款笔数,占比基点", ...value.rows.map((row) => `${row.method},${row.amountCents},${row.receiptCount},${row.ratioBasisPoints ?? "unavailable"}`)].join("\r\n")}`;
    }
    const value = getOrderPaymentStatistics(actor, month);
    return `\uFEFF${["下单时间,订单号,退单号,客户,订货金额分,运费分,应收分,已收分,待收分", ...value.rows.map((row) => [row.orderedAt ?? "unavailable", row.orderNo, row.returnNos.join("|"), row.customerSnapshot.name, row.goodsAmountCents, row.freightCents, row.netReceivableCents, row.netReceivedCents, row.outstandingCents].join(","))].join("\r\n")}`;
  }
  function getInstitutionReceipts(actor: FinanceActor): never {
    permission(actor, "finance.view-institutions");
    deps.assertInstitutionProvider?.();
    throw new FinanceDomainError(
      "DATA_PROVIDER_UNAVAILABLE",
      "机构主数据尚未接入，机构收款暂不可用",
    );
  }
  function getWithdrawalWorkspace(actor: FinanceActor): never {
    permission(actor, "finance.view-other-transactions");
    throw new FinanceDomainError(
      "DATA_PROVIDER_UNAVAILABLE",
      "拉新奖励、人员与可提现余额提供方尚未接入",
    );
  }

  return {
    listTransfers,
    createTransfer,
    approveTransfer,
    cancelTransfer,
    listIncomeExpenseItems,
    saveIncomeExpenseItem,
    listOtherTransactions,
    createOtherTransaction,
    createRefundRecovery,
    reviewOtherTransaction,
    summarizeOtherTransactions,
    listSupplierRefundObligations,
    getSupplierRefundDetail,
    confirmSupplierRefund,
    getMethodStatistics,
    getOrderPaymentStatistics,
    listLedgerStatistics,
    exportStatisticsCsv,
    getInstitutionReceipts,
    getWithdrawalWorkspace,
  };
}
