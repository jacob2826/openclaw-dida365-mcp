# 贡献指南

欢迎提交 Issue 和 PR。这个项目的目标很明确：在不破坏 OpenClaw 正常聊天体验的前提下，把 Dida365 官方 MCP 以最小中间层方式接入进来。

## 开发原则

- 直接使用官方 MCP 工具名，不做业务层二次命名映射
- 能透传官方 schema，就不要手写一套本地 schema
- 默认安装和运行路径要可回滚、可清理
- 没有充分理由时，不引入新的长期常驻后台服务
- 日志默认按“最小泄漏面”处理，避免把 token 打进输出

## 本地开发

```bash
npm install
npm run build
npm run check
npm test
npm run sync-git
```

如果你要同步最新官方工具列表：

```bash
npm run refresh-tools
```

如果你要做真实联通验证：

```bash
npm run verify-basic
```

这一步需要本地 OAuth 登录。

如果你准备发布到 GitHub，请先执行：

```bash
npm run sync-git
```

然后在你的 Git 工作目录镜像中检查并提交。

## 提交前检查

提交 PR 之前，请至少确认：

- `npm run check` 通过
- `npm test` 通过
- 如果改动了桥接逻辑，至少本地跑一次 `npm run verify-basic`
- 如果官方工具列表有变化，同时更新 `data/mcp-tools.json`
- 如果用户可见行为有变化，同时更新 `README.md`
- 如果涉及安全边界变化，同时更新 `SECURITY.md`

## 代码风格

- TypeScript 以 `strict` 模式为准
- 优先写小而直接的函数，不要过度抽象
- 测试优先覆盖桥接层、配置解析和注册逻辑
- 对外文档统一使用中文

## Issue / PR 建议内容

如果你提交的是功能改动，建议说明：

- 改动目的
- 是否影响现有 OAuth / mcp-remote 行为
- 是否改变工具暴露范围
- 是否需要更新 OpenClaw 配置
- 如何验证

如果你提交的是 bugfix，建议附上：

- 触发条件
- 实际表现
- 期望表现
- 修复前后的验证结果
