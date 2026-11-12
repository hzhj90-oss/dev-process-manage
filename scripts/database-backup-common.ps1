# Shared local-only backup helpers. Do not print database credentials.
$script:BackupRoot = Split-Path -Parent $PSScriptRoot
$script:DatabaseName = 'dev_process_manager'
$script:MySqlBin = 'D:\soft\mysql-5.7.44-winx64\bin'

function Get-LocalDatabaseConfig {
    $path = Join-Path $script:BackupRoot '.local\application-local.yml'
    if (-not (Test-Path -LiteralPath $path)) { throw 'Local database configuration is missing.' }
    $content = [IO.File]::ReadAllText($path)
    $source = [regex]::Match($content,'(?m)^\s*url:\s*jdbc:mysql://([^/\s:]+):(\d+)/([^?\s]+)')
    if (-not $source.Success) { throw 'Local MySQL JDBC URL was not recognized.' }
    $hostName = $source.Groups[1].Value
    $port = [int]$source.Groups[2].Value
    $database = $source.Groups[3].Value
    if ($hostName -notin @('127.0.0.1','localhost') -or $port -ne 3306 -or
        $database -ne $script:DatabaseName) { throw 'Refusing to back up an unexpected database endpoint.' }
    $fields = @{}
    foreach ($name in @('username','password')) {
        $value = [regex]::Match($content, '(?m)^\s*' + $name + ':\s*(.+?)\s*$')
        if (-not $value.Success) { throw 'Required database configuration field is missing.' }
        $text = $value.Groups[1].Value.Trim()
        if ($text.Length -ge 2 -and (($text.StartsWith("'") -and $text.EndsWith("'")) -or
            ($text.StartsWith('"') -and $text.EndsWith('"')))) { $text = $text.Substring(1,$text.Length - 2) }
        $fields[$name] = $text
    }
    if ($fields.username -notmatch '^[a-zA-Z0-9._-]{1,64}$' -or
        [string]::IsNullOrWhiteSpace($fields.password)) { throw 'Invalid local database credentials.' }
    return @{ Host=$hostName; Port=$port; Name=$database; User=$fields.username; Password=$fields.password }
}

function Get-MySqlExecutable([string]$Name) {
    $path = Join-Path $script:MySqlBin $Name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "MySQL client missing: $Name" }
    return $path
}

function Invoke-MySqlWithLocalCredentials([string]$Executable,[string[]]$Arguments,[hashtable]$Config) {
    $present = Test-Path Env:MYSQL_PWD
    $previous = if ($present) { $env:MYSQL_PWD } else { $null }
    try {
        $env:MYSQL_PWD = $Config.Password
        # PowerShell 5.1 treats native stderr as a PowerShell error under Stop.
        # Capture it without exposing the database user or endpoint in logs.
        $oldPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $output = & $Executable @Arguments 2>&1
            $exit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $oldPreference }
        if ($exit -ne 0) {
            # Avoid echoing native stderr because it may contain connection details.
            throw "MySQL client operation failed with exit code $exit."
        }
        return @($output | ForEach-Object { [string]$_ })
    } finally {
        if ($present) { $env:MYSQL_PWD = $previous }
        else { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
    }
}

function Protect-BackupDirectory([string]$Path) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $directory = [IO.DirectoryInfo]::new($Path)
    $acl = $directory.GetAccessControl()
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($allowed in @($sid,
        (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'),
        (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $allowed, [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($rule)
    }
    $directory.SetAccessControl($acl)
}

function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()
    } finally { $stream.Dispose(); $sha.Dispose() }
}

function Get-BackupDataRoot {
    return (Join-Path $script:BackupRoot 'data\backup\automatic')
}
