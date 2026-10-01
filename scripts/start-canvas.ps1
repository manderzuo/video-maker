param([int]$Port=4188,[string]$Runtime)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(-not(Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))){throw '缺少离线构建 dist/index.html，请先准备发行包。'}
Push-Location $projectRoot
try {
 if(Test-Path -LiteralPath './scripts/use-local-toolchain.ps1'){. ./scripts/use-local-toolchain.ps1}
 $nodeVersion=& node -p 'process.versions.node'
 if($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^22\.' -or [version]$nodeVersion -lt [version]'22.18.0'){throw '启动需要 Node 22.18 或更高的 22.x 版本。'}
 $serverArguments=@('./scripts/serve-local.mjs','--root','dist','--port',[string]$Port)
 if($Runtime){$serverArguments+=@('--runtime',$Runtime)}
 & node @serverArguments
 if($LASTEXITCODE -ne 0){throw '本地启动失败；不会自动开放其他网卡或改端口。'}
} finally {Pop-Location}
