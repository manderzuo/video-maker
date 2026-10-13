param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
$opsConfig=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$opsRoot=[System.IO.Path]::GetFullPath($opsConfig.root)
$opsMutex=[System.Threading.Mutex]::new($false,'Local\AIWorkProductionSupervisor')
$opsLocked=$false
try {
    $opsLocked=$opsMutex.WaitOne(0)
    if(-not $opsLocked){exit 0}
    if(Test-Path -LiteralPath (Join-Path $opsRoot 'maintenance.json')){exit 0}
    $opsProcesses=@(Get-CimInstance Win32_Process)
    $opsApps=@($opsProcesses | Where-Object {$_.Name -eq 'ai-work-assistant.exe'})
    $opsExpected=@($opsApps | Where-Object {$_.ExecutablePath -eq $opsConfig.executable})
    $opsLast=Join-Path $opsRoot 'last-start.json'
    $opsCanStart=(-not (Test-Path -LiteralPath $opsLast)) -or ((Get-Date)-(Get-Item -LiteralPath $opsLast).LastWriteTime).TotalMinutes -ge 5
    $opsStatus='ok'
    if($opsApps.Count -gt 0 -and $opsExpected.Count -eq 0){$opsStatus='unexpected_app_identity'}
    elseif($opsExpected.Count -eq 0 -and $opsCanStart){
        if(-not (Test-Path -LiteralPath $opsConfig.executable)){throw 'Production executable missing'}
        @{at=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()} | ConvertTo-Json | Set-Content -LiteralPath $opsLast -Encoding utf8
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$opsConfig.launcher+'"')) -WindowStyle Hidden | Out-Null
        $opsStatus='started'
    }elseif($opsExpected.Count -eq 0){$opsStatus='restart_backoff'}
    $opsFrp=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'frpc.exe' -and $_.ExecutablePath -eq $opsConfig.frpc -and $_.CommandLine.Contains($opsConfig.frpc_config)})
    if($opsFrp.Count -eq 0){
        Start-Process -FilePath $opsConfig.frpc -ArgumentList @('-c',('"'+$opsConfig.frpc_config+'"')) -WindowStyle Hidden | Out-Null
    }
    @{at=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();status=$opsStatus;appCount=$opsExpected.Count;frpCount=$opsFrp.Count;requiresInteractiveUser=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $opsRoot 'supervisor-health.json') -Encoding utf8
    if($opsStatus -eq 'unexpected_app_identity'){exit 2}
}finally{if($opsLocked){$opsMutex.ReleaseMutex()};$opsMutex.Dispose()}
