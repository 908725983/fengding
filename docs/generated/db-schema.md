# 数据结构快照

- 来源：`mock/schemas/` 与 `mock/fixtures/baseline.json`
- 生成方式：`npm run docs:generate`
- 最近刷新：2026-08-13

> 本文件由脚本生成，禁止手工编辑“生成内容”。当前原型没有数据库，本页描述的是已通过字段准备门的 Mock 契约，不是生产表结构。

## 生成内容

- Mock schema 版本：6
- 默认场景：normal
- 已登记功能数据：`CUS-001`、`INV-001`、`ORD-001`、`PRD-001`、`PRD-002`、`PRD-003`、`PRD-004`

### mock/schemas/authorization-foundation.schema.json

- SHA-256：`268d0c160737b356aff0a9cf8ff8d1724f924252ac9123dcce4541c57ea04566`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mock/schemas/authorization-foundation.schema.json",
  "title": "PRD-003 Product Authorization State",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "nextPlanSequence", "plans", "rules", "specials", "changeLogs"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "nextPlanSequence": { "type": "integer", "minimum": 1 },
    "plans": { "type": "array" },
    "rules": { "type": "array" },
    "specials": { "type": "array" },
    "changeLogs": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/customer-foundation.schema.json

- SHA-256：`73de3e6fe33bc65b168c2e4aa5b6a3e6414a1a2d67b9c9672b71bdb62c4457dd`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "fengding://mock/CUS-001",
  "title": "CUS-001 客户档案、分类与标签 Mock 契约",
  "type": "object",
  "required": [
    "schemaVersion",
    "enterpriseId",
    "nextCustomerSequence",
    "customers",
    "categories",
    "tags",
    "suggestions",
    "changeLogs"
  ],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "nextCustomerSequence": { "type": "integer", "minimum": 1 },
    "customers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "enterpriseId", "code", "name", "categoryId", "primaryContactName", "primaryPhone", "salespersonId", "settlementMethod", "tagIds", "businessSettings", "status", "createdAt", "updatedAt"],
        "properties": {
          "code": { "type": "string", "pattern": "^(CUS-[0-9]{6}|.+)$" },
          "name": { "type": "string", "minLength": 1, "maxLength": 50 },
          "status": { "enum": ["pending", "active", "inactive", "frozen"] },
          "settlementMethod": { "enum": ["cash", "monthly", "terms"] },
          "paymentTermDays": { "type": ["integer", "null"], "minimum": 1, "maximum": 365 },
          "tagIds": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
        }
      }
    },
    "categories": { "type": "array", "items": { "type": "object", "required": ["id", "code", "name", "status", "discountRatePercent"] } },
    "tags": { "type": "array", "items": { "type": "object", "required": ["id", "code", "name", "color", "type", "status"] } },
    "suggestions": { "type": "array", "items": { "type": "object", "required": ["id", "customerId", "tagId", "action", "status"] } },
    "changeLogs": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/distribution-foundation.schema.json

- SHA-256：`f0bba9e33cba9c6803a7fd02a7f16cb8e68aa406b81413457d749d29f40a1eb5`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "fengding://mock/PRD-004",
  "title": "PRD-004 铺货方案与订单模板 Mock 契约",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "plans", "templates", "changeLogs"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "plans": { "type": "array" },
    "templates": { "type": "array" },
    "changeLogs": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/inventory-foundation.schema.json

- SHA-256：`792ac1d6368ed8604dd7b8cd215420e19f3692c721d130b14fc6c5b16c1883f0`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "fengding://mock/INV-001",
  "title": "INV-001 库存、仓库、库位与批次 Mock 契约",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "warehouses", "locations", "thresholds", "openingBalances", "batches", "balances", "movements", "changeLogs"],
  "properties": {
    "schemaVersion": { "const": 1 }, "enterpriseId": { "type": "string", "minLength": 1 },
    "warehouses": { "type": "array" }, "locations": { "type": "array" }, "thresholds": { "type": "array" },
    "openingBalances": { "type": "array" }, "batches": { "type": "array" }, "balances": { "type": "array" },
    "movements": { "type": "array" }, "changeLogs": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/order-foundation.schema.json

- SHA-256：`7b0fc68c1b79f7385e02ff6ce8100b2692db8a6733e96231d4bdfb44d6af2819`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "fengding://mock/ORD-001",
  "title": "ORD-001 客户订单列表与详情 Mock 契约",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "orders", "printRequests"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "orders": { "type": "array", "minItems": 31 },
    "printRequests": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/price-foundation.schema.json

- SHA-256：`e134e3720d0629fa665fc5e0b5b6332a9a9e8c80cfc0496534aeedc0a8b2c941`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mock/schemas/price-foundation.schema.json",
  "title": "PRD-002 Price Foundation State",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "clock", "nextSequences", "adjustments", "versions", "history", "unitOverrides", "strategies", "categoryTierMappings", "costBasis"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "clock": { "type": "string", "format": "date-time" },
    "nextSequences": {
      "type": "object",
      "required": ["level", "purchase", "customer"],
      "properties": {
        "level": { "type": "integer", "minimum": 1 },
        "purchase": { "type": "integer", "minimum": 1 },
        "customer": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    },
    "adjustments": { "type": "array" },
    "versions": { "type": "array" },
    "history": { "type": "array" },
    "unitOverrides": { "type": "array" },
    "strategies": { "type": "array" },
    "categoryTierMappings": { "type": "array" },
    "costBasis": { "type": "array" }
  },
  "additionalProperties": false
}
```

### mock/schemas/product-foundation.schema.json

- SHA-256：`97a9e5f1279049c582743a6ba55197f929079e51647d6a8a86f32f74228d06f7`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "fengding://mock/PRD-001",
  "title": "PRD-001 商品、SKU 与多单位 Mock 契约",
  "type": "object",
  "required": ["schemaVersion", "enterpriseId", "nextProductSequence", "nextSkuSequence", "products", "categories", "brands", "units", "tags", "displayCategories", "changeLogs"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "enterpriseId": { "type": "string", "minLength": 1 },
    "nextProductSequence": { "type": "integer", "minimum": 1 },
    "nextSkuSequence": { "type": "integer", "minimum": 1 },
    "products": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "enterpriseId", "code", "name", "categoryId", "baseUnitId", "productType", "sceneUnits", "minimumOrderQuantity", "orderMultiple", "skus", "status", "hasOrderReference", "deletedAt", "createdAt", "updatedAt"],
        "properties": {
          "code": { "type": "string", "pattern": "^(SPU-[0-9]{6}|.+)$" },
          "name": { "type": "string", "minLength": 1, "maxLength": 80 },
          "productType": { "const": "normal" },
          "status": { "enum": ["draft", "on-sale", "off-sale"] },
          "orderMultiple": { "type": "integer", "minimum": 1 },
          "skus": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["id", "productId", "code", "specificationName", "specificationValue"],
              "properties": {
                "code": { "type": "string", "pattern": "^(SKU-[0-9]{6}|.+)$" },
                "barcode": { "type": ["string", "null"] }
              }
            }
          }
        }
      }
    },
    "categories": { "type": "array" },
    "brands": { "type": "array" },
    "units": { "type": "array" },
    "tags": { "type": "array" },
    "displayCategories": { "type": "array" },
    "changeLogs": { "type": "array" }
  },
  "additionalProperties": false
}
```
