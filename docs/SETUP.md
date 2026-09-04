# 설정 가이드

## 0단계 — 배포 방식 (완료됨)

GitHub Actions 워크플로가 활성화되어 있다. `main` 의 `web/**` 이 바뀌면
자동으로 GitHub Pages에 배포된다. 수동 실행은 `gh workflow run deploy-pages.yml`.

**주소: https://alswhitetiger.github.io/ai-visibility-check/**

Actions가 막힐 때를 위한 예비 경로로 `scripts/deploy-pages.sh` 를 남겨 두었다.
gh-pages 브랜치로 직접 밀어 넣는 방식이며, Pages 소스를 브랜치로 되돌리면 쓸 수 있다.

## 1단계 — GitHub Pages (실시간 분석 없이 먼저 배포)

프론트만 올린다. 이 단계에서 이미 제출 가능한 링크가 생긴다.

1. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 변경
2. `main` 에 push → 자동 배포
3. 주소: `https://alswhitetiger.github.io/ai-visibility-check/`

`VITE_API_BASE` 가 비어 있으면 정적 모드로 빌드된다. 진단 버튼을 누르면
"실시간 분석은 준비 중" 안내와 함께 사전 계산 결과를 보여준다.

## 2단계 — Cloudflare Worker + D1

```bash
cd worker
npm install

# D1 생성 → 출력된 database_id 를 wrangler.toml 에 붙여넣는다
npx wrangler d1 create ai-visibility

# 스키마 적용
npm run db:remote

# API 키는 secret 으로만 등록한다. 절대 커밋하지 않는다.
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY

npm run deploy
```

배포되면 `https://ai-visibility.<계정>.workers.dev` 주소가 나온다.

### 프론트에 연결

저장소 **Settings → Secrets and variables → Actions → Variables** 에서
`VITE_API_BASE` 에 Worker 주소를 넣고 다시 push 하면 실시간 분석이 켜진다.

### CORS

`wrangler.toml` 의 `ALLOWED_ORIGINS` 에 GitHub Pages 주소가 들어 있어야 한다.
저장소 이름이나 계정을 바꾸면 여기도 함께 바꾼다.

## 한도와 방어

| 설정 | 기본값 | 의미 |
|---|---|---|
| `DAILY_SCAN_LIMIT` | 400 | 하루 전체 분석 상한 |
| `IP_DAILY_LIMIT` | 5 | IP 하나당 하루 상한 |
| `CACHE_TTL_HOURS` | 24 | 같은 URL 재사용 기간 |
| `JUDGE_CODE` | (비어 있음) | 심사위원용 우회 코드 |

한도를 넘으면 서비스가 죽는 대신 안내 문구와 함께 저장된 결과를 보여준다.
제출 설명란에 심사용 코드를 함께 적으면 심사위원은 한도 없이 실행할 수 있다.

## 사전 계산

```bash
# scripts/targets.json 에 optedIn: true 인 대상을 넣고
node scripts/precompute.mjs
git add web/public/data/showcase.json && git commit -m "chore: 사전 계산 결과 갱신"
```

AI 호출 없이 규칙 기반 엔진만 쓰므로 비용이 들지 않는다.

## 비용

| 항목 | 비용 |
|---|---|
| GitHub Pages / Actions | 0원 |
| Cloudflare Workers + D1 | 0원 (무료 한도 내) |
| Gemini API | 0원 (무료 티어) |
| OpenAI / Anthropic | 폴백 시에만. 콘솔에서 상한을 걸어 둘 것 |
