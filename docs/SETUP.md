# 설정 가이드

## 배포 현황

| 항목 | 값 |
|---|---|
| 프론트 (GitHub Pages) | https://alswhitetiger.github.io/ai-visibility-check/ |
| Worker (Cloudflare) | https://ai-visibility.ai-visibility-worker.workers.dev |
| D1 | `ai-visibility` (APAC) · `92c0a136-cec9-43f0-98be-a15b79f0cf01` |
| 저장소 변수 | `VITE_API_BASE` = 위 Worker 주소 |

**제출 링크는 GitHub Pages 주소 하나만 쓴다.** Worker는 뒤에서만 호출된다.

운영 Worker에는 `GEMINI_API_KEY`와 `JUDGE_CODE`가 secret으로 등록되어 있다. 현재 운영 방침은 Gemini 단독 사용이며 OpenAI·Anthropic 폴백은 연결하지 않는다. 키가 없어도 규칙 기반 진단은 정상 동작하고 AI 실제 응답 영역만 미수집으로 표시된다.

`wrangler.toml` 에 `AUTH_REQUIRED = "true"` 가 설정돼 있지만, 같은 파일의
`ANON_SCAN_ENABLED = "true"` / `ANON_DAILY_LIMIT = "1"` 덕분에 로그인하지
않은 방문자도 하루 1회(IP 기준) 실제 URL 검사를 익명으로 실행할 수 있다.
그 한도를 넘거나 익명 허용이 꺼져 있으면 서버가 `LOGIN_REQUIRED` 를 반환하고,
프론트는 그때만 "로그인하고 검사하기" 안내를 띄운다. 프론트(GitHub Pages)와
API(Workers)가 서로 다른 도메인이라 세션 쿠키를 프론트에서 바로 읽을 수
없으므로, 크로스 오리진에서는 로그인 여부를 미리 확인하지 않고 곧바로 검사
요청을 보낸 뒤 서버 응답으로만 로그인 필요 여부를 판단한다. 로그인 후에는
API와 같은 도메인(`workers.dev/ai-visibility-check/login/`)에서 계정 기능
(사이트 저장·이력·공유 보고서)을 이어서 쓴다. `docs/SUBMISSION.md` 의 심사
체험 안내도 이 구조(예시·익명 검사는 로그인 불필요, 계정 기능만 로그인 필요)에
맞춰 두었다.

## 0단계 — 배포 방식 (완료됨)

GitHub Actions 워크플로가 활성화되어 있다. `main` 의 `web/**` 이 바뀌면
자동으로 GitHub Pages에 배포된다. 수동 실행은 `gh workflow run deploy-pages.yml`.

**주소: https://alswhitetiger.github.io/ai-visibility-check/**

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
| `ANON_DAILY_LIMIT` | 1 | 비회원 IP 하나당 하루 상한 |
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

## 공개 목록 등록 (소유 확인)

점수와 함께 사이트명을 공개 목록에 올리려면 사이트 제어권을 확인해야 한다.
관측값(사실 점검표)은 확인 없이 공개하지만, 우리가 매긴 점수는 다르게 다룬다.

흐름은 이렇다.

1. 진단 실행 후 결과 아래 **"이 사이트를 공개 목록에 등록"** 클릭
2. `GET /api/optin?url=<host>` 가 호스트별 확인 값을 발급
3. 사이트에 둘 중 하나를 올린다
   - `<meta name="ai-visibility-check" content="<확인값>">`
   - `/.well-known/ai-visibility-check.txt` 에 확인 값
4. **"등록했습니다. 확인해 주세요"** 클릭 → `POST /api/optin` 이 실제로 사이트를
   읽어 확인 값을 대조하고, 통과하면 `showcase` 테이블에 등록

확인 값은 호스트에서 결정론적으로 만든다(SHA-256 앞 8바이트). **값 자체는 비밀이
아니어도 된다.** 남의 호스트 확인 값을 계산할 수는 있어도 그 호스트에 파일이나
메타태그를 올릴 수는 없기 때문이다. 근거는 값의 비밀성이 아니라 사이트 제어권이다.

등록된 항목은 `GET /api/showcase` 로 내려오며, 프론트가 사전 계산 목록과 합쳐 보여준다.

## 결과 공유

로그인 회원이 **"공유 링크 만들기"**를 누르면 서버가 본인의 실제 검사 이력을
다시 확인해 무작위 토큰을 만든다. `?share=<token>` 주소는 저장된 단일 보고서 또는
같은 URL의 두 시점 비교 보고서를 30일 동안 읽기 전용으로 보여준다. 계정마다 최근 공유 주소 30개를 유지한다. 전후 비교는
브라우저의 인쇄 기능으로 PDF 저장도 가능하다. 화면에서 보낸 점수를 그대로 믿지
않고 서버 이력을 다시 읽기 때문에 다른 사용자의 결과나 조작한 점수를 공유할 수 없다.

핵심 페이지 묶음 검사는 `/api/site-pages`가 `robots.txt`의 Sitemap 선언과 기본
`/sitemap.xml`을 최대 한 단계만 읽어 같은 호스트의 페이지를 최대 5개 추천한다.
추천만으로 검사 횟수를 차감하지 않으며 사용자가 묶음 검사를 실행할 때만 새 페이지별
검사 횟수를 사용한다.

## 비용

| 항목 | 비용 |
|---|---|
| GitHub Pages / Actions | 0원 |
| Cloudflare Workers + D1 | 0원 (무료 한도 내) |
| Gemini 생성 | API 프로젝트의 무료·유료 사용량 정책 적용 |
| Gemini 브랜드 비노출 기억 검사 | 일반 Gemini 생성 사용량에 포함 · 서비스 전체 하루 100회, 회원당 하루 3회 제한 |
| OpenAI / Anthropic | 현재 키를 등록하지 않아 미사용 |

## 과거 이슈와 현재 상태 — Gemini 지역 제한

2026-09-15 운영 재검사에서는 Gemini 응답이 정상 수집됐다. 아래 내용은 2026-09-04에
Cloudflare Worker 무료 티어에서 관찰한 과거 기록이며, 저장된 예전 실패 결과를 현재
연결 상태로 판단하면 안 된다.

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

당시 실패 8건에서 토큰 한도는 병목이 아니었다. 진단 1건당 약 500토큰이고 Worker
자체 상한은 하루 400건이었다. 이 수치는 현재 성공 상태를 부정하는 근거가 아니다.

### 대응

1. 같은 오류가 다시 발생하면 `/api/health`와 신규 호스트 실시간 검사를 함께 확인한다.
2. `ai_answers` 보관소가 일시 실패를 메운다. 한 번이라도 성공한 호스트는
   이후 요청에서 수집 날짜와 함께 그 응답을 보여준다.

어느 경우든 규칙 기반 진단은 항상 정상 반환된다. 서비스가 멈추지 않는다.

## 모델

일반 AI 답변과 브랜드 비노출 기억 검사는 운영 재검사에 성공한
`gemini-3.5-flash-lite`를 쓴다. Google 검색 근거 기능은 현재 API 프로젝트의 무료
티어에서 사용할 수 없어 연결하지 않는다. 서비스 전체 한도는 하루 100회다.
