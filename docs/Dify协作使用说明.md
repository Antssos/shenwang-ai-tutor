# Dify 协作使用说明

目前 Dify 部署在团队云服务器上，管理后台没有直接向公网开放。团队成员通过 SSH 加密隧道访问，每个人应使用自己的服务器账户、SSH 密钥和 Dify 账号。

## 需要准备

1. 一台安装了 OpenSSH 的电脑。
2. 自己生成的一对 Ed25519 SSH 密钥。
3. 由服务器管理员创建的个人 Linux 账户。
4. 由 Dify 工作区管理员邀请的个人 Dify 账号。
5. 服务器地址、SSH 端口和用户名。

## 生成 SSH 密钥

在 Windows PowerShell 中执行：

```powershell
ssh-keygen -t ed25519 -C "你的名字或邮箱"
```

生成后：

- `id_ed25519` 是私钥，只能自己保管；
- `id_ed25519.pub` 是公钥，需要发给服务器管理员。

不得发送私钥、服务器密码或其他成员的密钥。

## 配置访问方式

在本机 `.ssh/config` 中添加：

```text
Host dify
    HostName <服务器公网IP>
    User <你的个人用户名>
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    LocalForward 127.0.0.1:8080 127.0.0.1:80
    ExitOnForwardFailure yes
    ServerAliveInterval 60
```

建立连接：

```powershell
ssh -N dify
```

输入私钥保护密码后保持窗口开启，然后访问：

```text
http://127.0.0.1:8080
```

## Dify 账号和权限

服务器 SSH 账户与 Dify 账号是两套独立身份：

- SSH 账户负责建立访问通道；
- Dify 账号负责工作区、应用和知识库权限。

管理员应按照实际职责分配最低必要权限。普通成员不应共用工作区所有者账号。

## 协作规则

- 不共享私钥、服务器密码或 Dify 管理员密码。
- 不把模型 API Key 写入文档、聊天记录或 Git。
- 不随意删除应用、知识库、数据集和工作流。
- 修改正式 Chatflow 前先复制测试版本。
- 知识库资料完成审核后才能设为正式可用。
- 不上传真实儿童身份信息、照片或未经授权的对话。
- 遇到容器、服务器或权限问题时先联系服务器管理员。
