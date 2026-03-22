#!/bin/bash
set -e

# Configuration
# If not in a project dir, default to ~/OpenClaw-Chat-Gateway
INSTALL_DIR="$HOME/OpenClaw-Chat-Gateway"
if [ -f "deploy-release.sh" ]; then
    PROJECT_ROOT="$(pwd)"
elif [ -d "$INSTALL_DIR" ]; then
    PROJECT_ROOT="$INSTALL_DIR"
else
    echo "Error: Could not find OpenClaw Chat Gateway installation."
    echo "Checked: $(pwd) and $INSTALL_DIR"
    exit 1
fi

SERVICE_DIR="$HOME/.config/systemd/user"

echo "================================================"
echo "   OpenClaw Chat Gateway - 更新脚本"
echo "================================================"

# 1. 从服务文件中探测现有端口
EXISTING_PORT=""
SERVICES=$(ls $SERVICE_DIR/clawui-*.service 2>/dev/null | sort -V || true)

if [ -n "$SERVICES" ]; then
    # 使用找到的第一个服务端口作为默认值
    FIRST_SERVICE=$(echo "$SERVICES" | head -n 1)
    EXISTING_PORT=$(basename "$FIRST_SERVICE" | sed 's/clawui-\([0-9]*\)\.service/\1/')
    echo "检测到正在运行的端口: $EXISTING_PORT"
else
    # 检查旧版服务文件
    if [ -f "$SERVICE_DIR/clawui.service" ]; then
        EXISTING_PORT="3115"
        echo "检测到旧版安装 (端口 3115)"
    fi
fi

TARGET_PORT=${1:-$EXISTING_PORT}
TARGET_PORT=${TARGET_PORT:-3115}

echo "正在从 GitHub 更新代码，目录: $PROJECT_ROOT..."
cd "$PROJECT_ROOT"
git pull

echo "开始升级端口 $TARGET_PORT 的服务..."
./deploy-release.sh "$TARGET_PORT"

echo "================================================"
echo "升级完成！"
echo "您的配置和数据已保留。"
echo "================================================"
