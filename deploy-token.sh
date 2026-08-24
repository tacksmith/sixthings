#!/bin/bash
# 用 Vercel token 部署（非交互）
# 用法: bash deploy-token.sh <VERCEL_TOKEN>
set -e
cd "$(dirname "$0")"
TOKEN="$1"
if [ -z "$TOKEN" ]; then
  echo "用法: bash deploy-token.sh <VERCEL_TOKEN>"
  exit 1
fi
npx vercel --token "$TOKEN" --prod --yes
echo "→ 部署完成!"
