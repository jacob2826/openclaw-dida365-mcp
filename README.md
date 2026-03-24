# OpenClaw 滴答清单（Dida365）MCP 插件

`openclaw-dida365-mcp` 是一个将 **滴答清单（Dida365）官方 MCP** 直接接入 **OpenClaw Agent 工具层**的插件。

它的目标很明确：在统一的 Agent 会话中调用滴答清单能力，同时保持工具命名、参数结构和上游官方 MCP 一致，不额外引入一层私有 API，也不依赖专用 Agent 路由。

## ✨ 特性

- 直接暴露滴答清单（Dida365）官方 MCP 工具
- 使用官方 `tools/list` 生成的工具 schema
- 支持随上游工具集更新而刷新
- 通过 `mcp-remote` 连接远端 MCP，并复用单进程内连接
- 适合接入到 OpenClaw 的主 Agent 或其他通用 Agent

## 🧭 设计定位

这个项目不是滴答清单的替代实现，也不是“再包一层任务 API”的封装器。  
它更像一个**薄桥接层**：

```text
OpenClaw Agent
-> openclaw-dida365-mcp
-> mcp-remote
-> https://mcp.dida365.com
```

它解决的是这类问题：

- 希望在同一个 Agent 会话中直接调用滴答清单（Dida365）能力
- 希望保持官方工具名，而不是维护一套二次映射
- 希望插件本身尽量轻，升级路径尽量跟随官方 MCP

## 🆚 与常见接入方式的区别

围绕滴答清单（Dida365）的 Agent 接入，常见做法通常分成几类：

| 方式 | 常见特点 | 典型问题 | 本项目的选择 |
| --- | --- | --- | --- |
| 专用 Agent 路由 | 把某类会话整体交给一个任务 Agent | 会话入口被拆分，集成边界较重 | 保持在既有 Agent 工具层接入 |
| 自定义工具映射 | 自定义 `get_today_tasks`、`create_project` 等私有接口 | 工具名和 schema 容易与上游漂移 | 直接使用官方工具名与 schema |
| 一次性脚本封装 | 用零散脚本拼接查询、创建、更新流程 | 可维护性和可测试性较弱 | 使用标准 OpenClaw 插件结构 |

如果你需要的是“稳定复用上游官方 MCP 能力”，而不是“重新设计一套任务抽象层”，这个项目更合适。

## 📦 MCP 能力概览

截至 `2026-03-24`，重新从滴答清单（Dida365）官方 MCP 拉取 `tools/list` 后，当前官方暴露的工具共 `20` 个；本项目默认按 manifest **全量注册**。

下面的分类仅用于文档说明；运行时仍然直接使用官方工具名。

| 抽象分类 | 官方 MCP 工具 | 对应功能 |
| --- | --- | --- |
| 项目管理 | `list_projects` | 列出全部项目 |
| 项目管理 | `get_project_by_id` | 按项目 ID 查看项目详情 |
| 项目管理 | `get_project_with_undone_tasks` | 查看项目及其未完成任务 |
| 任务管理 | `create_task` | 创建任务 |
| 任务管理 | `update_task` | 更新任务内容、时间、字段等信息 |
| 任务管理 | `get_task_in_project` | 获取某个项目中的指定任务 |
| 任务管理 | `get_task_by_id` | 按任务 ID 获取任务详情 |
| 任务管理 | `complete_task` | 标记单个任务完成 |
| 任务管理 | `complete_tasks_in_project` | 批量完成项目中的任务 |
| 任务管理 | `move_task` | 移动任务到其他位置或项目 |
| 查询检索 | `search_task` | 搜索任务 |
| 查询检索 | `search` | 通用搜索 |
| 查询检索 | `fetch` | 按 MCP 服务定义执行抓取类查询 |
| 查询检索 | `filter_tasks` | 按条件筛选任务 |
| 时间视图 | `list_undone_tasks_by_date` | 按日期查看未完成任务 |
| 时间视图 | `list_undone_tasks_by_time_query` | 按时间查询词查看未完成任务 |
| 时间视图 | `list_completed_tasks_by_date` | 按日期查看已完成任务 |
| 批量操作 | `batch_add_tasks` | 批量创建任务 |
| 批量操作 | `batch_update_tasks` | 批量更新任务 |
| 账户配置 | `get_user_preference` | 读取用户偏好设置 |

默认策略如下：

