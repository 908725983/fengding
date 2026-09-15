import { InMemorySettingsRepository } from '@/features/settings/repositories/settings-repository'
import { createSettingsService } from '@/features/settings/services/settings-service'
import { defaultRolePermissionIds } from '@/features/settings/config/permission-catalog'
import type { SettingsFeatureState, SettingsWarehouseProvider } from '@/features/settings/types'
import { createRuntimeSequence } from '../runtime/application-browser-persistence'

export type SettingsScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure'
const baseState: SettingsFeatureState = {
  schemaVersion: 1, enterpriseId: 'enterprise-demo',
  company: { id: 'company-1', enterpriseId: 'enterprise-demo', name: '蜂订食品供应链有限公司', code: 'FENGDING', contactName: '王瑞', phone: '13800000000', email: 'demo@example.com', region: '浙江省杭州市', address: '示例地址 1 号', logo: null, description: '用于业务流程验证的原型企业资料。', version: 1, updatedAt: '2026-08-10T10:00:00+08:00', updatedBy: 'seed' },
  departments: [
    { id: 'dept-1', enterpriseId: 'enterprise-demo', code: 'DEPT-20260810-001', name: '销售中心', parentId: null, managerId: 'employee-1', status: 'enabled', employeeCount: 2, customerCount: 4, announcementCount: 1, version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
    { id: 'dept-2', enterpriseId: 'enterprise-demo', code: 'DEPT-20260810-002', name: '华东业务组', parentId: 'dept-1', managerId: null, status: 'enabled', employeeCount: 0, customerCount: 0, announcementCount: 0, version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
  ],
  announcements: [{ id: 'announcement-1', enterpriseId: 'enterprise-demo', title: '本周五系统维护通知', type: 'general', content: '本周五 22:00 进行例行维护。', contentMeta: { images: [], aiDraft: null }, linkText: null, linkUrl: null, recipientScope: 'all', recipientDepartmentIds: [], pushEnabled: false, publisher: '系统管理员', attachments: [], status: 'published', publishedAt: '2026-08-10T10:00:00+08:00', publishedSnapshot: { title: '本周五系统维护通知', type: 'general', content: '本周五 22:00 进行例行维护。', linkText: null, linkUrl: null, recipientScope: 'all', recipientDepartmentIds: [], attachments: [] }, pushState: 'not-requested', pushError: null, version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' }],
  regions: [{ id: 'region-root', enterpriseId: 'enterprise-demo', code: 'REG-ROOT', name: '全国', parentId: null, type: 'region', status: 'enabled', isDefault: true, customerCount: 4, warehouseCount: 2, version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' }, { id: 'region-east', enterpriseId: 'enterprise-demo', code: 'REG-20260810-001', name: '华东', parentId: 'region-root', type: 'region', status: 'enabled', isDefault: false, customerCount: 2, warehouseCount: 1, version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' }],
  roles: [
    { id: 'role-super-admin', enterpriseId: 'enterprise-demo', name: '系统管理员', description: '原型内置全权限角色', kind: 'system', permissionIds: [...defaultRolePermissionIds['super-admin']], status: 'enabled', version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
    { id: 'role-finance', enterpriseId: 'enterprise-demo', name: '财务', description: '资金与日志查看', kind: 'system', permissionIds: [...defaultRolePermissionIds.finance], status: 'enabled', version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
    { id: 'role-warehouse', enterpriseId: 'enterprise-demo', name: '仓库', description: '库存与日志查看', kind: 'system', permissionIds: [...defaultRolePermissionIds.warehouse], status: 'enabled', version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
  ],
  employees: [
    { id: 'employee-1', enterpriseId: 'enterprise-demo', name: '系统管理员', account: 'admin', jobNumber: 'EMP-001', departmentId: 'dept-1', position: '管理员', employeeType: 'full-time', roleIds: ['role-super-admin'], regionId: 'region-root', phone: '13800000000', email: 'admin@example.com', passwordMeta: { fingerprint: 'fake:8', resetCount: 0, updatedAt: '2026-08-10T10:00:00+08:00' }, mustChangePassword: false, status: 'enabled', version: 1, createdAt: '2026-08-10T10:00:00+08:00', updatedAt: '2026-08-10T10:00:00+08:00' },
  ],
  permissionCatalogVersion: 1,
  sessions: [],
  auditLogs: [],
}
export function createSettingsMockSession(scenarioName: SettingsScenarioName = 'normal', options: { warehouseProvider: SettingsWarehouseProvider }) {
  const state = structuredClone(baseState)
  if (scenarioName === 'empty') { state.company = null; state.departments = []; state.announcements = []; state.regions = [state.regions[0]]; state.roles = (state.roles ?? []).filter((item) => item.kind === 'system'); state.employees = [] }
  const repository = new InMemorySettingsRepository(state); const nextSequence = createRuntimeSequence()
  const service = createSettingsService({ repository, warehouseProvider: options.warehouseProvider, now: () => '2026-08-10T10:00:00+08:00', nextId: (kind) => `${kind}-settings-${nextSequence()}` })
  const latencyMs = scenarioName === 'slow' ? 500 : 0
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, latencyMs)); if (scenarioName === 'error') throw new Error('原型模拟：设置服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, run }
}
