$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Version = '12.2.2'
$ToolRoot = Join-Path $Root '.local\tools'
$InstallDir = Join-Path $ToolRoot ("npm-" + $Version)
$Cli = Join-Path $InstallDir 'package\bin\npm-cli.js'
if (Test-Path $Cli) {
    Write-Host "Portable npm $Version already available."
    return
}
New-Item -ItemType Directory -Path $ToolRoot -Force | Out-Null
$Metadata = Invoke-RestMethod -Uri "https://registry.npmjs.org/npm/$Version" -TimeoutSec 30
if ($Metadata.version -ne $Version -or -not $Metadata.dist.integrity.StartsWith('sha512-')) {
    throw 'Unexpected npm package metadata or missing SHA-512 integrity.'
}
$DownloadDir = Join-Path $ToolRoot ('.npm-download-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $DownloadDir | Out-Null
try {
    $Archive = Join-Path $DownloadDir 'npm.tgz'
    Invoke-WebRequest -Uri $Metadata.dist.tarball -OutFile $Archive -UseBasicParsing -TimeoutSec 60
    $Hasher = [System.Security.Cryptography.SHA512]::Create()
    try {
        $Hash = [Convert]::ToBase64String($Hasher.ComputeHash([IO.File]::ReadAllBytes($Archive)))
    }
    finally { $Hasher.Dispose() }
    if ('sha512-' + $Hash -cne $Metadata.dist.integrity) {
        throw 'npm package SHA-512 mismatch; aborting bootstrap.'
    }
    & tar.exe -xzf $Archive -C $DownloadDir
    if ($LASTEXITCODE -ne 0) { throw 'Failed to extract the verified npm archive.' }
    $Extracted = Join-Path $DownloadDir 'package'
    if (-not (Test-Path (Join-Path $Extracted 'bin\npm-cli.js'))) {
        throw 'Verified archive does not contain npm CLI.'
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Move-Item -LiteralPath $Extracted -Destination (Join-Path $InstallDir 'package')
    Write-Host "Verified and installed portable npm $Version into ignored .local/tools."
}
finally {
    Remove-Item -LiteralPath $DownloadDir -Recurse -Force -ErrorAction SilentlyContinue
}
