# 望学伴 Web

React、TypeScript 和 Vite 构建的中文 AI 学习与陪伴界面。前端负责账号入口、聊天记录展示、Markdown/LaTeX 渲染、消息编辑和流式交互，不保存任何 Dify Key 或模型 Key。

## 本地启动

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

`.env.local`：

```text
VITE_API_BASE_URL=http://127.0.0.1:3000
```

浏览器打开 `http://127.0.0.1:4173`。所有 `VITE_` 变量都会进入浏览器，因此只能填写公开配置。

## 数据边界

- 账号、密码摘要和对话记录由 BFF 的 SQLite 数据库保存。
- 浏览器仅保存 Cookie 选择等必要界面偏好。
- 登录状态使用服务端 HttpOnly Cookie。
- Markdown 经过安全过滤，数学公式由 KaTeX 渲染。

## 检查与构建

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

生产构建输出到 `dist/`，由 Git 忽略。

## Netlify

| 设置 | 值 |
|---|---|
| Base directory | `web` |
| Build command | `npm run build` |
| Publish directory | `web/dist` |
| Node.js | 24.x |

生产变量：

```text
VITE_API_BASE_URL=https://正式的-BFF-域名
```

正式构建必须在 Netlify 显式配置该变量。缺少变量时，生产页面会显示“服务地址尚未配置”。这里只能填写公开的 BFF 地址，不能填写 Dify Key、邀请码或任何服务器密钥。

`public/_redirects` 已配置单页应用路由回退。
