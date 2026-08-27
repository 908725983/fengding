export interface ModuleMenuItem {
  label: string
  path: string
}

export interface ModuleMenuGroup {
  label: string
  items: ModuleMenuItem[]
}

export const moduleNavigation: Record<string, ModuleMenuGroup[]> = {
  dashboard: [],
  orders: [
    { label: '订单管理', items: [{ label: '客户订单', path: '/orders' }, { label: '新增订单', path: '/orders/new' }] },
    { label: '履约与售后', items: [{ label: '销售出库单', path: '/orders/outbounds' }, { label: '差异单', path: '/orders/differences' }, { label: '客户退单', path: '/orders/returns' }] },
    { label: '数据分析', items: [{ label: '订单统计', path: '/orders/statistics' }, { label: '销售统计', path: '/orders/sales-statistics' }] },
  ],
  products: [
    { label: '商品管理', items: [{ label: '商品列表', path: '/products' }] },
    { label: '价格管理 · PRD-002', items: [{ label: '等级调价单', path: '/products/prices/level-adjustments' }, { label: '进价调价单', path: '/products/prices/purchase-adjustments' }, { label: '客户调价单', path: '/products/prices/customer-adjustments' }, { label: '历史调价明细', path: '/products/prices/history' }, { label: '单位价格', path: '/products/prices/order-unit-prices' }, { label: '自动调价策略', path: '/products/prices/strategies' }] },
    { label: '商品授权 · PRD-003', items: [{ label: '授权方案', path: '/products/authorizations/plans' }, { label: '授权规则', path: '/products/authorizations/rules' }, { label: '特殊授权', path: '/products/authorizations/specials' }] },
    { label: '铺货与模板 · PRD-004', items: [{ label: '铺货方案', path: '/products/distribution/plans' }, { label: '订单模板', path: '/products/order-templates' }, { label: '解析预览', path: '/products/distribution/preview' }, { label: '铺货执行统计', path: '/products/distribution/statistics' }] },
    { label: '辅助资料 · PRD-005', items: [{ label: '商品分类', path: '/products/references/categories' }, { label: '商品品牌', path: '/products/references/brands' }, { label: '商品单位', path: '/products/references/units' }, { label: '商品标签', path: '/products/references/tags' }] },
  ],
  procurement: [
    { label: '采购管理', items: [{ label: '供应商', path: '/procurement/suppliers' }, { label: '供货商品', path: '/procurement/supplier-products' }, { label: '采购订单', path: '/procurement/purchase-orders' }, { label: '采购退单', path: '/procurement/purchase-returns' }] },
    { label: '采购分析与执行', items: [{ label: '补货分析', path: '/procurement/replenishment' }, { label: '按库存采购', path: '/procurement/quick-purchase/stock' }, { label: '按订单采购', path: '/procurement/quick-purchase/order' }, { label: '采购统计', path: '/procurement/statistics' }, { label: '直送统计', path: '/procurement/direct-delivery' }] },
  ],
  inventory: [
    { label: '库存查询', items: [{ label: '库存查询', path: '/inventory/stocks' }, { label: '批次库存', path: '/inventory/batches' }, { label: '出入库明细', path: '/inventory/movements' }, { label: '批次出入明细', path: '/inventory/batch-movements' }] },
    { label: '仓库资料', items: [{ label: '仓库管理', path: '/inventory/warehouses' }, { label: '库位管理', path: '/inventory/locations' }] },
    { label: '出入库作业', items: [{ label: '转仓单', path: '/inventory/transfers' }, { label: '其他入库', path: '/inventory/other-inbounds' }, { label: '其他出库', path: '/inventory/other-outbounds' }, { label: '盘点记录', path: '/inventory/stocktakes' }, { label: '成本调整', path: '/inventory/cost-adjustments' }, { label: '库存结转', path: '/inventory/closings' }] },
    { label: '分拣配送', items: [{ label: '待分拣订单', path: '/inventory/pending-outbound' }, { label: '按订单分拣', path: '/inventory/order-picking' }, { label: '波次分拣', path: '/inventory/wave-picking' }, { label: '配送任务', path: '/inventory/delivery-tasks' }, { label: '配送线路', path: '/inventory/delivery-routes' }, { label: '车辆管理', path: '/inventory/delivery-vehicles' }, { label: '分拣标签', path: '/inventory/picking-labels' }] },
    { label: '加工管理', items: [{ label: '加工配方', path: '/inventory/processing-recipes' }, { label: '加工计划', path: '/inventory/processing-plans' }, { label: '加工单', path: '/inventory/processing-orders' }, { label: '加工领料', path: '/inventory/material-picks' }, { label: '加工退料', path: '/inventory/material-returns' }, { label: '出成率', path: '/inventory/processing-yields' }] },
    { label: '库存分析', items: [{ label: '库存统计', path: '/inventory/statistics' }] },
  ],
  customers: [
    { label: '客户资料', items: [{ label: '客户列表', path: '/customers' }, { label: '客户分类', path: '/customers/categories' }, { label: '客户标签', path: '/customers/tags' }, { label: '智能标签', path: '/customers/smart-tags' }] },
    { label: '客户经营', items: [{ label: '商机', path: '/customers/opportunities' }, { label: '常购商品', path: '/customers/frequent-products' }, { label: '客户地图', path: '/customers/map' }, { label: '客户公海', path: '/customers/public-sea' }, { label: '公海规则', path: '/customers/public-sea/rules' }] },
    { label: '外勤与会员', items: [{ label: '外勤看板', path: '/customers/fieldwork/dashboard' }, { label: '拜访记录', path: '/customers/fieldwork/visits' }, { label: '拜访路线', path: '/customers/fieldwork/routes' }, { label: '拜访计划', path: '/customers/fieldwork/plans' }, { label: '会员等级', path: '/customers/membership-levels' }, { label: '积分管理', path: '/customers/points' }, { label: '积分设置', path: '/customers/points/settings' }] },
    { label: '营销与渠道', items: [{ label: '优惠券', path: '/customers/coupons' }, { label: '促销活动', path: '/customers/promotions' }, { label: '易发券', path: '/customers/voucher-campaigns' }, { label: '获客文章', path: '/customers/articles' }, { label: '营销分析', path: '/customers/marketing-analysis' }, { label: 'AI营销分析', path: '/customers/ai-marketing-analysis' }, { label: '拉新提成', path: '/customers/referral-commission' }, { label: '企微运营', path: '/customers/wecom' }, { label: '商城运营', path: '/customers/mall' }] },
  ],
  finance: [
    { label: '应收应付', items: [{ label: '客户应收', path: '/finance/receivables' }, { label: '应收商品明细', path: '/finance/receivables/products' }, { label: '供应商应付', path: '/finance/payables' }, { label: '应付商品明细', path: '/finance/payables/products' }, { label: '应收单据', path: '/finance/receivables/documents' }, { label: '应收账龄', path: '/finance/receivables/aging' }, { label: '应付账龄', path: '/finance/payables/aging' }] },
    { label: '收付款与核销', items: [{ label: '供应商付款', path: '/finance/supplier-payments' }, { label: '付款核销', path: '/finance/supplier-writeoffs' }, { label: '收款管理', path: '/finance/receipts' }, { label: '收款核销', path: '/finance/writeoffs' }, { label: '客户退款', path: '/finance/refunds' }, { label: '供应商退款', path: '/finance/supplier-refunds' }] },
    { label: '账户与其他', items: [{ label: '账户转账', path: '/finance/transfers' }, { label: '其他收支', path: '/finance/other-transactions' }, { label: '机构收款', path: '/finance/institution-receipts' }, { label: '资金账户', path: '/finance/accounts' }, { label: '收支汇总', path: '/finance/account-summary' }, { label: '资金结转', path: '/finance/carryovers' }, { label: '银行账户', path: '/finance/banks' }, { label: '在线支付', path: '/finance/payment-channels' }] },
    { label: '统计与运营', items: [{ label: '资金统计', path: '/finance/statistics' }, { label: '拉新提现', path: '/finance/withdrawals' }] },
  ],
  settings: [
    { label: '组织资料', items: [{ label: '公司信息', path: '/settings/company' }, { label: '部门管理', path: '/settings/departments' }, { label: '区域管理', path: '/settings/regions' }, { label: '内部公告', path: '/settings/announcements' }] },
    { label: '权限与账号', items: [{ label: '共享仓库', path: '/settings/warehouses' }, { label: '角色权限', path: '/settings/roles' }, { label: '员工账号', path: '/settings/employees' }] },
    { label: '审计', items: [{ label: '系统日志', path: '/settings/logs' }] },
  ],
}
