import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const schemaRoot = resolve(root, 'mock/schemas')
const baselinePath = resolve(root, 'mock/fixtures/baseline.json')
const outputPath = resolve(root, 'docs/generated/db-schema.md')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.name !== 'README.md') files.push(path)
  }
  return files.sort()
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
const schemaFiles = await listFiles(schemaRoot)
const featureIds = Object.keys(baseline.featureData ?? {}).sort()
const refreshed = new Date().toISOString().slice(0, 10)
const lines = [
  '# 数据结构快照',
  '',
  '- 来源：`mock/schemas/` 与 `mock/fixtures/baseline.json`',
  '- 生成方式：`npm run docs:generate`',
  `- 最近刷新：${refreshed}`,
  '',
  '> 本文件由脚本生成，禁止手工编辑“生成内容”。当前原型没有数据库，本页描述的是已通过字段准备门的 Mock 契约，不是生产表结构。',
  '',
  '## 生成内容',
  '',
  `- Mock schema 版本：${baseline.schemaVersion}`,
  `- 默认场景：${baseline.scenario}`,
  `- 已登记功能数据：${featureIds.length > 0 ? featureIds.map((id) => `\`${id}\``).join('、') : '无'}`,
  '',
]

if (schemaFiles.length === 0) {
  lines.push('当前没有可执行的业务 schema 文件；全部业务切片仍未达到字段契约 ready。', '')
} else {
  for (const path of schemaFiles) {
    const contents = await readFile(path, 'utf8')
    const sourcePath = relative(root, path).replaceAll('\\', '/')
    const hash = createHash('sha256').update(contents).digest('hex')
    const language = { '.json': 'json', '.ts': 'ts', '.js': 'js' }[extname(path)] ?? 'text'
    lines.push(`### ${sourcePath}`, '', `- SHA-256：\`${hash}\``, '', `\`\`\`${language}`, contents.trimEnd(), '\`\`\`', '')
  }
}

await writeFile(outputPath, `${lines.join('\n').trimEnd()}\n`, 'utf8')
console.log(`已生成 ${relative(root, outputPath)}，包含 ${schemaFiles.length} 个业务 schema。`)
