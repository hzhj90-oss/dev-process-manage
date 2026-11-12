Option Explicit
' Silent, windowless scheduled backup runner. Preserves exit code.
Dim fso, shell, windowsDir, ps, scriptPath, command, result
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
windowsDir = shell.ExpandEnvironmentStrings("%WINDIR%")
ps = fso.BuildPath(windowsDir, "System32\WindowsPowerShell\v1.0\powershell.exe")
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "run-scheduled-backup.ps1")
If Not fso.FileExists(ps) Or Not fso.FileExists(scriptPath) Then WScript.Quit 2
command = Chr(34) & ps & Chr(34) & _
  " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & _
  Chr(34) & scriptPath & Chr(34)
result = shell.Run(command, 0, True)
WScript.Quit result
