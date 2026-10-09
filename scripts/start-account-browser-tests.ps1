[CmdletBinding()]
param([switch]$DryRun,[switch]$CleanupOnly)
$ErrorActionPreference='Stop'
$accountRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$accountMetadata=Join-Path $accountRoot 'work/account-api-cloud/prepared-test-tls.json'

function Read-AccountCleanupRecord([string]$MetadataPath,[string]$AttemptId='') {
    if(!(Test-Path -LiteralPath $MetadataPath)){throw 'No recorded test certificate fingerprint; no broad cleanup was attempted'}
    $info=Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if(($AttemptId -and $info.attemptId -ne $AttemptId) -or $info.userSid -ne $sid -or
       $info.subject -ne 'CN=AIWORK-Local-Account-Test-20261008-Restricted' -or
       $info.thumbprint -notmatch '^[A-Fa-f0-9]{40}$'){
        throw 'No exact certificate record for this attempt/current user; no broad cleanup was attempted'
    }
    return $info
}

function Invoke-AccountCertificateWorkflow {
    param([string]$MetadataPath,[string]$AttemptId,[scriptblock]$Action)
    try {
        & $Action 'Prepare' $AttemptId
        $info=Read-AccountCleanupRecord $MetadataPath $AttemptId
        & $Action 'Run' $info.thumbprint
    }
    finally {
        # Always reread the disk journal, including when Prepare threw before returning.
        $record=if(Test-Path -LiteralPath $MetadataPath){Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json}else{$null}
        if($record -and $record.attemptId -eq $AttemptId -and $record.thumbprint -match '^[A-Fa-f0-9]{40}$'){
            $cleanupInfo=Read-AccountCleanupRecord $MetadataPath $AttemptId
            & $Action 'Cleanup' $cleanupInfo.thumbprint
        }
    }
}

if($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7){throw 'Run this launcher in PowerShell 7, as the ordinary current Windows user'}
if(!$CleanupOnly -and ($env:NODE_TLS_REJECT_UNAUTHORIZED -eq '0' -or ![string]::IsNullOrWhiteSpace($env:NODE_OPTIONS))){throw 'Strict TLS requires NODE_TLS_REJECT_UNAUTHORIZED not set to 0 and empty NODE_OPTIONS'}
if($DryRun){
    [ordered]@{mode='dry-run';root=$accountRoot;wrapper='scripts/run-account-browser-tests.ps1';metadata=$accountMetadata;certificateSubject='CN=AIWORK-Local-Account-Test-20261008-Restricted';trustTarget='CurrentUser/Root';generatesCertificate=$false;changesTrust=$false;startsServices=$false} | ConvertTo-Json
    return
}
$accountWrapper=Join-Path $accountRoot 'scripts/run-account-browser-tests.ps1'
if($CleanupOnly){
    $info=Read-AccountCleanupRecord $accountMetadata
    & $accountWrapper -AuthorizeLocalTrust -CleanupOnly -PreparedThumbprint $info.thumbprint
    if($LASTEXITCODE -ne 0){throw 'Exact test certificate cleanup failed; retain the output and report it'}
    return
}
Set-Location -LiteralPath $accountRoot
. (Join-Path $accountRoot 'scripts/use-local-toolchain.ps1')
$env:TEMP=Join-Path $accountRoot 'work/account-api-cloud/npm-temp'
$env:TMP=$env:TEMP
$env:npm_config_cache=Join-Path $accountRoot 'work/account-api-cloud/npm-cache'
$attempt=[Guid]::NewGuid().ToString('N')
$action={
    param($phase,$value)
    if($phase -eq 'Prepare'){
        & $accountWrapper -AuthorizeLocalTrust -PrepareOnly -AttemptId $value
    } elseif($phase -eq 'Run'){
        & $accountWrapper -AuthorizeLocalTrust -PreparedThumbprint $value
        $browserCode=$LASTEXITCODE
        Write-Output ('Strict browser exit: '+$browserCode)
        if($browserCode -ne 0){throw 'Strict browser tests did not pass'}
    } elseif($phase -eq 'Cleanup'){
        & $accountWrapper -AuthorizeLocalTrust -CleanupOnly -PreparedThumbprint $value
        if($LASTEXITCODE -ne 0){throw 'Exact test certificate cleanup failed; retain the output and report it'}
    } else {throw 'Unknown workflow phase'}
}
Invoke-AccountCertificateWorkflow -MetadataPath $accountMetadata -AttemptId $attempt -Action $action
