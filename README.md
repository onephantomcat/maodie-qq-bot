# 耄耋 QQ 机器人

一个运行在本机的猫系 QQ 群聊机器人。通过 OneBot v11 接入 QQ，用 OpenAI 兼容接口生成回复；支持多群独立开关、引用上下文、私人音效、静态/GIF 表情、本地热梗和手动 B站学习。

当前版本：**1.13.0**。原创程序代码采用 MIT 许可。

## 可以做什么

- 群友 @ 或引用机器人即可互动，普通群聊按概率接话。
- 火力 0 为温顺猫系语气，1–3 逐步加强互怼。停止话题后不继续追着人回复。
- 每个群独立保存暂停、火力、互动和表情开关；仅配置的控制人可以修改。
- 多人 @ 按群排队，保留每人的最近上下文，不把其他群的引用混入对话。
- 音效按指令点播；表情从本地静态图和 GIF 共用池选择，正文和表情分两条发送。
- 本地谐音和热梗匹配不调用模型。B站学习由控制人私聊手动触发，保存来源和摘要。
- 控制人私聊查询调用量、token 和估算费用。历史实付与新增估算分开显示。

## 本地启动

需要 Node.js **22 或以上**、已登录的 QQ 和支持 OneBot v11 正向 WebSocket 的服务。当前 Windows 启动脚本适配 NapCat Shell；QQ 和 NapCat 分别安装，不包含在代码仓库中。

```powershell
npm ci
Copy-Item config.example.json config.local.json
# 编辑 config.local.json，填写自己的账号、群、OneBot 和模型参数
node index.mjs --check
node index.mjs
```

`--check` 只检查配置格式，不验证 QQ 连通性或 API 额度。普通启动会连接 QQ；首次配置建议先关闭 `enabledOnStart`，确认群号和控制账号后手动开启。

模型接口需要提供 `/chat/completions`，支持非流式响应。默认示例使用词元跳动的 Flash 模型，实际可用模型与价格以接口账户为准。API Key 写进 `config.local.json`，也可由 `DSAPI_API_KEY` 环境变量覆盖；OneBot token 可由 `ONEBOT_TOKEN` 覆盖。

### Windows EXE

下载 Releases 的 `maodie-windows-版本号.zip`，**完整解压**后双击 `耄耋机器人.exe`。启动器采用耄耋主题：头像侧栏、QQ连接提示、每群独立状态卡和带时间的运行记录。提供启动、停止服务、刷新状态、配置、扫码登录、安装更新和打开日志；窗口打开时每30秒只读刷新状态，不调用模型。关闭启动器窗口不会停止机器人。

这是原生 Windows 启动器，程序代码放在同级 `app` 文件夹；不要只复制 EXE。电脑仍需安装 Node.js 和 QQ。脚本默认 QQ 位于 `C:\Program Files\Tencent\QQNT\QQ.exe`，独立 NapCat Shell 位于 `%LOCALAPPDATA%\QQFanGu\napcat`，OneBot 地址由配置文件决定。使用其他部署方式时可直接 `node index.mjs`。

从源码编译启动器（Windows .NET Framework 自带编译器）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/build.ps1
# dist/耄耋机器人.exe；放到包含 app/ 的安装目录中使用
```

本机自定义图标可在编译时传入 `-IconPath C:\Icons\cat.ico`。EXE 内嵌图标同时用于文件、窗口标题栏和任务栏；头像文件不需要随程序分发。

### 更新与回收

在启动器中点“安装更新”，选择本项目的新版发布 ZIP。也可以运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File app/windows/update.ps1 `
  -Package C:\Downloads\maodie-windows-1.13.0.zip -InstallRoot C:\Bots\Maodie
