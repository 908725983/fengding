# Mock 设计

## 目标

Mock 是可替换的数据边界，不是散落在页面里的假数组。它需要支持稳定复现、状态变更、失败注入和一键重置，使业务验收可以重复执行。

## 调用链

```text
View -> Store/Composable -> Service -> Repository interface -> Mock repository -> Fixture/Scenario
```

View 禁止直接导入 `mock/fixtures` 或 `mock/scenarios`。

## 目录职责

- `mock/fixtures/baseline.json`：最小、互相关联的基准实体。
- `mock/scenarios/*.json`：场景覆盖与故障参数，不复制整套数据。
- `mock/handlers/`：未来 Mock API/Repository 实现位置。
- `mock/schemas/`：实体与接口契约说明；实现功能时换成可执行 schema。
- `work/mock-state.json`：运行期副本，不纳入版本控制。

## 内置场景

| 场景 | 用途 | 约束 |
|---|---|---|
| `normal` | 有代表性关联数据的黄金旅程 | 默认 |
| `empty` | 无记录和无搜索结果 | 不能与错误混淆 |
| `error` | 查询或提交失败 | UI 提供重试/保留输入 |
| `slow` | 延迟响应 | 展示 loading，防止重复提交 |
| `restricted` | 权限不足 | 隐藏或禁用动作并说明原因 |

场景由 `VITE_MOCK_SCENARIO` 或原型顶部场景切换器选择。未识别值回退 `normal` 并记录警告。

## 数据约束

- ID 固定且可读，如 `order-001`；测试不依赖随机 ID。
- 日期使用 ISO 8601；展示时按 Asia/Shanghai 转换。
- 金额内部为整数分，例如 `12345` 表示 `123.45` 元。
- 数量必须伴随单位；批次、仓库、客户、商品和单据引用必须存在。
- 基准数据不得包含真实客户、手机号、地址、账号、令牌或支付信息。

## 状态变更

- 业务状态只能由 service 的显式 command 改变。
- 每次变更返回成功结果或结构化错误 `{ code, message, fieldErrors? }`。
- 跨模块动作（如出库扣库存并形成应收）由一个协调服务提交，禁止页面依次写多个 fixture。
- 原型可用浏览器存储模拟持久化，但必须能由 `npm run mock:reset` 恢复基线。

## 新功能的 Mock 完成标准

1. 规格中的正常路径有基准数据。
2. 至少覆盖 empty、error、restricted 中与功能相关的状态。
3. 写操作后重新查询能看到一致结果。
4. 重置后 ID、数量、金额和状态完全一致。
5. 自动测试不依赖执行顺序。
