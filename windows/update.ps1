param([Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName Microsoft.VisualBasic
$installPath=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$appPath=Join-Path $installPath 'app'
if(!(Test-Path -LiteralPath (Join-Path $appPath 'index.mjs'))){throw 'Expected an installed app folder.'}
if((Get-Item -LiteralPath $installPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Install root cannot be a link.'}
if((Get-Item -LiteralPath $appPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'App folder cannot be a link.'}
$mutex=New-Object Threading.Mutex($false,'Local\MaodieQQBotManagement')
$held=$false;$switched=$false;$hadProcess=$false
$stage=Join-Path $installPath ('update-stage-'+[Guid]::NewGuid().ToString('N'))
$old=Join-Path $installPath ('old-app-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
$entry=Join-Path $appPath 'index.mjs'
$pidFile=Join-Path $env:LOCALAPPDATA 'QQFanGu\bot.pid'
try {
 $held=$mutex.WaitOne(15000);if(!$held){throw 'Another update or start is running.'}
 New-Item -ItemType Directory -Path $stage | Out-Null
 $zip=[IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Package).Path)
 try {
  $total=0
  foreach($item in $zip.Entries){
   $name=$item.FullName.Replace('/', '\')
   $path=[IO.Path]::GetFullPath((Join-Path $stage $name))
   if(!$path.StartsWith($stage+'\',[StringComparison]::OrdinalIgnoreCase) -or $name.Contains(':') -or $item.ExternalAttributes -band 0x400){throw 'Unsafe archive entry.'}
   $total+=$item.Length;if($total -gt 256MB){throw 'Update is larger than 256 MB.'}
   if($name.EndsWith('\')){New-Item -ItemType Directory -Path $path -Force | Out-Null;continue}
   New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force | Out-Null
   [IO.Compression.ZipFileExtensions]::ExtractToFile($item,$path,$false)
  }
 } finally {$zip.Dispose()}
 $incoming=Join-Path $stage 'app'
 foreach($name in @('index.mjs','package.json','node_modules\ws\wrapper.mjs','start-services.ps1','windows\manage.ps1','windows\status.mjs','windows\update.ps1')){if(!(Test-Path -LiteralPath (Join-Path $incoming $name))){throw 'Incomplete update package.'}}
 if(Test-Path -LiteralPath (Join-Path $incoming 'config.local.json')){throw 'Update package contains a personal configuration.'}
 $newVersion=[Version]((Get-Content -LiteralPath (Join-Path $incoming 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version)
 $oldVersion=[Version]((Get-Content -LiteralPath (Join-Path $appPath 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version)
 if($newVersion -le $oldVersion){throw 'Update version must be newer than the installed version.'}
 Copy-Item -LiteralPath (Join-Path $appPath 'config.local.json') -Destination (Join-Path $incoming 'config.local.json')
 # Local sticker library is never replaced by a public code update.
 $stickerPath=Join-Path $appPath 'assets\stickers'
 if(Test-Path -LiteralPath $stickerPath){
  $dest=Join-Path $incoming 'assets\stickers'
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Get-ChildItem -LiteralPath $stickerPath -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $dest -Force}
 }
 & node (Join-Path $incoming 'index.mjs') --check
 if($LASTEXITCODE -ne 0){throw 'New configuration check failed.'}
 if(Test-Path -LiteralPath $pidFile){
  $botId=[int](Get-Content -LiteralPath $pidFile -Raw)
  $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$botId"
  if($candidate){if(!$candidate.CommandLine -or !$candidate.CommandLine.Contains($entry)){throw 'Process ownership mismatch.'};$hadProcess=$true;Stop-Process -Id $botId;Wait-Process -Id $botId -Timeout 10 -ErrorAction SilentlyContinue}
 }
 if([IO.Path]::GetFullPath($appPath) -ne (Join-Path $installPath 'app') -or [IO.Path]::GetFullPath($old).Substring(0,$installPath.Length+1) -ne ($installPath+'\')){throw 'Move target escaped installation.'}
 Move-Item -LiteralPath $appPath -Destination $old
 try {Move-Item -LiteralPath $incoming -Destination $appPath;$switched=$true}
 catch {Move-Item -LiteralPath $old -Destination $appPath;throw}
 if($hadProcess){
  & (Join-Path $appPath 'start-services.ps1')
  Start-Sleep -Seconds 3
  $newId=[int](Get-Content -LiteralPath $pidFile -Raw)
  if(!(Get-Process -Id $newId -ErrorAction SilentlyContinue)){throw 'New listener exited during startup.'}
  & node (Join-Path $appPath 'windows\status.mjs')
  if($LASTEXITCODE -ne 0){throw 'QQ connection verification failed.'}
 }
 # Only recycle the exact former app directory after successful verification.
 if((Split-Path $old -Parent) -ne $installPath -or !(Split-Path $old -Leaf).StartsWith('old-app-')){throw 'Recycle target escaped installation.'}
 [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($old,'OnlyErrorDialogs','SendToRecycleBin','ThrowException')
 # Recycle obsolete release ZIPs only within this installation's known caches.
 $cacheFolders=@($installPath,(Join-Path $installPath 'outputs'),(Join-Path $appPath 'dist'))
 foreach($folder in (Get-ChildItem -LiteralPath $installPath -Directory)){
  if(!($folder.Attributes -band [IO.FileAttributes]::ReparsePoint) -and (Test-Path -LiteralPath (Join-Path $folder.FullName '.git'))){$cacheFolders+=(Join-Path $folder.FullName 'dist')}
 }
 foreach($cache in $cacheFolders){
  if(!(Test-Path -LiteralPath $cache)){continue}
  if((Get-Item -LiteralPath $cache).Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
  foreach($archive in (Get-ChildItem -LiteralPath $cache -File -Filter 'maodie-windows-*.zip')){
   if($archive.Name -match '^maodie-windows-(\d+\.\d+\.\d+)\.zip$' -and [Version]$Matches[1] -lt $newVersion){
    $archivePath=[IO.Path]::GetFullPath($archive.FullName)
    if(!$archivePath.StartsWith($installPath+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Archive cleanup escaped installation.'}
    try{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($archivePath,'OnlyErrorDialogs','SendToRecycleBin','ThrowException')}
    catch{Write-Warning 'Update succeeded; an old package could not be recycled.'}
   }
  }
 }
 Write-Output "Update completed: $newVersion. Previous app sent to Recycle Bin."
} catch {
 $failure=$_
 if($switched -and (Test-Path -LiteralPath $old)){
  if(Test-Path -LiteralPath $pidFile){$currentId=[int](Get-Content -LiteralPath $pidFile -Raw);$running=Get-CimInstance Win32_Process -Filter "ProcessId=$currentId";if($running -and $running.CommandLine -and $running.CommandLine.Contains($entry)){Stop-Process -Id $currentId;Wait-Process -Id $currentId -Timeout 10 -ErrorAction SilentlyContinue}}
  $failed=Join-Path $installPath ('failed-update-'+[Guid]::NewGuid().ToString('N'))
  if((Split-Path $failed -Parent) -ne $installPath){throw 'Recovery path escaped installation.'}
  Move-Item -LiteralPath $appPath -Destination $failed
  Move-Item -LiteralPath $old -Destination $appPath
  if($hadProcess){& (Join-Path $appPath 'start-services.ps1')}
  Write-Output 'Old version restored; failed update retained for diagnosis.'
 }
 throw $failure
} finally {
 if($held){$mutex.ReleaseMutex()};$mutex.Dispose()
 if((Test-Path -LiteralPath $stage) -and (Split-Path $stage -Parent) -eq $installPath -and (Split-Path $stage -Leaf).StartsWith('update-stage-')){
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($stage,'OnlyErrorDialogs','SendToRecycleBin','ThrowException')
 }
}
