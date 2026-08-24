#!/bin/bash
# ============================================================
# 六件事 · 一键部署到 Vercel
# 用法：
#   1) 首次： bash deploy.sh login   （浏览器登录你的 Vercel 账号）
#   2) 部署： bash deploy.sh deploy  （部署到生产，生成 https://xxx.vercel.app）
#   3) 以后更新： bash deploy.sh deploy （自动重新部署）
# ============================================================
set -e
cd "$(dirname "$0")"

case "$1" in
  login)
    echo "→ 打开浏览器登录你的 Vercel 账号（GitHub 登录最快）..."
    npx vercel login
    echo "→ 登录完成。现在运行: bash deploy.sh deploy"
    ;;
  deploy)
    echo "→ 首次会询问: 链接哪个仓库 → 选 GitHub → 选 nero985/sixthings"
    npx vercel --prod --yes
    echo "→ 部署完成!"
    ;;
  *)
    echo "用法: bash deploy.sh [login|deploy]"
    ;;
esac
