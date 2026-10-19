# 望学伴

面向儿童课后学习、一般情绪支持和公益服务咨询的 AI 助手。React 静态前端与 Hono API 同源运行，SQLite 保存账号、会话、消息、知识索引和额度；通过外部模型 API 完成分类与生成。无需 Dify、Netlify、Tunnel 或本地大模型。

## 开发与验证

需要 Node.js 24、npm。首次配置：

```bash
npm ci
cp .env.example .env
# 在本地 .env 中设置随机 INVITE_CODE，Vite 开发时设 APP_ORIGIN=http://127.0.0.1:4173。
# 模型参数通过受控配置提供。
set -a
. ./.env
set +a
npm run dev
```

浏览器打开 `http://127.0.0.1:4173`；Vite 将 `/api` 转发到 `127.0.0.1:3000`。生产构建由后端直接提供页面：

```bash
npm run check
npm run build
npm start
```

此时打开 `http://127.0.0.1:3000`。`.env` 必须先导出到当前进程环境；容器使用 `env_file` 自动读取。`APP_ORIGIN` 必须与浏览器地址一致；Vite 开发时设为 `http://127.0.0.1:4173`。

端到端测试使用一次性 SQLite、合成知识和明确标记的测试模型，不读取真实账号或密钥：

```bash
npx playwright install chromium
npm run test:e2e
# 使用系统 Chromium 时：PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

## 模型与资料

`AI_PROVIDER=disabled` 时账号、历史和固定安全回复可用，页面明确提示 AI 未配置。启用真实模型需设置 `AI_PROVIDER=openai`、`MODEL_API_BASE`、`MODEL_API_KEY`、`MODEL_NAME`；支持 OpenAI 兼容接口。模型名称以供应商实际可用值为准。

知识正文只存于私有 `Antssos/cloudcodex` 仓库的 `internal/shenwang-ai-tutor` 分支、`shenwang-ai-tutor-internal/knowledge/`。本仓库不包含真实知识正文。导入工具只读取 manifest 中的 active 文件，严格分库，限制最多 5,000 个片段；重新导入采用完整、事务化替换：

```bash
npm run cli -- import /secure/path/knowledge /secure/path/knowledge/_management/document_manifest.csv
npm run cli -- doctor
```

配置 `EMBEDDING_API_BASE`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL` 后导入会建立语义索引；否则使用中文分词关键词检索。改变嵌入模型必须重新导入，不能混用旧索引。无可靠资料时返回资料不足。提示词在 `prompts/`，六类路由在 `config/routes.json`。

## 账号、历史与管理

- 使用服务端邀请码注册，异步 scrypt 保存密码摘要；HttpOnly/SameSite=Lax 会话 Cookie。
- 服务端保存生成任务、消息状态和来源；浏览器不能回写伪造历史。编辑重生成建立保留前文的新分支，旧分支保留。
- API 和管理页面均检查账号；停止任务、读取/删除对话验证归属。配额保存在 SQLite，按账号和全局分别控制。
- 先注册管理账号，再在受控终端执行 `npm run cli -- admin USERNAME`。登录后访问 `/admin` 查看资料、发布/下架与预算状态。
- `npm run cli -- disable USERNAME` 停用账号并撤销会话。
- Token 预算是保守预留上限，包含分类、上下文、证据和最大输出，失败/停止也不退还预留，不能当作实际供应商账单。

## 部署与恢复

见 [部署说明](deploy/README.md)。支持不绑定域名的回环端口与 SSH 转发；默认不开放公网应用端口。按 Compose 设置 384 MiB 内存上限、0.5 核 CPU，并与其他项目分开卷和网络。

```bash
npm run cli -- backup /secure/backup/wangxueban.sqlite
npm run cli -- cleanup
```

数据库备份应加密后保存到本机之外。恢复时停止应用，将备份放回配置的数据路径并确认权限，再运行 doctor。默认历史保留 90 天；定期清理按 `RETENTION_DAYS` 执行。

## 代码入口

| 路径 | 内容 |
|---|---|
| `apps/web/` | 页面、聊天流状态与同源客户端 |
| `apps/server/src/app.ts` | HTTP、认证边界、流式生命周期 |
| `apps/server/src/store.ts`、`db/migrations/` | 数据所有权、迁移与配额 |
| `apps/server/src/knowledge.ts`、`provider.ts`、`engine.ts` | 检索、供应商协议与六路由 |
| `packages/contracts/` | 共用 Zod 契约 |
| `tests/e2e/` | 可复现浏览器联调 |
| `deploy/` | 单容器资源和运行配置 |

小程序、多模态和 Office 文件解析未实现。运行记录、交接包和内部分析统一保存在上述私有仓库，旧 Dify 方案仅作历史参考。