```

更新器拒绝同版本、降级、路径越界和缺文件的包。先准备新版，复制本机配置和本地表情，再检查配置；随后替换程序。原来运行中的服务会启动新版并检查 QQ 连接，成功后将旧 `app` 目录送进 Windows 回收站。启动或连接检查失败则恢复旧版。原来停止的服务保持停止，此时只做配置检查。

更新成功时，也会回收安装目录、outputs 和本项目构建缓存中的旧版本发布 ZIP，保留当前版本包。

本地开关、学习记录、用量和 QQ 登录数据不在版本目录中，不随代码更新清除。更新包不会覆盖私人音效。失败包会保留以便检查。回收站支持恢复，**占用空间要在清空回收站后才会真正释放**；更新器不会自动清空回收站。

更新会运行包里的代码，请使用自己构建或本仓库发布的包。

## 配置

示例 QQ 号为占位值，请全部替换。

| 字段 | 说明 |
| --- | --- |
| `selfId` | 机器人 QQ |
| `ownerId` | 唯一控制人 QQ，群管理员身份不代替此权限 |
| `groups` | 允许回复的群及目标机器人；每群独立 |
| `onebot.url` / `token` | 正向 WebSocket 地址及访问 token；不是 WebUI 密码 |
| `llm.baseUrl` / `apiKey` / `model` | 模型服务设置 |
| `behavior.spice` | 默认火力 0–3；已保存的群开关优先 |
| `behavior.wildReplyProbability` | 普通群聊接话概率，默认 0.2 |
| `media.stickerProbability` | 自动附图概率，默认 0.4；温和回复不自动附攻击性表情 |
| `media.audioDirectory` | 私人音效库目录 |
| `media.stickerDirectory` | 本地表情库目录，默认 `assets/stickers` |

默认关闭模型思考，每轮只生成一次，最多 320 输出 token、4 轮历史、120 字回复。主动 @ 不受普通接话概率影响。调整概率不会改变群开关或强制切换火力。

## 指令

群友输入 `/菜单` 查看当前可用指令，每条指令独占一行。

| 群友可用 | 用途 |
| --- | --- |
| `/菜单`、`/状态` | 查看帮助和当前群状态 |
| `/随机音效`、`/音效列表`、`/音效 1` | 本地音效点播 |
| `/随机表情`、`/表情列表`、`/表情 M01` | 静态/GIF 表情点播 |

| 仅控制人 | 用途 |
| --- | --- |
| `/开启`、`/暂停` | 当前群总开关；暂停回复“我歇了喵” |
| `/清空` | 清空当前群会话上下文 |
| `/火力 0` 到 `/火力 3` | 当前群语气 |
| `@耄耋 出来`、`/乱咬人停止` | 普通群聊随机接话开关 |
| `/自动表情开启`、`/自动表情关闭` | 自动表情开关 |

控制人私聊 `/菜单` 还可查看 `/用量`、`/今日用量`、`/费用`、`/今日费用`、`/学习耄耋`、`/学习状态`、`/学习笔记`、`/停止学习`、`/清空学习`。这些入口不出现在群菜单中。

B站学习只读取可公开访问的支持页面和字幕；受限或失败会保留已有笔记。仅有简介时会标记来源类型，不代表完整观看视频或训练模型。

## 自备媒体

仓库和公开发布包**不包含私人音效、第三方表情图片、聊天记录和已学习的个人数据库**。本机已有素材可以继续使用；新安装需要自行添加有权使用的素材。

`assets/stickers/manifest.json` 是数组，例如：

```json
[{"id":"M01","file":"M01.gif","label":"猫猫","enabled":true,"frames":12,"weight":1}]
```

图片和清单放在同一目录，支持 JPG、PNG、GIF、WebP，单文件上限 8 MB。GIF 保留原始字节。QQ 客户端对显示尺寸和动画播放的支持可能不同。

音效目录保存 `library.json` 和与 `id` 同名的 MP3，例如：

```json
{"custom":[{"id":"u_cat","label":"猫叫","enabled":true,"weight":1,"delivery":"voice","seconds":2}]}
```

`delivery: "voice"` 作为 QQ 语音发送，`"file"` 作为文件发送。程序不裁剪原音频，不随聊天回复自动播放。

## 数据与费用

- API Key、QQ 号和群配置保存在本机 `config.local.json`，Git 已忽略该文件。
- 群开关、学习笔记、用量和日志存放在 `%LOCALAPPDATA%\QQFanGu`；其中 NapCat 目录包含 QQ 服务数据。
- 对话历史在内存中，退出后清除。被触发的消息和有限上下文会发送到配置的模型服务。
- 本地媒体、菜单和统计查询不调用模型；对话与手动学习摘要可能产生费用。
- 用量缺失和未知模型价格单独提示。当前估价只是程序内设定，不能代替服务商账单。
- 暂停会取消未提交的回复，已发送的消息无法撤回。不要把第三方聊天或私人素材提交到公开仓库。

## 开发和测试

```powershell
npm ci
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File windows/test-update.ps1
python tools/package-release.py
```

核心逻辑有 96 项本地测试，覆盖权限、暂停、排队、引用、媒体、统计和学习。更新器另有隔离目录测试，验证保留本机数据、失败恢复以及回收旧版。这些测试不向 QQ 群发送消息，也不调用付费模型。

```text
index.mjs        启动和运行时接线
src/             对话、OneBot、媒体、知识、学习和统计
assets/          本地热梗及谐音数据；媒体由用户自备
test/            Node.js 测试
windows/         EXE 源码、编译和更新脚本
tools/           公开发布包构建脚本
```

Node.js 依赖 `ws` 使用 MIT 许可；QQ、NapCat、模型服务和自行添加的媒体各自遵循原项目/服务的许可。MIT 许可仅覆盖本仓库原创代码，不赋予第三方素材再分发权。

欢迎通过 Issue 反馈可复现的问题或提交 PR。请描述触发方式、预期、实际结果与版本，并先去除日志中的密钥、QQ 号和私人内容。
