import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const failures = []

const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/DESIGN.md',
  'docs/FRONTEND.md',
  'docs/PLANS.md',
  'docs/PRODUCT_SENSE.md',
  'docs/QUALITY_SCORE.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/index.md',
  'docs/design-docs/core-beliefs.md',
  'docs/design-docs/implementation-sequence.md',
  'docs/exec-plans/tech-debt-tracker.md',
  'docs/generated/db-schema.md',
  'docs/product-specs/index.md',
  'docs/product-specs/dashboard.md',
  'docs/product-specs/orders.md',
  'docs/product-specs/products.md',
  'docs/product-specs/procurement.md',
  'docs/product-specs/inventory.md',
  'docs/product-specs/customers.md',
  'docs/product-specs/finance.md',
  'docs/product-specs/settings.md',
  'docs/references/source-requirements.md',
  'docs/references/requirements-manifest.json',
]

const requiredDirectories = [
  'docs/design-docs',
  'docs/exec-plans/active',
  'docs/exec-plans/completed',
  'docs/generated',
  'docs/product-specs',
  'docs/references',
]

const retiredPaths = [
  'feature_list.json',
  'progress.md',
  'docs/ROADMAP.md',
  'docs/DECISIONS.md',
  'docs/ENGINEERING_GUARDRAILS.md',
  'docs/OPEN_QUESTIONS.md',
  'docs/MOCK.md',
  'docs/ui-specs',
  'docs/exec-plans/TEMPLATE.md',
]

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

for (const path of requiredFiles) {
  if (!(await exists(resolve(root, path)))) failures.push(`缺少推荐结构中的文件：${path}`)
}
for (const path of requiredDirectories) {
  if (!(await exists(resolve(root, path)))) failures.push(`缺少推荐结构中的目录：${path}`)
}
for (const path of retiredPaths) {
  if (await exists(resolve(root, path))) failures.push(`发现已归并的重复入口：${path}`)
}

const agents = await readFile(resolve(root, 'AGENTS.md'), 'utf8')
const agentLines = agents.trimEnd().split(/\r?\n/).length
if (agentLines > 80) failures.push(`AGENTS.md 应保持为短导航，当前 ${agentLines} 行（上限 80）`)

for (const requiredReference of [
  'ARCHITECTURE.md',
  'docs/QUALITY_SCORE.md',
  'docs/PLANS.md',
  'docs/product-specs/index.md',
  'docs/RELIABILITY.md',
]) {
  if (!agents.includes(requiredReference)) failures.push(`AGENTS.md 未路由到：${requiredReference}`)
}

const productSpecs = requiredFiles.filter(
  (path) => path.startsWith('docs/product-specs/') && path !== 'docs/product-specs/index.md',
)
for (const path of productSpecs) {
  const contents = await readFile(resolve(root, path), 'utf8')
  if (!contents.startsWith('# ')) failures.push(`${path} 缺少一级标题`)
  if (!/## .*验收/.test(contents)) failures.push(`${path} 缺少验收章节`)
}

const ruleRanges = { ORD: 15, PRD: 17, PUR: 10, INV: 16, CUS: 12, FIN: 11, SET: 10 }
const allSpecText = (await Promise.all(productSpecs.map((path) => readFile(resolve(root, path), 'utf8')))).join('\n')
for (const [prefix, max] of Object.entries(ruleRanges)) {
  for (let index = 1; index <= max; index += 1) {
    const ruleId = `${prefix}-${String(index).padStart(2, '0')}`
    if (!allSpecText.includes(ruleId)) failures.push(`业务规则未进入产品规格：${ruleId}`)
  }
}

const requirementsManifest = JSON.parse(
  await readFile(resolve(root, 'docs/references/requirements-manifest.json'), 'utf8'),
)
if (requirementsManifest.files.length !== 8) {
  failures.push(`需求快照应为 8 份，当前 ${requirementsManifest.files.length} 份`)
}
for (const source of requirementsManifest.files) {
  const snapshotPath = resolve(root, 'docs/references/requirements', source.name)
  if (!(await exists(snapshotPath))) {
    failures.push(`缺少需求快照：${source.name}`)
    continue
  }
  const snapshotBytes = await readFile(snapshotPath)
  const snapshotHash = createHash('sha256').update(snapshotBytes).digest('hex')
  if (snapshotHash !== source.sha256 || snapshotBytes.length !== source.bytes) {
    failures.push(`需求快照与 manifest 不一致：${source.name}`)
  }

  const upstreamPath = resolve(requirementsManifest.upstream_root, source.name)
  if (await exists(upstreamPath)) {
    const upstreamHash = createHash('sha256').update(await readFile(upstreamPath)).digest('hex')
    if (upstreamHash !== source.sha256) failures.push(`上游需求已变化但尚未同步评审：${source.name}`)
  }
}

const planHeadings = [
  '## 目标',
  '## 范围与非目标',
  '## 事实来源',
  '## 验证路径',
  '## 风险与阻塞',
  '## 进度日志',
  '## 开放决策',
  '## 中断恢复点',
]
const activeDirectory = resolve(root, 'docs/exec-plans/active')
const activePlans = (await readdir(activeDirectory)).filter((name) => name.endsWith('.md'))
for (const name of activePlans) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) {
    failures.push(`active plan 命名不符合 YYYY-MM-DD-short-topic.md：${name}`)
  }
  const contents = await readFile(resolve(activeDirectory, name), 'utf8')
  for (const heading of planHeadings) {
    if (!contents.includes(heading)) failures.push(`active plan 缺少章节“${heading}”：${name}`)
  }
  const currentSteps = contents.match(/^- \[ \] 当前步骤：/gm) ?? []
  if (currentSteps.length !== 1) failures.push(`active plan 必须有且仅有一个当前步骤：${name}`)
}

