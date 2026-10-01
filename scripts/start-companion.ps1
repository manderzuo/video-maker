param([string]$StudioOrigin='http://127.0.0.1:4188',[int]$Port=4181)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(-not(Test-Path -LiteralPath (Join-Path $projectRoot 'companion/dist/main.mjs'))){throw '缺少已构建的本机协作入口。'}
$savedOrigin=$env:STUDIO_ORIGIN
$savedPort=$env:STUDIO_AGENT_PORT
Push-Location $projectRoot
try {
 if(Test-Path -LiteralPath './scripts/use-local-toolchain.ps1'){. ./scripts/use-local-toolchain.ps1}
 $env:STUDIO_ORIGIN=$StudioOrigin
 $env:STUDIO_AGENT_PORT=[string]$Port
 & node ./companion/dist/main.mjs
 if($LASTEXITCODE -ne 0){throw '本机协作启动失败。'}
} finally {$env:STUDIO_ORIGIN=$savedOrigin;$env:STUDIO_AGENT_PORT=$savedPort;Pop-Location}
