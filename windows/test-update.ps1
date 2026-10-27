$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName Microsoft.VisualBasic
$sourceRoot=Split-Path $PSScriptRoot -Parent
$originalData=$env:LOCALAPPDATA
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('maodie-update-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
function Save-Text($Path,$Text){New-Item -ItemType Directory -Path (Split-Path $Path -Parent) -Force | Out-Null;[IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))}
function Assert-That($Condition,$Message){if(!$Condition){throw $Message}}
function Run-Update($Install,$Zip,$ExpectSuccess){
 $logPath=Join-Path $testRoot 'last-run.log'
 $p=Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $sourceRoot 'windows\update.ps1')+'"'),'-InstallRoot',('"'+$Install+'"'),'-Package',('"'+$Zip+'"') -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError ($logPath+'.err') -PassThru
 $null=$p.Handle
 $p.WaitForExit()
 if($ExpectSuccess -and $p.ExitCode -ne 0){Get-Content $logPath;Get-Content ($logPath+'.err');throw 'Expected successful update'}
 if(!$ExpectSuccess -and $p.ExitCode -eq 0){throw 'Expected refused update'}
}
function Make-App($Path,$Version){
 New-Item -ItemType Directory -Path $Path -Force | Out-Null
 foreach($name in @('src','node_modules','windows')){Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $Path -Recurse}
 New-Item -ItemType Directory -Path (Join-Path $Path 'assets\stickers') -Force | Out-Null
 foreach($name in @('memes.json','slang.json')){Copy-Item -LiteralPath (Join-Path $sourceRoot ('assets\'+$name)) -Destination (Join-Path $Path 'assets')}
 Save-Text (Join-Path $Path 'assets\stickers\manifest.json') '[]'
 foreach($name in @('index.mjs','package.json','persona.txt','start-services.ps1')){Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $Path}
 $p=Get-Content -LiteralPath (Join-Path $Path 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json;$p.version=$Version;Save-Text (Join-Path $Path 'package.json') ($p|ConvertTo-Json -Depth 12)
}
try{
 $env:LOCALAPPDATA=Join-Path $testRoot 'private-data'
 New-Item -ItemType Directory -Path (Join-Path $env:LOCALAPPDATA 'QQFanGu') -Force | Out-Null
 $statePath=Join-Path $env:LOCALAPPDATA 'QQFanGu\control-state.json';Save-Text $statePath '{"sentinel":"keep-switches"}'
 $install=Join-Path $testRoot 'install';$oldApp=Join-Path $install 'app';Make-App $oldApp '1.0.0'
 $config=Get-Content -LiteralPath (Join-Path $sourceRoot 'config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json;$config.llm.apiKey='fake-update-test-key';$config.enabledOnStart=$false
 $configText=$config|ConvertTo-Json -Depth 12;Save-Text (Join-Path $oldApp 'config.local.json') $configText
 Save-Text (Join-Path $oldApp 'assets\stickers\local-only.png') 'private-test-media'
 $packageFolder=Join-Path $testRoot 'package';$incoming=Join-Path $packageFolder 'app';Make-App $incoming '1.1.0'
 $zipPath=Join-Path $testRoot 'update.zip';[IO.Compression.ZipFile]::CreateFromDirectory($packageFolder,$zipPath)
 Run-Update $install $zipPath $true
 Assert-That ((Get-Content (Join-Path $oldApp 'package.json') -Raw|ConvertFrom-Json).version -eq '1.1.0') 'New version not installed'
 Assert-That ([IO.File]::ReadAllText((Join-Path $oldApp 'config.local.json')) -eq $configText) 'Local config changed'
 Assert-That ((Get-Content (Join-Path $oldApp 'assets\stickers\local-only.png') -Raw) -eq 'private-test-media') 'Local media lost'
 Assert-That ((Get-Content $statePath -Raw) -eq '{"sentinel":"keep-switches"}') 'Saved controls changed'
 Assert-That (@(Get-ChildItem $install -Directory -Filter 'old-app-*').Count -eq 0) 'Old app not recycled'
 Run-Update $install $zipPath $false
 Assert-That ((Get-Content (Join-Path $oldApp 'package.json') -Raw|ConvertFrom-Json).version -eq '1.1.0') 'Same-version refusal changed app'
 $badZip=Join-Path $testRoot 'escape.zip';$z=[IO.Compression.ZipFile]::Open($badZip,'Create');try{$e=$z.CreateEntry('../escaped.txt');$writer=New-Object IO.StreamWriter($e.Open());$writer.Write('no');$writer.Dispose()}finally{$z.Dispose()}
 Run-Update $install $badZip $false
 Assert-That (!(Test-Path (Join-Path $install 'escaped.txt'))) 'ZIP traversal was allowed'
 # Force a running-service connection-check failure without any QQ traffic.
 $rollbackInstall=Join-Path $testRoot 'rollback';$rollbackApp=Join-Path $rollbackInstall 'app';Make-App $rollbackApp '1.0.0'
 Save-Text (Join-Path $rollbackApp 'config.local.json') $configText
 $fakeJs="if(!process.argv.includes('--check'))setInterval(()=>{},1000);"
 Save-Text (Join-Path $rollbackApp 'index.mjs') $fakeJs
 $fakeStart=@'
$entry=Join-Path $PSScriptRoot 'index.mjs'
$p=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'"') -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'QQFanGu\bot.pid'),[string]$p.Id)
'@
 Save-Text (Join-Path $rollbackApp 'start-services.ps1') $fakeStart
 $rollbackPackage=Join-Path $testRoot 'rollback-package';$rollbackIncoming=Join-Path $rollbackPackage 'app';Make-App $rollbackIncoming '1.2.0'
 Save-Text (Join-Path $rollbackIncoming 'index.mjs') $fakeJs
 Save-Text (Join-Path $rollbackIncoming 'start-services.ps1') $fakeStart
 Save-Text (Join-Path $rollbackIncoming 'windows\status.mjs') 'process.exitCode=1;'
 $rollbackZip=Join-Path $testRoot 'rollback.zip';[IO.Compression.ZipFile]::CreateFromDirectory($rollbackPackage,$rollbackZip)
 & (Join-Path $rollbackApp 'start-services.ps1')
 Run-Update $rollbackInstall $rollbackZip $false
 Assert-That ((Get-Content (Join-Path $rollbackApp 'package.json') -Raw|ConvertFrom-Json).version -eq '1.0.0') 'Failure did not restore old version'
 $restoredId=[int](Get-Content (Join-Path $env:LOCALAPPDATA 'QQFanGu\bot.pid') -Raw)
 Assert-That ($null -ne (Get-Process -Id $restoredId -ErrorAction SilentlyContinue)) 'Old listener did not restart'
 Write-Output 'PASS: upgrade; config/media/state preservation; recycling; same-version refusal; ZIP traversal rejection; running-service rollback. No QQ messages or paid API calls.'
} finally {
 $testPid=Join-Path $testRoot 'private-data\QQFanGu\bot.pid'
 if(Test-Path -LiteralPath $testPid){$testId=[int](Get-Content -LiteralPath $testPid -Raw);$p=Get-CimInstance Win32_Process -Filter "ProcessId=$testId";if($p -and $p.CommandLine -and $p.CommandLine.Contains($testRoot)){Stop-Process -Id $testId;Wait-Process -Id $testId -Timeout 10 -ErrorAction SilentlyContinue}}
 $env:LOCALAPPDATA=$originalData
 if((Split-Path $testRoot -Parent) -eq [IO.Path]::GetTempPath().TrimEnd('\') -and (Split-Path $testRoot -Leaf).StartsWith('maodie-update-test-')){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($testRoot,'OnlyErrorDialogs','SendToRecycleBin','ThrowException')}
}
