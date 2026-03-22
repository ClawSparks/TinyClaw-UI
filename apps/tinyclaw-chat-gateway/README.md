<p align="center">
<img width="1014" height="620" alt="PixPin_2026-03-10_18-49-55" src="https://github.com/user-attachments/assets/efdb14cb-c2cf-4e2d-9df7-5b5e30db9161" />
</p>

# OpenClaw Chat Gateway

**现代化、生产级的 OpenClaw 全功能 Web 客户端**

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

**OpenClaw Chat Gateway** 是一款专为 OpenClaw 生态打造的生产级 Web 客户端。它为高级用户提供了一套完整的“智能体沙盒”管理方案，结合极致的响应式界面，让您的 OpenClaw 体验步入全新次元。

### 🌟 核心亮点

- **🤖 多智能体，全 UI 界面配置**：支持多智能体快速创建与管理，通过全 UI 可视化界面完成所有配置逻辑。彻底**告别手动修改 JSON 和 Markdown 文件**。
- **📉 独立模型配置 & 极大节约 Token**：每个智能体可独立配置不同的模型，结合完全隔离的工作空间（Workspace）和独立配置文件，**精准控制模型分流，极大减少了由于背景重叠导致的 Token 浪费**。
- **📱 极致的手机移动端优化**：深度适配移动端屏幕与交互逻辑，响应式设计丝滑顺畅，**操作体验几乎与原生 APP 无异**。

### ✨ 深度功能
- **🗝️ 智能体完全隔离 (Sandboxing)**：独立工作区、独立记忆。每个角色拥有专属的 `SOUL.md` 和 `USER.md`，彻底告别对话污染。
- **🖼️ 工业级预览体验**：集成 LibreOffice 渲染能力，完美支持 Word, PPT, Excel, PDF 等复杂文档在线预览，还原真实排版。
- **🚀 深度原生集成**：在对话窗口直接运行 `/status`、`/help` 等底层指令，实时反馈系统状态。

<p align="center">
  <img src="docs/screenshots/agent_config.png" width="45%" />

</p>

### 🚀 快速开始
> [!IMPORTANT]
> 本项目须安装在安装了 OpenClaw 的 **Linux 主机**上，且必须是 **原生安装**（非 Docker）。

#### 📥 一键安装

**默认端口 3115**
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/install.sh | bash
```

**自定义端口部署 (例如 8080)**
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/install.sh | bash -s 8080
```

#### 🆙 无损升级
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/update.sh | bash
```

#### 🗑️ 彻底卸载
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/uninstall.sh | bash
```

---

### 📱 移动端预览
精心打磨的移动端细节，不仅是响应式，更是沉浸式。

<p align="center">
  <img src="docs/screenshots/mobile_sidebar.jpg" width="45%" />
  <img src="docs/screenshots/mobile_chat.jpg" width="45%" />
</p>

---

### 💡 提示：预览增强
如果您需要预览 Word, PPT, Excel 等文档，请运行以下指令安装 LibreOffice：
```bash
sudo apt update && sudo apt install libreoffice -y
```

### 💬 社群与支持
- **Telegram 群**: [安格视界 (AngeWorld)](https://t.me/angeworld2024)
- **资源站**: [安格超市 (Ange Market)](https://blog.angeworld.cc/market/)
- **AI 接口**: [芝麻开门 AI 接口](https://ai.opendoor.cn)

---

## English

**OpenClaw Chat Gateway** is a production-grade Web client designed specifically for the OpenClaw ecosystem. It provides a complete "Agent Sandboxing" management solution for advanced users, combined with a cutting-edge responsive interface to take your OpenClaw experience to a new dimension.

### 🌟 Core Highlights

- **🤖 Multi-Agent, Full UI Configuration**: Supports rapid creation and management of multi-agents through a fully visualized UI interface. Say goodbye to **manually editing JSON and Markdown files**.
- **📉 Isolated Model Configuration & Significant Token Savings**: Each agent can be independently configured with different models. Combined with completely isolated Workspaces and independent configuration files, it **precisely controls model routing and significantly reduces Token waste caused by background overlap**.
- **📱 Ultimate Mobile Optimization**: Deeply adapted to mobile screens and interaction logic, with a smooth responsive design. The **user experience is almost indistinguishable from a native app**.

### ✨ In-Depth Features
- **🗝️ Complete Agent Isolation (Sandboxing)**: Independent workspaces and memory. Each character has its own `SOUL.md` and `USER.md`, completely eliminating conversation pollution.
- **🖼️ Industrial-Grade Preview Experience**: Integrated with LibreOffice rendering capabilities, it perfectly supports online previews of complex documents such as Word, PPT, Excel, and PDF, preserving the original layout.
- **🚀 Deep Native Integration**: Run low-level commands like `/status` and `/help` directly in the chat window for real-time system status feedback.

<p align="center">
  <img src="docs/screenshots/agent_config.png" width="45%" />
</p>

### 🚀 Quick Start
> [!IMPORTANT]
> This project must be installed on a **Linux host** where OpenClaw is already installed, and it must be a **native installation** (not Docker).

#### 📥 One-Click Installation

**Default port 3115**
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/install.sh | bash
```

**Custom port deployment (e.g., 8080)**
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/install.sh | bash -s 8080
```

#### 🆙 Non-Destructive Upgrade
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/update.sh | bash
```

#### 🗑️ Complete Uninstallation
```bash
curl -fsSL https://raw.githubusercontent.com/liandu2024/OpenClaw-Chat-Gateway/main/uninstall.sh | bash
```

---

### 📱 Mobile Preview
Meticulously crafted mobile details, providing not just responsiveness, but immersion.

<p align="center">
  <img src="docs/screenshots/mobile_sidebar.jpg" width="45%" />
  <img src="docs/screenshots/mobile_chat.jpg" width="45%" />
</p>

---

### 💡 Tip: Enhanced Preview
If you need to preview documents like Word, PPT, or Excel, please run the following command to install LibreOffice:
```bash
sudo apt update && sudo apt install libreoffice -y
```

### 💬 Community & Support
- **Telegram Group**: [安格视界 (AngeWorld)](https://t.me/angeworld2024)
- **Resource Site**: [安格超市 (Ange Market)](https://blog.angeworld.cc/market/)
- **AI Interface**: [芝麻开门 AI 接口](https://ai.opendoor.cn)
