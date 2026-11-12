# Database backup restore E2E in a disposable, separate MySQL 5.7 instance.
# No connection to the application's running MySQL server is ever made here.
param([switch]$Apply,[string]$BackupPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem

$completedBackupDirectory = [IO.Path]::GetFullPath((Get-BackupDataRoot))
$matches = @(Get-ChildItem -LiteralPath $completedBackupDirectory -Directory |
    Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
    Sort-Object Name -Descending)
if ($matches.Count -eq 0) { throw 'No completed automatic backup exists.' }
if ([string]::IsNullOrWhiteSpace($BackupPath)) { $BackupPath = $matches[0].FullName }
$backup = [IO.Path]::GetFullPath($BackupPath)
if (-not ([IO.Path]::GetDirectoryName($backup)).Equals($completedBackupDirectory,
        [StringComparison]::OrdinalIgnoreCase) -or
    ([IO.Path]::GetFileName($backup) -notmatch '^backup-\d{8}_\d{6}_\d{3}$')) {
    throw 'Only a direct, completed automatic backup is accepted.'
}
$verifyScript = Join-Path $PSScriptRoot 'verify-database-backup.ps1'
& powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $verifyScript -BackupPath $backup
if ($LASTEXITCODE -ne 0) { throw 'Backup integrity verification failed.' }
$manifest = [IO.File]::ReadAllText((Join-Path $backup 'manifest.json')) | ConvertFrom-Json
$sqlArchive = Join-Path $backup 'database.sql.gz'
$checks = @('(?i)^\s*(USE|CREATE\s+DATABASE|DROP\s+DATABASE|ALTER\s+DATABASE|GRANT|REVOKE|CREATE\s+USER|DROP\s+USER|SET\s+GLOBAL)\b',
    '(?i)^\s*(source|system|\\!)\s',
    '(?i)^\s*\\\.',
    '(?i)\bINTO\s+OUTFILE\b',
    '(?i)\bLOAD\s+DATA\s+LOCAL\b')
$tableCount = 0
$sqlFile = [IO.File]::OpenRead($sqlArchive)
try {
    $gzip = [IO.Compression.GZipStream]::new($sqlFile,[IO.Compression.CompressionMode]::Decompress)
    try {
        $reader = [IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8)
        try {
            while ($null -ne ($line = $reader.ReadLine())) {
                if ($line.StartsWith('CREATE TABLE ')) { $tableCount++ }
                foreach ($check in $checks) {
                    if ($line -match $check) {
                        throw 'The dump contains an unsafe cross-database or client command.'
                    }
                }
            }
        } finally { $reader.Dispose() }
    } finally { $gzip.Dispose() }
} finally { $sqlFile.Dispose() }
if ($tableCount -ne [int]$manifest.databaseTableCount) {
    throw 'Dump schema count does not match manifest.'
}
Write-Host ('RESTORE_PREFLIGHT_PASS backup=' + [IO.Path]::GetFileName($backup) +
    ' tables=' + $tableCount + ' uploads=' + $manifest.uploadFileCount)
if (-not $Apply) {
    Write-Host 'RESTORE_DRY_RUN_ONLY=true (no temporary database created)'
    return
}
if ($env:DPM_ISOLATED_RESTORE_ALLOW_WRITE -cne 'YES') {
    throw 'Restore requires DPM_ISOLATED_RESTORE_ALLOW_WRITE=YES plus -Apply.'
}
$bin = $script:MySqlBin
$mysqld = Get-MySqlExecutable 'mysqld.exe'
$mysql = Get-MySqlExecutable 'mysql.exe'
$mysqlcheck = Get-MySqlExecutable 'mysqlcheck.exe'
$mysqladmin = Get-MySqlExecutable 'mysqladmin.exe'
$basedir = Split-Path -Parent $bin
$schema = 'dpm_restore_verify'

# Expose only a random loopback TCP port, never the live port 3306.
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start()
try { $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port }
finally { $listener.Stop() }
if ($port -eq 3306 -or $port -lt 49152) {
    throw 'Refusing an unexpected restore port.'
}
$restoreRoot = Join-Path $script:BackupRoot 'data\restore-validation'
if (-not (Test-Path -LiteralPath $restoreRoot)) {
    New-Item -ItemType Directory -Path $restoreRoot -Force | Out-Null
}
Protect-BackupDirectory $restoreRoot
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss') + '_' +
    [guid]::NewGuid().ToString('N')
$run = Join-Path $restoreRoot ('run-' + $runId)
$datadir = Join-Path $run 'mysql-data'
$uploadDir = Join-Path $run 'uploads'
$errlog = Join-Path $run 'mysql-error.log'
New-Item -ItemType Directory -Path $run, $datadir | Out-Null
Protect-BackupDirectory $run
$started = $null

function To-MySqlPath([string]$path) {
    return [IO.Path]::GetFullPath($path).Replace('\','/')
}
function New-MySqlProcess([string]$exe,[string]$arguments,[bool]$stdin,[bool]$captureStderr = $false) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exe
    $info.Arguments = $arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $stdin
    $info.RedirectStandardError = $captureStderr
    # Never let ambient credentials affect this entirely separate test instance.
    if ($info.EnvironmentVariables.ContainsKey('MYSQL_PWD')) {
        $info.EnvironmentVariables.Remove('MYSQL_PWD')
    }
    return [Diagnostics.Process]::Start($info)
}
function Invoke-IsolatedMysql([string]$query) {
    # Query is fixed, application-authored SQL and a fixed schema name.
    $args = '--no-defaults --protocol=TCP --host=127.0.0.1 --port=' + $port +
        ' --user=root --batch --skip-column-names --execute="' + $query + '"'
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $mysql
    $info.Arguments = $args
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    if ($info.EnvironmentVariables.ContainsKey('MYSQL_PWD')) {
        $info.EnvironmentVariables.Remove('MYSQL_PWD')
    }
    $proc = [Diagnostics.Process]::Start($info)
    try {
        $output = $proc.StandardOutput.ReadToEnd()
        $null = $proc.StandardError.ReadToEnd()
        if (-not $proc.WaitForExit(15000) -or $proc.ExitCode -ne 0) {
            throw 'Query against the isolated MySQL instance failed.'
        }
        return $output.Trim()
    } finally { $proc.Dispose() }
}

try {
    $base = To-MySqlPath $basedir
    $data = To-MySqlPath $datadir
    $log = To-MySqlPath $errlog
    # Initialize ONLY the unique datadir; never read Windows MySQL service options.
    $init = New-MySqlProcess $mysqld (
        '--no-defaults --initialize-insecure --log-syslog=0 --basedir="' + $base +
        '" --datadir="' + $data + '" --log-error="' + $log + '"') $false
    try {
        if (-not $init.WaitForExit(120000)) {
            $init.Kill()
            throw 'Disposable MySQL data directory initialization timed out.'
        }
        if ($init.ExitCode -ne 0) {
            throw 'Disposable MySQL instance initialization failed.'
        }
    } finally { $init.Dispose() }

    $startArgs = '--no-defaults --basedir="' + $base + '" --datadir="' + $data +
        '" --port=' + $port + ' --bind-address=127.0.0.1 --log-syslog=0' +
        ' --skip-log-bin --local-infile=0' +
        ' --secure-file-priv=NULL --innodb-buffer-pool-size=64M --console'
    $started = New-MySqlProcess $mysqld $startArgs $false $false
    $deadline = [datetime]::UtcNow.AddSeconds(35)
    $ready = $false
    while ([datetime]::UtcNow -lt $deadline -and -not $started.HasExited) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            try {
                $connect = $tcp.BeginConnect('127.0.0.1',$port,$null,$null)
                if ($connect.AsyncWaitHandle.WaitOne(300)) {
                    $tcp.EndConnect($connect)
                    $check = Invoke-IsolatedMysql 'SELECT 1'
                    if ($check -eq '1') { $ready = $true; break }
                }
            } finally { $tcp.Dispose() }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        if ($started.HasExited) {
            Write-Host ('ISOLATED_CHILD_EXIT=' + $started.ExitCode)
            # Child stderr is inherited while diagnosing Windows standalone startup.
        }
        if (Test-Path -LiteralPath $errlog) {
            Get-Content -LiteralPath $errlog -Tail 16 |
                Where-Object { $_ -match '(?i)\[ERROR\]|\[Warning\]' } |
                Select-Object -Last 6 | ForEach-Object {
                    Write-Host ('ISOLATED_STARTUP_ERROR=' + ($_ -replace
                        '(?i)password\s*[:=]\s*\S+','password=[REDACTED]'))
                }
        }
        throw 'Disposable MySQL did not become healthy on its own loopback port.'
    }
    Write-Host ('ISOLATED_MYSQL_READY port=' + $port + ' schema=' + $schema)

    [void](Invoke-IsolatedMysql ('CREATE DATABASE ' + $schema +
        ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'))
    $before = Invoke-IsolatedMysql (
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" +
        $schema + "' AND table_type='BASE TABLE'")
    if ($before -ne '0') { throw 'Refusing restore into a nonempty test schema.' }

    $importArgs = '--no-defaults --protocol=TCP --host=127.0.0.1 --port=' + $port +
        ' --user=root --default-character-set=utf8mb4 --database=' + $schema
    $import = New-MySqlProcess $mysql $importArgs $true
    try {
        $file = [IO.File]::OpenRead($sqlArchive)
        try {
            $zipStream = [IO.Compression.GZipStream]::new($file,[IO.Compression.CompressionMode]::Decompress)
            try { $zipStream.CopyTo($import.StandardInput.BaseStream) }
            finally { $zipStream.Dispose() }
        } finally { $file.Dispose() }
        $import.StandardInput.Close()
        if (-not $import.WaitForExit(120000)) {
            $import.Kill()
            throw 'The isolated database restore timed out.'
        }
        if ($import.ExitCode -ne 0) { throw 'Isolated restore mysql client returned an error.' }
    } finally { $import.Dispose() }

    $restored = [int](Invoke-IsolatedMysql (
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" +
        $schema + "' AND table_type='BASE TABLE'"))
    if ($restored -ne $tableCount) { throw 'Restored base table count does not match manifest.' }

    $mysqlcheckArgs = '--no-defaults --protocol=TCP --host=127.0.0.1 --port=' +
        $port + ' --user=root --check --databases ' + $schema
    $health = New-MySqlProcess $mysqlcheck $mysqlcheckArgs $false
    try {
        if (-not $health.WaitForExit(45000)) {
            $health.Kill()
            throw 'mysqlcheck timed out.'
        }
        if ($health.ExitCode -ne 0) { throw 'mysqlcheck found a damaged table.' }
    } finally { $health.Dispose() }

    $projectCount = [int](Invoke-IsolatedMysql ('SELECT COUNT(*) FROM ' + $schema + '.dpm_project'))
    $cycleCount = [int](Invoke-IsolatedMysql ('SELECT COUNT(*) FROM ' + $schema + '.dpm_test_cycle'))
    $taskCount = [int](Invoke-IsolatedMysql ('SELECT COUNT(*) FROM ' + $schema + '.dpm_execution_task'))
    if ($projectCount -lt 1 -or $cycleCount -lt 1 -or $taskCount -lt 1) {
        throw 'Restored database lacks expected business records.'
    }
    # The verified ZIP has only safe file names; extract ONLY under this disposable directory.
    [IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $backup 'uploads.zip'),$uploadDir)
    $uploadCount = @(Get-ChildItem -LiteralPath $uploadDir -File -Recurse).Count
    if ($uploadCount -ne [int]$manifest.uploadFileCount) {
        throw 'Restored upload file count is incorrect.'
    }
    $report = [ordered]@{
        result='PASS'; runId=$runId; backup=[IO.Path]::GetFileName($backup)
        tableCount=$restored; projectRows=$projectCount; cycleRows=$cycleCount
        taskRows=$taskCount; uploadFiles=$uploadCount
        verifiedAtUtc=[DateTime]::UtcNow.ToString('o')
        isolation='separate-process-separate-datadir-random-loopback-port'
    }
    $reportPath = Join-Path $restoreRoot ('report-' + $runId + '.json')
    [IO.File]::WriteAllText($reportPath,($report | ConvertTo-Json -Depth 4),
        [Text.UTF8Encoding]::new($false))
    Write-Host ('ISOLATED_RESTORE_PASS tables=' + $restored + ' projects=' +
        $projectCount + ' cycles=' + $cycleCount + ' tasks=' + $taskCount +
        ' uploads=' + $uploadCount)
    Write-Host ('RESTORE_REPORT=' + $reportPath)
} finally {
    if ($started -ne $null) {
        try {
            if (-not $started.HasExited) {
                # mysqladmin can shut down this unique running process gracefully.
                $adminArgs = '--no-defaults --protocol=TCP --host=127.0.0.1 --port=' +
                    $port + ' --user=root shutdown'
                $shutdown = New-MySqlProcess $mysqladmin $adminArgs $false
                try { [void]$shutdown.WaitForExit(10000) }
                finally { $shutdown.Dispose() }
                if (-not $started.WaitForExit(12000)) { $started.Kill() }
            }
        } catch {
            if (-not $started.HasExited) { $started.Kill() }
        } finally {
            try { [void]$started.WaitForExit(10000) } catch {}
            $started.Dispose()
        }
    }
    if (Test-Path -LiteralPath $run -PathType Container) {
        for ($n=0; $n -lt 5; $n++) {
            try { Remove-Item -LiteralPath $run -Force -Recurse -ErrorAction Stop; break }
            catch { Start-Sleep -Milliseconds 500 }
        }
        if (Test-Path -LiteralPath $run) {
            throw 'Could not remove disposable restore data; inspect the isolated run directory.'
        }
    }
}
