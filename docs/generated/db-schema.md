# 数据结构快照

- 来源：`mock/schemas/` 与 `mock/fixtures/baseline.json`
- 生成方式：`npm run docs:generate`
- 最近刷新：2026-08-11

> 本文件由脚本生成，禁止手工编辑“生成内容”。当前原型没有数据库，本页描述的是已通过字段准备门的 Mock 契约，不是生产表结构。

## 生成内容

- Mock schema 版本：3
- 默认场景：normal
- 已登记功能数据：`CUS-001`、`PRD-001`

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

### mock/schemas/product-foundation.schema.json

- SHA-256：`55d043d5679393fe3cefcee8d3365f30d80ebb04c890b43c33814f2528a25a0a`

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
        "required": ["id", "enterpriseId", "code", "name", "categoryId", "baseUnitId", "productType", "sceneUnits", "skus", "status", "hasOrderReference", "deletedAt", "createdAt", "updatedAt"],
        "properties": {
          "code": { "type": "string", "pattern": "^(SPU-[0-9]{6}|.+)$" },
          "name": { "type": "string", "minLength": 1, "maxLength": 80 },
          "productType": { "const": "normal" },
          "status": { "enum": ["draft", "on-sale", "off-sale"] },
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
