# 설정 가이드

## 배포 현황

| 항목 | 값 |
|---|---|
| 프론트 (GitHub Pages) | https://alswhitetiger.github.io/ai-visibility-check/ |
| Worker (Cloudflare) | https://ai-visibility.ai-visibility-worker.workers.dev |
| D1 | `ai-visibility` (APAC) · `92c0a136-cec9-43f0-98be-a15b79f0cf01` |
| 저장소 변수 | `VITE_API_BASE` = 위 Worker 주소 |

**제출 링크는 GitHub Pages 주소 하나만 쓴다.** Worker는 뒤에서만 호출된다.

남은 것: AI 키 등록 (`GEMINI_API_KEY`, `JUDGE_CODE`). 키가 없어도 규칙 기반
진단은 정상 동작하며, AI 실제 응답 영역만 "대기 중"으로 표시된다.

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
npx wrangler secret put JUDGE_CODE      # 심사위원 우회 코드

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
| `JUDGE_CODE` | (secret) | 심사위원용 우회 코드. 공개 저장소에 값을 남기지 않으려고 secret 으로 둔다 |

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

## 알려진 이슈 — Gemini 지역 제한

Cloudflare Worker에서 Gemini 무료 티어를 호출하면 간헐적으로 아래 오류가 난다.

```
400 FAILED_PRECONDITION
User location is not supported for the API use.
```

요청을 처리한 Cloudflare 콜로(데이터센터)의 위치를 Google이 무료 티어 지원 지역으로
인정하지 않을 때 발생한다. 같은 요청도 콜로에 따라 성공한다. 로컬(한국)에서는 항상 성공한다.

### 실측 (2026-09-04)

| 항목 | 결과 |
|---|---|
| 신규 호스트 실시간 성공률 | 8건 중 2건 (약 25%) |
| 실패 원인 | **전부 지역 제한(400). 토큰 한도(429)는 0건** |
| 같은 요청 내 재시도 | 4회 모두 동일 실패 — 콜로 단위로 고정됨 |

**토큰 한도는 병목이 아니다.** 진단 1건당 약 500토큰이고 Worker 자체 상한이
하루 400건이라, 무료 티어 한도의 절반도 쓰지 않는다. 문제는 오직 지역 제한이다.

### 대응

1. **Gemini API 에 결제를 연결한다(권장).** 지역 제한은 무료 티어 정책이다.
   결제를 붙이면 사라지고, 상위 모델과 503 우선순위도 함께 해결된다.
2. 또는 2단(OpenAI) 키를 등록한다. 이 오류를 그대로 받아내는 자리다.
3. 그 전까지는 `ai_answers` 보관소가 메운다. 한 번이라도 성공한 호스트는
   이후 요청에서 수집 날짜와 함께 그 응답을 보여준다.

어느 경우든 규칙 기반 진단은 항상 정상 반환된다. 서비스가 멈추지 않는다.

```bash
npx wrangler secret put OPENAI_API_KEY
```

## 모델

`gemini-2.5-flash-lite` 는 신규 사용자에게 중단됐다(404). Google 안내에 따라
`gemini-3.5-flash-lite` 를 쓴다.
