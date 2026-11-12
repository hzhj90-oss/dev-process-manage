#!/usr/bin/env node
// Read-only local source-release inventory. Does not stage/commit or print file contents.
import { spawnSync } from 'node:child_process'
import { lstatSync, openSync, readSync, closeSync, existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePorcelainZ, inspectReleaseFile, aggregateReleaseAudit, containsSecretSignature, containsVisibleNestedPowerShell } from './release-worktree-audit-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')
const json = process.argv.includes('--json')
if (process.argv.slice(2).some(arg => !['--strict', '--json'].includes(arg))) {
  throw new Error('Usage: node scripts/audit-release-worktree.mjs [--strict] [--json]')
}
const git = (...args) => {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args],
    { cwd: root, encoding: null, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0) {
    throw new Error('Git command failed: ' + args[0] + ' (' + (result.status ?? 'unavailable') + ')')
  }
  return result.stdout
}
const head = git('rev-parse', '--short', 'HEAD').toString('utf8').trim()
const branch = git('branch', '--show-current').toString('utf8').trim()
const worktree = parsePorcelainZ(git('status', '--porcelain=v1', '-z', '--untracked-files=all'))
const summary = aggregateReleaseAudit(worktree)
// Validate every tracked source as well, not just modified/untracked paths.
const indexed = git('ls-files', '-z').toString('utf8').split('\0').filter(Boolean)
const changedPaths = new Set(worktree.map(item => item.path))
const fullInventory = [...worktree, ...indexed.filter(path => !changedPaths.has(path))
  .map(path => ({path,code:'  ',untracked:false}))]
const issues = []
const warnings = []
const inspected = []
for (const entry of fullInventory) {
  const full = resolve(root, ...entry.path.split('/'))
  if (full !== root && !full.startsWith(root + sep)) {
    issues.push({ path: entry.path, code: 'ESCAPED_WORKTREE' })
    continue
  }
  if (!existsSync(full)) {
    if (entry.code.includes('D')) continue // deleted tracked file: Git checks it
    issues.push({ path: entry.path, code: 'MISSING_SOURCE_FILE' })
    continue
  }
  const stats = lstatSync(full)
  const meta = {
    size: stats.size,
    symlink: stats.isSymbolicLink(),
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    hasNonAscii: false,
    utf8Bom: false,
    isText: false,
    mergeConflict: false,
    secretSignature: false,
    visibleNestedPowerShell: false
  }
  // Only sample text files. Never dump any source, credentials or grep matches.
  if (stats.isFile() && stats.size <= 10 * 1024 * 1024) {
    const fd = openSync(full, 'r')
    const bytes = Buffer.alloc(Math.min(stats.size, 1024 * 1024))
    try {
      const read = readSync(fd, bytes, 0, bytes.length, 0)
      const sample = bytes.subarray(0, read)
      meta.utf8Bom = sample.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
      meta.hasNonAscii = sample.some(value => value > 127)
      const isCode = /\.(?:ps1|mjs|js|vue|java|xml|yml|yaml|json|css|html|ts|sh)$/i.test(entry.path)
      const isReadable = isCode || /\.(?:md|txt|properties)$/i.test(entry.path)
      meta.isText = isCode
      if (isReadable) {
        const source = sample.toString('utf8')
        meta.secretSignature = containsSecretSignature(source)
        if (entry.path.toLowerCase().endsWith('.ps1')) {
          meta.visibleNestedPowerShell = containsVisibleNestedPowerShell(source)
        }
        if (isCode) meta.mergeConflict = /^(?:<{7} |>{7} )/m.test(source)
      }
    } finally { closeSync(fd) }
  }
  const report = inspectReleaseFile(entry.path, meta)
  for (const code of report.blockers) issues.push({ path: entry.path, code })
  for (const code of report.warnings) warnings.push({ path: entry.path, code })
  inspected.push(entry.path)
}
const protectedExamples = [
  '.local/application-local.yml', '.local/runner-token.txt',
  'data/backup/automatic/backup-example/database.sql.gz', 'logs/application.stderr.log',
  'backend/target/dev-process-manager.jar', 'frontend/dist/index.html',
  'runner/browser-runner/node_modules/example/index.js'
]
for (const path of protectedExamples) {
  const code = spawnSync('git', ['check-ignore', '-q', path],
    { cwd: root, windowsHide: true }).status
  if (code !== 0) issues.push({ path, code: 'PRIVATE_PATH_NOT_GITIGNORED' })
}
const diff = spawnSync('git', ['diff', '--check'], {cwd: root, windowsHide: true, encoding: 'utf8'})
if (diff.status !== 0) issues.push({ path: '(tracked diff)', code: 'GIT_DIFF_CHECK_FAILED' })
// Git diff --check does not check untracked files; the filename/metadata audit above does.
const result = {
  head, branch, summary, scannedSourceFiles: inspected.length, blockers: issues, warnings,
  hygienePassed: issues.length === 0,
  sourceReleaseReady: issues.length === 0 && summary.files === 0,
  strict
}
if (json) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} else {
  console.log('WORKTREE_AUDIT_HEAD=' + head + ' BRANCH=' + branch)
  console.log('WORKTREE_AUDIT_FILES=' + summary.files +
    ' TRACKED_CHANGES=' + summary.trackedChanges + ' UNTRACKED=' + summary.untracked)
  for (const [area, data] of Object.entries(summary.areas).sort()) {
    console.log('WORKTREE_AREA_' + area.toUpperCase().replaceAll('.', '_') +
      '=' + data.total + ' UNTRACKED=' + data.untracked)
  }
  console.log('WORKTREE_SCANNED_SOURCE_FILES=' + result.scannedSourceFiles)
  console.log('WORKTREE_AUDIT_BLOCKERS=' + issues.length + ' WARNINGS=' + warnings.length)
  for (const item of issues.slice(0, 25)) console.log('WORKTREE_BLOCKER=' + item.code + ' ' + item.path)
  const types = [...new Set(warnings.map(item => item.code))]
  for (const type of types) {
    console.log('WORKTREE_WARNING_' + type + '=' + warnings.filter(item => item.code === type).length)
  }
  console.log('WORKTREE_HYGIENE_PASS=' + result.hygienePassed)
  console.log('SOURCE_RELEASE_READY=' + result.sourceReleaseReady)
  console.log('WORKTREE_AUDIT_READ_ONLY=true')
}
if (issues.length || (strict && summary.files)) process.exitCode = 1
