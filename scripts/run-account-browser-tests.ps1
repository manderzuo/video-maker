[CmdletBinding()]
param([string[]]$BrowserArgs=@(),[switch]$AuthorizeLocalTrust,[switch]$PrepareOnly,[switch]$CleanupOnly,[string]$PreparedThumbprint,[string]$AttemptId)
$ErrorActionPreference='Stop'
if(!$AuthorizeLocalTrust){throw 'Explicit authorization for this local test certificate workflow is required'}
if($BrowserArgs.Count -gt 0){throw 'This scoped run requires the seven configured account cases without overrides'}
if(!$CleanupOnly -and ($env:NODE_TLS_REJECT_UNAUTHORIZED -eq '0' -or ![string]::IsNullOrWhiteSpace($env:NODE_OPTIONS))){throw 'Strict TLS requires NODE_TLS_REJECT_UNAUTHORIZED not set to 0 and empty NODE_OPTIONS'}
$taskRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$certDir=Join-Path $taskRoot 'work/account-api-cloud/trusted-test-tls'
$certPath=Join-Path $certDir 'cert.pem';$keyPath=Join-Path $certDir 'key.pem'
$metadataPath=Join-Path $taskRoot 'work/account-api-cloud/prepared-test-tls.json'
$statusPath=Join-Path $taskRoot 'work/account-api-cloud/test-tls-run-status.json'
$evidencePath=Join-Path $taskRoot 'docs/review/evidence/account-trusted-browser-tls.json'
$userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$allowedSids=@($userSid.Value,'S-1-5-18')
$expectedSubject='CN=AIWORK-Local-Account-Test-20261008-Restricted'
$openssl='C:/Program Files/Git/usr/bin/openssl.exe'
function Assert-OwnedPath {
 foreach($path in @($certDir,$certPath,$keyPath)){
  if([IO.Path]::GetFullPath($path) -ne $path -or !$path.StartsWith($certDir,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected test TLS path'}
  if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing TLS reparse point'}
 }
}
function Get-TrustCount([string]$location,[string]$thumbprint){
 $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root',$location)
 try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly);return $store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$thumbprint,$false).Count}finally{$store.Dispose()}
}
function Get-AllowedAcl([string]$path){
 $acl=Get-Acl -LiteralPath $path
 $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
 if($rules.Count -eq 0 -or @($rules | Where-Object {$_.AccessControlType -ne 'Allow' -or $_.IdentityReference.Value -notin $allowedSids}).Count -gt 0 -or @($rules | Where-Object {$_.IdentityReference.Value -eq $userSid.Value}).Count -eq 0){throw 'Private test directory/key ACL has unexpected access'}
 return @($rules | ForEach-Object {$_.IdentityReference.Value} | Sort-Object -Unique)
}
function Read-OwnedCert([string]$thumbprint){
 Assert-OwnedPath
 $public=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certPath))
 $constraints=$public.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.19'}
 $san=(& $openssl x509 -in $certPath -noout -ext subjectAltName) -join ' '
 $eku=(& $openssl x509 -in $certPath -noout -ext extendedKeyUsage) -join ' '
 if($public.Subject -ne $expectedSubject -or $constraints.CertificateAuthority -ne $false -or ($san -replace '\s+',' ').Trim() -ne 'X509v3 Subject Alternative Name: IP Address:127.0.0.1' -or $eku -notmatch 'TLS Web Server Authentication' -or $public.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow -or ($public.NotAfter-$public.NotBefore).TotalHours -gt 24.01 -or ($thumbprint -and $public.Thumbprint -ne $thumbprint)){ $public.Dispose();throw 'Unexpected prepared certificate profile/fingerprint/expiry' }
 return $public
}
function Remove-OwnedTls([string]$thumbprint){
 Assert-OwnedPath
 if($thumbprint -notmatch '^[A-Fa-f0-9]{40}$'){throw 'Exact generated thumbprint required for cleanup'}
 if(Test-Path -LiteralPath $certPath){$public=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certPath));try{if($public.Thumbprint -ne $thumbprint -or $public.Subject -ne $expectedSubject){throw 'Unexpected cleanup certificate'}}finally{$public.Dispose()}}
 $issues=[Collections.Generic.List[string]]::new()
 $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','CurrentUser')
 try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite);foreach($entry in @($store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$thumbprint,$false))){$store.Remove($entry)}}catch{$issues.Add('CurrentUser exact-fingerprint removal failed')}finally{$store.Dispose()}
 foreach($path in @($keyPath,$certPath)){try{if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}}catch{$issues.Add('Exact generated test file deletion failed')}}
 $result=[ordered]@{checkedAtUtc=[DateTime]::UtcNow.ToString('o');thumbprint=$thumbprint;currentUserRootCount=(Get-TrustCount 'CurrentUser' $thumbprint);localMachineRootCount=(Get-TrustCount 'LocalMachine' $thumbprint);privateKeyExists=(Test-Path -LiteralPath $keyPath);publicCertExists=(Test-Path -LiteralPath $certPath);cleanupIssues=$issues.ToArray()}
 if($result.currentUserRootCount -ne 0 -or $result.localMachineRootCount -ne 0 -or $result.privateKeyExists -or $result.publicCertExists){$result.cleanupIssues+=@('Independent cleanup conditions are not all satisfied')}
 return $result
}
if($CleanupOnly){
 $metadata=Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
 if($metadata.userSid -ne $userSid.Value -or !$PreparedThumbprint -or $metadata.thumbprint -ne $PreparedThumbprint){throw 'Cleanup metadata/current-user/fingerprint mismatch'}
 $result=Remove-OwnedTls $PreparedThumbprint
 $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRoot 'docs/review/evidence/account-test-tls-cancel-cleanup.json') -Encoding utf8
 $result | ConvertTo-Json -Depth 4
 if($result.cleanupIssues.Count -gt 0){exit 1};exit 0
}
if($PrepareOnly){
 if(!$AttemptId){$AttemptId=[Guid]::NewGuid().ToString('N')}
 if($AttemptId -notmatch '^[a-f0-9]{32}$'){throw 'Valid isolated attempt id required'}
 if((Test-Path -LiteralPath $keyPath) -or (Test-Path -LiteralPath $certPath)){throw 'Existing TLS files must be cleaned by their exact recorded fingerprint first'}
 New-Item -ItemType Directory -Force -Path $certDir | Out-Null
 Assert-OwnedPath
 $acl=[IO.FileSystemAclExtensions]::GetAccessControl([IO.DirectoryInfo]::new($certDir),[Security.AccessControl.AccessControlSections]::Access);$acl.SetAccessRuleProtection($true,$false)
 foreach($rule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){$null=$acl.RemoveAccessRuleSpecific($rule)}
 $inherit=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
 foreach($sid in @($userSid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
 [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($certDir),$acl)
 if(!(Get-Acl -LiteralPath $certDir).AreAccessRulesProtected){throw 'Test directory ACL must be protected before key creation'}
 $directorySids=Get-AllowedAcl $certDir
 $public=$null
 $journal=[ordered]@{attemptId=$AttemptId;phase='preparing';userSid=$userSid.Value;subject=$expectedSubject;thumbprint=$null;privateKeyPath=$keyPath;publicCertificatePath=$certPath}
 $journal | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding utf8
 try{
  & $openssl req -x509 -newkey rsa:2048 -nodes -sha256 -keyout $keyPath -out $certPath -days 1 -subj '/CN=AIWORK-Local-Account-Test-20261008-Restricted' -addext 'subjectAltName=IP:127.0.0.1' -addext 'basicConstraints=critical,CA:FALSE' -addext 'keyUsage=critical,digitalSignature,keyEncipherment' -addext 'extendedKeyUsage=serverAuth' 2>$null
  if($LASTEXITCODE -ne 0){throw 'Synthetic certificate generation failed'}
  $generatedPublic=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certPath))
  try{$journal.thumbprint=$generatedPublic.Thumbprint;$journal.phase='generated';$journal | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding utf8}finally{$generatedPublic.Dispose()}
  $keySids=Get-AllowedAcl $keyPath;$public=Read-OwnedCert ''
  $metadata=[ordered]@{attemptId=$AttemptId;phase='prepared';preparedAtUtc=[DateTime]::UtcNow.ToString('o');thumbprint=$public.Thumbprint;subject=$public.Subject;issuer=$public.Issuer;notBeforeUtc=$public.NotBefore.ToUniversalTime().ToString('o');notAfterUtc=$public.NotAfter.ToUniversalTime().ToString('o');san='IP:127.0.0.1';certificateAuthority=$false;extendedKeyUsage='serverAuth';userSid=$userSid.Value;trustTarget='CurrentUser/Root';directoryAclProtected=$true;directoryAllowedSids=@($directorySids);keyAllowedSids=@($keySids);privateKeyPemEncrypted=$false;privateKeyPath=$keyPath;publicCertificatePath=$certPath;privateKeyContentPrinted=$false;currentUserRootCount=(Get-TrustCount 'CurrentUser' $public.Thumbprint);localMachineRootCount=(Get-TrustCount 'LocalMachine' $public.Thumbprint)}
  $metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding utf8
  $metadata | ConvertTo-Json -Depth 4
 }catch{
  $record=Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  if($record.attemptId -eq $AttemptId -and $record.thumbprint -match '^[A-Fa-f0-9]{40}$'){$cleanup=Remove-OwnedTls $record.thumbprint;$cleanup | ConvertTo-Json -Depth 4}
  else{Write-Output 'Preparation stopped without an exact recorded fingerprint; no broad cleanup was attempted'}
  throw
 }finally{if($public){$public.Dispose()}}
 return
}
$metadata=Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
if(!$PreparedThumbprint -or $metadata.thumbprint -ne $PreparedThumbprint -or $metadata.userSid -ne $userSid.Value){throw 'Prepared certificate/current-user/fingerprint mismatch'}
$null=Get-AllowedAcl $certDir;$null=Get-AllowedAcl $keyPath
$public=Read-OwnedCert $PreparedThumbprint
$store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','CurrentUser')
$browserExit=1;$verified=$false;$added=$false;$started=[DateTime]::UtcNow.ToString('o');$failure=$null;$cleanup=$null
try{
 if((Get-TrustCount 'CurrentUser' $PreparedThumbprint) -ne 0 -or (Get-TrustCount 'LocalMachine' $PreparedThumbprint) -ne 0){throw 'Generated test fingerprint unexpectedly already trusted; do not repeat import'}
 $status=[ordered]@{startedAtUtc=$started;phase='awaiting_current_user_trust';thumbprint=$PreparedThumbprint;subject=$public.Subject;trustTarget='CurrentUser/Root';ignoreHTTPSErrors=$false}
 $status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
 Write-Output ('CurrentUser trust request for '+$public.Subject+'; SHA1 '+$PreparedThumbprint)
 $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite);$store.Add($public);$added=$true
 $chain=[Security.Cryptography.X509Certificates.X509Chain]::new()
 try{$chain.ChainPolicy.VerificationFlags=[Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag;$chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::Online;$chain.ChainPolicy.RevocationFlag=[Security.Cryptography.X509Certificates.X509RevocationFlag]::ExcludeRoot;$chain.ChainPolicy.DisableCertificateDownloads=$true;$chain.ChainPolicy.UrlRetrievalTimeout=[TimeSpan]::FromSeconds(2);$chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'));$verified=$chain.Build($public);if(!$verified){throw 'Normal platform server certificate verification failed'}}finally{$chain.Dispose()}
 $status.phase='trusted_browser_tests';$status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
 Write-Output ('Verified temporary CurrentUser certificate: '+$PreparedThumbprint)
 & node (Join-Path $PSScriptRoot 'run-account-browser-tests.mjs')
 $browserExit=$LASTEXITCODE
}catch{$failure=$_.Exception.Message;Write-Output ('Scoped TLS run stopped: '+$failure)}finally{
 $store.Dispose();$public.Dispose();$cleanup=Remove-OwnedTls $PreparedThumbprint
 $evidence=[ordered]@{startedAtUtc=$started;finishedAtUtc=[DateTime]::UtcNow.ToString('o');thumbprint=$PreparedThumbprint;subject=$metadata.subject;host='127.0.0.1';certificateAuthority=$false;trustTarget='CurrentUser/Root';temporaryAdded=$added;platformChainVerified=$verified;ignoreHTTPSErrors=$false;browserExit=$browserExit;failure=$failure;preparation=$metadata;cleanup=$cleanup}
 $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding utf8
 $evidence | ConvertTo-Json -Depth 6
 $status=[ordered]@{finishedAtUtc=[DateTime]::UtcNow.ToString('o');phase='finished_and_cleanup_checked';thumbprint=$PreparedThumbprint;browserExit=$browserExit;cleanup=$cleanup};$status | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statusPath -Encoding utf8
}
if($cleanup.cleanupIssues.Count -gt 0){throw 'Exact test certificate/key cleanup incomplete'}
exit $browserExit
