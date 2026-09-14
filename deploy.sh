#!/bin/bash
# 阿勒泰秋日现场手册 — 一键部署到 GitHub Pages
# 用法: ./deploy.sh [提交信息]
#   默认提交信息: "更新 YYYY-MM-DD HH:MM"

set -e
cd "$(dirname "$0")"

MSG="${1:-更新 $(date '+%Y-%m-%d %H:%M')}"

git add -A
if git diff --cached --quiet; then
  echo "✓ 没有变更，无需部署"
  exit 0
fi

git commit -m "$MSG"
git push origin main
echo ""
echo "✓ 已推送，GitHub Pages 将在 1-2 分钟内自动重建"
echo "  https://mmzhang1998.github.io/kanas-altay/"
