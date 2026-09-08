# 가게 체크 · AI Visibility Check

쇼핑몰 주소를 넣으면 빠진 기본 정보를 찾고, 무엇부터 고치면 좋을지 안내합니다.

**[서비스 열기](https://alswhitetiger.github.io/ai-visibility-check/)** · 원티드 AI Championship 2026 출품작

## 사용 방법

1. 쇼핑몰 또는 상품 페이지 주소를 입력합니다. 주소가 없어도 가상 예시 리포트를 볼 수 있습니다.
2. AI가 읽을 정보와 고객에게 보여줄 정보의 준비 상태를 확인합니다.
3. 먼저 고칠 3가지의 설명과 코드 예시를 확인합니다. 코드의 교체 문구는 실제 정보로 바꿔야 합니다.
4. 사이트를 직접 수정한 뒤 다시 검사합니다. 같은 브라우저의 이전 검사와 항목별 변화를 비교합니다.

결과의 **이 페이지에서 읽힌 정보**에서 HTML 원본의 이름·제목·소개·가격·이미지 설명을 확인할 수 있습니다. 실제 AI 인식이나 사실 검증 결과는 아닙니다.

**우리 가게 소개 정보 만들기**에서는 실제 가게 이름·홈페이지 주소·소개를 입력하고 확인하면 Organization JSON-LD 코드를 만들 수 있습니다. 코드를 복사하고 일반 사이트 또는 카페24 적용 안내에 따라 게시한 뒤 다시 검사하세요. 코드 생성은 브라우저 안에서 처리하며 추가 AI 호출은 없습니다.

## 검사 범위

- 입력한 페이지와 robots.txt, llms.txt, sitemap.xml만 조회합니다. 상품 목록을 자동 순회하지 않습니다.
- HTML 원본의 브랜드·상품 데이터, 제목·설명, 이미지 설명, 모바일 설정 등을 점검합니다.
- 일반 페이지에는 상품 데이터·가격 점수를 적용하지 않습니다. 조회 실패는 미확인으로 구분합니다.
- llms.txt와 학습용 AI 설정은 참고 항목이며 점수에서 제외합니다.
- 점수는 자체 가중치를 사용한 기본 정보 점검입니다. 실제 AI 검색 노출, 추천 순위, 매출 또는 결제 성공 여부를 측정하지 않습니다.
- AI API에는 브랜드 정보를 알려주고 질의합니다. 웹 검색을 사용하지 않은 모델 응답이며, 두 점수에는 반영하지 않습니다. 모델명과 저장된 응답의 수집일을 표시합니다.

## 구조와 안정성

- web/: React + Vite, GitHub Pages
- worker/: Cloudflare Worker + D1. linkedom으로 HTML을 읽고 robots-parser로 URL별 규칙을 판정합니다.
- scripts/build-example.mjs: 외부 호출 없이 가상 전후 예시를 생성합니다.
- scripts/precompute.mjs: 별도 대량 조사 도구. 이전 기준의 정적 통계는 현재 첫 화면에 노출하지 않습니다.
- 진단 버전이 다른 캐시는 재사용하지 않습니다. 재검사는 일일 한도에 포함됩니다.
- 기존 AI 응답은 수집일과 함께 재사용합니다. 보관된 응답이 없으면 Gemini → OpenAI → Anthropic 순서로 설정된 키를 사용합니다. AI 호출이 실패해도 규칙 검사 결과와 가상 예시를 볼 수 있습니다.
- 브라우저에 API 키를 넣지 않습니다. 공개 목록 등록에는 사이트 제어권 확인이 필요합니다.

## 개발·검증

~~~sh
cd worker
npm ci
npm test
cd ..
node scripts/build-example.mjs
cd web
npm ci
npm run dev
npm run build
~~~

실시간 검사에는 VITE_API_BASE를 Worker 주소로 설정합니다. 없으면 가상 예시를 사용할 수 있습니다.
Worker 배포는 worker/에서 npm run deploy를 실행합니다. GitHub Pages의 main 배포는 테스트와 빌드가 통과한 뒤 진행됩니다.

자세한 환경 설정: [docs/SETUP.md](docs/SETUP.md). 제출 설명: [docs/SUBMISSION.md](docs/SUBMISSION.md).

## 라이선스

MIT. 사용한 의존성의 라이선스는 해당 패키지를 따릅니다.
