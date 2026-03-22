#!/bin/bash
set -e

# Configuration
REPO_URL="https://github.com/liandu2024/OpenClaw-Chat-Gateway.git"
INSTALL_DIR="$HOME/OpenClaw-Chat-Gateway"

# Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    OpenClaw Chat Gateway - 一键安装脚本       ${NC}"
echo -e "${BLUE}================================================${NC}"

# Check for Prerequisites
echo -e "\n${BLUE}步骤 1: 检查运行环境...${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${RED}错误: 未安装 git。请先安装 git。${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装 Node.js。请先安装 Node.js (v18+)。${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}错误: 未安装 npm。请先安装 npm。${NC}"
    exit 1
fi

# Clone Repository
echo -e "\n${BLUE}步骤 2: 获取项目源码...${NC}"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}目录 $INSTALL_DIR 已存在，正在更新...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Run Deployment Script
echo -e "\n${BLUE}步骤 3: 初始化部署...${NC}"
chmod +x deploy-release.sh
./deploy-release.sh "$1" # Pass single port argument if provided

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}   安装完成！ ${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "您现在可以访问 OpenClaw Chat Gateway："
echo -e "本地访问:   http://localhost:${1:-3115}"
echo -e "网络访问:   http://$LOCAL_IP:${1:-3115}"
echo -e "安装目录:   $INSTALL_DIR"
echo -e "------------------------------------------------"
echo -e "${BLUE}提示: 安装 LibreOffice 可以获得更好的文档预览体验。${NC}"
echo -e "安装指令: ${GREEN}sudo apt update && sudo apt install libreoffice -y${NC}"
echo -e "------------------------------------------------"
