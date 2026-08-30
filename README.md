# NodeLoc MCP

[English](#english) · [中文](#中文)

---

## English

An MCP (Model Context Protocol) server for the [NodeLoc](https://www.nodeloc.com) community (TypeScript). It lets any MCP-compatible AI client — Claude Desktop, Cursor, Cherry Studio, Cline, … — work with the forum through natural language: browse/post topics, private messages, likes/bookmarks/polls, nested communities (nodes), chat, daily check-in, red envelopes, energy-point rewards, the official payment API, knowledge-base lookup, and miniprogram CLI operations.

**42 tools** in total; tool descriptions are in English. Works with any MCP client over stdio.

### Feature groups

| Group | Tools |
|---|---|
| Account | `get_current_user` |
| Browsing | `list_latest_topics` `list_top_topics` `read_topic` `list_category_topics` `get_site_info` `get_user_profile` `get_user_summary` `search_users` |
| Notifications / PM | `list_notifications` `mark_notifications_read` `list_private_messages` `send_private_message` |
| Writing | `create_topic` `reply_to_topic` |
| Interaction | `like_post` `unlike_post` `bookmark_post` `vote_poll` `unvote_poll` |
| Nodes | `list_nodes` `list_node_topics` `join_node` `leave_node` `create_node` `check_node_slug` |
| Chat | `get_chat_messages` `get_chat_thread_messages` `send_chat_message` `mark_chat_read` |
| Energy | `checkin` `create_red_envelope` `give_reward` `get_points_history` `get_points_scores` |
| Payment (official API) | `payment_create` `payment_query` `payment_transfer` |
| Knowledge base | `docs_list_pages` `docs_get_page` `docs_search` |
| Miniprograms | `apps_cli` |

### Requirements & build

Requires **Node.js ≥ 20** (uses `fetch` and `headers.getSetCookie()`).

```bash
npm install
npm run build        # bundles everything into a single dist/index.js (~760 KB)
```

`dist/index.js` is self-contained — to distribute, ship this one file plus a Node runtime; no `npm install` needed on the target machine.

### Configuration (environment variables)

| Variable | Required | Description |
|---|---|---|
| `NODELOC_USERNAME` | ✅ | Forum username or email |
| `NODELOC_PASSWORD` | ✅ | Forum password (only used to obtain a cookie session; the session is stored in a local file) |
| `NODELOC_BASE_URL` | | Default `https://www.nodeloc.com` |
| `NODELOC_TIMEZONE` | | Default `Asia/Shanghai` |
| `NODELOC_LOCALE` | | Default `zh-CN` (used by the check-in request header) |
| `NODELOC_SECOND_FACTOR_METHOD` | | 2FA: `0` none / `1` SMS / `2` TOTP, default `0` |
| `NODELOC_PAYMENT_ID` | payment tools | Payment app ID (`pay_xxx`), apply at [payment/applications](https://www.nodeloc.com/payment/applications) (TL1+, admin approval) |
| `NODELOC_PAYMENT_TOKEN` | payment tools | Payment app token (`tk_xxx`) |
| `NODELOC_APPS_CLI` | apps tools | `nodeloc-apps` CLI path, defaults to PATH lookup |
| `NODELOC_DATA_DIR` | | Session/docs cache directory, default `~/.nodeloc-mcp` |

> Note: NodeLoc has disabled the Discourse User-Api-Key flow, so this server uses **cookie-session** auth (same as the official app): `POST /session` login → session persisted locally → automatic re-login on expiry.

### MCP client example

```json
{
  "mcpServers": {
    "nodeloc": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "NODELOC_USERNAME": "your_username",
        "NODELOC_PASSWORD": "your_password"
      }
    }
  }
}
```

### Project structure

```
src/
├── config.ts        # environment configuration
├── client.ts        # HTTP client + cookie-session auth (Cloudflare detection, auto re-login, session persistence)
├── index.ts         # MCP entry, registers 42 tools (English descriptions)
└── tools/
    ├── forum.ts     # topics/posts/PMs/interactions/nodes/chat
    ├── energy.ts    # check-in/red envelopes/rewards/points
    ├── payment.ts   # official payment API (HMAC-SHA256 signing)
    ├── docs.ts      # knowledge base (llms.txt index + Markdown cache)
    └── apps.ts      # nodeloc-apps CLI wrapper
```

### Known limitations

- **Miniprogram development access** requires a manual admin approval and cannot be automated; `apps_cli` only wraps an existing CLI (interactive commands like `login` must be run once in a terminal yourself)
- **OAuth** (docs.nodeloc.com) is an outbound service — "log in to third-party sites with your NodeLoc account" — unrelated to this server's forum auth, not included
- The check-in endpoint enforces nonce + timestamp anti-cheat validation; write operations are rate-limited by the forum, and server errors are passed through
- MessageBus real-time long-polling is not implemented (of limited use in a request-driven MCP model)

### References

- Official docs: https://docs.nodeloc.com/ ([llms.txt](https://docs.nodeloc.com/llms.txt))

---

## 中文

[NodeLoc](https://www.nodeloc.com) 论坛的 MCP（Model Context Protocol）服务器（TypeScript 实现），让 AI 助手直接操作论坛：浏览/发帖/私信/点赞/投票、节点社区、聊天、每日签到、红包、打赏、积分查询、官方支付 API、知识库检索、小程序 CLI 操作。

共 **42 个工具**，工具描述为英文，适用于任意 MCP 客户端（Claude Desktop、Cursor、Cherry Studio、Cline 等）。

### 功能一览

| 分组 | 工具 |
|---|---|
| 账号 | `get_current_user` |
| 浏览 | `list_latest_topics` `list_top_topics` `read_topic` `list_category_topics` `get_site_info` `get_user_profile` `get_user_summary` `search_users` |
| 通知/私信 | `list_notifications` `mark_notifications_read` `list_private_messages` `send_private_message` |
| 写作 | `create_topic` `reply_to_topic` |
| 互动 | `like_post` `unlike_post` `bookmark_post` `vote_poll` `unvote_poll` |
| 节点社区 | `list_nodes` `list_node_topics` `join_node` `leave_node` `create_node` `check_node_slug` |
| 聊天 | `get_chat_messages` `get_chat_thread_messages` `send_chat_message` `mark_chat_read` |
| 能量 | `checkin` `create_red_envelope` `give_reward` `get_points_history` `get_points_scores` |
| 支付（官方 API） | `payment_create` `payment_query` `payment_transfer` |
| 知识库 | `docs_list_pages` `docs_get_page` `docs_search` |
| 小程序 | `apps_cli` |

### 安装与构建

要求 **Node.js ≥ 20**（用了 `fetch` 和 `headers.getSetCookie()`）。

```bash
npm install
npm run build        # 打包成单文件 dist/index.js（约 760 KB，含全部依赖）
```

打包后的 `dist/index.js` 是自包含的单文件——分发给别人时只需这一个文件 + Node 运行时，无需 npm install。

### 配置（环境变量）

| 变量 | 必填 | 说明 |
|---|---|---|
| `NODELOC_USERNAME` | ✅ | 论坛用户名或邮箱 |
| `NODELOC_PASSWORD` | ✅ | 论坛密码（仅用于登录换取 Cookie 会话，会话仅存本地文件） |
| `NODELOC_BASE_URL` | | 默认 `https://www.nodeloc.com` |
| `NODELOC_TIMEZONE` | | 默认 `Asia/Shanghai` |
| `NODELOC_LOCALE` | | 默认 `zh-CN`（签到请求头用） |
| `NODELOC_SECOND_FACTOR_METHOD` | | 2FA 方式：`0` 无 / `1` 短信 / `2` TOTP，默认 `0` |
| `NODELOC_PAYMENT_ID` | 支付工具需要 | 支付应用 ID（`pay_xxx`），[申请入口](https://www.nodeloc.com/payment/applications)（TL1+，需审批） |
| `NODELOC_PAYMENT_TOKEN` | 支付工具需要 | 支付应用 token（`tk_xxx`） |
| `NODELOC_APPS_CLI` | 小程序工具需要 | `nodeloc-apps` CLI 路径，默认从 PATH 查找 |
| `NODELOC_DATA_DIR` | | 会话与文档缓存目录，默认 `~/.nodeloc-mcp` |

> 注：NodeLoc 站点已禁用 Discourse User-Api-Key，因此采用 **Cookie 会话**鉴权（与官方 App 相同）：`POST /session` 登录 → 会话持久化到本地 → 过期自动重新登录。

### MCP 客户端接入示例

```json
{
  "mcpServers": {
    "nodeloc": {
      "command": "node",
      "args": ["/绝对路径/dist/index.js"],
      "env": {
        "NODELOC_USERNAME": "your_username",
        "NODELOC_PASSWORD": "your_password"
      }
    }
  }
}
```

### 项目结构

```
src/
├── config.ts        # 环境变量配置
├── client.ts        # HTTP 客户端 + Cookie 会话鉴权（Cloudflare 检测、自动重登、会话持久化）
├── index.ts         # MCP 入口，注册 42 个工具（英文描述）
└── tools/
    ├── forum.ts     # 主题/帖子/私信/互动/节点/聊天
    ├── energy.ts    # 签到/红包/打赏/积分
    ├── payment.ts   # 官方支付 API（HMAC-SHA256 签名）
    ├── docs.ts      # 知识库（llms.txt 索引 + Markdown 缓存）
    └── apps.ts      # nodeloc-apps CLI 封装
```

### 已知边界

- **小程序开发权限**需人工向管理员申请，无法自动化；`apps_cli` 仅封装已有 CLI（`login` 等交互式命令需先在终端手动执行一次）
- **OAuth**（docs.nodeloc.com 的 OAuth 对接）是"用 NodeLoc 账号登录第三方平台"的对外服务，与本 MCP 的论坛鉴权无关，未纳入
- 签到接口有 nonce + 时间戳反作弊校验；写操作受论坛频率限制，工具会透传服务端错误
- MessageBus 实时长轮询未实现（MCP 按需调用模型下意义有限）

### 参考

- 官方文档：https://docs.nodeloc.com/ （[llms.txt](https://docs.nodeloc.com/llms.txt)）
