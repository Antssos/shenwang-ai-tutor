# 望学伴 BFF

浏览器与 Dify 之间的服务端应用，使用 Hono、TypeScript、Node.js 24 和 SQLite。它负责账号注册与登录、服务端对话记录、访问频率限制、Dify API Key 隔离和流式回答转发。

## 数据保存

默认数据库文件为 `worker/data/wangxueban.sqlite`，Docker 环境使用 `/data/wangxueban.sqlite`。数据库包含账号、登录会话和最近 50 条对话，不保存明文密码或明文会话令牌：

- 密码使用随机盐和 `scrypt` 摘要；
- 登录令牌随机生成，数据库只保存其 SHA-256 摘要；
- 浏览器只接收 HttpOnly Cookie，前端脚本不能读取；
- 所有对话按账号 ID 隔离查询。

数据库及其 `-wal`、`-shm` 文件必须纳入服务器备份，禁止提交 Git 或公开下载。

## 本地运行

先建立 Dify SSH 隧道，再在新的 PowerShell 中运行：

```powershell
cd worker
$env:DIFY_API_BASE = "http://127.0.0.1:8080/v1"
$secureKey = Read-Host "请输入 Dify Service API Key" -AsSecureString
$env:DIFY_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password
Remove-Variable secureKey
$env:ALLOWED_ORIGINS = "http://127.0.0.1:4173,http://localhost:4173"
$env:ANONYMIZATION_SECRET = [guid]::NewGuid().ToString("N")
$inviteCode = Read-Host "请输入私密邀请码" -AsSecureString
$env:INVITE_CODE = [System.Net.NetworkCredential]::new('', $inviteCode).Password
Remove-Variable inviteCode
$env:DATABASE_PATH = ".\data\wangxueban.sqlite"
npm.cmd run build
npm.cmd start
```

健康检查地址：`http://127.0.0.1:3000/healthz`。

## 接口

| 接口 | 作用 | 需要登录 |
|---|---|---|
| `GET /healthz` | 服务健康检查 | 否 |
| `GET /api/v1/config` | 公开应用配置 | 否 |
| `POST /api/v1/register` | 使用邀请码注册 | 否 |
| `POST /api/v1/login` | 登录账号 | 否 |
| `GET /api/v1/session` | 查询当前账号 | 否 |
| `DELETE /api/v1/session` | 退出登录 | 否 |
| `GET /api/v1/history` | 获取账号对话记录 | 是 |
| `PUT /api/v1/history/:id` | 保存对话记录 | 是 |
| `DELETE /api/v1/history/:id` | 删除对话记录 | 是 |
| `POST /api/v1/chat/stream` | 发起流式对话 | 是 |
| `POST /api/v1/chat/:taskId/stop` | 停止生成 | 是 |

## 安全要求

- 公网 HTTPS 环境设置 `COOKIE_SECURE=true`。
- `ALLOWED_ORIGINS` 必须填写精确前端地址，禁止使用 `*`。
- `ANONYMIZATION_SECRET` 和 `INVITE_CODE` 没有默认值，必须在本地或服务器环境中单独设置。
- 邀请码一旦出现在公开仓库、截图或聊天记录中，应立即在服务器上轮换。
- `.env`、SQLite 数据库、Dify Key 和服务器凭据不得提交 Git。
- 默认每分钟最多 10 次、每个账号每日最多 100 次，同时只生成一个回答。
- 日志不记录账号密码、Cookie、Dify Key或完整问答正文。

```powershell
npm.cmd test
npm.cmd run build
```

生产容器由 [`deploy/docker-compose.bff.yml`](../deploy/docker-compose.bff.yml) 管理。
