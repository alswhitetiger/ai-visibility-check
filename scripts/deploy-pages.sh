#!/usr/bin/env bash
# gh-pages 브랜치로 프론트를 배포한다.
#
# GitHub Actions 워크플로를 쓰려면 gh 토큰에 workflow 스코프가 필요하다.
# 그 전까지는 이 스크립트로 배포한다. 스코프를 추가한 뒤에는
# .github/workflows/deploy-pages.yml 이 자동으로 처리하므로 이 스크립트는 필요 없다.
#
#   bash scripts/deploy-pages.sh
#
# VITE_API_BASE 를 넣으면 실시간 분석이 켜진 상태로 빌드된다.
#   VITE_API_BASE=https://ai-visibility.xxx.workers.dev bash scripts/deploy-pages.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
BRANCH="gh-pages"
STAGE="$ROOT/.deploy"

echo "==> 빌드"
cd "$ROOT/web"
npm run build

echo "==> 스테이징"
rm -rf "$STAGE"
cp -r "$ROOT/web/dist" "$STAGE"
touch "$STAGE/.nojekyll"
# SPA는 아니지만, 잘못된 경로로 들어와도 첫 화면을 보여준다.
cp "$STAGE/index.html" "$STAGE/404.html"

echo "==> $BRANCH 푸시"
cd "$STAGE"
git init -q -b "$BRANCH"
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" \
    -c user.email="$(git -C "$ROOT" config user.email)" \
    commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q -f "$REMOTE" "$BRANCH"

cd "$ROOT"
rm -rf "$STAGE"
echo "==> 완료"
