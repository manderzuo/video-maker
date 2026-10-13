param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
$opsConfig=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$opsPython=Join-Path (Split-Path -Parent $opsConfig.executable) 'python\python.exe'
$opsSync=Join-Path $opsConfig.root 'windows_sync.py'
$opsProcess=Start-Process -FilePath $opsPython -ArgumentList @(('"'+$opsSync+'"'),('"'+$ConfigPath+'"')) -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $opsConfig.root 'last-sync.log') -RedirectStandardError (Join-Path $opsConfig.root 'last-sync-error.log')
exit $opsProcess.ExitCode
