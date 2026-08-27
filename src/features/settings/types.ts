import type { Warehouse, WarehouseDraft } from '@/features/inventory/public'

export type SettingsRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type SettingsStatus = 'enabled' | 'disabled'
export type PermissionId = string
export interface SettingsPermission { id: PermissionId; label: string; module: string; action: string }
export interface SettingsRoleRecord { id: string; enterpriseId: string; name: string; description: string | null; kind: 'system' | 'custom'; permissionIds: PermissionId[]; status: SettingsStatus; version: number; createdAt: string; updatedAt: string }
export type EmployeeType = 'full-time' | 'part-time' | 'external'
export interface SettingsEmployee { id: string; enterpriseId: string; name: string; account: string; jobNumber: string | null; departmentId: string; position: string | null; employeeType: EmployeeType; roleIds: string[]; regionId: string | null; phone: string; email: string | null; passwordMeta: { fingerprint: string; resetCount: number; updatedAt: string }; mustChangePassword: boolean; status: SettingsStatus; version: number; createdAt: string; updatedAt: string }
export type SettingsEmployeeDraft = Pick<SettingsEmployee, 'name' | 'account' | 'jobNumber' | 'departmentId' | 'position' | 'employeeType' | 'roleIds' | 'regionId' | 'phone' | 'email' | 'status'> & { password?: string }
export type SettingsRoleDraft = Pick<SettingsRoleRecord, 'name' | 'description' | 'permissionIds' | 'status'>
export interface SettingsSession { id: string; employeeId: string; permissionVersion: number; permissionIds: PermissionId[]; createdAt: string; active: boolean }
export interface SettingsAuditLog { id: string; action: string; targetId: string; operatorId: string; detail: string; createdAt: string; targetType?: string }
export type AnnouncementStatus = 'draft' | 'published' | 'withdrawn'
export type AnnouncementType = 'general' | 'policy' | 'event' | 'alert'
export type RegionType = 'region' | 'province' | 'city' | 'district' | 'warehouse'
export interface SettingsActor { actorId: string; role: SettingsRole }
export interface FakeFileMeta { name: string; size: number; mimeType: string; fakeUrl: string }
export interface CompanyProfile { id: string; enterpriseId: string; name: string; code: string; contactName: string; phone: string; email: string | null; region: string | null; address: string | null; logo: FakeFileMeta | null; description: string | null; version: number; updatedAt: string; updatedBy: string }
export type CompanyDraft = Omit<CompanyProfile, 'id' | 'enterpriseId' | 'version' | 'updatedAt' | 'updatedBy'>
export interface Department { id: string; enterpriseId: string; code: string; name: string; parentId: string | null; managerId: string | null; status: SettingsStatus; employeeCount: number; customerCount: number; announcementCount: number; version: number; createdAt: string; updatedAt: string }
export type DepartmentDraft = Pick<Department, 'name' | 'parentId' | 'managerId' | 'status'>
export interface FakeAttachment extends FakeFileMeta { kind: 'image' | 'attachment' }
export interface Announcement { id: string; enterpriseId: string; title: string; type: AnnouncementType; content: string; contentMeta: { images: FakeFileMeta[]; aiDraft: string | null }; linkText: string | null; linkUrl: string | null; recipientScope: 'all' | 'departments'; recipientDepartmentIds: string[]; pushEnabled: boolean; publisher: string; attachments: FakeAttachment[]; status: AnnouncementStatus; publishedAt: string | null; publishedSnapshot: Readonly<Pick<Announcement, 'title' | 'type' | 'content' | 'linkText' | 'linkUrl' | 'recipientScope' | 'recipientDepartmentIds' | 'attachments'>> | null; pushState: 'not-requested' | 'pending' | 'sent' | 'failed'; pushError: string | null; version: number; createdAt: string; updatedAt: string }
export interface AnnouncementDraft { title: string; type: AnnouncementType; content: string; linkText?: string | null; linkUrl?: string | null; recipientScope: 'all' | 'departments'; recipientDepartmentIds?: string[]; pushEnabled?: boolean; publisher: string; attachments?: FakeAttachment[]; contentMeta?: { images?: FakeFileMeta[]; aiDraft?: string | null } }
export interface Region { id: string; enterpriseId: string; code: string; name: string; parentId: string | null; type: RegionType; status: SettingsStatus; isDefault: boolean; customerCount: number; warehouseCount: number; version: number; createdAt: string; updatedAt: string }
export type RegionDraft = Pick<Region, 'name' | 'parentId' | 'type' | 'status' | 'isDefault'>
export interface SettingsFeatureState { schemaVersion: 1; enterpriseId: string; company: CompanyProfile | null; departments: Department[]; announcements: Announcement[]; regions: Region[]; roles?: SettingsRoleRecord[]; employees?: SettingsEmployee[]; permissionCatalogVersion?: number; sessions?: SettingsSession[]; auditLogs: SettingsAuditLog[]; }
export interface SettingsWarehouseProvider { listWarehouses(actor: { actorId: string; role: SettingsRole }): Warehouse[]; saveWarehouse(actor: { actorId: string; role: SettingsRole }, draft: WarehouseDraft, id?: string): Warehouse }
export interface SettingsWarehouseWorkspace { items: Warehouse[]; state: 'available' | 'unavailable'; message: string | null }
