$ErrorActionPreference = 'Stop'
$serviceRoot = Join-Path $env:LOCALAPPDATA 'QQFanGu'
$runtime = Join-Path $serviceRoot 'napcat'
$logRoot = Join-Path $serviceRoot 'logs'
$botEntry = Join-Path $PSScriptRoot 'index.mjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$bootPath = Join-Path $runtime 'NapCatWinBootMain.exe'
if (!(Test-Path -LiteralPath $bootPath)) { throw 'Independent NapCat runtime is not installed.' }
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.local.json'))) { throw 'Local bot configuration is missing.' }
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.local.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Find-OwnedProcess([string]$PidFile, [string]$RequiredPath) {
    if (!(Test-Path -LiteralPath $PidFile)) { return $null }
    $storedId = 0
    if (![int]::TryParse(([IO.File]::ReadAllText($PidFile)).Trim(), [ref]$storedId)) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$storedId" -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.CommandLine -and $candidate.CommandLine.Contains($RequiredPath)) { return $candidate }
    return $null
}

$qqPidFile = Join-Path $serviceRoot 'napcat.pid'
$qqProcess = Find-OwnedProcess $qqPidFile $bootPath
if (!$qqProcess) {
    $qqPath = 'C:\Program Files\Tencent\QQNT\QQ.exe'
    $hook = Join-Path $runtime 'NapCatWinBootHook.dll'
    $env:NAPCAT_PATCH_PACKAGE = Join-Path $runtime 'qqnt.json'
    $env:NAPCAT_LOAD_PATH = Join-Path $runtime 'loadNapCat.js'
    $env:NAPCAT_INJECT_PATH = $hook
    $env:NAPCAT_LAUNCHER_PATH = $bootPath
    $env:NAPCAT_MAIN_PATH = Join-Path $runtime 'napcat.mjs'
    $qqProcess = Start-Process -FilePath $bootPath -ArgumentList ('"' + $qqPath + '"'), ('"' + $hook + '"'), $config.selfId -WorkingDirectory $runtime -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'napcat.log') -RedirectStandardError (Join-Path $logRoot 'napcat.err') -PassThru
    [IO.File]::WriteAllText($qqPidFile, [string]$qqProcess.Id)
    Write-Output 'Started independent QQ login service.'
} else { Write-Output 'Independent QQ login service is already running.' }

$botPidFile = Join-Path $serviceRoot 'bot.pid'
$botProcess = Find-OwnedProcess $botPidFile $botEntry
if (!$botProcess) {
    $botProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $botEntry + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'bot.log') -RedirectStandardError (Join-Path $logRoot 'bot.err') -PassThru
    [IO.File]::WriteAllText($botPidFile, [string]$botProcess.Id)
    Write-Output 'Started bot listener using the local enable/interaction settings.'
} else { Write-Output 'Bot listener is already running.' }