- manifest 中存在的官方工具会被注册
- 上游新增工具后，执行 `npm run refresh-tools` 并重启 OpenClaw，即可接入新增能力
- 如果只希望开放部分工具，可使用 `toolAllowlist` / `toolDenylist`

## 🚀 安装与启用

### 1. 安装依赖并构建

```bash
npm install
npm run build
```

### 2. 在 OpenClaw 中启用插件

在 OpenClaw 配置中启用插件，并将其加入目标 Agent 的工具允许列表。

```json
{
  "plugins": {
    "openclaw-dida365-mcp": {
      "path": "/absolute/path/to/openclaw-dida365-mcp",
      "enabled": true,
      "config": {
        "serverUrl": "https://mcp.dida365.com",
        "authTimeoutSeconds": 300,
        "requestTimeoutSeconds": 300,
        "idleTimeoutSeconds": 600
      }
    }
  },
  "agents": {
    "main": {
      "tools": {
        "allow": ["openclaw-dida365-mcp"]
      }
    }
  }
}
```

### 3. 拉取官方工具清单

```bash
npm run refresh-tools
```

该命令会通过 `mcp-remote` 连接官方 MCP，读取 `tools/list`，并更新：

`data/mcp-tools.json`

### 4. 完成 OAuth

首次拉取工具或首次真实调用工具时，`mcp-remote` 会触发浏览器登录。完成一次授权后，后续通常会复用本地 token。

## ⚙️ 配置项

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `serverUrl` | `https://mcp.dida365.com` | 滴答清单（Dida365）MCP 地址 |
| `command` | `npx` | 启动 `mcp-remote` 的命令 |
| `args` | `["-y", "mcp-remote@latest"]` | 启动参数 |
| `host` | `127.0.0.1` | 本地 OAuth 回调监听地址 |
| `authTimeoutSeconds` | `300` | OAuth 等待时间 |
| `requestTimeoutSeconds` | `300` | MCP 请求超时 |
| `idleTimeoutSeconds` | `600` | 空闲多久后自动关闭内部子进程 |
| `refreshManifestOnStartup` | `false` | 启动时是否自动刷新 manifest |
| `manifestPath` | `data/mcp-tools.json` | 自定义 manifest 路径 |
| `toolAllowlist` | `[]` | 仅注册指定工具 |
| `toolDenylist` | `[]` | 排除指定工具 |

## 🔁 连接模型

该插件不会额外引入一个长期常驻服务。

当前行为是：

- 第一次调用滴答清单（Dida365）工具时拉起 `mcp-remote`
- 同一个 OpenClaw 进程内复用同一条连接
- 默认空闲 `600` 秒自动关闭
- 下次调用时自动重连

这样做的目的是在“调用延迟”和“进程常驻成本”之间取得平衡。

需要注意的是：

- 单进程内连接复用是有保证的
- 如果你另外启动独立调试进程，它们仍会建立各自的连接

## 🧪 开发与验证

```bash
npm install
npm run build
npm run check
npm test
npm run list-tools
npm run refresh-tools
npm run verify-basic
```

其中：

- `npm test`：覆盖配置解析、manifest 处理、连接复用、空闲回收、注册逻辑等
- `npm run list-tools`：打印当前 manifest 中记录的官方工具名
- `npm run refresh-tools`：重新从官方 MCP 拉取 `tools/list`
- `npm run verify-basic`：做一轮真实基础联通验证，当前覆盖
  - `list_projects`
  - `list_undone_tasks_by_time_query`
  - `create_task`
  - `complete_task`

CI 不执行真实 OAuth 集成测试；需要登录和真实账号数据的验证，仍建议在本地完成。

## 🛡️ 安全边界

当前版本默认具备这些约束：

- 远程 MCP 只允许 `https://`
- `http://` 仅允许本机回环地址
- 会对 `mcp-remote` stderr 中常见 token 字段做脱敏
- 默认不在插件启动时自动联网刷新 manifest
- 如果 manifest 对应的 `serverUrl` 与当前配置不一致，会给出告警

更完整的说明见 [SECURITY.md](./SECURITY.md)。

## 📝 已知限制

- 本项目透传的是官方 MCP，因此工具集合最终取决于官方 `tools/list`
- CI 不做线上 OAuth 测试
- 连接复用保证仅限单个 OpenClaw 进程

## 📄 License

以仓库根目录实际的 `LICENSE` 文件为准。
