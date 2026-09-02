import {
  assertLocationDraft,
  assertWarehouseDraft,
  InventoryValidationError,
} from "../schemas/inventory-schema";
import type { InventoryRepository } from "../repositories/inventory-repository";
import { createInventoryProcessingService } from "./inventory-processing-service";
import { createInventoryPickingDeliveryService } from "./inventory-picking-delivery-service";
import { createInventoryStatisticsService } from "./inventory-statistics-service";
import type {
  BatchStatus,
  ConfirmInboundInput,
  ConfirmOutboundBatchInput,
  ConfirmOutboundInput,
  ConfirmReturnInboundInput,
  EntityId,
  FifoAllocation,
  InventoryActor,
  InventoryBatchRow,
  InventoryCatalogProvider,
  InventoryCategorySnapshot,
  InventoryFeatureState,
  InventoryLocation,
  InventoryMovementRow,
  InventoryQuery,
  InventoryStatus,
  InventoryStockRow,
  InventoryThreshold,
  InventoryWorkspace,
  LocationDraft,
  LocationImportPreview,
  LocationImportRow,
  PageResult,
  ReferencedFifoAllocation,
  ReverseOutboundInput,
  ReverseReturnInboundInput,
  Warehouse,
  WarehouseDraft,
  InventoryDocumentListQuery,
  InventoryDocumentPage,
  InventoryTransfer,
  InventoryTransferDraft,
  InventoryOtherOutbound,
  InventoryOtherOutboundDraft,
  InventoryOtherInbound,
  InventoryOtherInboundDraft,
  InventoryStocktake,
  InventoryStocktakeDraft,
  InventoryCostAdjustment,
  InventoryCostAdjustmentDraft,
  InventoryClosingPage,
  InventoryClosing,
  InventoryAverageCost,
  InventoryCostHistory,
  ProcessingOrderSourceProvider,
  PickingOrderCoordinator,
  DeliveryStaffProvider,
} from "../types";

export type InventoryDomainErrorCode =
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "INVALID_STATE"
  | "SOURCE_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "EXPIRED_BATCH"
  | "PRODUCT_UNAVAILABLE";
export class InventoryDomainError extends Error {
  constructor(
    readonly code: InventoryDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryDomainError";
  }
}

export interface InventoryServiceDependencies {
  repository: InventoryRepository;
  catalog: InventoryCatalogProvider;
  now: () => string;
  nextId: (
    kind: "warehouse" | "location" | "batch" | "balance" | "movement" | "log",
  ) => string;
  processingOrderProvider?: ProcessingOrderSourceProvider;
  pickingOrderCoordinator?: PickingOrderCoordinator;
  deliveryStaffProvider?: DeliveryStaffProvider;
}

const readRoles = new Set(["super-admin", "warehouse", "sales-supervisor"]);
const writeRoles = new Set(["super-admin", "warehouse"]);
const normalize = (value: string) => value.trim().toLocaleLowerCase();
const datePart = (value: string) => value.slice(0, 10);
const monthPart = (value: string) => value.slice(0, 7);

function assertRead(actor: InventoryActor): void {
  if (!readRoles.has(actor.role))
    throw new InventoryDomainError(
      "PERMISSION_DENIED",
      "当前角色不可访问库存模块",
    );
}
function assertWrite(actor: InventoryActor): void {
  if (!writeRoles.has(actor.role))
    throw new InventoryDomainError(
      "PERMISSION_DENIED",
      "当前角色不可修改库存资料",
    );
}
function positiveMilli(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new InventoryValidationError([
      { path: "quantityMilli", message: "必须是正整数毫单位" },
    ]);
}
function cloneWarehouseFor(
  actor: InventoryActor,
  warehouse: Warehouse,
): Warehouse {
  return actor.role === "sales-supervisor"
    ? { ...structuredClone(warehouse), contactName: null, phone: null }
    : structuredClone(warehouse);
}
function amount(quantityMilli: number, costCents: number): number {
  return Math.round((quantityMilli * costCents) / 1000);
}

export function calculateInventoryStatus(
  availableMilli: number | null,
  threshold: InventoryThreshold | null,
): InventoryStatus {
  if (availableMilli === null) return "unavailable";
  if (availableMilli === 0) return "zero";
  const minimum = threshold?.safetyMinimumMilli ?? 0;
  if (availableMilli <= minimum) return "insufficient";
  if (
    threshold?.maximumMilli !== null &&
    threshold?.maximumMilli !== undefined &&
    availableMilli > threshold.maximumMilli
  )
    return "overstock";
  return "normal";
}

export function calculateBatchStatus(
  batch: { expiresOn: string | null },
  clock: string,
): BatchStatus {
  if (!batch.expiresOn) return "normal";
  const today = Date.parse(`${datePart(clock)}T00:00:00Z`);
  const expiry = Date.parse(`${batch.expiresOn}T00:00:00Z`);
  if (today > expiry) return "expired";
  return Math.round((expiry - today) / 86_400_000) <= 30
    ? "near-expiry"
    : "normal";
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function addMonths(month: string, months: number): string {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 7);
}
function warehouseById(state: InventoryFeatureState, id: string): Warehouse {
  const value = state.warehouses.find((item) => item.id === id);
  if (!value) throw new InventoryDomainError("NOT_FOUND", "仓库不存在");
  return value;
}
function locationById(
  state: InventoryFeatureState,
  id: string,
): InventoryLocation {
  const value = state.locations.find((item) => item.id === id);
  if (!value) throw new InventoryDomainError("NOT_FOUND", "库位不存在");
  return value;
}

