# 开发说明

## 项目定位

这是一个公开发布的 OpenClaw 插件仓库，对外提供：

- 通过 `mcp-remote` 接入滴答清单（Dida365）官方 MCP
- 保持官方工具名和 schema，不做二次 API 映射
- 通过 npm 方式被 OpenClaw 直接安装

## 仓库边界

这个仓库应始终保持“可公开发布”状态：

- 不提交本地绝对路径
- 不提交 OAuth token、cookie、缓存或账号配置
- 不提交临时调试输出、截图、日志或 shell 历史

发布前至少执行：

```bash
npm test
node ./scripts/scan-sensitive.mjs .
env npm_config_cache=/tmp/openclaw-dida365-npm-cache npm pack --dry-run --json
```

## 关键文件

- `src/index.ts`：插件入口，负责注册官方 MCP 工具
- `src/bridge.ts`：MCP 连接桥接、连接复用、空闲回收
- `src/config.ts`：配置解析与安全校验
- `src/manifest.ts`：官方 `tools/list` manifest 读写与过滤
- `data/mcp-tools.json`：当前缓存的官方工具清单
- `openclaw.plugin.json`：插件元数据与配置 schema
- `package.json`：npm / OpenClaw 安装元数据

## 开发命令

```bash
npm install
npm run build
npm run check
npm test
npm run refresh-tools
npm run verify-basic
```

说明：

- `refresh-tools` 会连接官方 MCP 并刷新本地 manifest
- `verify-basic` 依赖真实授权环境，适合本地人工验收
- `npm pack --dry-run` 会触发 `prepack`，可作为发布前检查

## 分支策略

- `main`：稳定、可发布状态
- `dev`：后续在线开发主分支

如果改动会影响 npm 发布或 OpenClaw 安装，请同步更新：

- `package.json`
- `openclaw.plugin.json`
- `README.md`
- `CHANGELOG.md`

## OpenClaw 安装模型

当前安装入口是：

```bash
openclaw plugins install "@jacob2826/openclaw-dida365-mcp"
```

相关元数据位于 `package.json > openclaw.install`：

- `npmSpec`
- `defaultChoice`
- `minHostVersion`

如果未来包名、兼容范围或安装方式变化，这里必须同步调整。
