# 申望 AI 助教（望学伴）

面向儿童课后学习、情绪陪伴和公益服务咨询场景的 AI 助手。当前版本由响应式 Web 前端、安全代理 BFF 和自建 Dify 社区版组成，模型计算通过外部 API 完成，不在服务器本地运行大模型。

> 当前处于小范围试点准备阶段。知识库清单仍标记为 `draft`，不得将儿童姓名、联系方式、学校班级、照片、病史等隐私资料提交到 Git。

## 当前进度

- Web：已完成中文首页、账号入口、服务端聊天记录、Markdown/LaTeX 渲染、消息编辑和流式回答。
- BFF：已完成账号注册登录、SQLite 持久化、密码摘要、HttpOnly 会话、Dify Key 隔离、限流和 SSE 转换。
- Dify：社区版已部署到阿里云，代表性学习、中心信息、情绪、安全和边界问题已联调。
- 部署：前端使用 Netlify；BFF 的 Docker Compose 已包含持久化数据卷，公网 HTTPS 入口尚待配置。
- 微信小程序：仅保留目录，尚未开发。

## 系统结构

```text
浏览器
  └─ Web（React + Vite，开发时 127.0.0.1:4173）
       └─ BFF（Hono，开发时 127.0.0.1:3000）
            └─ Dify Service API（阿里云服务器内部）
                 └─ 外部模型 API + Dify 知识库
```

浏览器不直接访问 Dify，也不会得到 Dify Key。Dify 管理后台继续通过 SSH 隧道访问。

## 目录

| 目录 | 内容 |
|---|---|
| `web/` | React + TypeScript + Vite 前端 |
| `worker/` | Hono + TypeScript BFF |
| `deploy/` | BFF 独立 Docker Compose 和服务器说明 |
| `docs/` | 技术方案、协作说明、接口说明和 Dify DSL |
| `knowledge/_management/` | 可提交的知识库规则与清单模板 |
| `tools/` | 知识库清洗、切分和检查脚本 |
| `miniprogram/` | 微信小程序预留目录 |

真实知识库内容位于本地并被 `.gitignore` 排除，不属于可公开源码。

## 本地联调

需要三个独立终端，按顺序保持运行：

1. `ssh dify`：建立到服务器 Dify 的 SSH 隧道。
2. 在 `worker/` 设置本地环境变量后运行 `npm.cmd start`。
3. 在 `web/` 运行 `npm.cmd run dev`，打开 `http://127.0.0.1:4173`。

详细命令分别见 [`worker/README.md`](worker/README.md) 和 [`web/README.md`](web/README.md)。

## 验证

```powershell
cd worker
npm.cmd test
npm.cmd run build

cd ..\web
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## 部署

- 前端：Netlify 托管 `web/`，只配置公开的 `VITE_API_BASE_URL`。
- BFF：阿里云 Docker 常驻，只监听宿主机 `127.0.0.1:3000`。
- 公网入口：正式 Cloudflare Tunnel 将 HTTPS 请求转发到 BFF，不开放公网 3000 端口。
- Dify：保持现有独立 Compose，不由本仓库的部署文件管理。

完整设计见 [`docs/前端v0.1技术方案.md`](docs/前端v0.1技术方案.md)，服务器操作入口见 [`deploy/README.md`](deploy/README.md)。

## 安全规则

- 禁止提交 `.env`、API Key、访问码、SSH 私钥和模型供应商凭据。
- 禁止提交未经脱敏和授权的儿童资料或原始课程数据。
- 正式 BFF 必须使用服务端邀请码、精确 CORS、HTTPS Cookie 和持久化数据库备份。
- 日志不得记录完整问题、回答正文和儿童身份信息。
- 发布前必须完成知识授权、隐私合规、安全边界和回滚验证。
