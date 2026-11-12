param(
    [string]$BaseUrl = 'http://127.0.0.1:18090'
)
$ErrorActionPreference = 'Stop'
# 独立浏览器配置目录，不使用或修改用户当前 Chrome 会话。
$ChromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$Browser = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Browser) { throw 'Chrome/Edge is required for the frontend smoke test.' }
$BaseUrl = $BaseUrl.TrimEnd('/')
$null = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/health" -TimeoutSec 5

$Routes = @('', 'projects', 'versions', 'requirements', 'test-cases',
    'test-scripts', 'environments', 'test-cycles', 'execution-tasks', 'ai-execution', 'test-reports')
$TempRoot = Join-Path $env:TEMP ('dpm-frontend-smoke-' + [Guid]::NewGuid().ToString('N'))
$Profile = Join-Path $TempRoot 'profile'
New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
$Results = @()
try {
    foreach ($Route in $Routes) {
        $Name = if ($Route) { $Route } else { 'dashboard' }
        $OutFile = Join-Path $TempRoot "$Name.html"
        $ErrFile = Join-Path $TempRoot "$Name.err"
        $Options = @('--headless=new', '--disable-gpu', '--no-first-run',
            '--no-default-browser-check', ("--user-data-dir=" + $Profile),
            '--virtual-time-budget=2500', '--dump-dom', "$BaseUrl/#/$Route")
        $Child = Start-Process -FilePath $Browser -ArgumentList $Options -Wait -PassThru `
            -NoNewWindow -RedirectStandardOutput $OutFile -RedirectStandardError $ErrFile
        $Html = [IO.File]::ReadAllText($OutFile)
        $Stderr = [IO.File]::ReadAllText($ErrFile)
        $IsRendered = $Html.Contains('class="page-view"') -or $Html.Contains('class="dashboard-page"')
        $Unknown = ([regex]::Matches($Html, '<el-[a-z]')).Count
        $Errors = ([regex]::Matches($Stderr,
            'Failed to resolve component|Uncaught|ReferenceError|TypeError|SyntaxError')).Count
        $Results += [pscustomobject]@{
            Page = $Name
            ExitCode = $Child.ExitCode
            Rendered = $IsRendered
            UnknownElementTags = $Unknown
            BrowserErrors = $Errors
        }
    }
    $Results | Format-Table -AutoSize
    $Failed = $Results | Where-Object {
        $_.ExitCode -ne 0 -or -not $_.Rendered -or
        $_.UnknownElementTags -ne 0 -or $_.BrowserErrors -ne 0
    }
    if ($Failed) { throw "Frontend smoke test failed for $(@($Failed).Count) page(s)." }
    Write-Host "Frontend browser smoke test passed: $($Results.Count)/$($Routes.Count)."
}
finally {
    # 删除测试自己的临时数据，不触碰用户浏览器的个人资料目录。
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
