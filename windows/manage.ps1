param([ValidateSet('start','stop','status','check')][string]$Action='start')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$appRoot=Split-Path $PSScriptRoot -Parent
$serviceRoot=Join-Path $env:LOCALAPPDATA 'QQFanGu'
$entryPath=Join-Path $appRoot 'index.mjs'
$mutex=New-Object Threading.Mutex($false,'Local\MaodieQQBotManagement')
$held=$false
try {
 $held=$mutex.WaitOne(15000)
 if(!$held){throw 'Another start or update is in progress.'}
 if($Action -eq 'start') { & (Join-Path $appRoot 'start-services.ps1') }
 elseif($Action -eq 'check') { & node $entryPath --check; if($LASTEXITCODE -ne 0){throw 'Config check failed.'} }
 elseif($Action -eq 'status') {
  $statusId=[int](Get-Content -LiteralPath (Join-Path $serviceRoot 'bot.pid') -Raw)
  $statusProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$statusId"
  if(!$statusProcess -or !$statusProcess.CommandLine -or !$statusProcess.CommandLine.Contains($entryPath)){throw 'Bot listener is not running.'}
  Write-Output 'Bot listener is running.'
  & node (Join-Path $PSScriptRoot 'status.mjs'); if($LASTEXITCODE -ne 0){throw 'Status check failed.'} }
 else {
  $pidFile=Join-Path $serviceRoot 'bot.pid'
  if(Test-Path -LiteralPath $pidFile){
   $botId=[int](Get-Content -LiteralPath $pidFile -Raw)
   $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$botId"
   if($candidate){
    if(!$candidate.CommandLine -or !$candidate.CommandLine.Contains($entryPath)){throw 'Process ownership mismatch; no process stopped.'}
    Stop-Process -Id $botId
    Wait-Process -Id $botId -Timeout 10 -ErrorAction SilentlyContinue
   }
  }
  Write-Output 'Bot listener stopped. QQ login and saved group switches were preserved.'
 }
} finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
