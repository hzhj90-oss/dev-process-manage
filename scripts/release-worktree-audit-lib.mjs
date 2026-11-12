// Read-only Git worktree audit utilities. Only filenames and metadata leave this module.
export function parsePorcelainZ(raw) {
  const parts = Buffer.isBuffer(raw) ? raw.toString('utf8').split('\0') : String(raw).split('\0')
  const result = []
  for (let i = 0; i < parts.length; i += 1) {
    const item = parts[i]
    if (!item) continue
    if (item.length < 4 || item[2] !== ' ') throw new Error('Malformed git porcelain record')
    const code = item.slice(0, 2)
    const path = item.slice(3)
    if (!path || /[\r\n\0]/.test(path)) throw new Error('Unsafe Git path')
    if (code.includes('!')) throw new Error('Unexpected ignored file in release worktree')
    if (code.includes('R') || code.includes('C')) {
      if (!parts[i + 1]) throw new Error('Rename or copy lacks source path')
      i += 1
    }
    result.push({ path, code, untracked: code === '??' })
  }
  const seen = new Set()
  for (const entry of result) {
    if (seen.has(entry.path)) throw new Error('Duplicate worktree path: ' + entry.path)
    seen.add(entry.path)
  }
  return result
}

export function worktreeArea(path) {
  const head = path.split('/')[0]
  if (['backend','frontend','runner','scripts','docs','.github'].includes(head)) return head
  return 'root'
}

export function inspectReleaseFile(path, metadata) {
  const basename = path.split('/').at(-1).toLowerCase()
  const normalized = path.toLowerCase().replaceAll('\\', '/')
  const blockers = []
  const warnings = []
  if (metadata.symlink) blockers.push('SYMLINK')
  if (metadata.size > 10 * 1024 * 1024) blockers.push('LARGE_FILE')
  if (metadata.isDirectory || !metadata.isFile) blockers.push('NON_REGULAR_FILE')
  if (/(^|\/)(\.local|data|logs|node_modules|target|dist)(\/|$)/i.test(normalized)) {
    blockers.push('RUNTIME_OR_PRIVATE_PATH')
  }
  if (/^(\.env(?:\..*)?|runner-token\.txt|application-local\.ya?ml|id_rsa|id_ed25519)$/i.test(basename) ||
      /\.(?:p12|pfx|pem|key|jks|keystore|sqlite|sqlite3|db|jar|class|exe|dll|zip|7z|gz)$/i.test(basename)) {
    blockers.push('CREDENTIAL_OR_BINARY_ARTIFACT')
  }
  if (metadata.isFile && basename.endsWith('.ps1') && metadata.hasNonAscii && !metadata.utf8Bom) {
    warnings.push('POWERSHELL_UTF8_WITHOUT_BOM')
  }
  if (metadata.isFile && metadata.isText && metadata.mergeConflict) blockers.push('MERGE_CONFLICT_MARKER')
  if (metadata.secretSignature) blockers.push('SECRET_SIGNATURE_REQUIRES_REVIEW')
  if (metadata.visibleNestedPowerShell) blockers.push('VISIBLE_NESTED_POWERSHELL')
  return { blockers, warnings }
}

// Patterns only; caller must never print matching substrings or source lines.
export function containsSecretSignature(source) {
  return [
    /github_pat_[A-Za-z0-9_]{25,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /AKIA[A-Z0-9]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/
  ].some(pattern => pattern.test(source))
}

export function containsVisibleNestedPowerShell(source) {
  return source.split(/\r?\n/).some(line =>
    /&\s+powershell(?:\.exe)?\s+-NoProfile\b/i.test(line) &&
    !/-WindowStyle\s+Hidden\b/i.test(line) &&
    !/^\s*#/.test(line))
}

export function aggregateReleaseAudit(entries) {
  const areas = {}
  let trackedChanges = 0
  let untracked = 0
  for (const item of entries) {
    const name = worktreeArea(item.path)
    areas[name] ??= { total: 0, untracked: 0 }
    areas[name].total += 1
    if (item.untracked) { untracked += 1; areas[name].untracked += 1 }
    else trackedChanges += 1
  }
  return { files: entries.length, untracked, trackedChanges, areas }
}