const generatedSchema = await readFile(resolve(root, 'docs/generated/db-schema.md'), 'utf8')
for (const marker of ['来源：', '生成方式：', '最近刷新：', '## 生成内容']) {
  if (!generatedSchema.includes(marker)) failures.push(`生成文档缺少元信息：${marker}`)
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory() && ['node_modules', 'dist', '.git', '.npm-cache'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

const sourceFiles = (await walk(resolve(root, 'src'))).filter((path) => /\.(vue|ts|tsx)$/.test(path))
for (const path of sourceFiles) {
  const contents = await readFile(path, 'utf8')
  const sourcePath = relative(root, path).replaceAll('\\', '/')
  if (/from\s+['"][^'"]*mock\/fixtures/.test(contents)) {
    failures.push(`源代码不得直接导入 fixture：${sourcePath}`)
  }
  if (path.endsWith('.vue') && /\bv-html\s*=/.test(contents)) {
    failures.push(`Vue 模板禁止未经专门评审使用 v-html：${sourcePath}`)
  }
  if (/\/views?\//.test(sourcePath) && /\b(fetch|localStorage|sessionStorage)\s*[.(]/.test(contents)) {
    failures.push(`View 不得直接请求网络或访问浏览器存储：${sourcePath}`)
  }
  if (/\/services?\//.test(sourcePath) && /(Math\.random\s*\(|Date\.now\s*\(|new\s+Date\s*\(\s*\))/.test(contents)) {
    failures.push(`Service 需注入 ID/Clock，不能用随机数或真实当前时间决定结果：${sourcePath}`)
  }

  const sourceDomain = sourcePath.match(/^src\/features\/([^/]+)\//)?.[1]
  const featureImports = [...contents.matchAll(/from\s+['"]@\/features\/([^/]+)\/([^'"]+)['"]/g)]
  for (const featureImport of featureImports) {
    const [, targetDomain, targetPath] = featureImport
    if (sourceDomain && targetDomain !== sourceDomain && targetPath !== 'public' && !targetPath.startsWith('public/')) {
      failures.push(`跨领域只能导入对方 public.ts：${sourcePath} -> ${targetDomain}/${targetPath}`)
    }
  }
}

const securityFiles = [
  ...(await walk(resolve(root, 'src'))),
  ...(await walk(resolve(root, 'mock'))),
  ...(await walk(resolve(root, 'scripts'))),
].filter((path) => /\.(vue|ts|tsx|js|mjs|json|ps1)$/.test(path))
for (const path of securityFiles) {
  const contents = await readFile(path, 'utf8')
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)) {
    failures.push(`发现私钥内容：${relative(root, path)}`)
  }
  if (/(api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(contents)) {
    failures.push(`发现疑似硬编码凭据：${relative(root, path)}`)
  }
}

const markdownFiles = (await walk(root)).filter(
  (path) => path.endsWith('.md') && !path.includes(resolve(root, 'docs/references/requirements')),
)
for (const path of markdownFiles) {
  const contents = await readFile(path, 'utf8')
  const targets = [...contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1])
  for (const target of targets) {
    if (/^(https?:|#)/.test(target)) continue
    const cleanTarget = target.split('#')[0]
    if (cleanTarget && !(await exists(resolve(dirname(path), cleanTarget)))) {
      failures.push(`文档链接不可达：${relative(root, path)} -> ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Harness 验证失败：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Harness 验证通过：OpenAI 高级目录完整，${productSpecs.length} 份领域规格，${requirementsManifest.files.length} 份需求快照，${agentLines} 行入口导航。`,
)
