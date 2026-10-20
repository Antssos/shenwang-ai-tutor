# 单容器部署（暂不绑定域名）

构建在 CI 或开发环境完成，不在 2 GiB 共享服务器上编译。应用在单个容器中提供静态前端和 API。

```bash
docker build -t wangxueban:0.2.0 .
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# 填写随机 INVITE_CODE 和实际模型配置。不要提交 deploy/.env。
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d
```

上线使用已核对的镜像 ID/registry digest，并记录对应 Git SHA。无需先部署 Caddy 或设置 DNS。

`127.0.0.1:3000` 是宿主机回环端口，不对外开放。通过用户已有 SSH 连接方式，在自己的电脑转发端口：

```bash
ssh -p 2222 -L 3000:127.0.0.1:3000 local-agent@SERVER_IP
```

然后浏览器打开 `http://127.0.0.1:3000`。`APP_ORIGIN` 与该地址一致，Cookie 为 HttpOnly、SameSite=Lax；这里的 HTTP 仅运行于回环与 SSH 加密转发内。正式 HTTPS 上线时再设置精确 `APP_ORIGIN` 和 `COOKIE_SECURE=true`。不要把当前 HTTP 账号服务直接暴露到公网。

## 资源与共存

- 单容器内存上限 384 MiB、CPU 上限 0.5 核、PID 上限 128。
- Node heap 上限 192 MiB，数据库使用独立命名卷。
- rootfs 只读，非 root 用户，移除 Linux capabilities；临时目录和日志有上限。
- 全机只在将来需要时共用一份 HTTPS 入口；每个项目独立 Compose、卷、配置与资源限制。
- 探针 `/health/live` 检查进程，`/health/ready` 检查数据库并报告模型配置状态。它不代表供应商连通性或模型质量通过。

不要将公开仓库 PR 的脚本放到具有 sudo 的自托管 Runner 执行。构建/测试使用 GitHub 托管 Runner；目标机只运行受控发布任务。当前仓库的 CI 不连接目标机，也不读取私有知识。

## 导入私有知识

将私库知识目录放在服务器受控路径（不位于静态资源目录），临时以只读方式挂载到同一镜像执行 CLI。运行 Compose 服务前后均可导入，期间不发起聊天生成：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml run --rm --no-deps \
  -v /secure/knowledge:/input:ro app \
  node apps/server/dist/cli.js import /input /input/_management/document_manifest.csv
```

同一数据库只运行一个应用实例。导入会校验路径、active 状态和库类别，重新切分/索引并原子替换，未完成不会破坏旧索引。嵌入不可用时，若未配置嵌入密钥可明确使用关键词索引；已配置却调用失败则导入失败，避免悄悄发布不完整语义索引。

## 备份、升级与回滚

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml exec app \
  node apps/server/dist/cli.js backup /data/backup.sqlite
docker compose --env-file deploy/.env -f deploy/compose.yml cp app:/data/backup.sqlite /secure/backups/backup.sqlite
```

将备份加密并传至机器之外。恢复必须停止服务，用备份替换主库，删除旧的对应 WAL/SHM（先保留完整旧数据副本），修复卷内权限并执行 doctor，再启动。不要对运行中的数据库使用直接文件复制。

升级前备份，固定新旧镜像。SQL 迁移受 `migrations` 表管理；当前版本不能直接读取旧 BFF 数据库格式。旧数据若后来找到，应先编写离线导入工具和核对结果，不能覆盖新库。

发布回滚需要检查旧镜像是否兼容当前 schema；不兼容时从升级前备份恢复，并明确该时间点之后的数据影响。每次发布至少检查注册登录、历史、六类路由、停止、来源与跨账号隔离。

## 受信代理契约（将来启用反向代理时）

默认 `TRUSTED_PROXY_IPS` 为空，直连和 SSH 转发不信任任何来源 IP 请求头。认证同时有归一化账号失败限流、较宽的入口/全局限流和密码派生并发限制，成功登录不会消耗账号失败额度。

启用受控反向代理时，只填写应用实际看到的代理 socket IP（精确 IP，不支持 `*` 或任意 CIDR）；代理必须覆盖 `X-Real-IP` 为其直接观测的客户端 IP，并剥离客户端伪造值。应用只在直连 peer 属于该清单时读取单个合法 `X-Real-IP`，始终忽略 `X-Forwarded-For`。配置代理信任后，不应再让非代理调用者通过同一个受信 socket 直达应用。两个真实客户端的独立限流仍须在目标拓扑验证，本轮没有启用代理或修改公网入口。
