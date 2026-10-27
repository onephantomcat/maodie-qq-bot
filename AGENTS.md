# 项目维护

- 本机配置、音效、表情文件、聊天、学习笔记、用量和账单不提交到 Git 或公开发布包。
- 修改后运行 npm test。Windows 更新脚本变更后运行 windows/test-update.ps1。
- 发布时同步 package.json 与 package-lock.json 的版本，并更新 README。
- 通过 tools/package-release.py 构建公开包，再使用 windows/update.ps1 升级本机安装；成功后旧 app 送回收站，不永久删除。失败恢复旧版。不要另留本地旧版本 ZIP 或完整副本，已存在且属于本项目的旧包送回收站。
- 本机 AppData 中的群开关、QQ 登录、学习和统计不随代码升级重置；不重启或改动其他 QQ 程序。
- 用户明确指定的群和控制权限优先，不额外添加群或更改火力。
