#!/bin/bash

# GitHub 上传脚本
# 使用前请确保：
# 1. 已修改 GitHub 密码（因为之前在聊天中暴露过）
# 2. 已启用双因素认证（推荐）
# 3. 使用 Personal Access Token (PAT) 而非密码

echo "========================================="
echo "  MQTT 语音呼叫演示 - GitHub 上传脚本"
echo "========================================="
echo ""

# 检查是否已初始化 Git
if [ ! -d ".git" ]; then
    echo "1️⃣ 初始化 Git 仓库..."
    git init
    echo "✅ Git 仓库初始化完成"
    echo ""
fi

# 添加远程仓库（如果不存在）
if ! git remote | grep -q "origin"; then
    echo "2️⃣ 添加远程仓库..."
    echo "请输入您的 GitHub 仓库地址（例如：https://github.com/zhouagora/mqtt-call-demo.git）："
    read REPO_URL
    git remote add origin $REPO_URL
    echo "✅ 远程仓库添加完成"
    echo ""
else
    echo "2️⃣ 远程仓库已存在"
    echo ""
fi

# 添加所有文件
echo "3️⃣ 添加文件..."
git add .
echo "✅ 文件添加完成"
echo ""

# 检查 .env 文件是否被错误添加
if git ls-files --cached | grep -q ".env$"; then
    echo "⚠️  警告：检测到 .env 文件被添加！"
    echo "   正在移除 .env 文件..."
    git reset HEAD .env
    echo "✅ .env 文件已移除"
    echo ""
fi

# 提交
echo "4️⃣ 提交更改..."
git commit -m "feat: 初始化 MQTT 语音呼叫演示系统

- 集成 MQTT 信令交互
- 集成声网 Agora RTC 语音通话（G722编码）
- 配置外化（环境变量管理）
- 文档脱敏处理
- 添加完整操作说明"
echo "✅ 提交完成"
echo ""

# 推送到 GitHub
echo "5️⃣ 推送到 GitHub..."
echo ""
echo "⚠️  安全提示："
echo "   - 如果您之前在聊天中提供过 GitHub 密码，请立即修改！"
echo "   - 建议使用 Personal Access Token (PAT) 而非密码"
echo "   - 如何创建 PAT: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
echo ""
echo "请输入 GitHub 用户名（例如：zhouagora）："
read GITHUB_USER
echo ""
echo "请输入 Personal Access Token 或密码："
read -s GITHUB_TOKEN
echo ""
echo ""

# 尝试推送
git push -u origin main 2>/dev/null || git push -u origin master

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "  ✅ 上传成功！"
    echo "========================================="
    echo ""
    echo "📦 仓库地址：https://github.com/${GITHUB_USER}/<your-repo-name>"
    echo ""
    echo "📝 客户使用步骤："
    echo "   1. git clone <仓库地址>"
    echo "   2. cd <项目目录>"
    echo "   3. cp .env.example .env"
    echo "   4. 编辑 .env 填写配置"
    echo "   5. npm install"
    echo "   6. npm run dev"
    echo ""
else
    echo ""
    echo "========================================="
    echo "  ❌ 上传失败"
    echo "========================================="
    echo ""
    echo "可能的原因："
    echo "   1. 认证失败（用户名或 Token/密码错误）"
    echo "   2. 仓库不存在（请先在 GitHub 创建仓库）"
    echo "   3. 网络问题"
    echo ""
    echo "建议："
    echo "   - 在 GitHub 上创建新仓库"
    echo "   - 使用 Personal Access Token 而非密码"
    echo "   - 检查网络连接"
    echo ""
fi
