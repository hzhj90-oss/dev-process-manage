import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePorcelainZ, worktreeArea, inspectReleaseFile, aggregateReleaseAudit,
  containsSecretSignature, containsVisibleNestedPowerShell }
  from './release-worktree-audit-lib.mjs'

const file = (overrides={}) => ({
  symlink:false, size:120, isFile:true, isDirectory:false,
  hasNonAscii:false, utf8Bom:false, isText:true, mergeConflict:false,
  ...overrides
})

test('nul-separated porcelain expands filenames with spaces and UTF-8 without quoting', () => {
  const input=Buffer.from(' M frontend/src/App.vue\0?? docs/验收 清单.md\0?? scripts/new script.ps1\0')
  assert.deepEqual(parsePorcelainZ(input),[
    {path:'frontend/src/App.vue',code:' M',untracked:false},
    {path:'docs/验收 清单.md',code:'??',untracked:true},
    {path:'scripts/new script.ps1',code:'??',untracked:true}
  ])
})

test('renames consume source path and avoid counting them as new files', () => {
  assert.deepEqual(parsePorcelainZ(Buffer.from('R  scripts/new.ps1\0scripts/old.ps1\0')),
    [{path:'scripts/new.ps1',code:'R ',untracked:false}])
})

test('malformed and duplicate porcelain records fail closed', () => {
  assert.throws(()=>parsePorcelainZ(Buffer.from('?? x.txt\0?? x.txt\0')),/Duplicate/)
  assert.throws(()=>parsePorcelainZ(Buffer.from('bad-file\0')),/Malformed/)
  assert.throws(()=>parsePorcelainZ(Buffer.from('R  new.txt\0')),/source path/)
  assert.throws(()=>parsePorcelainZ(Buffer.from('?? file\nname\0')),/Unsafe/)
})

test('private paths, raw keys, binaries and symlinks cannot enter a release', () => {
  assert.ok(inspectReleaseFile('.local/application-local.yml',file()).blockers.includes('RUNTIME_OR_PRIVATE_PATH'))
  assert.ok(inspectReleaseFile('secrets/token.key',file()).blockers.includes('CREDENTIAL_OR_BINARY_ARTIFACT'))
  assert.ok(inspectReleaseFile('docs/readme.md',file({symlink:true})).blockers.includes('SYMLINK'))
  assert.ok(inspectReleaseFile('data/uploads/file.pdf',file()).blockers.includes('RUNTIME_OR_PRIVATE_PATH'))
  assert.ok(inspectReleaseFile('new.jar',file()).blockers.includes('CREDENTIAL_OR_BINARY_ARTIFACT'))
})

test('oversized, non-regular and merge conflict files cannot enter a release', () => {
  assert.ok(inspectReleaseFile('frontend/src/index.vue',file({size:15e6})).blockers.includes('LARGE_FILE'))
  assert.ok(inspectReleaseFile('src/folder',file({isFile:false,isDirectory:true})).blockers.includes('NON_REGULAR_FILE'))
  assert.ok(inspectReleaseFile('src/app.js',file({mergeConflict:true})).blockers.includes('MERGE_CONFLICT_MARKER'))
  assert.deepEqual(inspectReleaseFile('src/app.js',file()).blockers,[])
})

test('PowerShell encoding is a warning, not an unseen build failure', () => {
  assert.deepEqual(inspectReleaseFile('scripts/step.ps1',
    file({hasNonAscii:true,utf8Bom:false})).warnings,['POWERSHELL_UTF8_WITHOUT_BOM'])
  assert.deepEqual(inspectReleaseFile('scripts/step.ps1',
    file({hasNonAscii:true,utf8Bom:true})).warnings,[])
})

test('summary separates individual untracked files from tracked edits by area', () => {
  const summary=aggregateReleaseAudit(parsePorcelainZ(
    Buffer.from(' M scripts/a.ps1\0?? scripts/b.ps1\0?? docs/计划.md\0?? root.txt\0')))
  assert.equal(summary.files,4)
  assert.equal(summary.trackedChanges,1)
  assert.equal(summary.untracked,3)
  assert.deepEqual(summary.areas.scripts,{total:2,untracked:1})
  assert.equal(worktreeArea('docs/验收.md'),'docs')
  assert.equal(worktreeArea('README.md'),'root')
})

test('credential signatures produce review blockers without echoing credential bytes', () => {
  const fake = 'github_pat_' + 'A'.repeat(36)
  assert.equal(containsSecretSignature(fake),true)
  assert.equal(containsSecretSignature('EXAMPLE_TOKEN_FROM_ENV'),false)
  assert.ok(inspectReleaseFile('scripts/temp.txt',
    file({secretSignature:true})).blockers.includes('SECRET_SIGNATURE_REQUIRES_REVIEW'))
})

test('nested PowerShell invocations must be explicitly windowless', () => {
  assert.equal(containsVisibleNestedPowerShell('& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File step.ps1'),true)
  assert.equal(containsVisibleNestedPowerShell('& powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File step.ps1'),false)
  assert.equal(containsVisibleNestedPowerShell('# & powershell.exe -NoProfile -NonInteractive -File step.ps1'),false)
  assert.ok(inspectReleaseFile('scripts/step.ps1',
    file({visibleNestedPowerShell:true})).blockers.includes('VISIBLE_NESTED_POWERSHELL'))
})
