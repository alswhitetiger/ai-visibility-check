# AI Visibility Check

> 당신의 쇼핑몰은 **사람 손님**과 **AI 손님**, 둘 다 받을 준비가 되어 있습니까?

원티드 AI Championship 2026 출품작.

## 해결하려는 문제

사람들이 검색창 대신 AI에게 묻기 시작했다. 그런데 셀러에게는
**"AI가 우리 브랜드를 어떻게 말하는지"** 확인할 방법이 없다.
경쟁사만 추천되고 우리는 언급조차 안 돼도 그 이유를 모른다.

이 서비스는 쇼핑몰 URL 하나로 두 축을 동시에 진단한다.

| 축 | 질문 |
|---|---|
| **AI 가시성** | AI가 우리를 **찾고 이해할 수 있는가** |
| **구매여정** | 사람이 들어와서 **살 수 있는가** |

결과는 2x2 사분면으로 제시한다. 특히 *"지금은 잘 팔리는데 AI 검색으로
넘어가면 존재가 지워지는 가게"* 구간을 드러내는 것이 목적이다.

## AI 활용 방식

규칙 기반 검사와 LLM을 **의도적으로 분리**했다.

- **LLM 없이 판정** (전체 진단의 약 70%) — robots.txt의 AI 크롤러 차단 여부,
  llms.txt 유무, JSON-LD 구조화 데이터, JS 렌더링 의존도, sitemap, 상품 정보 노출 등
- **LLM 사용** — 실제 AI에게 브랜드를 질의한 응답 수집, 리포트 문장 생성

"AI가 우리를 모르는 이유"의 대부분은 파싱만으로 판정된다. LLM은 측정이
꼭 필요한 지점에만 쓴다.

## 사용한 AI 도구

3단 폴백 구조. 앞 단계가 한도에 걸리면 자동으로 다음 단계로 넘어간다.

```
① Google Gemini API (무료 티어)   ← 사실상 여기서 종결
② OpenAI API                      ← 안전망
③ Anthropic Claude API            ← 최후 보루
④ 사전 계산 결과 (정적 JSON)       ← 전부 소진돼도 화면은 살아있음
```

리포트 하단에 어떤 모델이 답했는지 항상 표기한다.

## 구조

```
web/      React + Vite  → GitHub Pages (제출 링크. 항상 작동)
worker/   Cloudflare Worker + D1 → 수집 / AI 호출 / 캐싱
scripts/  사전 계산 스크립트
data/     사전 계산 결과 (web/public/data)
```

프론트에는 API 키가 존재하지 않는다. 모든 키는 Worker secret에만 둔다.

## 개발

```bash
# 프론트
cd web && npm install && npm run dev

# 워커
cd worker && npm install && npm run dev
```

자세한 설정은 [docs/SETUP.md](docs/SETUP.md) 참고.

## 라이선스

MIT
