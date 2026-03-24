# 变更记录

## 0.2.1 - 2026-03-24

- 更新 `README.md`，调整插件中文名称、滴答清单（Dida365）对外表述，以及 MCP 能力分类表格

## 0.2.0 - 2026-03-24

- 默认按 manifest 全量注册官方 Dida365 MCP 工具
- 新增工具 allowlist / denylist
- 新增单进程共享桥接连接，避免重复建连
- 新增空闲自动断开机制，默认 600 秒
- 增加 `serverUrl` 安全校验，只允许 HTTPS 远端或本机回环 HTTP
- 增加日志 token 脱敏
- 增加配置、manifest、桥接、注册层测试
- 补充中文 `README.md`、`SECURITY.md`、`CONTRIBUTING.md`
- 增加 GitHub Actions CI