export function createInventoryService(deps: InventoryServiceDependencies) {
  function catalogRows(): {
    items: ReturnType<InventoryCatalogProvider["listSkus"]>;
    available: boolean;
  } {
    try {
      return { items: deps.catalog.listSkus(), available: true };
    } catch {
      return { items: [], available: false };
    }
  }

  function catalogCategories(): {
    items: InventoryCategorySnapshot[];
    available: boolean;
  } {
    try {
      return { items: deps.catalog.listCategories?.() ?? [], available: true };
    } catch {
      return { items: [], available: false };
    }
  }

  function categoryScope(
    categoryId: string,
    categories: ReturnType<typeof catalogCategories>["items"],
  ): Set<string> {
    const result = new Set([categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories)
        if (
          category.parentId &&
          result.has(category.parentId) &&
          !result.has(category.id)
        ) {
          result.add(category.id);
          changed = true;
        }
    }
    return result;
  }

  function listStocks(
    actor: InventoryActor,
    query: InventoryQuery = {},
  ): PageResult<InventoryStockRow> {
    assertRead(actor);
    const state = deps.repository.read();
    const catalog = catalogRows();
    const categories = catalogCategories();
    const skuMap = new Map(catalog.items.map((item) => [item.skuId, item]));
    const selectedCategories = query.categoryId
      ? categoryScope(query.categoryId, categories.items)
      : null;
    const keys = new Set<string>();
    state.balances.forEach((item) =>
      keys.add(`${item.warehouseId}|${item.skuId}`),
    );
    state.thresholds.forEach((item) =>
      keys.add(`${item.warehouseId}|${item.skuId}`),
    );
    state.openingBalances
      .filter((item) => item.month === monthPart(deps.now()))
      .forEach((item) => keys.add(`${item.warehouseId}|${item.skuId}`));
    const keyword = normalize(query.keyword ?? "");
    let rows = [...keys]
      .map((key): InventoryStockRow => {
        const [warehouseId, skuId] = key.split("|");
        const warehouse = warehouseById(state, warehouseId);
        const sku = skuMap.get(skuId) ?? null;
        const currentMilli = state.balances
          .filter(
            (item) => item.warehouseId === warehouseId && item.skuId === skuId,
          )
          .reduce((sum, item) => sum + item.quantityMilli, 0);
        const openingMilli =
          state.openingBalances.find(
            (item) =>
              item.month === monthPart(deps.now()) &&
              item.warehouseId === warehouseId &&
              item.skuId === skuId,
          )?.quantityMilli ?? 0;
        const threshold = state.thresholds.find(
          (item) => item.warehouseId === warehouseId && item.skuId === skuId,
        ) ?? { warehouseId, skuId, safetyMinimumMilli: 0, maximumMilli: null };
        const costPerBaseUnitCents = averageCost(state, warehouseId, skuId);
        return {
          warehouse: cloneWarehouseFor(actor, warehouse),
          sku,
          skuId,
          openingMilli,
          currentMilli,
          pendingOutboundMilli: null,
          availableMilli: null,
          inTransitMilli: null,
          safetyMinimumMilli: threshold.safetyMinimumMilli,
          maximumMilli: threshold.maximumMilli,
          status: calculateInventoryStatus(null, threshold),
          costPerBaseUnitCents:
            actor.role === "sales-supervisor" ? null : costPerBaseUnitCents,
          amountCents:
            actor.role === "sales-supervisor" || costPerBaseUnitCents === null
              ? null
              : amount(currentMilli, costPerBaseUnitCents),
        };
      })
      .filter(
        (row) => !row.sku?.deleted,
      )
      .filter(
        (row) => !query.warehouseId || row.warehouse.id === query.warehouseId,
      )
      .filter(
        (row) =>
          !selectedCategories ||
          Boolean(
            row.sku?.categoryId && selectedCategories.has(row.sku.categoryId),
          ),
      )
      .filter((row) => !query.status || row.status === query.status)
      .filter(
        (row) =>
          !keyword ||
          [
            row.warehouse.code,
            row.warehouse.name,
            row.skuId,
            row.sku?.skuCode,
            row.sku?.productName,
            row.sku?.barcode,
          ].some((value) => value && normalize(value).includes(keyword)),
      );
    rows = rows.sort(
      (a, b) =>
        a.warehouse.code.localeCompare(b.warehouse.code) ||
        (a.sku?.skuCode ?? a.skuId).localeCompare(b.sku?.skuCode ?? b.skuId),
    );
    const page = Math.max(1, query.page ?? 1);
    const pageSize = 30;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  function listBatches(actor: InventoryActor): InventoryBatchRow[] {
    assertRead(actor);
    const state = deps.repository.read();
    const catalog = catalogRows();
    const skuMap = new Map(catalog.items.map((item) => [item.skuId, item]));
    return state.balances
      .filter((item) => item.quantityMilli > 0)
      // 已淘汰商品的库存历史仍保留在账上，但不再出现在当前业务列表。
      .filter((item) => !skuMap.get(item.skuId)?.deleted)
      .map((balance) => {
        const batch = state.batches.find(
          (item) => item.id === balance.batchId,
        )!;
        const warehouse = warehouseById(state, balance.warehouseId);
        const location = locationById(state, balance.locationId);
        let sku = null;
        try {
          sku = deps.catalog.getSku(balance.skuId);
        } catch {
          sku = null;
        }
        return {
          warehouse: cloneWarehouseFor(actor, warehouse),
          location,
          batch,
          sku,
          quantityMilli: balance.quantityMilli,
          amountCents:
            actor.role === "sales-supervisor"
              ? 0
              : amount(balance.quantityMilli, batch.costPerBaseUnitCents),
          status: calculateBatchStatus(batch, deps.now()),
        };
      })
      .sort(
        (a, b) =>
          b.batch.receivedAt.localeCompare(a.batch.receivedAt) ||
          a.batch.id.localeCompare(b.batch.id),
      );
  }

  function listMovements(
    actor: InventoryActor,
    batchOnly = false,
  ): InventoryMovementRow[] {
    assertRead(actor);
    const state = deps.repository.read();
    const catalog = catalogRows();
    const skuMap = new Map(catalog.items.map((item) => [item.skuId, item]));
    return state.movements
      // 与库存列表保持一致，已淘汰 SKU 的流水只作为历史数据保留。
      .filter((movement) => !skuMap.get(movement.skuId)?.deleted)
      .map((movement) => {
        const batch = state.batches.find(
          (item) => item.id === movement.batchId,
        )!;
        let sku = null;
        try {
          sku = deps.catalog.getSku(movement.skuId);
        } catch {
          sku = null;
        }
        const cost =
          actor.role === "sales-supervisor" ? 0 : movement.costPerBaseUnitCents;
        return {
          ...movement,
          costPerBaseUnitCents: cost,
          warehouseName: warehouseById(state, movement.warehouseId).name,
          locationName: locationById(state, movement.locationId).name,
          batchNumber: batch.batchNumber,
          productionDate: batch.productionDate,
          expiresOn: batch.expiresOn,
          sku,
          amountCents: amount(movement.quantityMilli, cost),
        };
      })
      .filter(
        (item) =>
          !batchOnly ||
          state.batches.find((batch) => batch.id === item.batchId)?.tracked,
      )
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      );
  }

  function getWorkspace(
    actor: InventoryActor,
    query: InventoryQuery = {},
  ): InventoryWorkspace {
    const state = deps.repository.read();
    const catalog = catalogRows();
    const categories = catalogCategories();
    return {
      stocks: listStocks(actor, query),
      batches: listBatches(actor),
      movements: listMovements(actor),
      warehouses: state.warehouses
        .map((item) => cloneWarehouseFor(actor, item))
        .sort(
          (a, b) =>
            a.type.localeCompare(b.type) || a.code.localeCompare(b.code),
        ),
      locations: structuredClone(state.locations),
      categories: structuredClone(categories.items),
      catalogAvailable: catalog.available && categories.available,
    };
  }

  function saveThreshold(
    actor: InventoryActor,
    threshold: InventoryThreshold,
  ): InventoryThreshold {
    assertWrite(actor);
    if (
      !Number.isSafeInteger(threshold.safetyMinimumMilli) ||
      threshold.safetyMinimumMilli < 0 ||
      (threshold.maximumMilli !== null &&
        (!Number.isSafeInteger(threshold.maximumMilli) ||
          threshold.maximumMilli <= threshold.safetyMinimumMilli))
    )
      throw new InventoryValidationError([
        { path: "threshold", message: "下限必须非负，上限必须为空或大于下限" },
      ]);
    return deps.repository.transact((state) => {
      warehouseById(state, threshold.warehouseId);
      if (!deps.catalog.getSku(threshold.skuId))
        throw new InventoryDomainError("PRODUCT_UNAVAILABLE", "SKU 不存在");
      const index = state.thresholds.findIndex(
        (item) =>
          item.warehouseId === threshold.warehouseId &&
          item.skuId === threshold.skuId,
      );
      if (index >= 0) state.thresholds[index] = structuredClone(threshold);
      else state.thresholds.push(structuredClone(threshold));
      state.changeLogs.push({
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        action: "threshold.saved",
        targetId: `${threshold.warehouseId}:${threshold.skuId}`,
        operatorId: actor.actorId,
        detail: "保存库存阈值",
        createdAt: deps.now(),
      });
      return threshold;
    });
  }

  function saveWarehouse(
    actor: InventoryActor,
    draft: WarehouseDraft,
    id?: string,
  ): Warehouse {
    assertWrite(actor);
    assertWarehouseDraft(draft);
    const clean = {
      ...draft,
      code: draft.code.trim(),
      name: draft.name.trim(),
      contactName: draft.contactName?.trim() || null,
      phone: draft.phone?.trim() || null,
      address: draft.address?.trim() || null,
    };
    return deps.repository.transact((state) => {
      const duplicate = state.warehouses.find(
        (item) =>
          item.id !== id &&
          (normalize(item.code) === normalize(clean.code) ||
            normalize(item.name) === normalize(clean.name)),
      );
      if (duplicate)
        throw new InventoryDomainError("DUPLICATE", "仓库编码或名称已存在");
      const existing = id ? warehouseById(state, id) : null;
      if (
        existing &&
        existing.status === "enabled" &&
        clean.status === "disabled"
      ) {
        const nonzero = state.balances.some(
          (item) => item.warehouseId === id && item.quantityMilli > 0,
        );
        const enabledLocation = state.locations.some(
          (item) => item.warehouseId === id && item.status === "enabled",
        );
        if (nonzero || enabledLocation)
          throw new InventoryDomainError(
            "INVALID_STATE",
            "存在非零库存或启用库位，不能禁用仓库",
          );
      }
      const value: Warehouse = existing
        ? { ...existing, ...clean, updatedAt: deps.now() }
        : {
            ...clean,
            id: deps.nextId("warehouse"),
            enterpriseId: state.enterpriseId,
            createdAt: deps.now(),
            updatedAt: deps.now(),
          };
      if (existing)
        state.warehouses[state.warehouses.findIndex((item) => item.id === id)] =
          value;
      else state.warehouses.push(value);
      state.changeLogs.push({
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        action: "warehouse.saved",
        targetId: value.id,
        operatorId: actor.actorId,
        detail: existing ? "编辑仓库" : "新增仓库",
        createdAt: deps.now(),
      });
      return value;
    });
  }

  function saveLocation(
    actor: InventoryActor,
    draft: LocationDraft,
    id?: string,
  ): InventoryLocation {
    assertWrite(actor);
    assertLocationDraft(draft);
    const clean = {
      ...draft,
      code: draft.code.trim(),
      name: draft.name.trim(),
      note: draft.note?.trim() || null,
    };
    return deps.repository.transact((state) => {
      const warehouse = warehouseById(state, clean.warehouseId);
      if (warehouse.status !== "enabled")
        throw new InventoryDomainError(
          "INVALID_STATE",
          "只能在启用仓库保存库位",
        );
      const duplicate = state.locations.find(
        (item) =>
          item.id !== id &&
          item.warehouseId === clean.warehouseId &&
          (normalize(item.code) === normalize(clean.code) ||
            normalize(item.name) === normalize(clean.name)),
      );
      if (duplicate)
        throw new InventoryDomainError("DUPLICATE", "仓内库位编码或名称已存在");
      const existing = id ? locationById(state, id) : null;
      const nonzero = id
        ? state.balances.some(
            (item) => item.locationId === id && item.quantityMilli > 0,
          )
        : false;
      if (
        existing &&
        nonzero &&
        (existing.warehouseId !== clean.warehouseId ||
          clean.status === "disabled")
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "库位有非零库存，不能换仓或禁用",
        );
      const value: InventoryLocation = existing
        ? { ...existing, ...clean, updatedAt: deps.now() }
        : {
            ...clean,
            id: deps.nextId("location"),
            enterpriseId: state.enterpriseId,
            createdAt: deps.now(),
            updatedAt: deps.now(),
          };
      if (existing)
        state.locations[state.locations.findIndex((item) => item.id === id)] =
          value;
      else state.locations.push(value);
      state.changeLogs.push({
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        action: "location.saved",
        targetId: value.id,
        operatorId: actor.actorId,
        detail: existing ? "编辑库位" : "新增库位",
        createdAt: deps.now(),
      });
      return value;
    });
  }

  function previewLocationImport(
    actor: InventoryActor,
    rows: LocationImportRow[],
  ): LocationImportPreview {
    assertWrite(actor);
    const state = deps.repository.read();
    const errors: string[] = [];
    const seen = new Set<string>();
    const cleaned = rows.map((row) => ({
      ...row,
      warehouseCode: row.warehouseCode.trim(),
      locationCode: row.locationCode.trim(),
      locationName: row.locationName.trim(),
      note: row.note?.trim() || null,
    }));
    cleaned.forEach((row, index) => {
      const line = index + 2;
      const warehouse = state.warehouses.find(
        (item) => normalize(item.code) === normalize(row.warehouseCode),
      );
      if (!warehouse || warehouse.status !== "enabled")
        errors.push(`第 ${line} 行：仓库不存在或已禁用`);
      const issues = [
        { value: row.locationCode, name: "locationCode" },
        { value: row.locationName, name: "locationName" },
      ].filter((item) => !item.value || item.value.length > 40);
      issues.forEach((item) =>
        errors.push(`第 ${line} 行：${item.name} 必填且不超过40字`),
      );
      if (!["enabled", "disabled"].includes(row.status))
        errors.push(`第 ${line} 行：status 只能是 enabled/disabled`);
      if ((row.note?.length ?? 0) > 500)
        errors.push(`第 ${line} 行：note 不能超过500字`);
      if (warehouse) {
        const keys = [
          `${warehouse.id}|code|${normalize(row.locationCode)}`,
          `${warehouse.id}|name|${normalize(row.locationName)}`,
        ];
        keys.forEach((key) => {
          if (
            seen.has(key) ||
            state.locations.some(
              (item) =>
                `${item.warehouseId}|code|${normalize(item.code)}` === key ||
                `${item.warehouseId}|name|${normalize(item.name)}` === key,
            )
          )
            errors.push(`第 ${line} 行：仓内库位编码或名称重复`);
          seen.add(key);
        });
      }
    });
    return { rows: cleaned, errors };
  }

  function importLocations(
    actor: InventoryActor,
    rows: LocationImportRow[],
  ): InventoryLocation[] {
    const preview = previewLocationImport(actor, rows);
    if (preview.errors.length)
      throw new InventoryValidationError(
        preview.errors.map((message) => ({ path: "csv", message })),
      );
    return deps.repository.transact((state) => {
      const result = preview.rows.map((row) => {
        const warehouse = state.warehouses.find(
          (item) => normalize(item.code) === normalize(row.warehouseCode),
        )!;
        const value: InventoryLocation = {
          id: deps.nextId("location"),
          enterpriseId: state.enterpriseId,
          warehouseId: warehouse.id,
          code: row.locationCode,
          name: row.locationName,
          status: row.status,
          note: row.note,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        };
        state.locations.push(value);
        return value;
      });
      state.changeLogs.push({
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        action: "location.imported",
        targetId: result.map((item) => item.id).join(","),
        operatorId: actor.actorId,
        detail: `导入 ${result.length} 个库位`,
        createdAt: deps.now(),
      });
      return result;
    });
  }

  function eligibleBalances(
    state: InventoryFeatureState,
    warehouseId: string,
    skuId: string,
  ) {
    return state.balances
      .filter(
        (item) =>
          item.warehouseId === warehouseId &&
          item.skuId === skuId &&
          item.quantityMilli > 0,
      )
      .map((balance) => ({
        balance,
        batch: state.batches.find((item) => item.id === balance.batchId)!,
      }))
      .filter(
        (item) => calculateBatchStatus(item.batch, deps.now()) !== "expired",
      )
      .sort(
        (a, b) =>
          (a.batch.productionDate === null
            ? 1
            : b.batch.productionDate === null
              ? -1
              : a.batch.productionDate.localeCompare(b.batch.productionDate)) ||
          a.batch.receivedAt.localeCompare(b.batch.receivedAt) ||
          a.batch.batchNumber.localeCompare(b.batch.batchNumber) ||
          a.balance.id.localeCompare(b.balance.id),
      );
  }

  function previewOutbound(
    actor: InventoryActor,
    input: Pick<
      ConfirmOutboundInput,
      "warehouseId" | "skuId" | "quantityMilli"
    >,
  ): FifoAllocation[] {
    assertWrite(actor);
    positiveMilli(input.quantityMilli);
    const state = deps.repository.read();
    const warehouse = warehouseById(state, input.warehouseId);
    if (warehouse.status !== "enabled")
      throw new InventoryDomainError("INVALID_STATE", "仓库已禁用");
    if (!deps.catalog.getSku(input.skuId))
      throw new InventoryDomainError("PRODUCT_UNAVAILABLE", "SKU 不存在");
    let remaining = input.quantityMilli;
    const result: FifoAllocation[] = [];
    for (const item of eligibleBalances(
      state,
      input.warehouseId,
      input.skuId,
    )) {
      const quantityMilli = Math.min(remaining, item.balance.quantityMilli);
      result.push({
        balanceId: item.balance.id,
        batchId: item.batch.id,
        batchNumber: item.batch.batchNumber,
        locationId: item.balance.locationId,
        quantityMilli,
      });
      remaining -= quantityMilli;
      if (remaining === 0) break;
    }
    if (remaining > 0)
      throw new InventoryDomainError(
        "INSUFFICIENT_STOCK",
        "可出库的非过期库存不足",
      );
    return result;
  }

  function allocateBatch(
    state: InventoryFeatureState,
    input: Pick<ConfirmOutboundBatchInput, "warehouseId" | "lines">,
  ): ReferencedFifoAllocation[] {
    const warehouse = warehouseById(state, input.warehouseId);
    if (warehouse.status !== "enabled" || warehouse.saleProhibited)
      throw new InventoryDomainError(
        "INVALID_STATE",
        "仓库已禁用或禁止销售出库",
      );
    if (
      !input.lines.length ||
      new Set(input.lines.map((line) => line.referenceId)).size !==
        input.lines.length
    )
      throw new InventoryValidationError([
        { path: "lines", message: "出库行必须非空且引用唯一" },
      ]);
    const used = new Map<string, number>();
    const result: ReferencedFifoAllocation[] = [];
    for (const line of input.lines) {
      positiveMilli(line.quantityMilli);
      if (!deps.catalog.getSku(line.skuId))
        throw new InventoryDomainError("PRODUCT_UNAVAILABLE", "SKU 不存在");
      let remaining = line.quantityMilli;
      for (const item of eligibleBalances(
        state,
        input.warehouseId,
        line.skuId,
      )) {
        const available =
          item.balance.quantityMilli - (used.get(item.balance.id) ?? 0);
        if (available <= 0) continue;
        const quantityMilli = Math.min(remaining, available);
        result.push({
          referenceId: line.referenceId,
          skuId: line.skuId,
          balanceId: item.balance.id,
          batchId: item.batch.id,
          batchNumber: item.batch.batchNumber,
          locationId: item.balance.locationId,
          quantityMilli,
        });
        used.set(
          item.balance.id,
          (used.get(item.balance.id) ?? 0) + quantityMilli,
        );
        remaining -= quantityMilli;
        if (remaining === 0) break;
      }
      if (remaining > 0)
        throw new InventoryDomainError(
          "INSUFFICIENT_STOCK",
          `行 ${line.referenceId} 可出库的非过期库存不足`,
        );
    }
    return result;
  }

  function previewOutboundBatch(
    actor: InventoryActor,
    input: Pick<ConfirmOutboundBatchInput, "warehouseId" | "lines">,
  ): ReferencedFifoAllocation[] {
    assertWrite(actor);
    return allocateBatch(deps.repository.read(), input);
  }

  function confirmOutboundBatch(
    actor: InventoryActor,
    input: ConfirmOutboundBatchInput,
  ): ReferencedFifoAllocation[] {
    assertWrite(actor);
    if (!deps.catalog.sourceExists(input.sourceType, input.sourceId))
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "业务来源不存在");
    const unlockedState = deps.repository.read();
    for (const line of input.lines)
      assertDocumentUnlocked(
        unlockedState,
        input.occurredAt,
        input.warehouseId,
        line.skuId,
      );
    const existing = deps.repository
      .read()
      .movements.filter((item) => item.requestId === input.requestId);
    if (existing.length)
      throw new InventoryDomainError(
        "INVALID_STATE",
        "批量出库请求已执行，应由上游幂等记录返回原结果",
      );
    return deps.repository.transact((state) => {
      const allocations = allocateBatch(state, input);
      return allocations.map((part) => {
        const balance = state.balances.find(
          (item) => item.id === part.balanceId,
        )!;
        const batch = state.batches.find((item) => item.id === part.batchId)!;
        balance.quantityMilli -= part.quantityMilli;
        balance.updatedAt = input.occurredAt;
        const movementId = deps.nextId("movement");
        state.movements.push({
          id: movementId,
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "outbound",
          warehouseId: input.warehouseId,
          locationId: part.locationId,
          skuId: part.skuId,
          batchId: part.batchId,
          quantityMilli: part.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: batch.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
        return { ...part, movementId };
      });
    });
  }

  function reverseOutbound(
    actor: InventoryActor,
    input: ReverseOutboundInput,
  ): InventoryMovementRow[] {
    assertWrite(actor);
    if (!deps.catalog.sourceExists(input.sourceType, input.sourceId))
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "业务来源不存在");
    if (!input.allocations.length)
      throw new InventoryValidationError([
        { path: "allocations", message: "冲销分配不能为空" },
      ]);
    assertDocumentUnlocked(deps.repository.read(), input.occurredAt);
    const replay = deps.repository
      .read()
      .movements.filter((item) => item.requestId === input.requestId);
    if (replay.length)
      return listMovements(actor).filter(
        (item) => item.requestId === input.requestId,
      );
    deps.repository.transact((state) => {
      const seen = new Set<string>();
      for (const part of input.allocations) {
        positiveMilli(part.quantityMilli);
        if (seen.has(part.movementId))
          throw new InventoryValidationError([
            { path: "allocations", message: "原流水不能重复冲销" },
          ]);
        seen.add(part.movementId);
        const original = state.movements.find(
          (item) =>
            item.id === part.movementId && item.direction === "outbound",
        );
        if (
          !original ||
          original.warehouseId !== input.warehouseId ||
          original.locationId !== part.locationId ||
          original.batchId !== part.batchId ||
          original.skuId !== part.skuId ||
          original.quantityMilli !== part.quantityMilli
        )
          throw new InventoryDomainError(
            "INVALID_STATE",
            "原出库流水与冲销分配不一致",
          );
        const balance = state.balances.find(
          (item) =>
            item.id === part.balanceId &&
            item.warehouseId === input.warehouseId &&
            item.locationId === part.locationId &&
            item.batchId === part.batchId &&
            item.skuId === part.skuId,
        );
        if (!balance)
          throw new InventoryDomainError(
            "INVALID_STATE",
            "原库存余额不存在，不能精确冲销",
          );
        const batch = state.batches.find((item) => item.id === part.batchId)!;
        balance.quantityMilli += part.quantityMilli;
        balance.updatedAt = input.occurredAt;
        state.movements.push({
          id: deps.nextId("movement"),
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "inbound",
          warehouseId: input.warehouseId,
          locationId: part.locationId,
          skuId: part.skuId,
          batchId: part.batchId,
          quantityMilli: part.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: batch.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
      }
    });
    return listMovements(actor).filter(
      (item) => item.requestId === input.requestId,
    );
  }

  function confirmOutbound(
    actor: InventoryActor,
    input: ConfirmOutboundInput,
  ): InventoryMovementRow[] {
    assertWrite(actor);
    if (!deps.catalog.sourceExists(input.sourceType, input.sourceId))
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "业务来源不存在");
    assertDocumentUnlocked(
      deps.repository.read(),
      input.occurredAt,
      input.warehouseId,
      input.skuId,
    );
    const existing = deps.repository
      .read()
      .movements.filter((item) => item.requestId === input.requestId);
    if (existing.length)
      return listMovements(actor).filter(
        (item) => item.requestId === input.requestId,
      );
    const allocation = previewOutbound(actor, input);
    deps.repository.transact((state) => {
      for (const part of allocation) {
        const balance = state.balances.find(
          (item) => item.id === part.balanceId,
        )!;
        const batch = state.batches.find((item) => item.id === part.batchId)!;
        balance.quantityMilli -= part.quantityMilli;
        balance.updatedAt = input.occurredAt;
        state.movements.push({
          id: deps.nextId("movement"),
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "outbound",
          warehouseId: input.warehouseId,
          locationId: part.locationId,
          skuId: input.skuId,
          batchId: part.batchId,
          quantityMilli: part.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: batch.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
      }
    });
    return listMovements(actor).filter(
      (item) => item.requestId === input.requestId,
    );
  }

  function confirmInbound(
    actor: InventoryActor,
    input: ConfirmInboundInput,
  ): InventoryMovementRow[] {
    assertWrite(actor);
    positiveMilli(input.quantityMilli);
    if (
      !Number.isSafeInteger(input.costPerBaseUnitCents) ||
      input.costPerBaseUnitCents < 0
    )
      throw new InventoryValidationError([
        { path: "costPerBaseUnitCents", message: "必须是非负整数分" },
      ]);
    if (!deps.catalog.sourceExists(input.sourceType, input.sourceId))
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "业务来源不存在");
    const existing = deps.repository
      .read()
      .movements.filter((item) => item.requestId === input.requestId);
    if (existing.length)
      return listMovements(actor).filter(
        (item) => item.requestId === input.requestId,
      );
    const sku = deps.catalog.getSku(input.skuId);
    if (!sku)
      throw new InventoryDomainError("PRODUCT_UNAVAILABLE", "SKU 不存在");
    const tracked = sku.manageProductionDate || sku.shelfLifeDays !== null;
    if (tracked && (!input.batchNumber?.trim() || !input.productionDate))
      throw new InventoryValidationError([
        { path: "batch", message: "该商品必须填写批次号和生产日期" },
      ]);
    return (
      deps.repository.transact((state) => {
        assertDocumentUnlocked(
          state,
          input.occurredAt,
          input.warehouseId,
          input.skuId,
        );
        const warehouse = warehouseById(state, input.warehouseId);
        const location = locationById(state, input.locationId);
        if (
          warehouse.status !== "enabled" ||
          location.status !== "enabled" ||
          location.warehouseId !== warehouse.id
        )
          throw new InventoryDomainError(
            "INVALID_STATE",
            "仓库或库位不可用于入库",
          );
        const batchNumber = tracked
          ? input.batchNumber!.trim()
          : input.batchNumber?.trim() || `SYSTEM-NONTRACKED-${input.skuId}`;
        const expiresOn =
          tracked && sku.shelfLifeDays !== null
            ? (input.expiresOn ??
              addDays(input.productionDate!, sku.shelfLifeDays))
            : (input.expiresOn ?? null);
        if (
          input.productionDate &&
          input.productionDate > datePart(input.occurredAt)
        )
          throw new InventoryValidationError([
            { path: "productionDate", message: "不能晚于入库日期" },
          ]);
        if (
          input.productionDate &&
          expiresOn &&
          expiresOn < input.productionDate
        )
          throw new InventoryValidationError([
            { path: "expiresOn", message: "不能早于生产日期" },
          ]);
        let batch = state.batches.find(
          (item) =>
            item.skuId === input.skuId &&
            normalize(item.batchNumber) === normalize(batchNumber),
        );
        if (
          batch &&
          (batch.productionDate !== (input.productionDate ?? null) ||
            batch.expiresOn !== expiresOn)
        )
          throw new InventoryDomainError(
            "DUPLICATE",
            "同一 SKU 批次号已有不同日期资料",
          );
        if (!batch) {
          batch = {
            id: deps.nextId("batch"),
            enterpriseId: state.enterpriseId,
            skuId: input.skuId,
            batchNumber,
            tracked,
            productionDate: input.productionDate ?? null,
            expiresOn,
            receivedAt: input.occurredAt,
            costPerBaseUnitCents: input.costPerBaseUnitCents,
          };
          state.batches.push(batch);
        }
        let balance = state.balances.find(
          (item) =>
            item.warehouseId === input.warehouseId &&
            item.locationId === input.locationId &&
            item.skuId === input.skuId &&
            item.batchId === batch!.id,
        );
        if (!balance) {
          balance = {
            id: deps.nextId("balance"),
            enterpriseId: state.enterpriseId,
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            skuId: input.skuId,
            batchId: batch.id,
            quantityMilli: 0,
            updatedAt: input.occurredAt,
          };
          state.balances.push(balance);
        }
        applyInboundAverageCost(
          state,
          input.warehouseId,
          input.skuId,
          input.quantityMilli,
          input.costPerBaseUnitCents,
          input.occurredAt,
        );
        balance.quantityMilli += input.quantityMilli;
        balance.updatedAt = input.occurredAt;
        state.movements.push({
          id: deps.nextId("movement"),
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "inbound",
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          skuId: input.skuId,
          batchId: batch.id,
          quantityMilli: input.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: input.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
        return [] as InventoryMovementRow[];
      }),
      listMovements(actor).filter((item) => item.requestId === input.requestId)
    );
  }

  function confirmReturnInbound(
    actor: InventoryActor,
    input: ConfirmReturnInboundInput,
  ): InventoryMovementRow[] {
    assertWrite(actor);
    if (
      input.sourceType !== "customer-return" ||
      !deps.catalog.sourceExists(input.sourceType, input.sourceId)
    )
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "客户退单来源不存在");
    if (
      !input.lines.length ||
      new Set(input.lines.map((item) => item.referenceId)).size !==
        input.lines.length
    )
      throw new InventoryValidationError([
        { path: "lines", message: "退货入库行必须非空且引用唯一" },
      ]);
    const replay = deps.repository
      .read()
      .movements.filter((item) => item.requestId === input.requestId);
    if (replay.length)
      return listMovements(actor).filter(
        (item) => item.requestId === input.requestId,
      );
    deps.repository.transact((state) => {
      for (const line of input.lines)
        assertDocumentUnlocked(
          state,
          input.occurredAt,
          input.warehouseId,
          line.skuId,
        );
      const warehouse = warehouseById(state, input.warehouseId);
      const location = locationById(state, input.locationId);
      if (
        warehouse.status !== "enabled" ||
        location.status !== "enabled" ||
        location.warehouseId !== warehouse.id
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "仓库或库位不可用于退货入库",
        );
      for (const line of input.lines) {
        positiveMilli(line.quantityMilli);
        if (
          !Number.isSafeInteger(line.costPerBaseUnitCents) ||
          line.costPerBaseUnitCents < 0
        )
          throw new InventoryValidationError([
            {
              path: "costPerBaseUnitCents",
              message: "原出库成本必须是非负整数分",
            },
          ]);
        const sku = deps.catalog.getSku(line.skuId);
        if (!sku)
          throw new InventoryDomainError("PRODUCT_UNAVAILABLE", "SKU 不存在");
        const tracked = sku.manageProductionDate || sku.shelfLifeDays !== null;
        if (tracked && (!line.batchNumber.trim() || !line.productionDate))
          throw new InventoryValidationError([
            { path: "batch", message: "追踪商品必须沿用原出库批次和生产日期" },
          ]);
        const batchNumber = tracked
          ? line.batchNumber.trim()
          : `SYSTEM-NONTRACKED-${line.skuId}`;
        const expiresOn = line.expiresOn;
        let batch = state.batches.find(
          (item) =>
            item.skuId === line.skuId &&
            normalize(item.batchNumber) === normalize(batchNumber),
        );
        if (
          batch &&
          (batch.productionDate !== line.productionDate ||
            batch.expiresOn !== expiresOn ||
            batch.costPerBaseUnitCents !== line.costPerBaseUnitCents)
        )
          throw new InventoryDomainError(
            "DUPLICATE",
            "原批次日期或成本快照不一致",
          );
        if (!batch) {
          batch = {
            id: deps.nextId("batch"),
            enterpriseId: state.enterpriseId,
            skuId: line.skuId,
            batchNumber,
            tracked,
            productionDate: line.productionDate,
            expiresOn,
            receivedAt: input.occurredAt,
            costPerBaseUnitCents: line.costPerBaseUnitCents,
          };
          state.batches.push(batch);
        }
        let balance = state.balances.find(
          (item) =>
            item.warehouseId === input.warehouseId &&
            item.locationId === input.locationId &&
            item.skuId === line.skuId &&
            item.batchId === batch!.id,
        );
        if (!balance) {
          balance = {
            id: deps.nextId("balance"),
            enterpriseId: state.enterpriseId,
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            skuId: line.skuId,
            batchId: batch.id,
            quantityMilli: 0,
            updatedAt: input.occurredAt,
          };
          state.balances.push(balance);
        }
        applyInboundAverageCost(
          state,
          input.warehouseId,
          line.skuId,
          line.quantityMilli,
          line.costPerBaseUnitCents,
          input.occurredAt,
        );
        balance.quantityMilli += line.quantityMilli;
        balance.updatedAt = input.occurredAt;
        state.movements.push({
          id: deps.nextId("movement"),
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "inbound",
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          skuId: line.skuId,
          batchId: batch.id,
          quantityMilli: line.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: line.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
      }
    });
    return listMovements(actor).filter(
      (item) => item.requestId === input.requestId,
    );
  }

  function reverseReturnInbound(
    actor: InventoryActor,
    input: ReverseReturnInboundInput,
  ): InventoryMovementRow[] {
    assertWrite(actor);
    if (
      input.sourceType !== "customer-return-void" ||
      !deps.catalog.sourceExists(input.sourceType, input.sourceId)
    )
      throw new InventoryDomainError("SOURCE_NOT_FOUND", "客户退单来源不存在");
    if (
      !input.movementIds.length ||
      new Set(input.movementIds).size !== input.movementIds.length
    )
      throw new InventoryValidationError([
        { path: "movementIds", message: "原入库流水必须非空且唯一" },
      ]);
    const snapshot = deps.repository.read();
    assertDocumentUnlocked(snapshot, input.occurredAt);
    const replay = snapshot.movements.filter(
      (item) => item.requestId === input.requestId,
    );
    if (replay.length)
      return listMovements(actor).filter(
        (item) => item.requestId === input.requestId,
      );
    if (
      snapshot.movements.some(
        (item) =>
          item.sourceType === "customer-return-void" &&
          item.sourceId === input.sourceId,
      )
    )
      throw new InventoryDomainError("INVALID_STATE", "退货入库已经作废");
    deps.repository.transact((state) => {
      for (const movementId of input.movementIds) {
        const original = state.movements.find(
          (item) =>
            item.id === movementId &&
            item.direction === "inbound" &&
            item.sourceType === "customer-return" &&
            item.sourceId === input.sourceId,
        );
        if (!original || original.warehouseId !== input.warehouseId)
          throw new InventoryDomainError(
            "INVALID_STATE",
            "原退货入库流水不一致",
          );
        const balance = state.balances.find(
          (item) =>
            item.warehouseId === original.warehouseId &&
            item.locationId === original.locationId &&
            item.skuId === original.skuId &&
            item.batchId === original.batchId,
        );
        if (!balance || balance.quantityMilli < original.quantityMilli)
          throw new InventoryDomainError(
            "INSUFFICIENT_STOCK",
            "当前批次库存不足，不能精确作废退货入库",
          );
        balance.quantityMilli -= original.quantityMilli;
        balance.updatedAt = input.occurredAt;
        state.movements.push({
          id: deps.nextId("movement"),
          enterpriseId: state.enterpriseId,
          requestId: input.requestId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: "outbound",
          warehouseId: original.warehouseId,
          locationId: original.locationId,
          skuId: original.skuId,
          batchId: original.batchId,
          quantityMilli: original.quantityMilli,
          balanceAfterMilli: balance.quantityMilli,
          costPerBaseUnitCents: original.costPerBaseUnitCents,
          operatorId: input.operatorId,
          occurredAt: input.occurredAt,
        });
      }
    });
    return listMovements(actor).filter(
      (item) => item.requestId === input.requestId,
    );
  }

  function assertDocumentWrite(actor: InventoryActor): void {
    assertWrite(actor);
  }
  function assertDocumentUnlocked(
    state: InventoryFeatureState,
    occurredAt: string,
    warehouseId?: string,
    skuId?: string,
  ): void {
    if (state.operationLocks?.inventoryLocked)
      throw new InventoryDomainError(
        "INVALID_STATE",
        "盘点锁定期间不能执行库存单据",
      );
    const closed = state.operationLocks?.monthClosedThrough;
    if (closed && monthPart(occurredAt) <= closed)
      throw new InventoryDomainError(
        "INVALID_STATE",
        "已结转月份不能执行库存单据",
      );
    if (
      warehouseId &&
      skuId &&
      (state.inventoryLocks ?? []).some(
        (lock) => lock.warehouseId === warehouseId && lock.skuId === skuId,
      )
    )
      throw new InventoryDomainError(
        "INVALID_STATE",
        "该仓库商品正在盘点锁定期间",
      );
  }
  function nextCode(state: InventoryFeatureState, prefix: string): string {
    const day = datePart(deps.now()).replaceAll("-", "").slice(2);
    const used =
      [
        ...(state.transfers ?? []),
        ...(state.otherOutbounds ?? []),
        ...(state.otherInbounds ?? []),
        ...(state.stocktakes ?? []),
        ...(state.costAdjustments ?? []),
      ].filter((item) => item.code.startsWith(prefix + day)).length + 1;
    return `${prefix}${day}-${String(used).padStart(5, "0")}`;
  }
  function docFilter<
    T extends {
      code: string;
      occurredAt: string;
      status: string;
      lines: Array<{ skuId: string }>;
    },
  >(items: T[], query: InventoryDocumentListQuery): T[] {
    const keyword = normalize(query.keyword ?? "");
    return items
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !query.fromDate || datePart(item.occurredAt) >= query.fromDate,
      )
      .filter(
        (item) => !query.toDate || datePart(item.occurredAt) <= query.toDate,
      )
      .filter(
        (item) =>
          !keyword ||
          item.code.toLocaleLowerCase().includes(keyword) ||
          item.lines.some((line) =>
            line.skuId.toLocaleLowerCase().includes(keyword),
          ),
      )
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          b.code.localeCompare(a.code),
      );
  }
  function pageDocs<T>(
    items: T[],
    query: InventoryDocumentListQuery,
  ): InventoryDocumentPage<T> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 30;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }
  function documentFor<
    T extends { lines: Array<{ costPerBaseUnitCents: number }> },
  >(actor: InventoryActor, value: T): T {
    const copy = structuredClone(value);
    if (actor.role === "sales-supervisor")
      copy.lines.forEach((line) => {
        line.costPerBaseUnitCents = 0;
      });
    return copy;
  }
  // The in-memory adapter has no nested transaction. Snapshot restore keeps a multi-line
  // document operation atomic when a later line fails during the prototype phase.
  function atomicDocument<T>(operation: () => T): T {
    const snapshot = deps.repository.read();
    try {
      return operation();
    } catch (error) {
      deps.repository.reset(snapshot);
      throw error;
    }
  }
  function createTransfer(
    actor: InventoryActor,
    draft: InventoryTransferDraft,
  ): InventoryTransfer {
    assertDocumentWrite(actor);
    if (draft.sourceWarehouseId === draft.targetWarehouseId)
      throw new InventoryDomainError(
        "INVALID_STATE",
        "源仓库和目标仓库不能相同",
      );
    if (!draft.lines.length)
      throw new InventoryValidationError([
        { path: "lines", message: "转仓明细不能为空" },
      ]);
    return deps.repository.transact((state) => {
      assertDocumentUnlocked(state, draft.occurredAt);
      warehouseById(state, draft.sourceWarehouseId);
      warehouseById(state, draft.targetWarehouseId);
      const value: InventoryTransfer = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        code: nextCode(state, "ZZ"),
        sourceWarehouseId: draft.sourceWarehouseId,
        targetWarehouseId: draft.targetWarehouseId,
        occurredAt: draft.occurredAt,
        status: "pending-review",
        lines: draft.lines.map((line, index) => ({
          id: `${index + 1}`,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
          costPerBaseUnitCents: line.costPerBaseUnitCents,
          note: line.note ?? null,
        })),
        note: draft.note?.trim() || null,
        version: 1,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        outboundRequestId: null,
        inboundRequestId: null,
        outboundMovementIds: [],
      };
      state.transfers ??= [];
      state.transfers.push(value);
      return value;
    });
  }
  function listTransfers(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): InventoryDocumentPage<InventoryTransfer> {
    assertRead(actor);
    const state = deps.repository.read();
    return pageDocs(
      docFilter(state.transfers ?? [], query).map((item) =>
        documentFor(actor, item),
      ),
      query,
    );
  }
  function approveTransfer(
    actor: InventoryActor,
    value: InventoryTransfer,
  ): InventoryTransfer {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      const current = (state.transfers ?? []).find(
        (item) => item.id === value.id,
      );
      if (
        current?.status === "approved" ||
        current?.status === "shipped" ||
        current?.status === "received"
      )
        return current;
      if (
        !current ||
        current.version !== value.version ||
        current.status !== "pending-review"
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "转仓单状态或版本不允许审核",
        );
      current.status = "approved";
      current.version++;
      current.updatedAt = deps.now();
      return current;
    });
  }
  function shipTransfer(
    actor: InventoryActor,
    value: InventoryTransfer,
    locationId: string,
  ): InventoryTransfer {
    assertDocumentWrite(actor);
    return atomicDocument(() => {
      const snapshot = deps.repository.read();
      const current = snapshot.transfers?.find((item) => item.id === value.id);
      if (current?.status === "shipped" || current?.status === "received")
        return current;
      if (
        !current ||
        current.status !== "approved" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "转仓单状态或版本不允许出库",
        );
      assertDocumentUnlocked(snapshot, current.occurredAt);
      if (locationId) {
        const location = locationById(snapshot, locationId);
        if (
          location.warehouseId !== current.sourceWarehouseId ||
          location.status !== "enabled"
        )
          throw new InventoryDomainError(
            "INVALID_STATE",
            "源仓库位不可用于转仓出库",
          );
      }
      const requestId = `transfer-out-${current.id}`;
      const movementIds = current.lines.flatMap((line) =>
        confirmOutbound(actor, {
          requestId: `${requestId}-${line.id}`,
          sourceType: "inventory-transfer-out",
          sourceId: current.id,
          operatorId: actor.actorId,
          occurredAt: current.occurredAt,
          warehouseId: current.sourceWarehouseId,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
        }).map((movement) => movement.id),
      );
      return deps.repository.transact((state) => {
        const item = state.transfers!.find((row) => row.id === current.id)!;
        item.status = "shipped";
        item.outboundRequestId = requestId;
        item.outboundMovementIds = movementIds;
        item.version++;
        item.updatedAt = deps.now();
        return item;
      });
    });
  }
  function receiveTransfer(
    actor: InventoryActor,
    value: InventoryTransfer,
    locationId: string,
  ): InventoryTransfer {
    assertDocumentWrite(actor);
    return atomicDocument(() => {
      const snapshot = deps.repository.read();
      const current = snapshot.transfers?.find((item) => item.id === value.id);
      if (current?.status === "received") return current;
      if (
        !current ||
        current.status !== "shipped" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "转仓单状态或版本不允许入库",
        );
      assertDocumentUnlocked(snapshot, current.occurredAt);
      const targetLocation = locationById(snapshot, locationId);
      if (
        targetLocation.warehouseId !== current.targetWarehouseId ||
        targetLocation.status !== "enabled"
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "目标库位不可用于转仓入库",
        );
      if (!current.outboundMovementIds.length)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "转仓单缺少源仓出库流水",
        );
      for (const movementId of current.outboundMovementIds) {
        const movement = snapshot.movements.find(
          (item) =>
            item.id === movementId &&
            item.direction === "outbound" &&
            item.sourceId === current.id,
        );
        if (!movement)
          throw new InventoryDomainError(
            "INVALID_STATE",
            "转仓源仓出库流水不存在",
          );
        const batch = snapshot.batches.find(
          (item) => item.id === movement.batchId,
        );
        if (!batch)
          throw new InventoryDomainError("INVALID_STATE", "转仓源批次不存在");
        confirmInbound(actor, {
          requestId: `transfer-in-${current.id}-${movement.id}`,
          sourceType: "inventory-transfer-in",
          sourceId: current.id,
          operatorId: actor.actorId,
          occurredAt: current.occurredAt,
          warehouseId: current.targetWarehouseId,
          locationId,
          skuId: movement.skuId,
          quantityMilli: movement.quantityMilli,
          costPerBaseUnitCents: movement.costPerBaseUnitCents,
          batchNumber: batch.batchNumber,
          productionDate: batch.productionDate,
          expiresOn: batch.expiresOn,
        });
      }
      return deps.repository.transact((state) => {
        const item = state.transfers!.find((row) => row.id === current.id)!;
        item.status = "received";
        item.inboundRequestId = `transfer-in-${current.id}`;
        item.version++;
        item.updatedAt = deps.now();
        return item;
      });
    });
  }
  function createOtherOutbound(
    actor: InventoryActor,
    draft: InventoryOtherOutboundDraft,
  ): InventoryOtherOutbound {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      assertDocumentUnlocked(state, draft.occurredAt);
      warehouseById(state, draft.warehouseId);
      if (!draft.lines.length)
        throw new InventoryValidationError([
          { path: "lines", message: "出库明细不能为空" },
        ]);
      if (draft.note !== undefined && !draft.note?.trim())
        throw new InventoryValidationError([
          { path: "note", message: "出库原因不能为空" },
        ]);
      const value: InventoryOtherOutbound = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        code: nextCode(state, "QTCK"),
        warehouseId: draft.warehouseId,
        type: draft.type,
        occurredAt: draft.occurredAt,
        status: "pending-review",
        lines: draft.lines.map((line, index) => ({
          id: `${index + 1}`,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
          costPerBaseUnitCents: line.costPerBaseUnitCents,
          note: line.note ?? null,
        })),
        note: draft.note?.trim() || null,
        version: 1,
        createdAt: deps.now(),
        updatedAt: deps.now(),
      };
      state.otherOutbounds ??= [];
      state.otherOutbounds.push(value);
      return value;
    });
  }
  function listOtherOutbounds(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): InventoryDocumentPage<InventoryOtherOutbound> {
    assertRead(actor);
    return pageDocs(
      docFilter(deps.repository.read().otherOutbounds ?? [], query).map(
        (item) => documentFor(actor, item),
      ),
      query,
    );
  }
  function approveOtherOutbound(
    actor: InventoryActor,
    value: InventoryOtherOutbound,
  ): InventoryOtherOutbound {
    assertDocumentWrite(actor);
    return atomicDocument(() => {
      const snapshot = deps.repository.read();
      const current = snapshot.otherOutbounds?.find(
        (item) => item.id === value.id,
      );
      if (
        !current ||
        current.status !== "pending-review" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "其他出库状态或版本不允许审核",
        );
      assertDocumentUnlocked(snapshot, current.occurredAt);
      for (const line of current.lines)
        confirmOutbound(actor, {
          requestId: `other-out-${current.id}-${line.id}`,
          sourceType: "inventory-other-outbound",
          sourceId: current.id,
          operatorId: actor.actorId,
          occurredAt: current.occurredAt,
          warehouseId: current.warehouseId,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
        });
      return deps.repository.transact((state) => {
        const item = state.otherOutbounds!.find(
          (row) => row.id === current.id,
        )!;
        item.status = "completed";
        item.version++;
        item.updatedAt = deps.now();
        return item;
      });
    });
  }
  function createOtherInbound(
    actor: InventoryActor,
    draft: InventoryOtherInboundDraft,
  ): InventoryOtherInbound {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      assertDocumentUnlocked(state, draft.occurredAt);
      warehouseById(state, draft.warehouseId);
      if (draft.type === "return")
        throw new InventoryDomainError(
          "INVALID_STATE",
          "客户退货必须通过 ORD-005 退货入库流程",
        );
      if (!draft.lines.length)
        throw new InventoryValidationError([
          { path: "lines", message: "入库明细不能为空" },
        ]);
      if (draft.note !== undefined && !draft.note?.trim())
        throw new InventoryValidationError([
          { path: "note", message: "入库原因不能为空" },
        ]);
      const value: InventoryOtherInbound = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        code: nextCode(state, "QTRK"),
        warehouseId: draft.warehouseId,
        type: draft.type,
        occurredAt: draft.occurredAt,
        relatedDocumentNo: draft.relatedDocumentNo?.trim() || null,
        supplierId: draft.supplierId ?? null,
        status: "pending-review",
        lines: draft.lines.map((line, index) => ({
          id: `${index + 1}`,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
          costPerBaseUnitCents: line.costPerBaseUnitCents,
          batchNumber: line.batchNumber?.trim() || null,
          productionDate: line.productionDate ?? null,
          expiresOn: line.expiresOn ?? null,
          note: line.note ?? null,
        })),
        note: draft.note?.trim() || null,
        version: 1,
        createdAt: deps.now(),
        updatedAt: deps.now(),
      };
      state.otherInbounds ??= [];
      state.otherInbounds.push(value);
      return value;
    });
  }
  function listOtherInbounds(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): InventoryDocumentPage<InventoryOtherInbound> {
    assertRead(actor);
    return pageDocs(
      docFilter(deps.repository.read().otherInbounds ?? [], query).map((item) =>
        documentFor(actor, item),
      ),
      query,
    );
  }
  function approveOtherInbound(
    actor: InventoryActor,
    value: InventoryOtherInbound,
    locationId: string,
  ): InventoryOtherInbound {
    assertDocumentWrite(actor);
    return atomicDocument(() => {
      const snapshot = deps.repository.read();
      const current = snapshot.otherInbounds?.find(
        (item) => item.id === value.id,
      );
      if (
        !current ||
        current.status !== "pending-review" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "其他入库状态或版本不允许审核",
        );
      assertDocumentUnlocked(snapshot, current.occurredAt);
      for (const line of current.lines) {
        const existing = snapshot.balances.find(
          (item) =>
            item.warehouseId === current.warehouseId &&
            item.skuId === line.skuId &&
            item.quantityMilli > 0,
        );
        const batch = existing
          ? snapshot.batches.find((item) => item.id === existing.batchId)
          : null;
        confirmInbound(actor, {
          requestId: `other-in-${current.id}-${line.id}`,
          sourceType: "inventory-other-inbound",
          sourceId: current.id,
          operatorId: actor.actorId,
          occurredAt: current.occurredAt,
          warehouseId: current.warehouseId,
          locationId,
          skuId: line.skuId,
          quantityMilli: line.quantityMilli,
          costPerBaseUnitCents: line.costPerBaseUnitCents,
          batchNumber: line.batchNumber ?? batch?.batchNumber,
          productionDate: line.productionDate ?? batch?.productionDate,
          expiresOn: line.expiresOn ?? batch?.expiresOn,
        });
      }
      return deps.repository.transact((state) => {
        const item = state.otherInbounds!.find((row) => row.id === current.id)!;
        item.status = "completed";
        item.version++;
        item.updatedAt = deps.now();
        return item;
      });
    });
  }

  function deleteTransfer(
    actor: InventoryActor,
    value: InventoryTransfer,
  ): void {
    assertDocumentWrite(actor);
    deps.repository.transact((state) => {
      const items = state.transfers ?? [];
      const index = items.findIndex(
        (item) =>
          item.id === value.id &&
          item.version === value.version &&
          item.status === "pending-review",
      );
      if (index < 0)
        throw new InventoryDomainError("INVALID_STATE", "仅待审核转仓单可删除");
      items.splice(index, 1);
    });
  }
  function deleteOtherOutbound(
    actor: InventoryActor,
    value: InventoryOtherOutbound,
  ): void {
    assertDocumentWrite(actor);
    deps.repository.transact((state) => {
      const items = state.otherOutbounds ?? [];
      const index = items.findIndex(
        (item) =>
          item.id === value.id &&
          item.version === value.version &&
          item.status === "pending-review",
      );
      if (index < 0)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "仅待审核其他出库单可删除",
        );
      items.splice(index, 1);
    });
  }
  function deleteOtherInbound(
    actor: InventoryActor,
    value: InventoryOtherInbound,
  ): void {
    assertDocumentWrite(actor);
    deps.repository.transact((state) => {
      const items = state.otherInbounds ?? [];
      const index = items.findIndex(
        (item) =>
          item.id === value.id &&
          item.version === value.version &&
          item.status === "pending-review",
      );
      if (index < 0)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "仅待审核其他入库单可删除",
        );
      items.splice(index, 1);
    });
  }

  function averageCost(
    state: InventoryFeatureState,
    warehouseId: string,
    skuId: string,
  ): number | null {
    const saved = state.averageCosts?.find(
      (item) => item.warehouseId === warehouseId && item.skuId === skuId,
    );
    if (saved) return saved.costPerBaseUnitCents;
    const rows = state.balances.filter(
      (item) =>
        item.warehouseId === warehouseId &&
        item.skuId === skuId &&
        item.quantityMilli > 0,
    );
    if (!rows.length) return null;
    const quantity = rows.reduce((sum, row) => sum + row.quantityMilli, 0);
    return Math.round(
      rows.reduce(
        (sum, row) =>
          sum +
          row.quantityMilli *
            (state.batches.find((batch) => batch.id === row.batchId)
              ?.costPerBaseUnitCents ?? 0),
        0,
      ) / quantity,
    );
  }
  function applyInboundAverageCost(
    state: InventoryFeatureState,
    warehouseId: string,
    skuId: string,
    quantityMilli: number,
    inboundCostCents: number,
    occurredAt: string,
  ): void {
    const previousQuantity = state.balances
      .filter(
        (item) =>
          item.warehouseId === warehouseId &&
          item.skuId === skuId &&
          item.quantityMilli > 0,
      )
      .reduce((sum, item) => sum + item.quantityMilli, 0);
    const previousCost = averageCost(state, warehouseId, skuId);
    const nextCost =
      previousQuantity > 0 && previousCost !== null
        ? Math.round(
            (previousQuantity * previousCost +
              quantityMilli * inboundCostCents) /
              (previousQuantity + quantityMilli),
          )
        : inboundCostCents;
    const averages = state.averageCosts ?? [];
    const index = averages.findIndex(
      (item) => item.warehouseId === warehouseId && item.skuId === skuId,
    );
    const value: InventoryAverageCost = {
      warehouseId,
      skuId,
      costPerBaseUnitCents: nextCost,
      version: (index >= 0 ? averages[index]!.version : 0) + 1,
      updatedAt: occurredAt,
    };
    if (index >= 0) averages[index] = value;
    else averages.push(value);
    state.averageCosts = averages;
  }
  function stocktakeCandidates(
    state: InventoryFeatureState,
    draft: InventoryStocktakeDraft,
  ): string[] {
    const ids = new Set(
      state.balances
        .filter((item) => item.warehouseId === draft.warehouseId)
        .map((item) => item.skuId),
    );
    if (draft.type === "full" || !draft.scopeKind || draft.scopeKind === "all")
      return [...ids];
    if (draft.scopeKind === "skus")
      return (draft.scopeSkuIds ?? []).filter((id) => ids.has(id));
    const catalog = deps.catalog.listSkus();
    return catalog
      .filter(
        (sku) =>
          ids.has(sku.skuId) &&
          (draft.scopeKind === "category"
            ? sku.categoryId === draft.scopeValue
            : sku.brandId === draft.scopeValue),
      )
      .map((sku) => sku.skuId);
  }
  function createStocktake(
    actor: InventoryActor,
    draft: InventoryStocktakeDraft,
  ): InventoryStocktake {
    assertDocumentWrite(actor);
    if (!draft.warehouseId || !draft.operatorId)
      throw new InventoryValidationError([
        { path: "stocktake", message: "仓库和盘点人不能为空" },
      ]);
    return deps.repository.transact((state) => {
      const warehouse = warehouseById(state, draft.warehouseId);
      if (warehouse.status !== "enabled")
        throw new InventoryDomainError("INVALID_STATE", "只能盘点启用仓库");
      assertDocumentUnlocked(state, draft.occurredAt);
      const value: InventoryStocktake = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        code: nextCode(state, "PD"),
        warehouseId: draft.warehouseId,
        type: draft.type,
        scopeKind: draft.scopeKind ?? "all",
        scopeValue: draft.scopeValue ?? null,
        scopeSkuIds: draft.scopeSkuIds ?? [],
        operatorId: draft.operatorId,
        occurredAt: draft.occurredAt,
        status: "pending",
        lines: [],
        version: 1,
        snapshotVersion: null,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        adjustmentRequestId: null,
      };
      state.stocktakes ??= [];
      state.stocktakes.push(value);
      return value;
    });
  }
  function listStocktakes(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): InventoryDocumentPage<InventoryStocktake> {
    assertRead(actor);
    const rows = docFilter(deps.repository.read().stocktakes ?? [], query).map(
      (item) => {
        const copy = structuredClone(item);
        if (actor.role === "sales-supervisor")
          copy.lines.forEach((line) => {
            line.costPerBaseUnitCents = null;
          });
        return copy;
      },
    );
    return pageDocs(rows, query);
  }
  function startStocktake(
    actor: InventoryActor,
    value: InventoryStocktake,
  ): InventoryStocktake {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      const current = state.stocktakes?.find((item) => item.id === value.id);
      if (
        !current ||
        current.version !== value.version ||
        current.status !== "pending"
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "盘点状态或版本不允许开始",
        );
      assertDocumentUnlocked(state, current.occurredAt);
      const ids = stocktakeCandidates(state, {
        warehouseId: current.warehouseId,
        type: current.type,
        scopeKind: current.scopeKind,
        scopeValue: current.scopeValue,
        scopeSkuIds: current.scopeSkuIds,
        operatorId: current.operatorId,
        occurredAt: current.occurredAt,
      });
      if (!ids.length)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "盘点范围没有可盘点商品",
        );
      const overlaps = (state.inventoryLocks ?? []).some(
        (lock) =>
          lock.warehouseId === current.warehouseId && ids.includes(lock.skuId),
      );
      if (overlaps)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "盘点范围与现有盘点锁重叠",
        );
      const locks = state.inventoryLocks ?? [];
      const lines = ids.map((skuId, index) => {
        const rows = state.balances.filter(
          (row) =>
            row.warehouseId === current.warehouseId && row.skuId === skuId,
        );
        return {
          id: `${current.id}-line-${index + 1}`,
          skuId,
          bookQuantityMilli: rows.reduce(
            (sum, row) => sum + row.quantityMilli,
            0,
          ),
          countedQuantityMilli: null,
          deltaQuantityMilli: null,
          costPerBaseUnitCents: averageCost(state, current.warehouseId, skuId),
          note: null,
        };
      });
      current.lines = lines;
      current.status = "counting";
      current.version++;
      current.snapshotVersion = `stock:${state.movements.length}:${state.balances.map((row) => `${row.id}:${row.quantityMilli}`).join("|")}`;
      current.updatedAt = deps.now();
      for (const skuId of ids)
        locks.push({
          stocktakeId: current.id,
          warehouseId: current.warehouseId,
          skuId,
        });
      state.inventoryLocks = locks;
      return current;
    });
  }
  function saveStocktakeCounts(
    actor: InventoryActor,
    value: InventoryStocktake,
  ): InventoryStocktake {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      const current = state.stocktakes?.find((item) => item.id === value.id);
      if (
        !current ||
        current.status !== "counting" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "盘点状态或版本不允许保存",
        );
      assertDocumentUnlocked(state, current.occurredAt);
      const submitted = new Map(
        value.lines.map((line) => [line.id, line.countedQuantityMilli]),
      );
      if (
        submitted.size !== current.lines.length ||
        current.lines.some((line) => !submitted.has(line.id))
      )
        throw new InventoryValidationError([
          { path: "lines", message: "盘点行与开始时快照不一致" },
        ]);
      current.lines = current.lines.map((line) => {
        const countedQuantityMilli = submitted.get(line.id) ?? null;
        if (countedQuantityMilli === null)
          throw new InventoryValidationError([
            {
              path: `lines.${line.id}`,
              message: "必须录入实盘数量，0 表示真实零库存",
            },
          ]);
        if (
          !Number.isSafeInteger(countedQuantityMilli) ||
          countedQuantityMilli < 0
        )
          throw new InventoryValidationError([
            {
              path: `lines.${line.id}`,
              message: "实盘数量必须是非负整数毫单位",
            },
          ]);
        return {
          ...line,
          countedQuantityMilli,
          deltaQuantityMilli: countedQuantityMilli - line.bookQuantityMilli,
        };
      });
      current.status = "pending-review";
      current.version++;
      current.updatedAt = deps.now();
      return current;
    });
  }
  function approveStocktake(
    actor: InventoryActor,
    value: InventoryStocktake,
  ): InventoryStocktake {
    assertDocumentWrite(actor);
    return atomicDocument(() =>
      deps.repository.transact((state) => {
        const current = state.stocktakes?.find((item) => item.id === value.id);
        if (
          !current ||
          current.status !== "pending-review" ||
          current.version !== value.version
        )
          throw new InventoryDomainError(
            "INVALID_STATE",
            "盘点状态或版本不允许审核",
          );
        if (current.lines.some((line) => line.countedQuantityMilli === null))
          throw new InventoryDomainError("INVALID_STATE", "盘点明细不完整");
        for (const line of current.lines) {
          const delta = line.countedQuantityMilli! - line.bookQuantityMilli;
          if (!delta) continue;
          const cost = line.costPerBaseUnitCents;
          if (cost === null)
            throw new InventoryDomainError("INVALID_STATE", "盘点商品缺少成本");
          const closed = state.operationLocks?.monthClosedThrough;
          if (state.operationLocks?.inventoryLocked)
            throw new InventoryDomainError(
              "INVALID_STATE",
              "盘点锁定期间不能执行库存单据",
            );
          if (closed && monthPart(current.occurredAt) <= closed)
            throw new InventoryDomainError(
              "INVALID_STATE",
              "已结转月份不能执行库存单据",
            );
          if (delta < 0) {
            let remaining = -delta;
            for (const item of eligibleBalances(
              state,
              current.warehouseId,
              line.skuId,
            )) {
              const used = Math.min(remaining, item.balance.quantityMilli);
              item.balance.quantityMilli -= used;
              item.balance.updatedAt = current.occurredAt;
              state.movements.push({
                id: deps.nextId("movement"),
                enterpriseId: state.enterpriseId,
                requestId: `stocktake-${current.id}`,
                sourceType: "inventory-stocktake-loss",
                sourceId: current.id,
                direction: "outbound",
                warehouseId: current.warehouseId,
                locationId: item.balance.locationId,
                skuId: line.skuId,
                batchId: item.batch.id,
                quantityMilli: used,
                balanceAfterMilli: item.balance.quantityMilli,
                costPerBaseUnitCents: item.batch.costPerBaseUnitCents,
                operatorId: actor.actorId,
                occurredAt: current.occurredAt,
              });
              remaining -= used;
              if (!remaining) break;
            }
            if (remaining)
              throw new InventoryDomainError(
                "INSUFFICIENT_STOCK",
                "盘亏超过当前可用库存",
              );
          } else {
            const location = state.locations.find(
              (item) =>
                item.warehouseId === current.warehouseId &&
                item.status === "enabled",
            );
            if (!location)
              throw new InventoryDomainError(
                "INVALID_STATE",
                "盘盈没有可用库位",
              );
            const sku = deps.catalog.getSku(line.skuId);
            if (!sku)
              throw new InventoryDomainError(
                "PRODUCT_UNAVAILABLE",
                "商品资料不可用",
              );
            const batchNumber =
              sku.manageProductionDate || sku.shelfLifeDays !== null
                ? `STK-${current.code}-${line.skuId}`
                : `SYSTEM-NONTRACKED-${line.skuId}`;
            let batch = state.batches.find(
              (item) =>
                item.skuId === line.skuId && item.batchNumber === batchNumber,
            );
            if (!batch) {
              batch = {
                id: deps.nextId("batch"),
                enterpriseId: state.enterpriseId,
                skuId: line.skuId,
                batchNumber,
                tracked: false,
                productionDate: null,
                expiresOn: null,
                receivedAt: current.occurredAt,
                costPerBaseUnitCents: cost,
              };
              state.batches.push(batch);
            }
            let balance = state.balances.find(
              (item) =>
                item.warehouseId === current.warehouseId &&
                item.locationId === location.id &&
                item.skuId === line.skuId &&
                item.batchId === batch!.id,
            );
            if (!balance) {
              balance = {
                id: deps.nextId("balance"),
                enterpriseId: state.enterpriseId,
                warehouseId: current.warehouseId,
                locationId: location.id,
                skuId: line.skuId,
                batchId: batch.id,
                quantityMilli: 0,
                updatedAt: current.occurredAt,
              };
              state.balances.push(balance);
            }
            balance.quantityMilli += delta;
            balance.updatedAt = current.occurredAt;
            state.movements.push({
              id: deps.nextId("movement"),
              enterpriseId: state.enterpriseId,
              requestId: `stocktake-${current.id}`,
              sourceType: "inventory-stocktake-gain",
              sourceId: current.id,
              direction: "inbound",
              warehouseId: current.warehouseId,
              locationId: location.id,
              skuId: line.skuId,
              batchId: batch.id,
              quantityMilli: delta,
              balanceAfterMilli: balance.quantityMilli,
              costPerBaseUnitCents: cost,
              operatorId: actor.actorId,
              occurredAt: current.occurredAt,
            });
          }
        }
        current.status = "completed";
        current.adjustmentRequestId = `stocktake-${current.id}`;
        current.version++;
        current.updatedAt = deps.now();
        state.inventoryLocks = (state.inventoryLocks ?? []).filter(
          (lock) => lock.stocktakeId !== current.id,
        );
        return current;
      }),
    );
  }
  function createCostAdjustment(
    actor: InventoryActor,
    draft: InventoryCostAdjustmentDraft,
  ): InventoryCostAdjustment {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      assertDocumentUnlocked(
        state,
        draft.effectiveAt,
        draft.warehouseId,
        draft.skuId,
      );
      const previous = averageCost(state, draft.warehouseId, draft.skuId);
      if (
        previous === null ||
        state.balances
          .filter(
            (row) =>
              row.warehouseId === draft.warehouseId &&
              row.skuId === draft.skuId &&
              row.quantityMilli > 0,
          )
          .reduce((sum, row) => sum + row.quantityMilli, 0) <= 0
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "只有正库存商品可调整成本",
        );
      if (
        !Number.isSafeInteger(draft.nextCostPerBaseUnitCents) ||
        draft.nextCostPerBaseUnitCents < 0 ||
        draft.nextCostPerBaseUnitCents === previous
      )
        throw new InventoryValidationError([
          {
            path: "nextCostPerBaseUnitCents",
            message: "新成本必须是不同的非负整数分",
          },
        ]);
      if (draft.effectiveAt > deps.now())
        throw new InventoryDomainError("INVALID_STATE", "原型暂不支持预约生效");
      if (draft.reason === "other" && !draft.reasonNote?.trim())
        throw new InventoryValidationError([
          { path: "reasonNote", message: "其他原因必须填写说明" },
        ]);
      const value: InventoryCostAdjustment = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        code: nextCode(state, "CBTZ"),
        warehouseId: draft.warehouseId,
        skuId: draft.skuId,
        previousCostPerBaseUnitCents: previous,
        nextCostPerBaseUnitCents: draft.nextCostPerBaseUnitCents,
        reason: draft.reason,
        reasonNote: draft.reasonNote?.trim() || null,
        effectiveAt: draft.effectiveAt,
        note: draft.note?.trim() || null,
        status: "pending-review",
        version: 1,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        historyId: null,
      };
      state.costAdjustments ??= [];
      state.costAdjustments.push(value);
      return value;
    });
  }
  function listCostAdjustments(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): InventoryDocumentPage<InventoryCostAdjustment> {
    assertRead(actor);
    const keyword = normalize(query.keyword ?? "");
    const rows = (deps.repository.read().costAdjustments ?? [])
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !query.fromDate || datePart(item.effectiveAt) >= query.fromDate,
      )
      .filter(
        (item) => !query.toDate || datePart(item.effectiveAt) <= query.toDate,
      )
      .filter(
        (item) =>
          !keyword ||
          item.code.toLocaleLowerCase().includes(keyword) ||
          item.skuId.toLocaleLowerCase().includes(keyword),
      )
      .sort(
        (a, b) =>
          b.effectiveAt.localeCompare(a.effectiveAt) ||
          b.code.localeCompare(a.code),
      )
      .map((item) =>
        actor.role === "sales-supervisor"
          ? {
              ...item,
              previousCostPerBaseUnitCents: 0,
              nextCostPerBaseUnitCents: 0,
            }
          : item,
      );
    return pageDocs(rows, query);
  }
  function approveCostAdjustment(
    actor: InventoryActor,
    value: InventoryCostAdjustment,
  ): InventoryCostAdjustment {
    assertDocumentWrite(actor);
    return deps.repository.transact((state) => {
      const current = state.costAdjustments?.find(
        (item) => item.id === value.id,
      );
      if (
        !current ||
        current.status !== "pending-review" ||
        current.version !== value.version
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "成本调整状态或版本不允许审核",
        );
      assertDocumentUnlocked(
        state,
        current.effectiveAt,
        current.warehouseId,
        current.skuId,
      );
      if (current.effectiveAt > deps.now())
        throw new InventoryDomainError("INVALID_STATE", "原型暂不支持预约生效");
      const quantity = state.balances
        .filter(
          (row) =>
            row.warehouseId === current.warehouseId &&
            row.skuId === current.skuId,
        )
        .reduce((sum, row) => sum + row.quantityMilli, 0);
      if (quantity <= 0)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "只有正库存商品可调整成本",
        );
      const averages = state.averageCosts ?? [];
      const previous =
        averageCost(state, current.warehouseId, current.skuId) ??
        current.previousCostPerBaseUnitCents;
      if (previous === current.nextCostPerBaseUnitCents)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "当前成本已等于目标成本",
        );
      const entry: InventoryAverageCost = {
        warehouseId: current.warehouseId,
        skuId: current.skuId,
        costPerBaseUnitCents: current.nextCostPerBaseUnitCents,
        version:
          (averages.find(
            (item) =>
              item.warehouseId === current.warehouseId &&
              item.skuId === current.skuId,
          )?.version ?? 0) + 1,
        updatedAt: current.effectiveAt,
      };
      const index = averages.findIndex(
        (item) =>
          item.warehouseId === current.warehouseId &&
          item.skuId === current.skuId,
      );
      if (index >= 0) averages[index] = entry;
      else averages.push(entry);
      state.averageCosts = averages;
      const history: InventoryCostHistory = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        warehouseId: current.warehouseId,
        skuId: current.skuId,
        previousCostPerBaseUnitCents: previous,
        nextCostPerBaseUnitCents: current.nextCostPerBaseUnitCents,
        quantityMilli: quantity,
        valueDeltaCents: amount(
          quantity,
          current.nextCostPerBaseUnitCents - previous,
        ),
        reason: current.reasonNote ?? current.reason,
        effectiveAt: current.effectiveAt,
        operatorId: actor.actorId,
        sourceId: current.id,
        createdAt: deps.now(),
      };
      state.costHistories ??= [];
      state.costHistories.push(history);
      current.historyId = history.id;
      current.status = "effective";
      current.version++;
      current.updatedAt = deps.now();
      return current;
    });
  }
  function closingPage(
    state: InventoryFeatureState,
    year: number,
  ): InventoryClosingPage {
    const items = (state.closings ?? []).filter((item) =>
      item.month.startsWith(`${year}-`),
    );
    const previous = [...(state.closings ?? [])]
      .sort((a, b) => a.month.localeCompare(b.month))
      .at(-1);
    const factMonths = [
      ...state.movements.map((item) => monthPart(item.occurredAt)),
      ...state.openingBalances.map((item) => item.month),
    ]
      .filter(Boolean)
      .sort();
    return {
      year,
      items,
      sourceVersion: `closing:${items.map((item) => item.id).join("|")}`,
      nextClosableMonth: previous
        ? addMonths(previous.month, 1)
        : (factMonths[0] ?? null),
      currentMonth: monthPart(deps.now()),
    };
  }
  function listClosings(
    actor: InventoryActor,
    year = Number(deps.now().slice(0, 4)),
  ): InventoryClosingPage {
    assertRead(actor);
    return closingPage(deps.repository.read(), year);
  }
  function closingSnapshots(
    state: InventoryFeatureState,
    month: string,
    previous?: InventoryClosing,
  ): InventoryClosing["snapshots"] {
    const values = new Map<
      string,
      {
        warehouseId: string;
        skuId: string;
        quantityMilli: number;
        cost: number | null;
        sources: string[];
      }
    >();
    if (previous)
      for (const row of previous.snapshots)
        values.set(`${row.warehouseId}|${row.skuId}`, {
          warehouseId: row.warehouseId,
          skuId: row.skuId,
          quantityMilli: row.quantityMilli,
          cost: row.averageCostPerBaseUnitCents,
          sources: [row.sourceVersion],
        });
    const startMonth = previous?.month;
    const movements = state.movements
      .filter(
        (item) =>
          monthPart(item.occurredAt) <= month &&
          (!startMonth || monthPart(item.occurredAt) > startMonth),
      )
      .map((item) => ({
        at: item.occurredAt,
        kind: "movement" as const,
        item,
      }));
    const histories = (state.costHistories ?? [])
      .filter(
        (item) =>
          monthPart(item.effectiveAt) <= month &&
          (!startMonth || monthPart(item.effectiveAt) > startMonth),
      )
      .map((item) => ({ at: item.effectiveAt, kind: "cost" as const, item }));
    const events: Array<
      (typeof movements)[number] | (typeof histories)[number]
    > = [...movements, ...histories];
    events.sort(
      (a, b) =>
        a.at.localeCompare(b.at) ||
        a.kind.localeCompare(b.kind) ||
        a.item.id.localeCompare(b.item.id),
    );
    for (const event of events) {
      const item = event.item;
      const key = `${item.warehouseId}|${item.skuId}`;
      const current = values.get(key) ?? {
        warehouseId: item.warehouseId,
        skuId: item.skuId,
        quantityMilli: 0,
        cost: null,
        sources: [],
      };
      if ("direction" in item) {
        if (item.direction === "inbound")
          current.cost =
            current.quantityMilli > 0 && current.cost !== null
              ? Math.round(
                  (current.quantityMilli * current.cost +
                    item.quantityMilli * item.costPerBaseUnitCents) /
                    (current.quantityMilli + item.quantityMilli),
                )
              : item.costPerBaseUnitCents;
        current.quantityMilli +=
          item.direction === "inbound"
            ? item.quantityMilli
            : -item.quantityMilli;
        if (current.quantityMilli < 0)
          throw new InventoryDomainError(
            "INVALID_STATE",
            `月末快照重放后库存为负：${key}`,
          );
        current.sources.push(`movement:${item.id}`);
      } else {
        current.cost = item.nextCostPerBaseUnitCents;
        current.sources.push(`cost:${item.id}`);
      }
      values.set(key, current);
    }
    if (!previous) {
      const movementKeys = new Set(
        movements.map(({ item }) => `${item.warehouseId}|${item.skuId}`),
      );
      for (const opening of state.openingBalances
        .filter((item) => item.month <= month)
        .sort((a, b) => a.month.localeCompare(b.month))) {
        const key = `${opening.warehouseId}|${opening.skuId}`;
        if (movementKeys.has(key)) continue;
        values.set(key, {
          warehouseId: opening.warehouseId,
          skuId: opening.skuId,
          quantityMilli: opening.quantityMilli,
          cost: averageCost(state, opening.warehouseId, opening.skuId),
          sources: [`opening:${opening.month}`],
        });
      }
    }
    return [...values.values()]
      .sort(
        (a, b) =>
          a.warehouseId.localeCompare(b.warehouseId) ||
          a.skuId.localeCompare(b.skuId),
      )
      .map((item) => {
        if (item.quantityMilli > 0 && item.cost === null)
          throw new InventoryDomainError(
            "INVALID_STATE",
            `月末正库存缺少有效成本：${item.warehouseId}/${item.skuId}`,
          );
        const cost = item.cost ?? 0;
        return {
          warehouseId: item.warehouseId,
          skuId: item.skuId,
          quantityMilli: item.quantityMilli,
          averageCostPerBaseUnitCents: cost,
          valueCents: amount(item.quantityMilli, cost),
          sourceVersion: item.sources.join("|") || "empty",
        };
      });
  }
  function closeMonth(
    actor: InventoryActor,
    month: string,
    requestId: string,
  ): InventoryClosingPage {
    if (actor.role !== "super-admin")
      throw new InventoryDomainError(
        "PERMISSION_DENIED",
        "只有管理员可以执行库存结转",
      );
    return deps.repository.transact((state) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new InventoryDomainError("INVALID_STATE", "结转月份格式无效");
      const existing = state.closings?.find((item) => item.month === month);
      if (existing) {
        if (existing.requestId !== requestId)
          throw new InventoryDomainError(
            "INVALID_STATE",
            "该月份已结转，requestId 不一致",
          );
        return closingPage(state, Number(month.slice(0, 4)));
      }
      if ((state.closings ?? []).some((item) => item.requestId === requestId))
        throw new InventoryDomainError(
          "INVALID_STATE",
          "requestId 已用于其他结转月份",
        );
      if (month >= monthPart(deps.now()))
        throw new InventoryDomainError("INVALID_STATE", "只能结转已结束月份");
      const factMonths = [
        ...state.movements.map((item) => monthPart(item.occurredAt)),
        ...state.openingBalances.map((item) => item.month),
      ]
        .filter(Boolean)
        .sort();
      const earliestFact = factMonths[0];
      const previous = [...(state.closings ?? [])]
        .sort((a, b) => a.month.localeCompare(b.month))
        .at(-1);
      const expected = previous ? addMonths(previous.month, 1) : earliestFact;
      if (expected && month !== expected)
        throw new InventoryDomainError(
          "INVALID_STATE",
          "结转月份必须从最早库存事实开始并连续",
        );
      if (
        (state.stocktakes ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month && item.status !== "completed",
        )
      )
        throw new InventoryDomainError("INVALID_STATE", "存在未完成盘点");
      if (
        (state.costAdjustments ?? []).some(
          (item) =>
            monthPart(item.effectiveAt) <= month && item.status !== "effective",
        )
      )
        throw new InventoryDomainError("INVALID_STATE", "存在未生效成本调整单");
      if (
        (state.transfers ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month &&
            !["received", "rejected"].includes(item.status),
        ) ||
        (state.otherOutbounds ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month &&
            !["completed", "rejected"].includes(item.status),
        ) ||
        (state.otherInbounds ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month &&
            !["completed", "rejected"].includes(item.status),
        )
      )
        throw new InventoryDomainError("INVALID_STATE", "存在未完成库存单据");
      if (
        (state.processingOrders ?? []).some(
          (item) =>
            monthPart(item.createdAt) <= month && item.status !== "completed",
        ) ||
        (state.materialPicks ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month && item.status !== "outbound",
        ) ||
        (state.materialReturns ?? []).some(
          (item) =>
            monthPart(item.occurredAt) <= month && item.status !== "inbound",
        )
      )
        throw new InventoryDomainError(
          "INVALID_STATE",
          "存在未完成加工或领退料单据",
        );
      const snapshots = closingSnapshots(state, month, previous);
      const sourceVersion = `inventory:${month}:${snapshots.map((item) => `${item.warehouseId}:${item.skuId}:${item.sourceVersion}`).join(";")}`;
      const closing: InventoryClosing = {
        id: deps.nextId("log"),
        enterpriseId: state.enterpriseId,
        month,
        status: "completed",
        snapshots,
        sourceVersion,
        operatorId: actor.actorId,
        createdAt: deps.now(),
        requestId,
      };
      state.closings ??= [];
      state.closings.push(closing);
      state.operationLocks = {
        ...(state.operationLocks ?? {
          inventoryLocked: false,
          monthClosedThrough: null,
        }),
        monthClosedThrough: month,
      };
      const next = addMonths(month, 1);
      for (const snapshot of snapshots) {
        const existingOpening = state.openingBalances.find(
          (item) =>
            item.month === next &&
            item.warehouseId === snapshot.warehouseId &&
            item.skuId === snapshot.skuId,
        );
        if (existingOpening)
          existingOpening.quantityMilli = snapshot.quantityMilli;
        else
          state.openingBalances.push({
            month: next,
            warehouseId: snapshot.warehouseId,
            skuId: snapshot.skuId,
            quantityMilli: snapshot.quantityMilli,
          });
      }
      return closingPage(state, Number(month.slice(0, 4)));
    });
  }

  function csv(value: unknown): string {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }
  function exportTransfersCsv(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): string {
    assertWrite(actor);
    const rows = docFilter(deps.repository.read().transfers ?? [], query);
    const body = rows.map((item) =>
      [
        item.code,
        item.sourceWarehouseId,
        item.targetWarehouseId,
        item.occurredAt,
        item.status,
        item.lines.length,
        item.lines.reduce(
          (sum, line) =>
            sum + amount(line.quantityMilli, line.costPerBaseUnitCents),
          0,
        ) / 100,
      ]
        .map(csv)
        .join(","),
    );
    return `\uFEFF${["code,sourceWarehouseId,targetWarehouseId,occurredAt,status,lineCount,amountCny", ...body].join("\r\n")}`;
  }
  function exportOtherOutboundsCsv(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): string {
    assertWrite(actor);
    const rows = docFilter(deps.repository.read().otherOutbounds ?? [], query);
    const body = rows.map((item) =>
      [
        item.code,
        item.warehouseId,
        item.type,
        item.occurredAt,
        item.status,
        item.lines.reduce((sum, line) => sum + line.quantityMilli, 0) / 1000,
        item.lines.reduce(
          (sum, line) =>
            sum + amount(line.quantityMilli, line.costPerBaseUnitCents),
          0,
        ) / 100,
      ]
        .map(csv)
        .join(","),
    );
    return `\uFEFF${["code,warehouseId,type,occurredAt,status,quantity,amountCny", ...body].join("\r\n")}`;
  }
  function exportOtherInboundsCsv(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): string {
    assertWrite(actor);
    const rows = docFilter(deps.repository.read().otherInbounds ?? [], query);
    const body = rows.map((item) =>
      [
        item.code,
        item.warehouseId,
        item.type,
        item.relatedDocumentNo ?? "",
        item.supplierId ?? "",
        item.occurredAt,
        item.status,
        item.lines.reduce((sum, line) => sum + line.quantityMilli, 0) / 1000,
        item.lines.reduce(
          (sum, line) =>
            sum + amount(line.quantityMilli, line.costPerBaseUnitCents),
          0,
        ) / 100,
      ]
        .map(csv)
        .join(","),
    );
    return `\uFEFF${["code,warehouseId,type,relatedDocumentNo,supplierId,occurredAt,status,quantity,amountCny", ...body].join("\r\n")}`;
  }

  function exportStocksCsv(
    actor: InventoryActor,
    query: InventoryQuery,
    selected: string[] = [],
  ): string {
    assertWrite(actor);
    let rows = listStocks(actor, { ...query, page: 1 }).items;
    if (selected.length)
      rows = rows.filter((item) =>
        selected.includes(`${item.warehouse.id}:${item.skuId}`),
      );
    const headers = [
      "warehouseCode",
      "warehouseName",
      "skuCode",
      "productName",
      "currentBaseQuantity",
      "pendingOutbound",
      "available",
      "inTransit",
      "status",
      "costPerBaseUnitCents",
      "amountCents",
    ];
    const body = rows.map((row) =>
      [
        row.warehouse.code,
        row.warehouse.name,
        row.sku?.skuCode ?? row.skuId,
        row.sku?.productName ?? "商品资料不可用",
        row.currentMilli / 1000,
        "unavailable",
        "unavailable",
        "unavailable",
        row.status,
        row.costPerBaseUnitCents ?? "",
        row.amountCents ?? "",
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
    return `\uFEFF${[headers.join(","), ...body].join("\r\n")}`;
  }

  function exportLocationsCsv(
    actor: InventoryActor,
    selected: string[] = [],
  ): string {
    assertWrite(actor);
    const state = deps.repository.read();
    let locations = state.locations;
    if (selected.length)
      locations = locations.filter((item) => selected.includes(item.id));
    const headers = [
      "warehouseCode",
      "locationCode",
      "locationName",
      "status",
      "note",
    ];
    const body = locations.map((item) => {
      const warehouse = warehouseById(state, item.warehouseId);
      return [
        warehouse.code,
        item.code,
        item.name,
        item.status,
        item.note ?? "",
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",");
    });
    return `\uFEFF${[headers.join(","), ...body].join("\r\n")}`;
  }

  function exportStocktakesCsv(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): string {
    assertWrite(actor);
    const rows = docFilter(deps.repository.read().stocktakes ?? [], query);
    const body = rows.map((item) =>
      [
        item.code,
        item.warehouseId,
        item.type,
        item.status,
        item.operatorId,
        item.occurredAt,
        actor.role === "sales-supervisor"
          ? ""
          : item.lines.reduce(
              (sum, line) =>
                sum +
                amount(
                  line.deltaQuantityMilli ?? 0,
                  line.costPerBaseUnitCents ?? 0,
                ),
              0,
            ) / 100,
      ]
        .map(csv)
        .join(","),
    );
    return `\uFEFF${["code,warehouseId,type,status,operatorId,occurredAt,varianceAmountCny", ...body].join("\r\n")}`;
  }

  function exportCostAdjustmentsCsv(
    actor: InventoryActor,
    query: InventoryDocumentListQuery = {},
  ): string {
    assertWrite(actor);
    const rows = (deps.repository.read().costAdjustments ?? [])
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !query.fromDate || datePart(item.effectiveAt) >= query.fromDate,
      )
      .filter(
        (item) => !query.toDate || datePart(item.effectiveAt) <= query.toDate,
      )
      .filter(
        (item) =>
          !query.keyword ||
          normalize(item.code).includes(normalize(query.keyword)) ||
          normalize(item.skuId).includes(normalize(query.keyword)),
      )
      .sort(
        (a, b) =>
          b.effectiveAt.localeCompare(a.effectiveAt) ||
          b.code.localeCompare(a.code),
      );
    const body = rows.map((item) =>
      [
        item.code,
        item.warehouseId,
        item.skuId,
        item.previousCostPerBaseUnitCents,
        item.nextCostPerBaseUnitCents,
        item.reason,
        item.effectiveAt,
        item.status,
      ]
        .map(csv)
        .join(","),
    );
    return `\uFEFF${["code,warehouseId,skuId,previousCostCents,nextCostCents,reason,effectiveAt,status", ...body].join("\r\n")}`;
  }

  function createReplenishmentProvider() {
    return {
      snapshot: () => {
        const stocks = listStocks(
          { actorId: "procurement-provider", role: "warehouse" },
          { page: 1 },
        ).items;
        const rows = stocks.map((row) => ({
          warehouseId: row.warehouse.id,
          warehouseCode: row.warehouse.code,
          warehouseName: row.warehouse.name,
          skuId: row.skuId,
          categoryId: row.sku?.categoryId ?? null,
          productName: row.sku?.productName ?? row.skuId,
          productCode: row.sku?.productId ?? row.skuId,
          skuCode: row.sku?.skuCode ?? row.skuId,
          specification: row.sku?.specification ?? "",
          inventoryUnitName: row.sku?.inventoryUnitName ?? "",
          currentMilli: row.currentMilli,
          safetyMinimumMilli: row.safetyMinimumMilli,
          maximumMilli: row.maximumMilli,
          availableMilli: row.availableMilli,
          inTransitMilli: row.inTransitMilli,
          pendingOutboundMilli: row.pendingOutboundMilli,
        }));
        return {
          rows,
          available: true,
          version: `inventory:${stocks.map((row) => `${row.warehouse.id}:${row.skuId}:${row.currentMilli}`).join("|")}`,
        };
      },
    };
  }

  function createWarehouseProvider() {
    return {
      listWarehouses: (
        actor: InventoryActor = {
          actorId: "settings-provider",
          role: "super-admin",
        },
      ) =>
        deps.repository
          .read()
          .warehouses.map((item) => cloneWarehouseFor(actor, item))
          .sort((a, b) => a.code.localeCompare(b.code)),
      saveWarehouse: (
        actor: InventoryActor,
        draft: WarehouseDraft,
        id?: string,
      ) => saveWarehouse(actor, draft, id),
    };
  }

  const processing = createInventoryProcessingService({
    repository: deps.repository,
    catalog: deps.catalog,
    orderProvider: deps.processingOrderProvider,
    now: deps.now,
    nextId: deps.nextId,
    confirmOutbound,
    confirmInbound,
  });
  const pickingDelivery = createInventoryPickingDeliveryService({
    repository: deps.repository,
    orderCoordinator: deps.pickingOrderCoordinator,
    staffProvider: deps.deliveryStaffProvider,
    now: deps.now,
    nextId: deps.nextId,
  });
  const statistics = createInventoryStatisticsService({
    repository: deps.repository,
    catalog: deps.catalog,
    now: deps.now,
  });
  return {
    listStocks,
    listBatches,
    listMovements,
    getWorkspace,
    saveThreshold,
    saveWarehouse,
    saveLocation,
    previewLocationImport,
    importLocations,
    previewOutbound,
    previewOutboundBatch,
    confirmOutbound,
    confirmOutboundBatch,
    reverseOutbound,
    confirmInbound,
    confirmReturnInbound,
    reverseReturnInbound,
    createTransfer,
    listTransfers,
    approveTransfer,
    shipTransfer,
    receiveTransfer,
    createOtherOutbound,
    listOtherOutbounds,
    approveOtherOutbound,
    createOtherInbound,
    listOtherInbounds,
    approveOtherInbound,
    deleteTransfer,
    deleteOtherOutbound,
    deleteOtherInbound,
    createStocktake,
    listStocktakes,
    startStocktake,
    saveStocktakeCounts,
    approveStocktake,
    createCostAdjustment,
    listCostAdjustments,
    approveCostAdjustment,
    listClosings,
    closeMonth,
    exportTransfersCsv,
    exportOtherOutboundsCsv,
    exportOtherInboundsCsv,
    exportStocksCsv,
    exportLocationsCsv,
    exportStocktakesCsv,
    exportCostAdjustmentsCsv,
    createReplenishmentProvider,
    createWarehouseProvider,
    queryStatistics: statistics.query,
    listStatisticsFilterOptions: statistics.listFilterOptions,
    ...processing,
    ...pickingDelivery,
  };
}
