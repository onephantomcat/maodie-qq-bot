param([string]$Destination='',[string]$IconPath='')
$ErrorActionPreference='Stop'
if(!$Destination){$Destination=Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Windows .NET Framework C# compiler is required.'}
$compilerArguments=@('/nologo','/target:winexe','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',('/out:'+(Join-Path $Destination '耄耋机器人.exe')))
if($IconPath){
    if(!(Test-Path -LiteralPath $IconPath -PathType Leaf)){throw 'The selected icon file does not exist.'}
    $compilerArguments+=('/win32icon:'+(Resolve-Path -LiteralPath $IconPath).Path)
}
$compilerArguments+=(Join-Path $PSScriptRoot 'Launcher.cs')
& $compiler @compilerArguments
if($LASTEXITCODE -ne 0){throw 'Launcher build failed.'}
Write-Output 'Built Windows launcher.'
