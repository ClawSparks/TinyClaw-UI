# TinyClaw Suite Installer V1

面向 OpenClaw `>= 2026.3.12` 的 Linux 一键安装包方案，支持 `x86_64` 与 `aarch64`。

## 产物

执行：

```bash
bash deploy/v1/build-package.sh
```

输出：

- `deploy/v1/out/tinyclaw-suite-v1-<version>.tar.gz`
- `deploy/v1/out/tinyclaw-suite-v1-<version>.tar.gz.sha256`

## 安装

1. 在目标 Linux 机器解压安装包：

```bash
tar -xzf tinyclaw-suite-v1-<version>.tar.gz
cd tinyclaw-suite-v1
sudo bash install.sh
```

2. 安装脚本会自动完成：

- 检查架构（x86_64 / aarch64）
- 检查 OpenClaw 版本（必须 `>= 2026.3.12`）
- 读取 `~/.openclaw/openclaw.json` 的 gateway 与认证信息
- 部署 chat gateway 与 control center
- 自动初始化 `~/.openclaw/agents/main/agent/auth-profiles.json`
- 自动补齐 `onelink/openai` 供应商映射与默认模型，降低首次聊天配置失败概率
- 自动打通配置并启动 systemd 服务

## 可选参数（环境变量）

- `RUN_USER`：运行服务的 Linux 用户（默认 `SUDO_USER`）
- `INSTALL_DIR`：安装目录（默认 `/opt/tinyclaw-suite`）
- `CHAT_PORT`：聊天网关端口（默认 `3115`）
- `CONTROL_CENTER_PORT`：控制中心端口（默认 `4310`）
- `CLAWUI_DATA_DIR`：聊天网关数据目录（默认 `/var/lib/tinyclaw-suite/clawui`）
- `NPM_REGISTRY`：安装依赖使用的 npm registry（默认 `https://registry.npmmirror.com/`）

示例：

```bash
sudo RUN_USER=ubuntu CHAT_PORT=3115 CONTROL_CENTER_PORT=4310 bash install.sh
```

## 服务

- `tinyclaw-chat-gateway.service`
- `tinyclaw-control-center.service`

查看状态：

```bash
systemctl status tinyclaw-chat-gateway.service
systemctl status tinyclaw-control-center.service
```
