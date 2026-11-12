import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const viewDir = join(root, 'src', 'views')
const problems = []
let checked = 0

for (const file of readdirSync(viewDir).filter(name => name.endsWith('.vue'))) {
  const source = readFileSync(join(viewDir, file), 'utf8')
  const scriptIndex = source.indexOf('<script setup>')
  if (scriptIndex >= 0) {
    // Guard against accidentally deleting a handler while editing loadData().
    // Only check simple named template callbacks; inline expressions are intentionally excluded.
    const template = source.slice(0, scriptIndex)
    const script = source.slice(scriptIndex)
    const events = /@(?:click|change|current-change|size-change|keyup\.enter|closed)\s*=\s*"([A-Za-z_$][\w$]*)(?:\(|")/g
    for (const event of template.matchAll(events)) {
      const handler = event[1]
      const declaration = new RegExp('\\b(?:function|const|let|var)\\s+' + handler + '\\b')
      if (!declaration.test(script)) problems.push(file + ': missing callback ' + handler)
    }
  }
  const tags = new Set([...source.matchAll(/<el-([a-z][a-z0-9-]*)\b/g)].map(match => match[1]))
  if (!tags.size) continue
  checked++
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]element-plus['"]/g)]
    .flatMap(match => match[1].split(',').map(value => value.trim()))
  const names = new Set(imports.map(value => value.split(/\s+as\s+/)[0]))
  for (const tag of tags) {
    const required = 'El' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')
    if (!names.has(required)) problems.push(`${file}: missing ${required} for <el-${tag}>`)
  }
  if (/v-loading\b/.test(source) && !imports.includes('ElLoadingDirective as vLoading')) {
    problems.push(`${file}: missing local vLoading directive`)
  }
}

const main = readFileSync(join(root, 'src', 'main.js'), 'utf8')
const router = readFileSync(join(root, 'src', 'router', 'index.js'), 'utf8')
if (/import\s+ElementPlus\s+from|\.use\(ElementPlus\)/.test(main)) {
  problems.push('main.js: full Element Plus registration was reintroduced')
}
if (/^import\s+\w+View\s+from\s+['"]\.\.\/views\//m.test(router)) {
  problems.push('router/index.js: eager route imports were reintroduced')
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`Element Plus import verification passed: ${checked} views; lazy routes preserved.`)
