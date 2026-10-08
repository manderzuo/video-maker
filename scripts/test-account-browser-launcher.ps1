$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'start-account-browser-tests.ps1') -DryRun | Out-Null
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('aiwork-launcher-check-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$record=Join-Path $testRoot 'record.json'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$thumb='A'*40
$passed=0
try {
    foreach($kind in @('success','prepare-failure','prepare-cancel','run-failure','missing-record','stale-record')){
        if(Test-Path -LiteralPath $record){Remove-Item -LiteralPath $record}
        $state=@{calls=[Collections.Generic.List[string]]::new();error=$null}
        $attempt=[Guid]::NewGuid().ToString('N')
        $fake={
            param($phase,$value)
            $state.calls.Add($phase)
            if($phase -eq 'Prepare'){
                if($kind -ne 'missing-record'){
                    @{attemptId=$(if($kind -eq 'stale-record'){'old'}else{$attempt});userSid=$sid;subject='CN=AIWORK-Local-Account-Test-20261008-Restricted';thumbprint=$thumb} | ConvertTo-Json | Set-Content -LiteralPath $record
                }
                if($kind -eq 'prepare-failure'){throw 'simulated prepare failure after journal write'}
                if($kind -eq 'prepare-cancel'){throw [OperationCanceledException]::new('simulated cancellation after journal write')}
            }
            if($phase -eq 'Run' -and $kind -eq 'run-failure'){throw 'simulated run failure'}
            if($phase -eq 'Cleanup' -and $value -ne $thumb){throw 'wrong cleanup thumbprint'}
        }
        try{Invoke-AccountCertificateWorkflow -MetadataPath $record -AttemptId $attempt -Action $fake}catch{$state.error=$_.Exception.Message}
        $actual=$state.calls -join ','
        $expected=switch($kind){'success'{'Prepare,Run,Cleanup'} 'prepare-failure'{'Prepare,Cleanup'} 'prepare-cancel'{'Prepare,Cleanup'} 'run-failure'{'Prepare,Run,Cleanup'} default{'Prepare'}}
        if($actual -ne $expected){throw "Failed $kind phase order: $actual"}
        if($kind -eq 'success' -and $state.error){throw "Unexpected error: $($state.error)"}
        if($kind -ne 'success' -and !$state.error){throw "Missing expected failure: $kind"}
        $passed++;Write-Output ('PASS '+$kind)
    }
    Write-Output ('Launcher mock checks: '+$passed+'/6; generated/imported certificates: 0')
} finally {
    if([IO.Path]::GetFullPath($testRoot).StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
