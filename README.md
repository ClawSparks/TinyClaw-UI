<div align="center">

<h1>TinyClaw-UI</h1>

<p>
  <strong>专为 OpenClaw 打造的轻量级前端控制台</strong><br/>
  一站式完成模型、网关、通道、智能体配置 + 多智能体自由协同聊天 & 任务派发
</p>

<p>
  <a href="https://github.com/你的用户名/TinyClaw-UI/stargazers"><img src="https://img.shields.io/github/stars/你的用户名/TinyClaw-UI?style=social" alt="Stars"></a>
  <a href="https://github.com/你的用户名/TinyClaw-UI/forks"><img src="https://img.shields.io/github/forks/你的用户名/TinyClaw-UI?style=social" alt="Forks"></a>
  <a href="https://github.com/你的用户名/TinyClaw-UI/releases"><img src="https://img.shields.io/github/v/release/你的用户名/TinyClaw-UI?color=green" alt="Release"></a>
  <img src="https://img.shields.io/badge/OpenClaw-Compatible-brightgreen" alt="OpenClaw Compatible">
</p>

[立即体验 Demo → https://tinyclaw.me/](https://tinyclaw.me/)　｜　[文档 & 截图](#截图)　｜　[快速开始](#快速开始)

</div>

## ✨ 核心功能

- **一站式配置中心**  
  模型（LLM）配置 · 网关（Gateway）设置 · 通道（Channel）管理 · 智能体（Agent）创建/编辑/技能绑定

- **多智能体自由协同**  
  支持多 Agent 同时在线聊天  
  自由@、任务指派、角色分工、实时观察思考链 & 工具调用

- **实时监控仪表盘**  
  系统健康分 · 任务心跳 · Cron 调度状态  
  当前活跃会话 · 模型调用统计 · 预算/延迟预警

- **极简 & 美观**  
  深色主题 · 响应式布局 · 实时流式更新（SSE/WebSocket）  
  无需复杂登录，本地优先

## 与 OpenClaw 的关系

TinyClaw-UI 是为 **OpenClaw**（以及 Pyra 生态）量身定制的现代 Web 控制面板。  
它通过 OpenClaw 的 REST API + WebSocket 接口，实现更自由、更直观的管理体验，尤其适合需要频繁调度多智能体任务的用户。

## 截图

<!-- 你可以后续把实际截图上传到仓库的 assets/ 文件夹，然后替换下面链接 -->

| 仪表盘概览                  | 多智能体聊天室              | 智能体配置页面              |
|-----------------------------|-----------------------------|-----------------------------|
| ![Dashboard](assets/dashboard.png) | ![Multi-Agent Chat](assets/multi-chat.png) | ![Agent Config](assets/agent-config.png) |

> 更多截图见 [screenshots](./docs/screenshots.md)

## 快速开始

### 1. 前置要求

- 已运行的 OpenClaw Gateway（推荐最新版）
- Node.js ≥ 18
- pnpm / yarn / npm

### 2. 安装 & 启动

```bash
# 克隆仓库
git clone https://github.com/你的用户名/TinyClaw-UI.git
cd TinyClaw-UI

# 安装依赖
pnpm install

# 配置环境变量（复制示例并修改）
cp .env.example .env.local
# 编辑 .env.local，填入你的 OpenClaw Gateway 地址
# 示例：VITE_GATEWAY_URL=http://127.0.0.1:18789

# 开发模式启动
pnpm dev
# 访问 http://localhost:5173
