$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$ViteCli = Join-Path $Frontend 'node_modules\vite\bin\vite.js'
$ImportCheck = Join-Path $Frontend 'scripts\verify-element-imports.mjs'
$Maven = 'D:\config\apache-maven-3.6.3\bin\mvn.cmd'
$Port = 18090

$NodeCommand = Get-Command node -ErrorAction Stop
$Node = $NodeCommand.Source
if (-not (Test-Path $ViteCli)) {
    throw "Vite dependencies are missing: $ViteCli. Install frontend dependencies before building."
}
if (-not (Test-Path $Maven)) { throw "Maven not found: $Maven" }
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port $Port is in use. Stop the application before packaging the JAR."
}

Write-Host '[1/2] Build frontend into backend static resources'
Push-Location $Frontend
try {
    # 避免新增页面时漏导入 Element Plus 组件/指令，导致运行期解析失败。
    Write-Host "Checking imports with Node: $Node"
    & $Node $ImportCheck
    $importCheckExit = $LASTEXITCODE
    Write-Host "Component import validation exit code: $importCheckExit"
    if ($importCheckExit -ne 0) { throw 'Element Plus import validation failed.' }
    & $Node $ViteCli build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
finally {
    Pop-Location
}

Write-Host '[2/2] Package Spring Boot application'
& $Maven -f (Join-Path $Root 'backend\pom.xml') clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend Maven verification/package failed.' }

Write-Host 'Build and automated tests completed.'
