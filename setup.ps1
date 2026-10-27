$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Ask-Value([string]$Label, [string]$Default) {
    $answer = Read-Host "$Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}

function Ask-Secret([string]$Label, [string]$Previous) {
    $secret = Read-Host "$Label（不回显；留空保留原值）" -AsSecureString
    if ($secret.Length -eq 0) { return $Previous }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$configPath = Join-Path $PSScriptRoot 'config.local.json'
if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
}

Write-Host 'QQ 反骨机器人：本机配置' -ForegroundColor Cyan
Write-Host '先让 NapCat 登录机器人小号，并启用“正向 WebSocket 服务器 / Universal”。'
Write-Host '程序按本地开关启动，群友@或引用可触发，只有控制人能暂停和修改火力。'
$config.selfId = Ask-Value '机器人小号 QQ' $config.selfId
$config.groups[0].groupId = Ask-Value 'QQ群号' $config.groups[0].groupId
$config.groups[0].targetId = Ask-Value '对方机器人 QQ' $config.groups[0].targetId
$config.onebot.url = Ask-Value 'NapCat 正向 WebSocket 地址' $config.onebot.url
$config.onebot.token = Ask-Secret 'OneBot Token（不是 WebUI 密码）' $config.onebot.token
$config.llm.baseUrl = Ask-Value '词元跳动 Base URL' $config.llm.baseUrl
$config.llm.model = Ask-Value '模型 ID（以你的词元跳动账号可用列表为准）' $config.llm.model
$config.llm.apiKey = Ask-Secret '词元跳动 API Key' $config.llm.apiKey
if ([string]::IsNullOrWhiteSpace($config.llm.apiKey)) { throw 'API Key 不能为空，尚未保存。' }
$config.ownerId = Ask-Value '唯一控制人的 QQ 号（群主/管理员也不能代替）' $config.ownerId
if ($config.ownerId -notmatch '^[1-9]\d{4,15}$' -or $config.ownerId -eq $config.groups[0].targetId) { throw '控制 QQ 号格式不正确，或与目标机器人相同，尚未保存。' }
if ($config.selfId -notmatch '^[1-9]\d{4,15}$' -or $config.groups[0].groupId -notmatch '^[1-9]\d{4,15}$' -or $config.groups[0].targetId -notmatch '^[1-9]\d{4,15}$') { throw 'QQ 号或群号格式不正确，尚未保存。' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 12), $utf8)
Write-Host '已保存到 config.local.json。密钥只保存在本机这个文件里，请勿把它发送给别人或提交到 Git。' -ForegroundColor Green
Write-Host '现在可双击“预览回复.cmd”检查模型，再双击“启动机器人.cmd”连接 QQ。'
