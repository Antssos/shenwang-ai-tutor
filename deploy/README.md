# 望学伴 BFF 服务器部署

本目录管理望学伴 BFF，不接管现有 Dify 容器。BFF 只监听服务器 `127.0.0.1:3000`，由 HTTPS 反向代理或 Tunnel 对外提供服务。

当前 Compose 同时包含一个 Cloudflare Quick Tunnel，便于短期联调或演示。它会在日志中给出随机的 `trycloudflare.com` HTTPS 地址；容器重建后地址可能变化，因此正式运行应改用受账号管理的固定 Tunnel 或独立 HTTPS 反向代理。

## 持久化结构

```text
HTTPS 入口
  └─ 127.0.0.1:3000
       └─ wangxueban-bff
            ├─ /data/wangxueban.sqlite
            └─ Dify API
```

Docker 命名卷 `wangxueban_data` 保存账号和对话记录。重新构建容器不会删除该卷；删除卷会永久删除账号和历史，因此应定期备份。

## 首次部署

```bash
cd /opt/shenwang-ai-tutor/deploy
cp .env.example .env
chmod 600 .env
nano .env
sudo docker compose -f docker-compose.bff.yml up -d --build
```

`.env` 至少填写：Dify Service API Key、精确前端来源、私密邀请码、随机匿名化密钥和正式数据库路径。示例文件故意将敏感值留空；缺少这些值时 BFF 会拒绝启动。HTTPS 环境设置 `COOKIE_SECURE=true`。

匿名化密钥可在服务器上用 `openssl rand -hex 32` 生成。邀请码应单独分发，不要写入源码、文档、截图或聊天记录。

## 验证

```bash
sudo docker compose -f docker-compose.bff.yml ps
curl http://127.0.0.1:3000/healthz
sudo docker compose -f docker-compose.bff.yml logs --tail=100 bff
sudo docker volume inspect wangxueban_wangxueban_data
```

## 备份数据库

先停止 BFF 写入，再备份整个 Docker 数据卷。恢复时必须同时恢复 `.sqlite`、`.sqlite-wal` 和 `.sqlite-shm`（如存在），不要只复制其中一个活动文件。

## 更新

```bash
sudo docker compose -f docker-compose.bff.yml up -d --build
```

更新后检查登录、跨设备历史读取、Markdown/公式显示和一条真实流式回答。

## 禁止事项

- 不要在安全组开放 3000、数据库、Redis 或向量数据库端口。
- 不要把 `ALLOWED_ORIGINS` 设置为 `*`。
- 不要输出或提交 `.env`、数据库、Cookie、密码和 Dify Key。
- 不要把邀请码或匿名化密钥写进 `.env.example`；已经公开过的邀请码必须轮换。
- 不要执行 `docker compose down -v`，它会删除持久化数据卷。
